import { describe, it, expect, vi } from 'vitest';
import { InputValidator } from '../inputValidator';
import { UrlNormalizer } from '../../services/linkedin/urlNormalizer';

vi.mock('../../services/linkedin/urlNormalizer', () => ({
  UrlNormalizer: {
    formatLinkedInUrl: vi.fn((url) => `normalized-${url}`),
  },
}));

describe('InputValidator', () => {
  describe('validateNoHebrew', () => {
    it('should return true if allowHebrew is true', () => {
      expect(InputValidator.validateNoHebrew('שלום', true)).toBe(true);
    });

    it('should return true if text is empty', () => {
      expect(InputValidator.validateNoHebrew('')).toBe(true);
      expect(InputValidator.validateNoHebrew('   ')).toBe(true);
    });

    it('should return error message if text contains Hebrew and allowHebrew is false', () => {
      expect(InputValidator.validateNoHebrew('שלום')).toBe(
        'Hebrew characters are not supported. Please use English only.'
      );
    });

    it('should return true if text has no Hebrew', () => {
      expect(InputValidator.validateNoHebrew('Hello')).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('should return true for empty email', () => {
      expect(InputValidator.validateEmail('')).toBe(true);
    });

    it('should return error if email has Hebrew', () => {
      expect(InputValidator.validateEmail('שלום@example.com')).toBe(
        'Hebrew characters are not supported. Please use English only.'
      );
    });

    it('should return error if email format is invalid', () => {
      expect(InputValidator.validateEmail('invalid-email')).toBe(
        'Invalid email address format'
      );
    });

    it('should return true for valid email', () => {
      expect(InputValidator.validateEmail('test@example.com')).toBe(true);
    });
  });

  describe('validatePhone', () => {
    it('should return true for empty phone', () => {
      expect(InputValidator.validatePhone('')).toBe(true);
    });

    it('should return error for invalid phone', () => {
      expect(InputValidator.validatePhone('abc')).toBe(
        'Only numbers, +, -, spaces, parentheses, #, and * allowed'
      );
    });

    it('should return true for valid phone', () => {
      expect(InputValidator.validatePhone('050-1234567')).toBe(true);
    });
  });

  describe('validateText', () => {
    it('should validate text for Hebrew', () => {
      expect(InputValidator.validateText('Hello')).toBe(true);
      expect(InputValidator.validateText('שלום')).toBe(
        'Hebrew characters are not supported. Please use English only.'
      );
    });
  });

  describe('validateLinkedInUrl', () => {
    it('should return true for empty url', () => {
      expect(InputValidator.validateLinkedInUrl('')).toBe(true);
    });

    it('should prepend https:// if missing', () => {
      expect(
        InputValidator.validateLinkedInUrl('www.linkedin.com/in/user')
      ).toBe(true);
    });

    it('should return error for invalid LinkedIn URL', () => {
      expect(InputValidator.validateLinkedInUrl('https://google.com')).toBe(
        'Must be a valid LinkedIn URL'
      );
    });

    it('should return true for valid LinkedIn URL', () => {
      expect(
        InputValidator.validateLinkedInUrl('https://www.linkedin.com/in/user')
      ).toBe(true);
    });
  });

  describe('normalizeLinkedInUrl', () => {
    it('should call UrlNormalizer.formatLinkedInUrl', () => {
      const url = 'linkedin.com/in/user';
      const result = InputValidator.normalizeLinkedInUrl(url);
      expect(UrlNormalizer.formatLinkedInUrl).toHaveBeenCalledWith(url);
      expect(result).toBe(`normalized-${url}`);
    });
  });

  describe('validateUniqueEmail', () => {
    const existing = ['test1@example.com', 'test2@example.com'];

    it('should return true if email is unique', () => {
      expect(
        InputValidator.validateUniqueEmail('new@example.com', existing)
      ).toBe(true);
    });

    it('should return error if email is duplicate', () => {
      expect(
        InputValidator.validateUniqueEmail('test1@example.com', existing)
      ).toBe('This email address is already added to this contact.');
    });

    it('should return true if email matches currentIndex', () => {
      expect(
        InputValidator.validateUniqueEmail('test1@example.com', existing, 0)
      ).toBe(true);
    });

    it('should return error if email is invalid', () => {
      expect(InputValidator.validateUniqueEmail('invalid', existing)).toBe(
        'Invalid email address format'
      );
    });
  });

  describe('validateUniquePhone', () => {
    const existing = ['0501234567', '0507654321'];

    it('should return true if phone is unique', () => {
      expect(InputValidator.validateUniquePhone('0500000000', existing)).toBe(
        true
      );
    });

    it('should return error if phone is duplicate', () => {
      expect(InputValidator.validateUniquePhone('0501234567', existing)).toBe(
        'This phone number is already added to this contact.'
      );
    });

    it('should return true if phone matches currentIndex', () => {
      expect(
        InputValidator.validateUniquePhone('0501234567', existing, 0)
      ).toBe(true);
    });
  });

  describe('validateLabelName', () => {
    const existing = [{ name: 'Friends', resourceName: 'res1' }];

    it("should return true for 'cancel'", () => {
      expect(InputValidator.validateLabelName('cancel', existing as any)).toBe(
        true
      );
    });

    it('should return error for empty name', () => {
      expect(InputValidator.validateLabelName('', existing as any)).toBe(
        "Error: Label name cannot be empty. Type 'cancel' to go back."
      );
    });

    it('should return error for invalid characters', () => {
      expect(InputValidator.validateLabelName('Label!', existing as any)).toBe(
        'Label name can only contain letters, numbers, spaces, hyphens, and underscores.'
      );
    });

    it('should return error if label exists', () => {
      expect(InputValidator.validateLabelName('Friends', existing as any)).toBe(
        "Label 'Friends' already exists."
      );
    });

    it('should return true for new valid label', () => {
      expect(InputValidator.validateLabelName('Work', existing as any)).toBe(
        true
      );
    });
  });

  describe('validateMinimumRequirements', () => {
    it('should return error if first name is missing', () => {
      expect(
        InputValidator.validateMinimumRequirements({
          firstName: '',
          labelResourceNames: ['res1'],
        } as any)
      ).toBe('First name is required.');
    });

    it('should return error if no labels are selected', () => {
      expect(
        InputValidator.validateMinimumRequirements({
          firstName: 'John',
          labelResourceNames: [],
        } as any)
      ).toBe('At least one label is required.');
    });

    it('should return true if requirements met', () => {
      expect(
        InputValidator.validateMinimumRequirements({
          firstName: 'John',
          labelResourceNames: ['res1'],
        } as any)
      ).toBe(true);
    });
  });

  describe('validateFieldLimits', () => {
    it('should return error if any field exceeds limit', () => {
      const data = {
        firstName: 'a'.repeat(1025),
        emails: [],
        phones: [],
        labelResourceNames: [],
      } as any;
      const result = InputValidator.validateFieldLimits(data);
      expect(typeof result).toBe('string');
      expect(result).toContain('Field too long');
    });

    it('should return error if too many fields', () => {
      const data = {
        firstName: 'John',
        emails: Array(300).fill('test@example.com'),
        phones: Array(300).fill('1234567'),
        labelResourceNames: [],
      } as any;
      const result = InputValidator.validateFieldLimits(data);
      expect(typeof result).toBe('string');
      expect(result).toContain('Too many fields');
    });

    it('should return true if within limits', () => {
      const data = {
        firstName: 'John',
        emails: ['test@example.com'],
        phones: ['1234567'],
        labelResourceNames: ['res1'],
      } as any;
      expect(InputValidator.validateFieldLimits(data)).toBe(true);
    });
  });
});
