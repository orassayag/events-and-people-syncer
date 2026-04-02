import { describe, it, expect } from 'vitest';
import { TextUtils } from '../textUtils.js';

describe('TextUtils', () => {
  describe('hasHebrewCharacters', () => {
    it('should detect Hebrew characters', () => {
      expect(TextUtils.hasHebrewCharacters('שלום')).toBe(true);
      expect(TextUtils.hasHebrewCharacters('Hello שלום')).toBe(true);
    });
    
    it('should return false for non-Hebrew text', () => {
      expect(TextUtils.hasHebrewCharacters('Hello')).toBe(false);
      expect(TextUtils.hasHebrewCharacters('123')).toBe(false);
      expect(TextUtils.hasHebrewCharacters('')).toBe(false);
    });
  });
  
  describe('formatNumberWithLeadingZeros', () => {
    it('should format numbers with leading zeros and commas', () => {
      expect(TextUtils.formatNumberWithLeadingZeros(1)).toBe('00,001');
      expect(TextUtils.formatNumberWithLeadingZeros(123)).toBe('00,123');
      expect(TextUtils.formatNumberWithLeadingZeros(12345)).toBe('12,345');
    });
  });
  
  describe('parseFullName', () => {
    it('should delegate to NameParser', () => {
      const result = TextUtils.parseFullName('John Doe');
      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
  });
});
