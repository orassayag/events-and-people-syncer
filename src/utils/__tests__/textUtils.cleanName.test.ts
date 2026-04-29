import { describe, it, expect } from 'vitest';
import { TextUtils } from '../textUtils';

describe('TextUtils.cleanName - Regression Tests', () => {
  it('should clean "Orna Dreman Ceo At Hitech" correctly', () => {
    const input = 'Orna Dreman Ceo At Hitech';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('Orna Dreman');
  });

  it('should clean job titles at the start and preserve following content', () => {
    const input = 'Ceo At Hitech Orna Dreman';
    const cleaned = TextUtils.cleanName(input);
    // "Ceo At " removed, "Hitech Orna Dreman" remains
    expect(cleaned).toBe('Hitech Orna Dreman');
  });

  it('should clean "Ceo At Hitech" to "Hitech"', () => {
    const input = 'Ceo At Hitech';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('Hitech');
  });

  it('should remove "La Nefesh" noise from names', () => {
    const input = 'Shir Dror La Nefesh';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('Shir Dror');
  });

  it('should handle "Shir Dror La Nefesh" with company "DrorLaNefesh" correctly', () => {
    const firstName = 'Shir';
    const lastName = 'Dror La Nefesh';

    // Simulations LinkedInExtractor logic:
    const fullNameRaw = `${firstName} ${lastName}`.trim();
    const cleanedFullName = TextUtils.cleanName(fullNameRaw);

    expect(cleanedFullName).toBe('Shir Dror');
  });

  it('should remove "At [Company]" when preceded by a title', () => {
    const input = 'John Doe Director At Some Company';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('John Doe');
  });

  it('should remove company suffixes like "Ltd" from names', () => {
    const input = 'Degel Ps Ltd';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('Degel Ps');
  });

  it('should handle " - " correctly without ignoring spaces', () => {
    const input = 'Maya Salemnia -MyHR';
    const cleaned = TextUtils.cleanName(input);
    expect(cleaned).toBe('Maya Salemnia');
  });

  it('should clean names with emojis and stars correctly', () => {
    expect(TextUtils.cleanName('★ Liat Kurlender ★')).toBe('Liat Kurlender');
    expect(TextUtils.cleanName('★Sari Cohen')).toBe('Sari Cohen');
    expect(TextUtils.cleanName('★ Gal Ben David ★')).toBe('Gal Ben David');
    expect(TextUtils.cleanName('☆ Neta Goldberg Levi ☆ I M HIRING')).toBe('Neta Goldberg Levi');
    expect(TextUtils.cleanName('★Mor Barki★')).toBe('Mor Barki');
  });

  it('should format hyphenated names with spaces instead of truncating them', () => {
    expect(TextUtils.cleanName('Or Assa-ayag')).toBe('Or Assa Ayag');
    expect(TextUtils.cleanName('Tal Fox-Honig')).toBe('Tal Fox Honig');
  });
});
