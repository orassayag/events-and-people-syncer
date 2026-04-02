import { promises as fs } from 'fs';
import { join } from 'path';
import type { ContactData, ContactCacheData } from '../types';
import { VALIDATION_CONSTANTS } from '../constants';
import { UrlNormalizer } from '../services/linkedin';
import { PhoneNormalizer, EmailNormalizer } from '../services/contacts';
import { SETTINGS } from '../settings';

export class ContactCache {
  private static instance: ContactCache;
  private readonly TTL: number = VALIDATION_CONSTANTS.CACHE.TTL_MS;
  private readonly cacheFilePath: string;
  private phoneIndex: Map<string, string[]> | null = null;

  private constructor() {
    this.cacheFilePath = join(
      SETTINGS.linkedin.cachePath,
      'contact-cache.json'
    );
  }

  static getInstance(): ContactCache {
    if (!ContactCache.instance) {
      ContactCache.instance = new ContactCache();
    }
    return ContactCache.instance;
  }

  async get(): Promise<ContactData[] | null> {
    try {
      const fileContent: string = await fs.readFile(
        this.cacheFilePath,
        'utf-8'
      );
      const data: ContactCacheData = JSON.parse(fileContent);
      const now: number = Date.now();
      if (now - data.timestamp <= this.TTL) {
        return data.contacts;
      }
      await this.invalidate();
      return null;
    } catch {
      return null;
    }
  }

  async set(contacts: ContactData[]): Promise<void> {
    try {
      await fs.mkdir(SETTINGS.linkedin.cachePath, { recursive: true });
      const data: ContactCacheData = {
        contacts,
        timestamp: Date.now(),
      };
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: unknown) {
      console.warn(
        'Failed to write contact cache:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async getByLinkedInSlug(url: string): Promise<ContactData | null> {
    const contacts = await this.get();
    if (!contacts) {
      return null;
    }
    const slug: string = UrlNormalizer.extractProfileSlug(url);
    for (const contact of contacts) {
      for (const website of contact.websites) {
        if (website.url.toLowerCase().includes('linkedin')) {
          const contactSlug: string = UrlNormalizer.extractProfileSlug(
            website.url
          );
          if (contactSlug === slug) {
            return contact;
          }
        }
      }
    }
    return null;
  }

  async getByEmail(email: string): Promise<ContactData[]> {
    const contacts = await this.get();
    if (!contacts) {
      return [];
    }
    const emailLower = email.toLowerCase();
    const matches: ContactData[] = [];
    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (contactEmail.value.toLowerCase() === emailLower) {
          matches.push(contact);
          break;
        }
      }
    }
    return matches;
  }

  async getByResourceName(resourceName: string): Promise<ContactData | null> {
    const contacts = await this.get();
    if (!contacts) {
      return null;
    }
    for (const contact of contacts) {
      if (contact.resourceName === resourceName) {
        return contact;
      }
    }
    return null;
  }

  async invalidate(): Promise<void> {
    this.phoneIndex = null;
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {}
  }

  private buildPhoneIndex(contacts: ContactData[]): void {
    this.phoneIndex = new Map();
    const normalizer = new PhoneNormalizer();
    for (const contact of contacts) {
      if (!contact.resourceName) continue;
      for (const phone of contact.phones) {
        const variations = normalizer.getAllNormalizedVariations(phone.number);
        for (const variation of variations) {
          const existing = this.phoneIndex.get(variation) || [];
          if (!existing.includes(contact.resourceName)) {
            existing.push(contact.resourceName);
          }
          this.phoneIndex.set(variation, existing);
        }
      }
    }
  }

  async getByNormalizedPhone(phone: string): Promise<ContactData[]> {
    const contacts = await this.get();
    if (!contacts) return [];
    if (!this.phoneIndex) {
      this.buildPhoneIndex(contacts);
    }
    const normalizer = new PhoneNormalizer();
    const variations = normalizer.getAllNormalizedVariations(phone);
    const resourceNames = new Set<string>();
    for (const variation of variations) {
      const matches = this.phoneIndex!.get(variation) || [];
      matches.forEach((rn) => resourceNames.add(rn));
    }
    return contacts.filter(
      (c) => c.resourceName && resourceNames.has(c.resourceName)
    );
  }

  async getByNormalizedEmail(email: string): Promise<ContactData[]> {
    const contacts = await this.get();
    if (!contacts) return [];
    const normalizedEmail = EmailNormalizer.normalize(email);
    const matches: ContactData[] = [];
    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (EmailNormalizer.normalize(contactEmail.value) === normalizedEmail) {
          matches.push(contact);
          break;
        }
      }
    }
    return matches;
  }
}
