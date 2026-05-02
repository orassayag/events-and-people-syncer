import { describe, it, expect } from 'vitest';
import { calculateFormattedCompany } from '../companyFormatter';

describe('calculateFormattedCompany - SelfEmployed Logic', () => {
  it('should return LinkedIn SelfEmployed if company matches firstName + lastName', () => {
    const result = calculateFormattedCompany('YonitKlinger', undefined, 'Yonit', 'Klinger');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should return normal formatted company if company matches lastName + firstName (strict order required)', () => {
    const result = calculateFormattedCompany('KlingerYonit', undefined, 'Yonit', 'Klinger');
    expect(result).toBe('LinkedIn KlingerYonit');
  });

  it('should be case-insensitive', () => {
    const result = calculateFormattedCompany('YANAWEISS', undefined, 'Yana', 'Weiss');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should handle spaces and special characters in company name', () => {
    const result = calculateFormattedCompany('Yonit Klinger', undefined, 'Yonit', 'Klinger');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should handle spaces and special characters in person name', () => {
    const result = calculateFormattedCompany('YonitKlinger', undefined, 'Yonit ', ' Klinger');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should return normal formatted company if it does not match name', () => {
    const result = calculateFormattedCompany('Google', undefined, 'Yonit', 'Klinger');
    expect(result).toBe('LinkedIn Google');
  });

  it('should handle cases with Hebrew characters', () => {
    // Assuming cleanStr handles Hebrew as well
    const result = calculateFormattedCompany('ישראל ישראלי', undefined, 'ישראל', 'ישראלי');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should handle company names with suffixes that are removed by cleanCompany', () => {
    // If cleanCompany removes "Ltd", it should match
    const result = calculateFormattedCompany('Yonit Klinger Ltd', undefined, 'Yonit', 'Klinger');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should handle Yana Weiss case (YANAWEISS all caps)', () => {
    const result = calculateFormattedCompany('YANAWEISS', undefined, 'Yana', 'Weiss');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should handle cases where LinkedIn is already in the company name', () => {
    const result = calculateFormattedCompany('LinkedIn Yana Weiss', undefined, 'Yana', 'Weiss');
    expect(result).toBe('LinkedIn SelfEmployed');
  });

  it('should return normal formatted company for partial matches (strict match required)', () => {
    const result = calculateFormattedCompany('Yana', undefined, 'Yana', 'Weiss');
    expect(result).toBe('LinkedIn Yana');
  });

  it('should return normal formatted company for extra noise (strict match required)', () => {
    const result = calculateFormattedCompany('Yana Weiss Specialist', undefined, 'Yana', 'Weiss');
    expect(result).toBe('LinkedIn YanaWeissSpecialist');
  });
});
