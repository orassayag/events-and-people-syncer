import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompanyMatcher } from '../companyMatcher';

vi.mock('../../../settings', () => ({
  SETTINGS: {
    linkedin: {
      companyFoldersPath: '/tmp/test-folders',
      defaultLabel: 'Job',
      companySuffixesToRemove: [
        'Inc',
        'Ltd',
        'LLC',
        'GmbH',
        'Corp',
        'Corporation',
        'Co',
        'Company',
        'Limited',
      ],
    },
  },
}));

vi.mock('../../../cache/companyCache', () => ({
  CompanyCache: class {
    get(): Promise<null> {
      return Promise.resolve(null);
    }

    set(): Promise<void> {
      return Promise.resolve(undefined);
    }
  },
}));

describe('CompanyMatcher', () => {
  let companyMatcher: CompanyMatcher;
  beforeEach(() => {
    vi.clearAllMocks();
    companyMatcher = new CompanyMatcher();
  });

  describe('getLabel', () => {
    it('should return default label for empty company name', async () => {
      const result = await companyMatcher.getLabel('');
      expect(result).toBe('Job');
    });
    it('should return default label for whitespace-only company name', async () => {
      const result = await companyMatcher.getLabel('   ');
      expect(result).toBe('Job');
    });
  });

  describe('company name cleaning', () => {
    it('should remove Inc suffix', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName('Planview, Inc.');
      expect(cleaned).toBe('Planview');
    });
    it('should remove Corporation suffix', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName(
        'Microsoft Corporation'
      );
      expect(cleaned).toBe('Microsoft');
    });
    it('should remove Ltd suffix', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName('Acme Ltd');
      expect(cleaned).toBe('Acme');
    });
    it('should split on comma and take first segment', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName(
        'Planview, International'
      );
      expect(cleaned).toBe('Planview');
    });
    it('should split on pipe and take first segment', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName('Company | Division');
      expect(cleaned).toBe('Company');
    });
    it('should split on dash and take first segment', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName('Parent - Subsidiary');
      expect(cleaned).toBe('Parent');
    });
    it('should return original if cleaning results in empty string', () => {
      const matcher = new CompanyMatcher();
      const cleaned = (matcher as any).cleanCompanyName('Inc.');
      expect(cleaned).toBe('Inc.');
    });
  });

  describe('company matching', () => {
    it('should match exact company names', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany('Microsoft', 'Microsoft');
      expect(result).toBe(true);
    });
    it('should match case-insensitively', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany('microsoft', 'Microsoft');
      expect(result).toBe(true);
    });
    it('should match when LinkedIn company contains folder company', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany(
        'Microsoft Corporation',
        'Microsoft'
      );
      expect(result).toBe(true);
    });
    it('should match when folder company contains LinkedIn company', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany('Google', 'Google Inc');
      expect(result).toBe(true);
    });
    it('should match without spaces', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany(
        'PlanviewInternational',
        'Planview'
      );
      expect(result).toBe(true);
    });
    it('should match CamelCase segments', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany(
        'Elbit Systems',
        'ElbitSystems'
      );
      expect(result).toBe(true);
    });
    it('should not match completely different companies', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany('Microsoft', 'Google');
      expect(result).toBe(false);
    });
  });

  describe('CamelCase splitting', () => {
    it('should split CamelCase into segments', () => {
      const matcher = new CompanyMatcher();
      const segments = (matcher as any).splitCamelCase('ElbitSystems');
      expect(segments).toEqual(['Elbit', 'Systems']);
    });
    it('should handle single word', () => {
      const matcher = new CompanyMatcher();
      const segments = (matcher as any).splitCamelCase('Microsoft');
      expect(segments).toEqual(['Microsoft']);
    });
    it('should handle multiple capitals', () => {
      const matcher = new CompanyMatcher();
      const segments = (matcher as any).splitCamelCase('IBMCorporation');
      expect(segments).toEqual(['I', 'B', 'M', 'Corporation']);
    });
  });

  describe('bug fixes', () => {
    it('should not match single letter CamelCase segments', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany('Gevit Azulay', 'ADAM+');
      expect(result).toBe(false);
    });
    it('should not match unrelated companies with coincidental single letters', () => {
      const matcher = new CompanyMatcher();
      const result = (matcher as any).matchesCompany(
        'Apple Inc',
        'AmazonWebServices'
      );
      expect(result).toBe(false);
    });
  });
});
