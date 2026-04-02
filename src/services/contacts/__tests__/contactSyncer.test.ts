import { describe, it, expect } from 'vitest';
import type { ContactData } from '../../../types/contact';
import { RegexPatterns } from '../../../regex/patterns';

describe('ContactSyncer - Hebrew Detection', () => {
  const mockContact: ContactData = {
    label: 'Job',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Tech Corp',
    jobTitle: 'Engineer',
    emails: [{ value: 'john@example.com', label: 'work' }],
    phones: [{ number: '+1234567890', label: 'mobile' }],
    websites: [{ url: 'https://linkedin.com/in/johndoe', label: 'LinkedIn' }],
    resourceName: 'people/c123',
    note: '',
  };

  describe('checkHebrewInAllFields', () => {
    it('should detect Hebrew in first name', () => {
      const contact = { ...mockContact, firstName: 'יוסי' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.firstName);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in last name', () => {
      const contact = { ...mockContact, lastName: 'כהן' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.lastName);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in company', () => {
      const contact = { ...mockContact, company: 'אלביט מערכות' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.company);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in job title', () => {
      const contact = { ...mockContact, jobTitle: 'מהנדס בכיר' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.jobTitle);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in label', () => {
      const contact = { ...mockContact, label: 'עבודה' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.label);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in email value', () => {
      const contact = {
        ...mockContact,
        emails: [{ value: 'יוסי@example.com', label: 'work' }],
      };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.emails[0].value);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in phone number', () => {
      const contact = {
        ...mockContact,
        phones: [{ number: '+972-50-1234567 עבודה', label: 'mobile' }],
      };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.phones[0].number);
      expect(hasHebrew).toBe(true);
    });

    it('should detect Hebrew in note', () => {
      const contact = { ...mockContact, note: 'הערה אישית' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.note || '');
      expect(hasHebrew).toBe(true);
    });

    it('should NOT detect Hebrew in LinkedIn URL (ASCII only)', () => {
      const contact = {
        ...mockContact,
        websites: [
          { url: 'https://linkedin.com/in/johndoe', label: 'LinkedIn' },
        ],
      };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.websites[0].url);
      expect(hasHebrew).toBe(false);
    });

    it('should not detect Hebrew in English-only contact', () => {
      const hasHebrew = [
        mockContact.firstName,
        mockContact.lastName,
        mockContact.company,
        mockContact.jobTitle,
        mockContact.label,
        mockContact.note || '',
        ...mockContact.emails.map((e) => e.value),
        ...mockContact.phones.map((p) => p.number),
      ].some((field) => field && RegexPatterns.HEBREW.test(field));
      expect(hasHebrew).toBe(false);
    });

    it('should detect Hebrew in mixed content (Hebrew + English)', () => {
      const contact = { ...mockContact, company: 'Microsoft ישראל' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.company);
      expect(hasHebrew).toBe(true);
    });
  });

  describe('Priority Categorization', () => {
    it('should assign priority 1 for Hebrew content', () => {
      const contact = { ...mockContact, firstName: 'יוסי' };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.firstName);
      const priority = hasHebrew ? 1 : 4;
      expect(priority).toBe(1);
    });

    it('should assign priority 2 for missing label', () => {
      const contact = { ...mockContact, label: '' };
      const hasHebrew = false;
      const noLabel = !contact.label || contact.label.trim() === '';
      const priority = hasHebrew ? 1 : noLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 2 for "Unknown" label', () => {
      const contact = { ...mockContact, label: 'Unknown' };
      const hasHebrew = false;
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const priority = hasHebrew ? 1 : hasUnknownLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 2 for "unknown" label (case-insensitive)', () => {
      const contact = { ...mockContact, label: 'UNKNOWN' };
      const hasHebrew = false;
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const priority = hasHebrew ? 1 : hasUnknownLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 2 for "Unknown" label with spaces', () => {
      const contact = { ...mockContact, label: '  Unknown  ' };
      const hasHebrew = false;
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const priority = hasHebrew ? 1 : hasUnknownLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 2 for "Unknown" in multi-label string', () => {
      const contact = { ...mockContact, label: 'Job | Unknown | HR' };
      const hasHebrew = false;
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const priority = hasHebrew ? 1 : hasUnknownLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 2 for "UNKNOWN" in multi-label string (case-insensitive)', () => {
      const contact = { ...mockContact, label: 'Job | UNKNOWN | HR' };
      const hasHebrew = false;
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const priority = hasHebrew ? 1 : hasUnknownLabel ? 2 : 4;
      expect(priority).toBe(2);
    });

    it('should assign priority 3 for missing company', () => {
      const contact = { ...mockContact, company: '' };
      const hasHebrew = false;
      const noLabel = false;
      const noCompany = !contact.company || contact.company.trim() === '';
      const priority = hasHebrew ? 1 : noLabel ? 2 : noCompany ? 3 : 4;
      expect(priority).toBe(3);
    });

    it('should assign priority 4 for missing other fields', () => {
      const hasHebrew = false;
      const noLabel = false;
      const noCompany = false;
      const priority = hasHebrew ? 1 : noLabel ? 2 : noCompany ? 3 : 4;
      expect(priority).toBe(4);
    });

    it('should use highest priority when multiple issues exist', () => {
      const contact = {
        ...mockContact,
        firstName: 'יוסי',
        label: '',
        company: '',
      };
      const hasHebrew = RegexPatterns.HEBREW.test(contact.firstName);
      const priority = hasHebrew ? 1 : 4;
      expect(priority).toBe(1);
    });
  });

  describe('Filter Contacts Logic', () => {
    it('should exclude contact with SYNCER_ADDED_NOTE', () => {
      const note =
        'Added by the people syncer script - Last update: 13/03/2026';
      const shouldExclude = RegexPatterns.SYNCER_ADDED_NOTE.test(note);
      expect(shouldExclude).toBe(true);
    });

    it('should exclude contact with SYNCER_UPDATED_NOTE', () => {
      const note =
        'Updated by the people syncer script - Last update: 13/03/2026';
      const shouldExclude = RegexPatterns.SYNCER_UPDATED_NOTE.test(note);
      expect(shouldExclude).toBe(true);
    });

    it('should exclude contact with SYNC_ADDED_NOTE', () => {
      const note =
        'Added by the contacts sync script - Last update: 13/03/2026';
      const shouldExclude = RegexPatterns.SYNC_ADDED_NOTE.test(note);
      expect(shouldExclude).toBe(true);
    });

    it('should INCLUDE contact with SYNC_UPDATED_NOTE (allows re-syncing)', () => {
      const note =
        'Updated by the contacts sync script - Last update: 13/03/2026';
      const shouldExclude =
        RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
        RegexPatterns.SYNC_ADDED_NOTE.test(note);
      expect(shouldExclude).toBe(false);
    });

    it('should INCLUDE contact with no note', () => {
      const note = '';
      const shouldExclude =
        RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
        RegexPatterns.SYNC_ADDED_NOTE.test(note);
      expect(shouldExclude).toBe(false);
    });

    it('should INCLUDE contact with personal note', () => {
      const note = 'This is my friend from college';
      const shouldExclude =
        RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
        RegexPatterns.SYNC_ADDED_NOTE.test(note);
      expect(shouldExclude).toBe(false);
    });

    it('should INCLUDE contact with "Unknown" label even if has SYNCER_ADDED_NOTE', () => {
      const contact = {
        ...mockContact,
        label: 'Unknown',
        note: 'Added by the people syncer script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });

    it('should INCLUDE contact with "Unknown" label even if has SYNCER_UPDATED_NOTE', () => {
      const contact = {
        ...mockContact,
        label: 'Unknown',
        note: 'Updated by the people syncer script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });

    it('should INCLUDE contact with "Unknown" label even if has SYNC_ADDED_NOTE', () => {
      const contact = {
        ...mockContact,
        label: 'Unknown',
        note: 'Added by the contacts sync script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });

    it('should INCLUDE contact with "UNKNOWN" label (case-insensitive) even if has excluded note', () => {
      const contact = {
        ...mockContact,
        label: 'UNKNOWN',
        note: 'Added by the people syncer script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });

    it('should INCLUDE contact with "Unknown" in multi-label string even if has excluded note', () => {
      const contact = {
        ...mockContact,
        label: 'Job | Unknown | HR',
        note: 'Added by the people syncer script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });

    it('should INCLUDE contact with "UNKNOWN" in multi-label string (case-insensitive) even if has excluded note', () => {
      const contact = {
        ...mockContact,
        label: 'Job | UNKNOWN | Kol',
        note: 'Added by the contacts sync script - Last update: 13/03/2026',
      };
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const note = contact.note || '';
      const shouldInclude =
        hasUnknownLabel ||
        !(
          RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
          RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
          RegexPatterns.SYNC_ADDED_NOTE.test(note)
        );
      expect(shouldInclude).toBe(true);
    });
  });

  describe('Missing Fields Detection', () => {
    it('should detect missing email', () => {
      const contact = { ...mockContact, emails: [] };
      const isMissing = !contact.emails || contact.emails.length === 0;
      expect(isMissing).toBe(true);
    });

    it('should detect missing phone', () => {
      const contact = { ...mockContact, phones: [] };
      const isMissing = !contact.phones || contact.phones.length === 0;
      expect(isMissing).toBe(true);
    });

    it('should detect missing LinkedIn URL', () => {
      const contact = { ...mockContact, websites: [] };
      const hasLinkedIn = contact.websites.length > 0;
      expect(hasLinkedIn).toBe(false);
    });

    it('should detect missing job title', () => {
      const contact = { ...mockContact, jobTitle: '' };
      const isMissing = !contact.jobTitle || contact.jobTitle.trim() === '';
      expect(isMissing).toBe(true);
    });

    it('should handle null/undefined fields', () => {
      const contact = { ...mockContact, jobTitle: undefined as any };
      const isMissing =
        contact.jobTitle === null ||
        contact.jobTitle === undefined ||
        (contact.jobTitle && contact.jobTitle.trim() === '');
      expect(isMissing).toBe(true);
    });

    it('should detect emails with all empty values', () => {
      const contact = {
        ...mockContact,
        emails: [
          { value: '', label: 'work' },
          { value: '  ', label: 'home' },
        ],
      };
      const allEmpty = contact.emails.every((e) => {
        const value = e.value;
        return value === null || value === undefined || value.trim() === '';
      });
      expect(allEmpty).toBe(true);
    });

    it('should detect phones with all empty values', () => {
      const contact = {
        ...mockContact,
        phones: [
          { number: '', label: 'work' },
          { number: '   ', label: 'mobile' },
        ],
      };
      const allEmpty = contact.phones.every((p) => {
        const value = p.number;
        return value === null || value === undefined || value.trim() === '';
      });
      expect(allEmpty).toBe(true);
    });

    it('should NOT detect missing email if at least one has value', () => {
      const contact = {
        ...mockContact,
        emails: [
          { value: '', label: 'work' },
          { value: 'john@example.com', label: 'home' },
        ],
      };
      const allEmpty = contact.emails.every((e) => {
        const value = e.value;
        return value === null || value === undefined || value.trim() === '';
      });
      expect(allEmpty).toBe(false);
    });

    it('should NOT detect missing phone if at least one has value', () => {
      const contact = {
        ...mockContact,
        phones: [
          { number: '  ', label: 'work' },
          { number: '+1234567890', label: 'mobile' },
        ],
      };
      const allEmpty = contact.phones.every((p) => {
        const value = p.number;
        return value === null || value === undefined || value.trim() === '';
      });
      expect(allEmpty).toBe(false);
    });
  });

  describe('Resource Name Validation', () => {
    it('should detect valid resourceName', () => {
      const contact = { ...mockContact, resourceName: 'people/c123456789' };
      expect(contact.resourceName).toBeTruthy();
    });

    it('should detect missing resourceName', () => {
      const contact = { ...mockContact, resourceName: undefined };
      expect(contact.resourceName).toBeFalsy();
    });

    it('should detect empty resourceName', () => {
      const contact = { ...mockContact, resourceName: '' };
      expect(contact.resourceName).toBeFalsy();
    });
  });
});
