import { describe, it, expect } from 'vitest';
import {
  formatCompanyToPascalCase,
  calculateFormattedCompany,
} from '../companyFormatter';

describe('Israeli city company words (Tel Aviv / Jerusalem / Haifa)', () => {
  it('Tel Aviv Yafo Municipality with maxWords 2 → TelAvivMunicipality', () => {
    expect(formatCompanyToPascalCase('Tel Aviv Yafo Municipality', 2)).toBe(
      'TelAvivMunicipality'
    );
  });

  it('skips Jaffa (any case) after Tel Aviv', () => {
    expect(formatCompanyToPascalCase('tel aviv JAFFA Municipality', 2)).toBe(
      'TelAvivMunicipality'
    );
  });

  it('Tel Aviv Municipality without Yafo still includes Municipality', () => {
    expect(formatCompanyToPascalCase('Tel Aviv Municipality', 2)).toBe(
      'TelAvivMunicipality'
    );
  });

  it('Jerusalem Yafo Municipality → JerusalemMunicipality', () => {
    expect(formatCompanyToPascalCase('Jerusalem Yafo Municipality', 2)).toBe(
      'JerusalemMunicipality'
    );
  });

  it('Haifa Jaffa Port with maxWords 2 → HaifaPort', () => {
    expect(formatCompanyToPascalCase('Haifa Jaffa Port', 2)).toBe('HaifaPort');
  });

  it('calculateFormattedCompany wraps LinkedIn prefix', () => {
    expect(calculateFormattedCompany('Tel Aviv Yafo Municipality', 2)).toBe(
      'LinkedIn TelAvivMunicipality'
    );
  });
});
