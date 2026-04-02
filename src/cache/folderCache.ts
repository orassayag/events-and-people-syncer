import { promises as fs } from 'fs';
import { join } from 'path';
import type { FolderCacheData } from '../types';
import { folderCacheDataSchema } from '../entities';
import { VALIDATION_CONSTANTS } from '../constants';
import { SETTINGS } from '../settings';

export class FolderCache {
  private static instance: FolderCache;
  private readonly TTL: number = VALIDATION_CONSTANTS.CACHE.TTL_MS;
  private readonly cacheFilePath: string;

  private constructor() {
    this.cacheFilePath = join(
      SETTINGS.linkedin.cachePath,
      'folder-mappings.json'
    );
  }

  static getInstance(): FolderCache {
    if (!FolderCache.instance) {
      FolderCache.instance = new FolderCache();
    }
    return FolderCache.instance;
  }

  async get(): Promise<FolderCacheData | null> {
    try {
      const fileContent: string = await fs.readFile(
        this.cacheFilePath,
        'utf-8'
      );
      let data: FolderCacheData;
      try {
        data = JSON.parse(fileContent);
      } catch {
        await this.invalidate();
        return null;
      }
      const result = folderCacheDataSchema.safeParse(data);
      if (!result.success) {
        await this.invalidate();
        return null;
      }
      const now: number = Date.now();
      if (now - data.timestamp <= this.TTL) {
        return data;
      }
      await this.invalidate();
      return null;
    } catch {
      return null;
    }
  }

  async set(data: FolderCacheData): Promise<void> {
    try {
      await fs.mkdir(SETTINGS.linkedin.cachePath, { recursive: true });
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (_error: unknown) {
      throw new Error(
        `Failed to write cache file - check permissions for: ${this.cacheFilePath}`
      );
    }
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {}
  }
}
