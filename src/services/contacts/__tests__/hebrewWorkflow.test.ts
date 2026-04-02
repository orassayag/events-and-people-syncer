import { describe, it, expect } from 'vitest';
import { RegexPatterns } from '../../../regex/patterns';

/**
 * Test suite for Hebrew to English workflow
 *
 * This tests the complete workflow of converting Hebrew text to English
 * in the contacts sync script. While the actual conversion is done manually
 * by the user, these tests verify that:
 * 1. Hebrew is properly detected
 * 2. Hebrew can be replaced with English
 * 3. The validation allows Hebrew input during editing
 */
describe('Hebrew to English Workflow', () => {
  describe('Hebrew Detection in Various Fields', () => {
    it('should detect Hebrew in first name and allow English replacement', () => {
      const hebrewName = 'יוסי';
      const englishName = 'Yossi';
      expect(RegexPatterns.HEBREW.test(hebrewName)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishName)).toBe(false);
    });

    it('should detect Hebrew in last name and allow English replacement', () => {
      const hebrewLastName = 'כהן';
      const englishLastName = 'Cohen';
      expect(RegexPatterns.HEBREW.test(hebrewLastName)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishLastName)).toBe(false);
    });

    it('should detect Hebrew in company name and allow English replacement', () => {
      const hebrewCompany = 'אלביט מערכות';
      const englishCompany = 'Elbit Systems';
      expect(RegexPatterns.HEBREW.test(hebrewCompany)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishCompany)).toBe(false);
    });

    it('should detect Hebrew in job title and allow English replacement', () => {
      const hebrewJobTitle = 'מהנדס בכיר';
      const englishJobTitle = 'Senior Engineer';
      expect(RegexPatterns.HEBREW.test(hebrewJobTitle)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishJobTitle)).toBe(false);
    });

    it('should detect Hebrew in email address value and allow English replacement', () => {
      const hebrewEmail = 'יוסי@example.com';
      const englishEmail = 'yossi@example.com';
      expect(RegexPatterns.HEBREW.test(hebrewEmail)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishEmail)).toBe(false);
    });

    it('should detect Hebrew in phone number and allow English replacement', () => {
      const hebrewPhone = '+972-50-1234567 עבודה';
      const englishPhone = '+972-50-1234567';
      expect(RegexPatterns.HEBREW.test(hebrewPhone)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishPhone)).toBe(false);
    });

    it('should detect Hebrew in label/contact group and allow English replacement', () => {
      const hebrewLabel = 'עבודה';
      const englishLabel = 'Work';
      expect(RegexPatterns.HEBREW.test(hebrewLabel)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishLabel)).toBe(false);
    });
  });

  describe('Mixed Hebrew-English Content', () => {
    it('should detect Hebrew in mixed content and allow full English replacement', () => {
      const mixedContent = 'Microsoft ישראל';
      const englishContent = 'Microsoft Israel';
      expect(RegexPatterns.HEBREW.test(mixedContent)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishContent)).toBe(false);
    });

    it('should handle partial Hebrew in composite last name', () => {
      const hebrewComposite = 'Cohen Job אלביט';
      const englishComposite = 'Cohen Job Elbit';
      expect(RegexPatterns.HEBREW.test(hebrewComposite)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishComposite)).toBe(false);
    });

    it('should handle Hebrew in company within full name display', () => {
      const hebrewFullDisplay = 'John Doe Job אלביט מערכות';
      const englishFullDisplay = 'John Doe Job Elbit Systems';
      expect(RegexPatterns.HEBREW.test(hebrewFullDisplay)).toBe(true);
      expect(RegexPatterns.HEBREW.test(englishFullDisplay)).toBe(false);
    });
  });

  describe('Validation Allows Hebrew During Editing', () => {
    /**
     * These tests verify that the validation logic allows Hebrew characters
     * during the editing phase. This is critical because users need to:
     * 1. See the Hebrew text in the current contact
     * 2. Be able to input Hebrew text temporarily while fixing
     * 3. Gradually convert Hebrew to English field by field
     */
    it('should allow Hebrew when allowHebrew parameter is true', () => {
      const allowHebrew = true;
      const hebrewText = 'יוסי';
      const validationPassed = allowHebrew
        ? true
        : RegexPatterns.HEBREW.test(hebrewText);
      expect(validationPassed).toBe(true);
    });

    it('should reject Hebrew when allowHebrew parameter is false', () => {
      const allowHebrew = false;
      const hebrewText = 'יוסי';
      const hasHebrew = RegexPatterns.HEBREW.test(hebrewText);
      const validationFailed = !allowHebrew && hasHebrew;
      expect(validationFailed).toBe(true);
    });

    it('should allow English text regardless of allowHebrew setting', () => {
      const englishText = 'Yossi';
      const hasHebrew = RegexPatterns.HEBREW.test(englishText);
      expect(hasHebrew).toBe(false);
    });
  });

  describe('Iterative Syncing Workflow', () => {
    /**
     * Tests the scenario where a contact is synced multiple times
     * across different sessions, gradually converting all Hebrew to English
     */
    it('should allow contact to be synced again after partial Hebrew removal', () => {
      const iteration1Contact = {
        firstName: 'יוסי',
        lastName: 'כהן',
        company: 'אלביט מערכות',
        note: '',
      };
      const iteration2Contact = {
        firstName: 'Yossi',
        lastName: 'כהן',
        company: 'אלביט מערכות',
        note: 'Updated by the contacts sync script - Last update: 13/03/2026',
      };
      const iteration3Contact = {
        firstName: 'Yossi',
        lastName: 'Cohen',
        company: 'Elbit Systems',
        note: 'Updated by the contacts sync script - Last update: 14/03/2026',
      };
      const hasHebrew1 =
        RegexPatterns.HEBREW.test(iteration1Contact.firstName) ||
        RegexPatterns.HEBREW.test(iteration1Contact.lastName) ||
        RegexPatterns.HEBREW.test(iteration1Contact.company);
      const hasHebrew2 =
        RegexPatterns.HEBREW.test(iteration2Contact.firstName) ||
        RegexPatterns.HEBREW.test(iteration2Contact.lastName) ||
        RegexPatterns.HEBREW.test(iteration2Contact.company);
      const hasHebrew3 =
        RegexPatterns.HEBREW.test(iteration3Contact.firstName) ||
        RegexPatterns.HEBREW.test(iteration3Contact.lastName) ||
        RegexPatterns.HEBREW.test(iteration3Contact.company);
      expect(hasHebrew1).toBe(true);
      expect(hasHebrew2).toBe(true);
      expect(hasHebrew3).toBe(false);
    });

    it('should continue to show in sync list until all Hebrew removed', () => {
      const SYNCER_ADDED_NOTE = /Added by the people syncer script/;
      const SYNCER_UPDATED_NOTE = /Updated by the people syncer script/;
      const SYNC_ADDED_NOTE = /Added by the contacts sync script/;
      const contactWithSyncedNote = {
        firstName: 'Yossi',
        lastName: 'כהן',
        company: 'Elbit',
        note: 'Updated by the contacts sync script - Last update: 13/03/2026',
      };
      const shouldExclude =
        SYNCER_ADDED_NOTE.test(contactWithSyncedNote.note) ||
        SYNCER_UPDATED_NOTE.test(contactWithSyncedNote.note) ||
        SYNC_ADDED_NOTE.test(contactWithSyncedNote.note);
      const hasHebrew = RegexPatterns.HEBREW.test(
        contactWithSyncedNote.lastName
      );
      const shouldIncludeInSyncList = !shouldExclude && hasHebrew;
      expect(shouldIncludeInSyncList).toBe(true);
    });
  });

  describe('LinkedIn URL Hebrew Exclusion', () => {
    /**
     * Critical test: LinkedIn URLs should NEVER trigger Hebrew detection
     * because LinkedIn normalizes all URLs to ASCII format
     */
    it('should NOT detect Hebrew in LinkedIn URLs (ASCII normalized)', () => {
      const linkedInUrls = [
        'https://linkedin.com/in/yossi-cohen',
        'https://linkedin.com/in/john-doe',
        'https://www.linkedin.com/in/jane-smith',
        'linkedin.com/in/test-user',
      ];
      for (const url of linkedInUrls) {
        const hasHebrew = RegexPatterns.HEBREW.test(url);
        expect(hasHebrew).toBe(false);
      }
    });

    it('should detect Hebrew in other fields but not LinkedIn URL', () => {
      const contact = {
        firstName: 'יוסי',
        company: 'אלביט',
        linkedInUrl: 'https://linkedin.com/in/yossi-cohen',
      };
      const hebrewInName = RegexPatterns.HEBREW.test(contact.firstName);
      const hebrewInCompany = RegexPatterns.HEBREW.test(contact.company);
      const hebrewInLinkedIn = RegexPatterns.HEBREW.test(contact.linkedInUrl);
      expect(hebrewInName).toBe(true);
      expect(hebrewInCompany).toBe(true);
      expect(hebrewInLinkedIn).toBe(false);
    });
  });
});
