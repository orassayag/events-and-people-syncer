import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { injectable } from 'inversify';
import { SETTINGS } from '../../settings';
import { LinkedInConnection } from '../../types';
import {
  linkedInConnectionSchema,
  linkedInUrlSchema,
} from '../../entities';
import { ErrorCode } from '../../errors';
import { UrlNormalizer } from './urlNormalizer';
import { Logger } from '../../logging';

@injectable()
export class LinkedInExtractor {
  private readonly sourcesPath: string;
  private logger: Logger = new Logger('LinkedInExtractor');

  constructor() {
    this.sourcesPath = SETTINGS.linkedin.sourcesPath;
  }

  async extract(): Promise<LinkedInConnection[]> {
    const zipPath: string = await this.findZipFile();
    const csvContent: string = await this.extractCsvFromZip(zipPath);
    return this.parseCsv(csvContent);
  }

  private async findZipFile(): Promise<string> {
    try {
      const files: string[] = await fs.readdir(this.sourcesPath);
      const zipFiles: string[] = files.filter((file: string) => {
        const lower: string = file.toLowerCase();
        return (
          lower.endsWith('.zip') &&
          (lower.includes('linkedin') ||
            lower.includes('data') ||
            lower.includes('export'))
        );
      });
      if (zipFiles.length === 0) {
        throw new Error(
          `LinkedIn ZIP file not found in ${this.sourcesPath}. Expected a ZIP file containing "linkedin", "data", or "export" in the filename`
        );
      }
      if (zipFiles.length > 1) {
        throw new Error(
          `Multiple LinkedIn ZIP files found in ${this.sourcesPath}: ${zipFiles.join(', ')}. Please keep only one ZIP file`
        );
      }
      return join(this.sourcesPath, zipFiles[0]);
    } catch (error: unknown) {
      const errorMessage: string =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `${errorMessage} (Code: ${ErrorCode.LINKEDIN_ZIP_NOT_FOUND})`
      );
    }
  }

  private async extractCsvFromZip(zipPath: string): Promise<string> {
    try {
      const zip = new AdmZip(zipPath);
      await Promise.resolve();
      const zipEntries = zip.getEntries();
      const csvEntries = zipEntries.filter((entry) => {
        const entryNameLower = entry.entryName.toLowerCase();
        const fileName = entryNameLower.split('/').pop() || '';
        return fileName === 'connections.csv';
      });
      if (csvEntries.length === 0) {
        throw new Error(
          `connections.csv not found in ZIP file (Code: ${ErrorCode.LINKEDIN_CSV_NOT_FOUND})`
        );
      }
      if (csvEntries.length > 1) {
        throw new Error(
          `Multiple connections.csv files found in ZIP (Code: ${ErrorCode.LINKEDIN_MULTIPLE_CSV_FILES})`
        );
      }
      const csvEntry = csvEntries[0];
      const csvContent: string = csvEntry.getData().toString('utf-8');
      if (!csvContent.trim()) {
        throw new Error(
          `connections.csv is empty (Code: ${ErrorCode.LINKEDIN_CSV_EMPTY})`
        );
      }
      return csvContent;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('password')) {
        throw new Error(
          `ZIP file is password protected (Code: ${ErrorCode.LINKEDIN_ZIP_PASSWORD_PROTECTED})`
        );
      }
      if (
        error instanceof Error &&
        error.message.includes(`(Code: ${ErrorCode.LINKEDIN_CSV_NOT_FOUND})`)
      ) {
        throw error;
      }
      if (
        error instanceof Error &&
        error.message.includes(
          `(Code: ${ErrorCode.LINKEDIN_MULTIPLE_CSV_FILES})`
        )
      ) {
        throw error;
      }
      const errorMessage: string =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `${errorMessage} (Code: ${ErrorCode.LINKEDIN_EXTRACTION_FAILED})`
      );
    }
  }

  private parseCsv(content: string): LinkedInConnection[] {
    try {
      const lines: string[] = content.split('\n');
      let headerIndex: number = -1;
      for (let i: number = 0; i < Math.min(10, lines.length); i++) {
        if (
          lines[i].includes('First Name') &&
          lines[i].includes('Last Name') &&
          lines[i].includes('URL')
        ) {
          headerIndex = i;
          break;
        }
      }
      if (headerIndex === -1) {
        throw new Error('CSV header row not found');
      }
      const csvWithoutNotes: string = lines.slice(headerIndex).join('\n');
      const records = parse(csvWithoutNotes, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        encoding: 'utf-8',
        relaxColumnCount: true,
      });
      const connections: LinkedInConnection[] = [];
      const processedUrls = new Set<string>();
      for (const record of records) {
        try {
          const firstName: string = (record['First Name'] || '').trim();
          const lastName: string = (record['Last Name'] || '').trim();
          const url: string = (record['URL'] || '').trim();
          if (!firstName || !lastName || !url) {
            this.logger.debug(
              `Skipped: Missing required fields - firstName: "${firstName}", lastName: "${lastName}", url: "${url}"`
            );
            continue;
          }
          if (!UrlNormalizer.isValidPersonalProfile(url)) {
            this.logger.debug(`Skipped: Invalid LinkedIn profile URL - ${url}`);
            continue;
          }
          try {
            linkedInUrlSchema.parse(url);
          } catch {
            this.logger.debug(`Skipped: Invalid LinkedIn URL format - ${url}`);
            continue;
          }
          const normalizedUrl: string = UrlNormalizer.normalizeLinkedInUrl(url);
          if (processedUrls.has(normalizedUrl)) {
            this.logger.debug(`Skipped: Duplicate LinkedIn URL - ${url}`);
            continue;
          }
          processedUrls.add(normalizedUrl);
          const profileSlug: string = UrlNormalizer.extractProfileSlug(url);
          const connection: LinkedInConnection = linkedInConnectionSchema.parse(
            {
              id: profileSlug,
              firstName,
              lastName,
              email: (record['Email Address'] || '').trim(),
              company: (record['Company'] || '').trim(),
              position: (record['Position'] || '').trim(),
              url,
              connectedOn: (record['Connected On'] || '').trim(),
            }
          );
          connections.push(connection);
        } catch (error: unknown) {
          this.logger.debug(
            `Skipped: Validation failed - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
      if (connections.length === 0) {
        throw new Error(
          `No valid connections found in CSV (Code: ${ErrorCode.LINKEDIN_CSV_VALIDATION_FAILED})`
        );
      }
      return connections;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes(
          `(Code: ${ErrorCode.LINKEDIN_CSV_VALIDATION_FAILED})`
        )
      ) {
        throw error;
      }
      const errorMessage: string =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `${errorMessage} (Code: ${ErrorCode.LINKEDIN_CSV_ENCODING_ERROR})`
      );
    }
  }
}
