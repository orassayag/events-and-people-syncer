import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { ContactCache } from '../contactCache';
import { SETTINGS } from '../../settings';
import { PhoneNormalizer } from '../../services/contacts';
import { UrlNormalizer } from '../../services/linkedin';
import type { ContactData } from '../../types';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('../../settings', () => ({
  SETTINGS: {
    linkedin: {
      cachePath: '/mock/cache/path',
    },
  },
}));

describe('ContactCache', () => {
  let cache: ContactCache;
  const mockContacts: ContactData[] = [
    {
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme',
      jobTitle: 'Engineer',
      emails: [{ value: 'john@example.com', label: 'work' }],
      phones: [{ number: '+1-555-123-4567', label: 'mobile' }],
      websites: [
        { url: 'https://www.linkedin.com/in/johndoe', label: 'linkedin' },
      ],
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
      company: 'Tech Corp',
      jobTitle: 'Manager',
      emails: [
        { value: 'jane@example.com', label: 'work' },
        { value: 'jane.personal@gmail.com', label: 'home' },
      ],
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
    // @ts-ignore - access private static member for testing
    ContactCache.instance = undefined;
    cache = ContactCache.getInstance();
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = ContactCache.getInstance();
      const instance2 = ContactCache.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('set', () => {
    it('should save contacts to file', async () => {
      await cache.set(mockContacts);
      expect(fs.mkdir).toHaveBeenCalledWith('/mock/cache/path', {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('contact-cache.json'),
        expect.stringContaining('John'),
        'utf-8'
      );
    });

    it('should handle write errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Write failed'));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await cache.set(mockContacts);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to write contact cache:',
        'Write failed'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('get', () => {
    it('should return contacts from file if not expired', async () => {
      const data = {
        contacts: mockContacts,
        timestamp: Date.now(),
      };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.get();
      expect(result).toEqual(mockContacts);
    });

    it('should return null and invalidate if expired', async () => {
      const data = {
        contacts: mockContacts,
        timestamp: Date.now() - 86400000 * 31, // 31 days ago
      };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.get();
      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return null on file read error', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read failed'));
      const result = await cache.get();
      expect(result).toBeNull();
    });
  });

  describe('getByLinkedInSlug', () => {
    it('should find contact by LinkedIn slug', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByLinkedInSlug(
        'https://www.linkedin.com/in/johndoe'
      );
      expect(result).toEqual(mockContacts[0]);
    });

    it('should return null if not found', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByLinkedInSlug(
        'https://www.linkedin.com/in/unknown'
      );
      expect(result).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('should find contacts by email', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByEmail('jane@example.com');
      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('Jane');
    });
  });

  describe('getByResourceName', () => {
    it('should find contact by resource name', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByResourceName('people/2');
      expect(result).toEqual(mockContacts[1]);
    });
  });

  describe('invalidate', () => {
    it('should remove the cache file', async () => {
      await cache.invalidate();
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('getByNormalizedPhone', () => {
    it('should find contact by phone variation', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByNormalizedPhone('+15551234567');
      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('John');
    });
  });

  describe('getByNormalizedEmail', () => {
    it('should find contact by normalized email', async () => {
      const data = { contacts: mockContacts, timestamp: Date.now() };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(data));

      const result = await cache.getByNormalizedEmail(' JANE@EXAMPLE.COM ');
      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('Jane');
    });
  });
});
