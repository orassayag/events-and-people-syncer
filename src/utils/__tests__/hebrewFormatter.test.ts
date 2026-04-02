import { describe, it, expect } from 'vitest';
import {
  extractEnglishFromMixed,
  formatMixedHebrewEnglish,
  formatHebrewText,
} from '../hebrewFormatter';

describe('extractEnglishFromMixed', () => {
  it('should extract English from mixed Hebrew-English with dash', () => {
    expect(
      extractEnglishFromMixed(
        'מערך הסייבר הלאומי - Israel National Cyber Directorate'
      )
    ).toBe('Israel National Cyber Directorate');
  });

  it('should extract English when English comes first with dash', () => {
    expect(
      extractEnglishFromMixed(
        'Israel National Cyber Directorate - מערך הסייבר הלאומי'
      )
    ).toBe('Israel National Cyber Directorate');
  });

  it('should extract English from mixed without separator', () => {
    expect(extractEnglishFromMixed('Microsoft ישראל')).toBe('Microsoft');
  });

  it('should return empty string for Hebrew only text', () => {
    expect(extractEnglishFromMixed('מערך הסייבר הלאומי')).toBe('');
  });

  it('should return English text when only English is present', () => {
    expect(extractEnglishFromMixed('Microsoft Corporation')).toBe(
      'Microsoft Corporation'
    );
  });

  it('should return empty string for empty input', () => {
    expect(extractEnglishFromMixed('')).toBe('');
  });

  it('should extract company with numbers', () => {
    expect(extractEnglishFromMixed('3M Company - חברה')).toBe('3M Company');
  });

  it('should extract company with apostrophe', () => {
    expect(extractEnglishFromMixed("O'Brien Technologies - חברת")).toBe(
      "O'Brien Technologies"
    );
  });

  it('should extract company with ampersand', () => {
    expect(extractEnglishFromMixed('AT&T - חברת תקשורת')).toBe('AT&T');
  });

  it('should extract company with hyphen', () => {
    expect(extractEnglishFromMixed('Hewlett-Packard - חברה')).toBe(
      'Hewlett-Packard'
    );
  });

  it('should extract multiple English segments', () => {
    expect(extractEnglishFromMixed('Microsoft - מיקרוסופט - Israel')).toBe(
      'Microsoft Israel'
    );
  });

  it('should return empty string for whitespace only', () => {
    expect(extractEnglishFromMixed('   ')).toBe('');
  });
});

describe('formatMixedHebrewEnglish', () => {
  it('should format mixed Hebrew-English with dash (Hebrew first)', () => {
    const result: string = formatMixedHebrewEnglish(
      'מערך הסייבר הלאומי - Israel National Cyber Directorate'
    );
    expect(result).toContain('Israel National Cyber Directorate');
    expect(result).toContain(' - ');
  });

  it('should reorder when English comes first', () => {
    const result: string = formatMixedHebrewEnglish(
      'Israel National Cyber Directorate - מערך הסייבר הלאומי'
    );
    expect(result).toContain('Israel National Cyber Directorate');
    expect(result).toContain(' - ');
  });

  it('should format mixed without separator', () => {
    const result: string = formatMixedHebrewEnglish('Microsoft ישראל');
    expect(result).toContain('Microsoft');
    expect(result).toContain(' - ');
  });

  it('should return Hebrew only when no English present', () => {
    const result: string = formatMixedHebrewEnglish('מערך הסייבר הלאומי');
    expect(result).not.toContain(' - ');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return English only when no Hebrew present', () => {
    expect(formatMixedHebrewEnglish('Microsoft Corporation')).toBe(
      'Microsoft Corporation'
    );
  });

  it('should return empty string for empty input', () => {
    expect(formatMixedHebrewEnglish('')).toBe('');
  });

  it('should format multiple segments', () => {
    const result: string = formatMixedHebrewEnglish(
      'Microsoft - מיקרוסופט - Israel'
    );
    expect(result).toContain('Microsoft');
    expect(result).toContain('Israel');
    expect(result).toContain(' - ');
  });

  it('should return empty string for whitespace only', () => {
    expect(formatMixedHebrewEnglish('   ')).toBe('');
  });

  it('should handle Hebrew with English number', () => {
    const result: string = formatMixedHebrewEnglish('מערך 8200');
    expect(result).toContain('8200');
    expect(result).toContain(' - ');
  });

  it('should format mixed name', () => {
    const result: string = formatMixedHebrewEnglish('John יוחנן');
    expect(result).toContain('John');
    expect(result).toContain(' - ');
  });
});

describe('formatHebrewText', () => {
  it('should return text as is when no Hebrew characters', () => {
    expect(formatHebrewText('Hello World')).toBe('Hello World');
  });

  it('should reverse Hebrew characters for RTL display', () => {
    const result: string = formatHebrewText('שלום עולם');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle empty string', () => {
    expect(formatHebrewText('')).toBe('');
  });

  it('should handle mixed content with Hebrew', () => {
    const result: string = formatHebrewText('מערך הסייבר');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('integration tests', () => {
  it('should handle full flow: mixed company to display and label', () => {
    const company: string = 'Microsoft Corporation - מיקרוסופט';
    const display: string = formatMixedHebrewEnglish(company);
    const englishOnly: string = extractEnglishFromMixed(company);
    expect(display).toContain('Microsoft');
    expect(display).toContain(' - ');
    expect(englishOnly).toBe('Microsoft Corporation');
  });

  it('should handle Hebrew-only company with empty English extraction', () => {
    const company: string = 'מערך הסייבר הלאומי';
    const englishOnly: string = extractEnglishFromMixed(company);
    expect(englishOnly).toBe('');
  });

  it('should preserve English for label generation', () => {
    const company: string =
      'Israel National Cyber Directorate - מערך הסייבר הלאומי';
    const englishOnly: string = extractEnglishFromMixed(company);
    expect(englishOnly).toBe('Israel National Cyber Directorate');
  });
});
