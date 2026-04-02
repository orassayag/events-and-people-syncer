import type { ContactData } from "../types.js";

export class ContactCache {
  private static instance: ContactCache;
  private cachedContacts: ContactData[] | null = null;
  private cacheTimestamp: number | null = null;
  private readonly TTL = 24 * 60 * 60 * 1000;

  private constructor() {}

  static getInstance(): ContactCache {
    if (!ContactCache.instance) {
      ContactCache.instance = new ContactCache();
    }
    return ContactCache.instance;
  }

  get(): Promise<ContactData[]> | null {
    if (!this.cachedContacts || !this.cacheTimestamp) {
      return null;
    }
    const now = Date.now();
    if (now - this.cacheTimestamp > this.TTL) {
      this.invalidate();
      return null;
    }
    return Promise.resolve(this.cachedContacts);
  }

  set(contacts: ContactData[]): void {
    this.cachedContacts = contacts;
    this.cacheTimestamp = Date.now();
  }

  invalidate(): void {
    this.cachedContacts = null;
    this.cacheTimestamp = null;
  }
}
