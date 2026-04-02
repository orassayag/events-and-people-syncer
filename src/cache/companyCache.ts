import { promises as fs } from 'fs';
import { join } from 'path';
import { SETTINGS } from '../settings';
import { CompanyCacheData } from '../types';
import { companyCacheDataSchema } from '../entities';

export class CompanyCache {
  private readonly cacheFilePath: string;
  private readonly expirationMs: number;

  constructor() {
    this.cacheFilePath = join(
      SETTINGS.linkedin.cachePath,
      'company-mappings.json'
    );
    this.expirationMs =
      SETTINGS.linkedin.cacheExpirationDays * 24 * 60 * 60 * 1000;
  }

  async get(): Promise<CompanyCacheData | null> {
    try {
      const fileContent: string = await fs.readFile(
        this.cacheFilePath,
        'utf-8'
      );
      const data: CompanyCacheData = companyCacheDataSchema.parse(
        JSON.parse(fileContent)
      );
      const now: number = Date.now();
      if (now - data.timestamp < this.expirationMs) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  async set(data: CompanyCacheData): Promise<void> {
    try {
      await fs.mkdir(SETTINGS.linkedin.cachePath, { recursive: true });
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: unknown) {
      console.warn(
        'Failed to write company cache:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {}
  }
}
