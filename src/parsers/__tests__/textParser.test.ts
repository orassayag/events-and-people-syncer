import { describe, it, expect, vi } from 'vitest';
import { TextParser } from '../textParser';
import { NameParser } from '../nameParser';

vi.mock('../nameParser', () => ({
  NameParser: {
    parseFullName: vi.fn((name) => ({ firstName: name, lastName: '' })),
  },
}));

describe('TextParser', () => {
  describe('hasHebrewCharacters', () => {
    it('should return true if text contains Hebrew characters', () => {
      expect(TextParser.hasHebrewCharacters('שלום')).toBe(true);
      expect(TextParser.hasHebrewCharacters('Hello שלום')).toBe(true);
    });

    it('should return false if text does not contain Hebrew characters', () => {
      expect(TextParser.hasHebrewCharacters('Hello')).toBe(false);
      expect(TextParser.hasHebrewCharacters('123!@#')).toBe(false);
    });
  });

  describe('reverseHebrewText', () => {
    it('should return original text if it is empty', () => {
      expect(TextParser.reverseHebrewText('')).toBe('');
    });

    it('should return original text if it has no Hebrew', () => {
      expect(TextParser.reverseHebrewText('Hello World')).toBe('Hello World');
    });

    it('should reverse Hebrew words in the text', () => {
      // "שלום עולם" -> "םולש םלוע"
      expect(TextParser.reverseHebrewText('שלום עולם')).toBe('םולש םלוע');
    });

    it('should not reverse mixed content words', () => {
      // Word with Hebrew and English should stay the same
      expect(TextParser.reverseHebrewText('שלום123 עולם')).toBe('שלום123 םלוע');
    });

    it('should handle mixed Hebrew and non-Hebrew words', () => {
      expect(TextParser.reverseHebrewText('Hello שלום World')).toBe('Hello םולש World');
    });
  });

  describe('formatNumberWithLeadingZeros', () => {
    it('should format numbers with 5 digits and grouping', () => {
      expect(TextParser.formatNumberWithLeadingZeros(123)).toBe('00,123');
      expect(TextParser.formatNumberWithLeadingZeros(12345)).toBe('12,345');
      expect(TextParser.formatNumberWithLeadingZeros(1)).toBe('00,001');
    });
  });

  describe('parseFullName', () => {
    it('should call NameParser.parseFullName', () => {
      const result = TextParser.parseFullName('John Doe');
      expect(NameParser.parseFullName).toHaveBeenCalledWith('John Doe');
      expect(result).toEqual({ firstName: 'John Doe', lastName: '' });
    });
  });
});
