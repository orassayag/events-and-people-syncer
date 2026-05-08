import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicateDetector } from '../duplicateDetector';
import { ContactCache } from '../../../cache';
import { PhoneNormalizer } from '../phoneNormalizer';
import type { ContactData, OAuth2Client } from '../../../types';

vi.mock('../../../cache', () => ({
  ContactCache: {
    getInstance: vi.fn().mockReturnValue({
      getByEmail: vi.fn(),
      getByNormalizedPhone: vi.fn(),
    }),
  },
}));

vi.mock('../../../logging', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('../../../utils', () => ({
  confirmWithEscape: vi.fn(),
  selectWithEscape: vi.fn(),
  retryWithBackoff: vi.fn((fn) => fn()),
  formatMixedHebrewEnglish: vi.fn((s) => s),
}));

describe('DuplicateDetector', () => {
  let detector: DuplicateDetector;
  let mockAuth: OAuth2Client;
  let mockCache: any;

  const mockContacts: ContactData[] = [
    {
      firstName: 'John',
      lastName: 'Doe',
      emails: [{ value: 'john@example.com', label: 'work' }],
      phones: [{ number: '+15551234567', label: 'mobile' }],
      websites: [],
      resourceName: 'people/1',
      addresses: [],
      organizations: [],
      notes: [],
      birthdays: [],
      metadata: { sources: [] },
    },
    {
      firstName: 'Jane',
      lastName: 'Smith',
      emails: [{ value: 'jane@example.com', label: 'work' }],
      phones: [],
      websites: [],
      resourceName: 'people/2',
      addresses: [],
      organizations: [],
      notes: [],
      birthdays: [],
      metadata: { sources: [] },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {} as OAuth2Client;
    mockCache = ContactCache.getInstance();
    detector = new DuplicateDetector(mockAuth);
    // @ts-ignore - access private method for testing
    detector.fetchAllContacts = vi.fn().mockResolvedValue(mockContacts);
  });

  describe('checkDuplicateEmail', () => {
    it('should find duplicates via cache', async () => {
      mockCache.getByEmail.mockResolvedValue([mockContacts[0]]);
      const matches = await detector.checkDuplicateEmail('john@example.com');
      expect(matches).toHaveLength(1);
      expect(matches[0].contact.firstName).toBe('John');
      expect(matches[0].similarityType).toBe('Email');
    });

    it('should find duplicates via fetchAllContacts if not in cache', async () => {
      mockCache.getByEmail.mockResolvedValue([]);
      const matches = await detector.checkDuplicateEmail('jane@example.com');
      expect(matches).toHaveLength(1);
      expect(matches[0].contact.firstName).toBe('Jane');
    });
  });

  describe('checkDuplicatePhone', () => {
    it('should find duplicates via cache', async () => {
      mockCache.getByNormalizedPhone.mockResolvedValue([mockContacts[0]]);
      const matches = await detector.checkDuplicatePhone('+15551234567');
      expect(matches).toHaveLength(1);
      expect(matches[0].contact.firstName).toBe('John');
      expect(matches[0].similarityType).toBe('Phone');
    });
  });

  describe('checkDuplicateName', () => {
    it('should find duplicates by full name', async () => {
      const matches = await detector.checkDuplicateName('John', 'Doe');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].contact.firstName).toBe('John');
    });

    it('should find duplicates with fuzzy matching', async () => {
      const matches = await detector.checkDuplicateName('Johny', 'Doe');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].contact.firstName).toBe('John');
    });
  });

  describe('levenshteinDistance', () => {
    it('should calculate distance correctly', () => {
      // @ts-ignore - access private method
      expect(detector.levenshteinDistance('kitten', 'sitting')).toBe(3);
      // @ts-ignore - access private method
      expect(detector.levenshteinDistance('book', 'back')).toBe(2);
    });
  });

  describe('extractCleanLastName', () => {
    it('should clean hiring suffix', () => {
      const contact = { ...mockContacts[0], lastName: "Doe I'm hiring" };
      // @ts-ignore - access private method
      expect(detector.extractCleanLastName(contact)).toBe('Doe');
    });
  });
});
