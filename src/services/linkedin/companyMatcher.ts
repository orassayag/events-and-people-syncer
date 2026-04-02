import { promises as fs } from 'fs';
import { injectable } from 'inversify';
import { SETTINGS } from '../../settings';
import { CompanyMapping, CompanyCacheData } from '../../types';
import { CompanyCache } from '../../cache';
import { ErrorCode } from '../../errors';
import { RegexPatterns } from '../../regex';

@injectable()
export class CompanyMatcher {
  private readonly companyCache: CompanyCache;
  private readonly companyFoldersPath: string;
  private readonly defaultLabel: string;
  private readonly suffixesToRemove: string[];

  constructor() {
    this.companyCache = new CompanyCache();
    this.companyFoldersPath = SETTINGS.linkedin.companyFoldersPath;
    this.defaultLabel = SETTINGS.linkedin.defaultLabel;
    this.suffixesToRemove = SETTINGS.linkedin.companySuffixesToRemove;
  }

  async getLabel(linkedinCompany: string): Promise<string> {
    if (!linkedinCompany.trim()) {
      return this.defaultLabel;
    }
    const mappings: CompanyMapping[] = await this.getMappings();
    const cleanedLinkedInCompany: string =
      this.cleanCompanyName(linkedinCompany);
    const normalizedLinkedIn: string = cleanedLinkedInCompany
      .toLowerCase()
      .trim();
    for (const mapping of mappings) {
      const normalizedFolder: string = mapping.companyName.toLowerCase().trim();
      if (normalizedLinkedIn === normalizedFolder) {
        return mapping.label;
      }
    }
    for (const mapping of mappings) {
      if (this.matchesCompany(cleanedLinkedInCompany, mapping.companyName)) {
        return mapping.label;
      }
    }
    return this.defaultLabel;
  }

  private async getMappings(): Promise<CompanyMapping[]> {
    const cached: CompanyCacheData | null = await this.companyCache.get();
    if (cached) {
      return cached.mappings;
    }
    const mappings: CompanyMapping[] = await this.scanCompanyFolders();
    const cacheData: CompanyCacheData = {
      timestamp: Date.now(),
      mappings,
    };
    await this.companyCache.set(cacheData);
    return mappings;
  }

  private async scanCompanyFolders(): Promise<CompanyMapping[]> {
    try {
      const folders: string[] = await fs.readdir(this.companyFoldersPath);
      const mappings: CompanyMapping[] = [];
      for (const folder of folders) {
        try {
          const stat = await fs.stat(`${this.companyFoldersPath}/${folder}`);
          if (!stat.isDirectory()) {
            continue;
          }
          const underscoreIndex: number = folder.indexOf('_');
          if (underscoreIndex === -1) {
            throw new Error(
              `${ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN}: Folder "${folder}" missing underscore separator`
            );
          }
          if (underscoreIndex === 0) {
            throw new Error(
              `${ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN}: Folder "${folder}" has empty label`
            );
          }
          if (underscoreIndex === folder.length - 1) {
            throw new Error(
              `${ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN}: Folder "${folder}" has empty company name`
            );
          }
          const label: string = folder.substring(0, underscoreIndex).trim();
          const companyName: string = folder
            .substring(underscoreIndex + 1)
            .trim();
          if (!label || !companyName) {
            throw new Error(
              `${ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN}: Folder "${folder}" has empty label or company name after parsing`
            );
          }
          mappings.push({ label, companyName });
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            error.message.includes(
              String(ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN)
            )
          ) {
            throw error;
          }
        }
      }
      return mappings;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes(
          String(ErrorCode.LINKEDIN_INVALID_FOLDER_PATTERN)
        )
      ) {
        throw error;
      }
      throw new Error(
        `${ErrorCode.LINKEDIN_FILE_SYSTEM_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private cleanCompanyName(company: string): string {
    let cleaned: string = company.trim();
    for (const suffix of this.suffixesToRemove) {
      const regex = RegexPatterns.createCompanySuffixRegex(suffix);
      cleaned = cleaned.replace(regex, '');
    }
    cleaned = cleaned.trim();
    const parts: string[] = cleaned.split(
      RegexPatterns.COMPANY_NAME_SEPARATORS
    );
    if (parts.length > 0 && parts[0].trim()) {
      cleaned = parts[0].trim();
    }
    return cleaned || company.trim();
  }

  private matchesCompany(
    linkedinCompany: string,
    folderCompany: string
  ): boolean {
    const normalizedLinkedIn: string = linkedinCompany.toLowerCase().trim();
    const normalizedFolder: string = folderCompany.toLowerCase().trim();
    if (normalizedLinkedIn === normalizedFolder) {
      return true;
    }
    if (
      normalizedLinkedIn.includes(normalizedFolder) ||
      normalizedFolder.includes(normalizedLinkedIn)
    ) {
      return true;
    }
    const linkedInNormalized: string = normalizedLinkedIn.replace(
      RegexPatterns.MULTIPLE_SPACES,
      ''
    );
    const folderNormalized: string = normalizedFolder.replace(
      RegexPatterns.MULTIPLE_SPACES,
      ''
    );
    if (
      linkedInNormalized.includes(folderNormalized) ||
      folderNormalized.includes(linkedInNormalized)
    ) {
      return true;
    }
    const folderSegments: string[] = this.splitCamelCase(folderCompany);
    for (const segment of folderSegments) {
      if (segment.length <= 5) {
        continue;
      }
      const normalizedSegment: string = segment.toLowerCase().trim();
      if (
        normalizedLinkedIn.includes(normalizedSegment) ||
        normalizedSegment.includes(normalizedLinkedIn)
      ) {
        return true;
      }
    }
    return false;
  }

  private splitCamelCase(str: string): string[] {
    return str
      .split(RegexPatterns.CAMEL_CASE_SPLIT)
      .filter((s: string) => s.length > 0);
  }
}
