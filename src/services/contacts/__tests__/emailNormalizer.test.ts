import { describe, it, expect } from 'vitest';
import { EmailNormalizer } from '../emailNormalizer';

describe('EmailNormalizer', () => {
  describe('normalize', () => {
    it('should convert email to lowercase', () => {
      expect(EmailNormalizer.normalize('John.DOE@Example.COM')).toBe(
        'john.doe@example.com'
      );
    });

    it('should trim whitespace', () => {
      expect(EmailNormalizer.normalize('  john@example.com  ')).toBe(
        'john@example.com'
      );
    });

    it('should handle already lowercase email', () => {
      expect(EmailNormalizer.normalize('john@example.com')).toBe(
        'john@example.com'
      );
    });

    it('should handle email with mixed case domain', () => {
      expect(EmailNormalizer.normalize('user@GMAIL.com')).toBe(
        'user@gmail.com'
      );
    });

    it('should preserve plus addressing', () => {
      expect(EmailNormalizer.normalize('user+tag@example.com')).toBe(
        'user+tag@example.com'
      );
    });

    it('should handle empty string', () => {
      expect(EmailNormalizer.normalize('')).toBe('');
    });

    it('should handle whitespace only', () => {
      expect(EmailNormalizer.normalize('   ')).toBe('');
    });
  });

  describe('emailsMatch', () => {
    it('should match identical emails', () => {
      expect(
        EmailNormalizer.emailsMatch('john@example.com', 'john@example.com')
      ).toBe(true);
    });

    it('should match emails with different cases', () => {
      expect(
        EmailNormalizer.emailsMatch('John@Example.COM', 'john@example.com')
      ).toBe(true);
    });

    it('should match emails with leading/trailing whitespace', () => {
      expect(
        EmailNormalizer.emailsMatch('  john@example.com  ', 'john@example.com')
      ).toBe(true);
    });

    it('should not match different emails', () => {
      expect(
        EmailNormalizer.emailsMatch('john@example.com', 'jane@example.com')
      ).toBe(false);
    });

    it('should not match emails with different plus addressing', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'user+tag1@example.com',
          'user+tag2@example.com'
        )
      ).toBe(false);
    });

    it('should not match email with plus addressing to email without', () => {
      expect(
        EmailNormalizer.emailsMatch('user+tag@example.com', 'user@example.com')
      ).toBe(false);
    });

    it('should match same email with different case and whitespace', () => {
      expect(
        EmailNormalizer.emailsMatch(
          '  JOHN.DOE@EXAMPLE.COM  ',
          'john.doe@example.com'
        )
      ).toBe(true);
    });

    it('should handle empty strings', () => {
      expect(EmailNormalizer.emailsMatch('', '')).toBe(true);
    });

    it('should not match empty with non-empty', () => {
      expect(EmailNormalizer.emailsMatch('', 'john@example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle email with dots before @', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'john.doe@example.com',
          'JOHN.DOE@EXAMPLE.COM'
        )
      ).toBe(true);
    });

    it('should handle email with numbers', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'user123@example.com',
          'USER123@Example.COM'
        )
      ).toBe(true);
    });

    it('should handle email with hyphen', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'john-doe@example.com',
          'JOHN-DOE@Example.COM'
        )
      ).toBe(true);
    });

    it('should handle email with underscore', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'john_doe@example.com',
          'JOHN_DOE@Example.COM'
        )
      ).toBe(true);
    });

    it('should handle subdomain emails', () => {
      expect(
        EmailNormalizer.emailsMatch(
          'user@mail.example.com',
          'USER@MAIL.EXAMPLE.COM'
        )
      ).toBe(true);
    });
  });
});
