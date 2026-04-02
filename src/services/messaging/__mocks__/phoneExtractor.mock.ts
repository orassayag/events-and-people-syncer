import type {
  ExtractedContact,
  MessageSource,
} from '../../../types/smsWhatsappSync';

export const createMockExtractedContact = (
  phone: string,
  suggestedName?: string
): ExtractedContact => ({
  phone,
  normalizedPhone: phone.replace(/[^\d+#*]/g, ''),
  suggestedName,
});

export const mockExtractedContacts: ExtractedContact[] = [
  createMockExtractedContact('+972501234567'),
  createMockExtractedContact('+1-555-987-6543'),
  createMockExtractedContact('052-999-5784'),
];

export const mockExtractedContactsWithNames: ExtractedContact[] = [
  createMockExtractedContact('+972509876543'),
  createMockExtractedContact('+972 54-441-9002', 'נתנאל'),
  createMockExtractedContact('+1-555-123-4567'),
];

export const mockInternationalContacts: ExtractedContact[] = [
  createMockExtractedContact('+1 (555) 123-4567'),
  createMockExtractedContact('+44 20 7946 0958'),
  createMockExtractedContact('+49 30 1234567'),
  createMockExtractedContact('+33 1 23 45 67 89'),
  createMockExtractedContact('+972 52-123-4567'),
  createMockExtractedContact('+81 3-1234-5678'),
  createMockExtractedContact('+86 10 1234 5678'),
  createMockExtractedContact('+61 2 1234 5678'),
];

export const mockDuplicateContacts: ExtractedContact[] = [
  createMockExtractedContact('+972501234567'),
  createMockExtractedContact('+972-50-123-4567'),
  createMockExtractedContact('050-123-4567'),
  createMockExtractedContact('+972509876543'),
];

export class MockPhoneExtractor {
  private mockContacts: ExtractedContact[] = [];
  setMockContacts(contacts: ExtractedContact[]): void {
    this.mockContacts = contacts;
  }

  extractPhoneNumbers(
    _html: string,
    _source: MessageSource
  ): ExtractedContact[] {
    return this.mockContacts;
  }

  deduplicateContacts(contacts: ExtractedContact[]): ExtractedContact[] {
    const seen = new Set<string>();
    const unique: ExtractedContact[] = [];
    for (const contact of contacts) {
      if (!seen.has(contact.normalizedPhone)) {
        seen.add(contact.normalizedPhone);
        unique.push(contact);
      }
    }
    return unique;
  }
}
