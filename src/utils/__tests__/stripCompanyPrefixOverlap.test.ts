import { describe, it, expect } from 'vitest';
import { stripCompanyPrefixOverlapFromName } from '../companyFormatter';

describe('stripCompanyPrefixOverlapFromName', () => {
  it('removes leading company words from end of last name (hyphen vs space)', () => {
    expect(
      stripCompanyPrefixOverlapFromName('Hrzog Log On', 'Log-On Software')
    ).toBe('Hrzog');
  });

  it('removes full company prefix when it matches multiple trailing words', () => {
    expect(
      stripCompanyPrefixOverlapFromName(
        'Hrzog Log On Software',
        'Log On Software Ltd'
      )
    ).toBe('Hrzog');
  });

  it('removes single trailing word when it is the whole company', () => {
    expect(
      stripCompanyPrefixOverlapFromName('Jane Microsoft', 'Microsoft')
    ).toBe('Jane');
  });

  it('does not change name when there is no overlap', () => {
    expect(
      stripCompanyPrefixOverlapFromName('Doe', 'Microsoft Corporation')
    ).toBe('Doe');
  });

  it('does not strip a short ambiguous trailing token for multi-word company', () => {
    expect(
      stripCompanyPrefixOverlapFromName('Mary Log', 'Log Cabin Software')
    ).toBe('Mary Log');
  });

  it('returns trimmed input when company is empty', () => {
    expect(stripCompanyPrefixOverlapFromName('  Smith  ', '')).toBe('Smith');
  });
});
