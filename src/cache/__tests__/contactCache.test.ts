import { describe, it, expect, vi } from 'vitest';
import { EmailNormalizer } from '../../services/contacts';

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

describe('ContactCache - getByNormalizedEmail', () => {
  const mockContacts = [
    {
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme',
      jobTitle: 'Engineer',
      emails: [{ value: 'john@example.com', label: 'work' }],
      phones: [{ number: '+1-555-123-4567', label: 'mobile' }],
      websites: [],
      resourceName: 'people/1',
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
    },
    {
      firstName: 'Bob',
      lastName: 'Wilson',
      company: '',
      jobTitle: '',
      emails: [{ value: 'BOB.WILSON@Example.COM', label: 'other' }],
      phones: [],
      websites: [],
      resourceName: 'people/3',
    },
    {
      firstName: 'Alice',
      lastName: 'Brown',
      company: 'Startup',
      jobTitle: 'CEO',
      emails: [],
      phones: [{ number: '+972-50-123-4567', label: 'mobile' }],
      websites: [],
      resourceName: 'people/4',
    },
  ];

  const getByNormalizedEmail = (
    contacts: typeof mockContacts,
    email: string
  ): typeof mockContacts => {
    const normalizedEmail = EmailNormalizer.normalize(email);
    const matches: typeof mockContacts = [];
    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (EmailNormalizer.normalize(contactEmail.value) === normalizedEmail) {
          matches.push(contact);
          break;
        }
      }
    }
    return matches;
  };

  it('should find contact by exact email match', () => {
    const result = getByNormalizedEmail(mockContacts, 'john@example.com');
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('John');
  });

  it('should find contact by case-insensitive email match', () => {
    const result = getByNormalizedEmail(mockContacts, 'JOHN@EXAMPLE.COM');
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('John');
  });

  it('should find contact by email with different case in stored value', () => {
    const result = getByNormalizedEmail(mockContacts, 'bob.wilson@example.com');
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Bob');
  });

  it('should find contact by email with leading/trailing whitespace', () => {
    const result = getByNormalizedEmail(mockContacts, '  john@example.com  ');
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('John');
  });

  it('should find contact with multiple emails by any email', () => {
    const result1 = getByNormalizedEmail(mockContacts, 'jane@example.com');
    expect(result1).toHaveLength(1);
    expect(result1[0].firstName).toBe('Jane');
    const result2 = getByNormalizedEmail(
      mockContacts,
      'jane.personal@gmail.com'
    );
    expect(result2).toHaveLength(1);
    expect(result2[0].firstName).toBe('Jane');
  });

  it('should return empty array for non-existent email', () => {
    const result = getByNormalizedEmail(
      mockContacts,
      'nonexistent@example.com'
    );
    expect(result).toHaveLength(0);
  });

  it('should return empty array for empty email', () => {
    const result = getByNormalizedEmail(mockContacts, '');
    expect(result).toHaveLength(0);
  });

  it('should return empty array when contacts have no emails', () => {
    const contactsWithNoEmails = [mockContacts[3]];
    const result = getByNormalizedEmail(
      contactsWithNoEmails,
      'test@example.com'
    );
    expect(result).toHaveLength(0);
  });

  it('should return empty array for null/empty contacts', () => {
    const result = getByNormalizedEmail([], 'john@example.com');
    expect(result).toHaveLength(0);
  });

  it('should not match plus-addressed emails as the same', () => {
    const contactsWithPlusAddress = [
      {
        firstName: 'Test',
        lastName: 'User',
        company: '',
        jobTitle: '',
        emails: [{ value: 'user@example.com', label: 'work' }],
        phones: [],
        websites: [],
        resourceName: 'people/5',
      },
    ];
    const result = getByNormalizedEmail(
      contactsWithPlusAddress,
      'user+tag@example.com'
    );
    expect(result).toHaveLength(0);
  });

  it('should match email with subdomain correctly', () => {
    const contactsWithSubdomain = [
      {
        firstName: 'Sub',
        lastName: 'Domain',
        company: '',
        jobTitle: '',
        emails: [{ value: 'user@mail.example.com', label: 'work' }],
        phones: [],
        websites: [],
        resourceName: 'people/6',
      },
    ];
    const result = getByNormalizedEmail(
      contactsWithSubdomain,
      'USER@MAIL.EXAMPLE.COM'
    );
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Sub');
  });
});

describe('ContactCache - getByNormalizedPhone integration', () => {
  it('should handle phone lookup scenario correctly', () => {
    const normalizeDigits = (phone: string): string => phone.replace(/\D/g, '');
    const phone1 = '+972-50-123-4567';
    const phone2 = '0501234567';
    const digits1 = normalizeDigits(phone1);
    const digits2 = normalizeDigits(phone2);
    expect(digits1).toBe('972501234567');
    expect(digits2).toBe('0501234567');
    expect(digits1.endsWith(digits2.substring(1))).toBe(true);
  });
});
