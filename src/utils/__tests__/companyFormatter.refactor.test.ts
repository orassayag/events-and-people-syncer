import { describe, it, expect } from 'vitest';
import {
  calculateFormattedCompany,
  refactorCompanyName,
} from '../companyFormatter';

describe('refactorCompanyName rules', () => {
  it('should handle Stealth rule', () => {
    expect(refactorCompanyName('StealthAI')).toBe('Stealth');
    expect(refactorCompanyName('StealthStartup')).toBe('Stealth');
    expect(refactorCompanyName('StealthCybersecurity')).toBe('Stealth');
    expect(refactorCompanyName('StartupInStealthMode')).toBe('Stealth');
  });

  it('should handle Freelance rule', () => {
    expect(refactorCompanyName('FreelanceIndependent')).toBe('Freelance');
    expect(refactorCompanyName('FreelanceRecruiting')).toBe('Freelance');
    expect(refactorCompanyName('SelfEmployed')).toBe('Freelance');
    expect(refactorCompanyName('FreelanceSelf')).toBe('Freelance');
    expect(refactorCompanyName('IndependentConsultant')).toBe('Freelance');
  });

  it('should handle IDF / Unit rule', () => {
    expect(refactorCompanyName('Unit8200')).toBe('IDF');
    expect(refactorCompanyName('Unit9900')).toBe('IDF');
    expect(refactorCompanyName('Ofek324Unit')).toBe('IDF');
    expect(refactorCompanyName('MamdaIDF')).toBe('IDF');
    expect(refactorCompanyName('IsraelDefense')).toBe('IDF');
    expect(refactorCompanyName('IsraeliArmy')).toBe('IDF');
    expect(refactorCompanyName('IsraeliNavy')).toBe('IDF');
    expect(refactorCompanyName('IsraeliAirForce')).toBe('IDF');
  });

  it('should handle special character & acquisition rules', () => {
    expect(refactorCompanyName('Net&Work')).toBe('NetAndWork');
    expect(refactorCompanyName('Nestlé')).toBe('Nestle');
    expect(refactorCompanyName('DatoramaASalesforce')).toBe('Datorama');
    expect(refactorCompanyName('Perimeter81ASalesforceCompany')).toBe(
      'Perimeter81'
    );
    expect(refactorCompanyName('AbraRDSolutionsFormerlyDevalore')).toBe('Abra');
  });

  it('should remove "Israel" suffix', () => {
    expect(refactorCompanyName('AppliedMaterialsIsrael')).toBe(
      'AppliedMaterials'
    );
    expect(refactorCompanyName('DecathlonIsrael')).toBe('Decathlon');
  });

  it('should handle manual refactor list with whitespace-agnostic keys', () => {
    expect(refactorCompanyName('YouCCTechnologies')).toBe('YouCC');
    expect(refactorCompanyName('RafaelAdvanced')).toBe('Rafael');
    expect(refactorCompanyName('StraussGroup')).toBe('Strauss');
    expect(refactorCompanyName('StraussWater')).toBe('Strauss');
    expect(refactorCompanyName('Monday')).toBe('Monday.com');
    expect(refactorCompanyName('SodaStreamInternational')).toBe('SodaStream');
    expect(refactorCompanyName('Wix.com')).toBe('Wix');
    expect(refactorCompanyName('SVTJobs')).toBe('SVT.Jobs');
    expect(refactorCompanyName('Svt.jobsRecruitment')).toBe('SVT.Jobs');
    expect(refactorCompanyName('PagayaGlobal')).toBe('Papaya');
    expect(refactorCompanyName('PAGAYA')).toBe('Papaya');
  });

  it('should preserve protected suffixes', () => {
    expect(refactorCompanyName('Monday.com')).toBe('Monday.com');
    expect(refactorCompanyName('Viz.ai')).toBe('Viz.ai');
    expect(refactorCompanyName('Mend.io')).toBe('Mend.io');
    expect(refactorCompanyName('Riverside.fm')).toBe('Riverside.fm');
  });
});

describe('calculateFormattedCompany integration', () => {
  it('should integrate refactoring into the full flow', () => {
    expect(calculateFormattedCompany('Applied Materials Israel')).toBe(
      'LinkedIn AppliedMaterials'
    );
    expect(calculateFormattedCompany('Monday')).toBe('LinkedIn Monday.com');
    expect(calculateFormattedCompany('Unit 8200')).toBe('LinkedIn IDF');
    expect(calculateFormattedCompany('Self Employed')).toBe(
      'LinkedIn Freelance'
    );
    expect(calculateFormattedCompany('Wix.com')).toBe('LinkedIn Wix');
    expect(calculateFormattedCompany('entrosecurity')).toBe(
      'LinkedIn EntroSecurity'
    );
    expect(calculateFormattedCompany('AnyClip')).toBe('LinkedIn AnyClip');
    expect(calculateFormattedCompany('OkCupid')).toBe('LinkedIn OkCupid');
    expect(calculateFormattedCompany('AVIF')).toBe('LinkedIn AVIF');
    expect(calculateFormattedCompany('Mcpd')).toBe('LinkedIn MCPD');
    expect(calculateFormattedCompany('JumboMail')).toBe('LinkedIn JUMBOMail');
    expect(calculateFormattedCompany('Dun & Bradstreet')).toBe(
      'LinkedIn Dun & Bradstreet'
    );
    expect(calculateFormattedCompany('3D Printer')).toBe('LinkedIn 3DPrinter');
    expect(calculateFormattedCompany('Investing.com')).toBe(
      'LinkedIn Investing.com'
    );
  });

  it('should not suggest duplicate labels like HR Hr', () => {
    // Linoy Bar HR case
    // The maintainer logic should correctly construct the suffix
    expect(calculateFormattedCompany('HR', undefined, 'Linoy', 'Bar')).toBe(
      'LinkedIn HR'
    );
  });

  it('should not suggest SelfEmployed for partial matches (like Lotem or BrainerHub)', () => {
    // "Lotem" matches firstName but not full name
    expect(
      calculateFormattedCompany('Lotem', undefined, 'Lotem', 'Cohen')
    ).toBe('LinkedIn Lotem');
    // "BrainerHub" matches part of lastName but not full name
    expect(
      calculateFormattedCompany('BrainerHub', undefined, 'Tanknath', 'Motikhar')
    ).toBe('LinkedIn BrainerHub');
  });

  it('should still suggest SelfEmployed for exact full name matches', () => {
    expect(
      calculateFormattedCompany('Lotem Cohen', undefined, 'Lotem', 'Cohen')
    ).toBe('LinkedIn SelfEmployed');
    expect(
      calculateFormattedCompany(
        'Tanknath Motikhar',
        undefined,
        'Tanknath',
        'Motikhar'
      )
    ).toBe('LinkedIn SelfEmployed');
  });
});
