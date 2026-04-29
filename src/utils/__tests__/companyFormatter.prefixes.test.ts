import { describe, it, expect } from 'vitest';
import { formatCompanyToPascalCase, calculateFormattedCompany } from '../companyFormatter';

describe('formatCompanyToPascalCase prefixes', () => {
  it('should pull next word for "The Open"', () => {
    // maxWords=1, "The" pulls "Open" because "The" is a joiner, 
    // "TheOpen" pulls "University" because it's in forceNextPrefixes
    expect(formatCompanyToPascalCase('The Open University', 1)).toBe('TheOpenUniversity');
  });

  it('should pull next word for "Bar Ilan"', () => {
    expect(formatCompanyToPascalCase('Bar Ilan University', 1)).toBe('BarIlanUniversity');
  });

  it('should pull next word for "Ben Gurion"', () => {
    // "Ben" is a joiner, "BenGurion" is a forceNextPrefix
    expect(formatCompanyToPascalCase('Ben Gurion University', 1)).toBe('BenGurionUniversity');
  });

  it('should pull next word for "Medical"', () => {
    expect(formatCompanyToPascalCase('Harvard Medical School', 2)).toBe('HarvardMedicalSchool');
    expect(formatCompanyToPascalCase('Medical Center', 1)).toBe('MedicalCenter');
  });

  it('should pull next word for "Israel National"', () => {
    expect(formatCompanyToPascalCase('Israel National Bank', 1)).toBe('IsraelNationalBank');
  });

  it('should pull next word for "Bet Shemesh"', () => {
    expect(formatCompanyToPascalCase('Bet Shemesh Engines', 1)).toBe('BetShemeshEngines');
  });

  it('should pull next word for "The Academic"', () => {
    expect(formatCompanyToPascalCase('The Academic College', 1)).toBe('TheAcademicCollege');
  });

  it('should pull next word for "The ADHD"', () => {
    expect(formatCompanyToPascalCase('The ADHD Center', 1)).toBe('TheADHDCenter');
  });

  it('should pull next word for "House Of"', () => {
    expect(formatCompanyToPascalCase('House Of Coulture', 2)).toBe('HouseOfCoulture');
    expect(calculateFormattedCompany('House Of Products.AI', 2)).toBe('LinkedIn HouseOfProducts');
  });

  it('should truncate after comma or dash-space using calculateFormattedCompany', () => {
    expect(calculateFormattedCompany('Perimeter 81, a Check Point Company', 2)).toBe('LinkedIn Perimeter81');
    expect(calculateFormattedCompany('Perimeter 81 - a Check Point Company', 2)).toBe('LinkedIn Perimeter81');
    expect(calculateFormattedCompany('Perimeter 81- a Check Point Company', 2)).toBe('LinkedIn Perimeter81');
    expect(calculateFormattedCompany('Log-On Software', 2)).toBe('LinkedIn LogOn');
  });
});
