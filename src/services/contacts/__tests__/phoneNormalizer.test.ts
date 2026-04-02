import { describe, it, expect } from 'vitest';
import { PhoneNormalizer } from '../phoneNormalizer';

describe('PhoneNormalizer', () => {
  const normalizer = new PhoneNormalizer();

  describe('normalize', () => {
    it('should remove spaces and dashes', () => {
      expect(normalizer.normalize('+1 555-123-4567')).toBe('+15551234567');
    });

    it('should remove parentheses', () => {
      expect(normalizer.normalize('(555) 123-4567')).toBe('5551234567');
    });

    it('should preserve plus sign', () => {
      expect(normalizer.normalize('+972-50-123-4567')).toBe('+972501234567');
    });

    it('should preserve hash and star', () => {
      expect(normalizer.normalize('*123#')).toBe('*123#');
    });

    it('should handle international format with dots', () => {
      expect(normalizer.normalize('+1.555.123.4567')).toBe('+15551234567');
    });
  });

  describe('getAllNormalizedVariations', () => {
    it('should return multiple variations', () => {
      const variations =
        normalizer.getAllNormalizedVariations('+972-50-123-4567');
      expect(variations).toContain('+972501234567');
      expect(variations).toContain('972501234567');
    });

    it('should strip leading zero for local numbers', () => {
      const variations = normalizer.getAllNormalizedVariations('050-123-4567');
      expect(variations).toContain('501234567');
    });

    it('should strip double leading zero for international', () => {
      const variations =
        normalizer.getAllNormalizedVariations('00972501234567');
      expect(variations).toContain('972501234567');
    });

    it('should deduplicate variations', () => {
      const variations = normalizer.getAllNormalizedVariations('1234567');
      const uniqueCount = new Set(variations).size;
      expect(variations.length).toBe(uniqueCount);
    });
  });

  describe('phonesMatch', () => {
    it('should match identical phones', () => {
      expect(normalizer.phonesMatch('+972501234567', '+972501234567')).toBe(
        true
      );
    });

    it('should match phones with different formatting', () => {
      expect(normalizer.phonesMatch('+972-50-123-4567', '+972501234567')).toBe(
        true
      );
    });

    it('should match local with international format', () => {
      expect(normalizer.phonesMatch('050-123-4567', '+972501234567')).toBe(
        true
      );
    });

    it('should match suffix when one is shorter', () => {
      expect(normalizer.phonesMatch('501234567', '+972501234567')).toBe(true);
    });

    it('should not match different phones', () => {
      expect(normalizer.phonesMatch('+972501234567', '+972509876543')).toBe(
        false
      );
    });

    it('should not match when suffix is too short', () => {
      expect(normalizer.phonesMatch('12345', '+972501234567')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should accept valid phone with 7 digits', () => {
      expect(normalizer.isValidPhone('1234567')).toBe(true);
    });

    it('should accept valid phone with 15 digits', () => {
      expect(normalizer.isValidPhone('123456789012345')).toBe(true);
    });

    it('should reject phone with less than 7 digits', () => {
      expect(normalizer.isValidPhone('123456')).toBe(false);
    });

    it('should reject phone with more than 15 digits', () => {
      expect(normalizer.isValidPhone('1234567890123456')).toBe(false);
    });

    it('should reject all zeros', () => {
      expect(normalizer.isValidPhone('0000000')).toBe(false);
    });

    it('should reject repeated single digit', () => {
      expect(normalizer.isValidPhone('1111111')).toBe(false);
    });

    it('should accept valid international format', () => {
      expect(normalizer.isValidPhone('+972501234567')).toBe(true);
    });
  });

  describe('static phonesMatch', () => {
    it('should work as a static method', () => {
      expect(
        PhoneNormalizer.phonesMatch('+972-50-123-4567', '0501234567')
      ).toBe(true);
    });
  });

  describe('edge cases - very long phone numbers', () => {
    it('should reject phone with 16 digits', () => {
      expect(normalizer.isValidPhone('1234567890123456')).toBe(false);
    });

    it('should reject phone with 20 digits', () => {
      expect(normalizer.isValidPhone('12345678901234567890')).toBe(false);
    });

    it('should accept phone with exactly 15 digits', () => {
      expect(normalizer.isValidPhone('123456789012345')).toBe(true);
    });
  });

  describe('edge cases - special characters', () => {
    it('should handle phones with hash and star symbols', () => {
      expect(normalizer.normalize('*123#456')).toBe('*123#456');
    });

    it('should validate short codes with star', () => {
      expect(normalizer.isValidPhone('*1234567')).toBe(true);
    });

    it('should validate short codes with hash', () => {
      expect(normalizer.isValidPhone('#1234567')).toBe(true);
    });
  });

  describe('edge cases - international formats', () => {
    it('should match UK phone formats', () => {
      expect(normalizer.phonesMatch('+44 20 7946 0958', '+442079460958')).toBe(
        true
      );
    });

    it('should match US phone formats', () => {
      expect(normalizer.phonesMatch('+1 (555) 123-4567', '+15551234567')).toBe(
        true
      );
    });

    it('should match German phone formats', () => {
      expect(normalizer.phonesMatch('+49 30 1234567', '+49301234567')).toBe(
        true
      );
    });

    it('should match French phone formats', () => {
      expect(normalizer.phonesMatch('+33 1 23 45 67 89', '+33123456789')).toBe(
        true
      );
    });

    it('should match Japanese phone formats', () => {
      expect(normalizer.phonesMatch('+81 3-1234-5678', '+81312345678')).toBe(
        true
      );
    });

    it('should match Chinese phone formats', () => {
      expect(normalizer.phonesMatch('+86 10 1234 5678', '+861012345678')).toBe(
        true
      );
    });

    it('should match Australian phone formats', () => {
      expect(normalizer.phonesMatch('+61 2 1234 5678', '+61212345678')).toBe(
        true
      );
    });
  });

  describe('edge cases - 6-digit minimum overlap requirement', () => {
    it('should match when overlap is exactly 6 digits', () => {
      expect(normalizer.phonesMatch('123456', '9999123456')).toBe(true);
    });

    it('should not match when overlap is 5 digits', () => {
      expect(normalizer.phonesMatch('12345', '999912345')).toBe(false);
    });

    it('should match when overlap is more than 6 digits', () => {
      expect(normalizer.phonesMatch('1234567', '99991234567')).toBe(true);
    });
  });
});
