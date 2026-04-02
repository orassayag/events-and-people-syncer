import { describe, it, expect } from 'vitest';
import { UrlNormalizer } from '../urlNormalizer';

describe('UrlNormalizer', () => {
  describe('normalizeLinkedInUrl', () => {
    it('should remove https protocol', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://www.linkedin.com/in/john-doe'
      );
      expect(result).toBe('in/john-doe');
    });
    it('should remove http protocol', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'http://www.linkedin.com/in/jane-smith'
      );
      expect(result).toBe('in/jane-smith');
    });
    it('should remove www prefix', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://www.linkedin.com/in/test-user'
      );
      expect(result).toBe('in/test-user');
    });
    it('should handle mobile URLs', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://m.linkedin.com/in/mobile-user'
      );
      expect(result).toBe('in/mobile-user');
    });
    it('should remove trailing slashes', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://www.linkedin.com/in/user-name/'
      );
      expect(result).toBe('in/user-name');
    });
    it('should remove query parameters', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://www.linkedin.com/in/user?trk=123&ref=home'
      );
      expect(result).toBe('in/user');
    });
    it('should convert to lowercase', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'https://www.LinkedIn.com/in/John-Doe'
      );
      expect(result).toBe('in/john-doe');
    });
    it('should handle all transformations together', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        'HTTPS://M.LinkedIn.COM/in/Complex-User-Name/?trk=test'
      );
      expect(result).toBe('in/complex-user-name');
    });
    it('should trim whitespace', () => {
      const result = UrlNormalizer.normalizeLinkedInUrl(
        '  https://www.linkedin.com/in/user  '
      );
      expect(result).toBe('in/user');
    });
  });

  describe('extractProfileSlug', () => {
    it('should extract profile slug from standard URL', () => {
      const result = UrlNormalizer.extractProfileSlug(
        'https://www.linkedin.com/in/john-doe-123'
      );
      expect(result).toBe('john-doe-123');
    });
    it('should extract profile slug from URL with query params', () => {
      const result = UrlNormalizer.extractProfileSlug(
        'https://www.linkedin.com/in/jane-smith?trk=profile'
      );
      expect(result).toBe('jane-smith');
    });
    it('should extract profile slug from mobile URL', () => {
      const result = UrlNormalizer.extractProfileSlug(
        'https://m.linkedin.com/in/mobile-user'
      );
      expect(result).toBe('mobile-user');
    });
    it('should return normalized URL if no /in/ pattern found', () => {
      const result = UrlNormalizer.extractProfileSlug(
        'https://linkedin.com/company/test'
      );
      expect(result).toBe('company/test');
    });
  });

  describe('isValidPersonalProfile', () => {
    it('should return true for valid personal profile URL', () => {
      expect(
        UrlNormalizer.isValidPersonalProfile(
          'https://www.linkedin.com/in/john-doe'
        )
      ).toBe(true);
    });
    it('should return true for personal profile with uppercase', () => {
      expect(
        UrlNormalizer.isValidPersonalProfile(
          'https://www.LinkedIn.com/IN/jane-smith'
        )
      ).toBe(true);
    });
    it('should return false for company URL', () => {
      expect(
        UrlNormalizer.isValidPersonalProfile(
          'https://www.linkedin.com/company/microsoft'
        )
      ).toBe(false);
    });
    it('should return false for URL without /in/', () => {
      expect(
        UrlNormalizer.isValidPersonalProfile('https://www.linkedin.com/feed/')
      ).toBe(false);
    });
    it('should return false for empty URL', () => {
      expect(UrlNormalizer.isValidPersonalProfile('')).toBe(false);
    });
  });
});
