import type { ContactData } from '../../types/contact';

export const createMockContact = (
  firstName: string,
  lastName: string,
  phones: string[] = [],
  emails: string[] = [],
  resourceName?: string
): ContactData => ({
  firstName,
  lastName,
  label: 'Test',
  company: 'Test Company',
  jobTitle: 'Test Title',
  emails: emails.map((email) => ({ value: email, label: 'work' })),
  phones: phones.map((phone) => ({ number: phone, label: 'mobile' })),
  websites: [],
  resourceName,
  biography: '',
  etag: 'mock-etag',
});

export const mockContactsWithPhones: ContactData[] = [
  createMockContact(
    'John',
    'Doe',
    ['+972501234567'],
    ['john@test.com'],
    'people/1'
  ),
  createMockContact(
    'Jane',
    'Smith',
    ['+1-555-987-6543'],
    ['jane@test.com'],
    'people/2'
  ),
  createMockContact(
    'אבי',
    'כהן',
    ['052-111-2222'],
    ['avi@test.com'],
    'people/3'
  ),
  createMockContact(
    'David',
    'Wilson',
    ['+44 20 7946 0958', '+44 7700 900123'],
    [],
    'people/4'
  ),
];

export const mockContactsWithoutPhones: ContactData[] = [
  createMockContact('Alice', 'Brown', [], ['alice@test.com'], 'people/5'),
  createMockContact('Bob', 'Green', [], ['bob@test.com'], 'people/6'),
];

export class MockContactCache {
  private static instance: MockContactCache;
  private contacts: ContactData[] = [];
  private phoneIndex: Map<string, string[]> = new Map();

  static getInstance(): MockContactCache {
    if (!MockContactCache.instance) {
      MockContactCache.instance = new MockContactCache();
    }
    return MockContactCache.instance;
  }

  static resetInstance(): void {
    MockContactCache.instance = new MockContactCache();
  }

  setContacts(contacts: ContactData[]): void {
    this.contacts = contacts;
    this.buildPhoneIndex();
  }

  get(): Promise<ContactData[] | null> {
    return Promise.resolve(this.contacts.length > 0 ? this.contacts : null);
  }

  set(contacts: ContactData[]): Promise<void> {
    this.contacts = contacts;
    this.buildPhoneIndex();
    return Promise.resolve();
  }

  invalidate(): Promise<void> {
    this.phoneIndex.clear();
    return Promise.resolve();
  }

  private buildPhoneIndex(): void {
    this.phoneIndex.clear();
    for (const contact of this.contacts) {
      if (!contact.resourceName) continue;
      for (const phone of contact.phones) {
        const normalized = phone.number.replace(/[^\d+#*]/g, '');
        const digitsOnly = phone.number.replace(/\D/g, '');
        for (const variant of [normalized, digitsOnly]) {
          const existing = this.phoneIndex.get(variant) || [];
          if (!existing.includes(contact.resourceName)) {
            existing.push(contact.resourceName);
          }
          this.phoneIndex.set(variant, existing);
        }
      }
    }
  }

  getByNormalizedPhone(phone: string): Promise<ContactData[]> {
    if (this.contacts.length === 0) return Promise.resolve([]);
    const normalized = phone.replace(/[^\d+#*]/g, '');
    const digitsOnly = phone.replace(/\D/g, '');
    const resourceNames = new Set<string>();
    for (const variant of [normalized, digitsOnly]) {
      const matches = this.phoneIndex.get(variant) || [];
      matches.forEach((rn) => resourceNames.add(rn));
    }
    return Promise.resolve(
      this.contacts.filter(
        (c) => c.resourceName && resourceNames.has(c.resourceName)
      )
    );
  }

  getByEmail(email: string): Promise<ContactData[]> {
    const emailLower = email.toLowerCase();
    return Promise.resolve(
      this.contacts.filter((c) =>
        c.emails.some((e) => e.value.toLowerCase() === emailLower)
      )
    );
  }

  getByResourceName(resourceName: string): Promise<ContactData | null> {
    return Promise.resolve(
      this.contacts.find((c) => c.resourceName === resourceName) || null
    );
  }
}
