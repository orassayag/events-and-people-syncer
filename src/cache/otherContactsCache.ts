import { promises as fs } from 'fs';
import { join } from 'path';
import type { OtherContactEntry, OtherContactsCacheData } from '../types';
import { EmailNormalizer, PhoneNormalizer } from '../services/contacts';
import { VALIDATION_CONSTANTS } from '../constants';
import { SETTINGS } from '../settings';

const CACHE_VERSION = 1;

export class OtherContactsCache {
  private static instance: OtherContactsCache;
  private readonly TTL: number = VALIDATION_CONSTANTS.CACHE.TTL_MS;
  private readonly cacheFilePath: string;

  private constructor() {
    this.cacheFilePath = join(
      SETTINGS.linkedin.cachePath,
      'other-contacts-cache.json'
    );
  }

  static getInstance(): OtherContactsCache {
    if (!OtherContactsCache.instance) {
      OtherContactsCache.instance = new OtherContactsCache();
    }
    return OtherContactsCache.instance;
  }

  async get(): Promise<OtherContactEntry[] | null> {
    try {
      const fileContent = await fs.readFile(this.cacheFilePath, 'utf-8');
      const data: OtherContactsCacheData = JSON.parse(fileContent);
      if (data.version !== CACHE_VERSION) {
        console.info('Cache version mismatch, invalidating cache');
        await this.invalidate();
        return null;
      }
      const now = Date.now();
      const ageMs = now - data.timestamp;
      const ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
      if (ageMs <= this.TTL) {
        console.info(
          `Cache hit: ${data.entries.length} entries, ${ageHours}h old`
        );
        return data.entries;
      }
      console.info(`Cache expired: ${ageHours}h old (TTL: 24h)`);
      await this.invalidate();
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.info('Cache corrupted, invalidating');
      }
      await this.invalidate();
      return null;
    }
  }

  async getWithTimestamp(): Promise<{
    entries: OtherContactEntry[];
    timestamp: number;
  } | null> {
    try {
      const fileContent = await fs.readFile(this.cacheFilePath, 'utf-8');
      const data: OtherContactsCacheData = JSON.parse(fileContent);
      return { entries: data.entries, timestamp: data.timestamp };
    } catch {
      return null;
    }
  }

  async set(
    entries: OtherContactEntry[],
    preserveTimestamp?: number
  ): Promise<void> {
    try {
      await fs.mkdir(SETTINGS.linkedin.cachePath, { recursive: true });
      const data: OtherContactsCacheData = {
        version: CACHE_VERSION,
        entries,
        timestamp: preserveTimestamp ?? Date.now(),
      };
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: unknown) {
      console.warn(
        'Failed to write other contacts cache:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
      console.info('Other Contacts cache invalidated');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to invalidate cache:', (error as Error).message);
      }
    }
  }

  async removeByEmails(emails: string[]): Promise<void> {
    const cacheData = await this.getWithTimestamp();
    if (!cacheData) {
      await this.invalidate();
      return;
    }
    const normalizedEmailsToRemove = new Set(
      emails.map((e) => EmailNormalizer.normalize(e))
    );
    const filtered = cacheData.entries.filter((entry) => {
      for (const email of entry.emails) {
        if (normalizedEmailsToRemove.has(EmailNormalizer.normalize(email))) {
          return false;
        }
      }
      return true;
    });
    await this.set(filtered, cacheData.timestamp);
  }

  async removeByPhones(phones: string[]): Promise<void> {
    const cacheData = await this.getWithTimestamp();
    if (!cacheData) {
      await this.invalidate();
      return;
    }
    const filtered = cacheData.entries.filter((entry) => {
      for (const phone of entry.phones) {
        for (const phoneToRemove of phones) {
          if (PhoneNormalizer.phonesMatch(phone, phoneToRemove)) {
            return false;
          }
        }
      }
      return true;
    });
    await this.set(filtered, cacheData.timestamp);
  }

  async removeByResourceName(resourceName: string): Promise<void> {
    const cacheData = await this.getWithTimestamp();
    if (!cacheData) {
      await this.invalidate();
      return;
    }
    const filtered = cacheData.entries.filter(
      (entry) => entry.resourceName !== resourceName
    );
    await this.set(filtered, cacheData.timestamp);
  }

  async removeEntry(entry: OtherContactEntry): Promise<void> {
    try {
      if (entry.emails.length > 0) {
        await this.removeByEmails(entry.emails);
      } else if (entry.phones.length > 0) {
        await this.removeByPhones(entry.phones);
      } else {
        await this.removeByResourceName(entry.resourceName);
      }
    } catch (error) {
      console.warn(
        `Failed to remove entry from cache: ${(error as Error).message}`
      );
    }
  }
}
