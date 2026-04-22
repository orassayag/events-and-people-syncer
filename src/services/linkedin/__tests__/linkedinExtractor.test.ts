import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInExtractor } from '../linkedinExtractor';
import {
  MOCK_CSV_CONTENT,
  MOCK_INVALID_CSV_MISSING_REQUIRED,
  MOCK_INVALID_CSV_COMPANY_URL,
  MOCK_DUPLICATE_URL_CSV,
} from '../__mocks__/connections.mock';

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../../settings', () => ({
  SETTINGS: {
    linkedin: {
      sourcesPath: '/tmp/sources',
      cachePath: '/tmp/cache',
      zipFileName: 'test.zip',
      cacheExpirationDays: 1,
    },
  },
}));

vi.mock('adm-zip', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getEntries: vi.fn().mockReturnValue([
        {
          entryName: 'connections.csv',
          getData: vi.fn().mockReturnValue(Buffer.from(MOCK_CSV_CONTENT)),
        },
      ]),
    })),
  };
});

describe('LinkedInExtractor', () => {
  let extractor: LinkedInExtractor;
  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new LinkedInExtractor();
  });

  describe('CSV parsing', () => {
    it('should parse valid CSV with all fields', async () => {
      const connections = await (extractor as any).parseCsv(MOCK_CSV_CONTENT);
      expect(connections).toHaveLength(3);
      expect(connections[0]).toMatchObject({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        company: 'Microsoft Corporation',
        position: 'Software Engineer',
      });
    });
    it('should skip rows with missing required fields', async () => {
      await expect((extractor as any).parseCsv(MOCK_INVALID_CSV_MISSING_REQUIRED)).rejects.toThrow();
    });
    it('should skip rows with company URLs', async () => {
      await expect((extractor as any).parseCsv(MOCK_INVALID_CSV_COMPANY_URL)).rejects.toThrow();
    });
    it('should detect duplicate URLs within CSV', async () => {
      const connections = await (extractor as any).parseCsv(MOCK_DUPLICATE_URL_CSV);
      expect(connections).toHaveLength(1);
    });
    it('should trim all field values', async () => {
      const csvWithSpaces = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
  John  ,  Doe  ,https://www.linkedin.com/in/test,  john@test.com  ,  Microsoft  ,  Engineer  ,01 Jan 2024`;
      const connections = await (extractor as any).parseCsv(csvWithSpaces);
      expect(connections[0].firstName).toBe('John');
      expect(connections[0].lastName).toBe('Doe');
      expect(connections[0].email).toBe('john@test.com');
      expect(connections[0].company).toBe('Microsoft');
      expect(connections[0].position).toBe('Engineer');
    });
    it('should handle empty optional fields', async () => {
      const csvWithEmpty = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/in/test,,,,01 Jan 2024`;
      const connections = await (extractor as any).parseCsv(csvWithEmpty);
      expect(connections[0].email).toBe('');
      expect(connections[0].company).toBe('');
      expect(connections[0].position).toBe('');
    });
    it('should extract profile slug as ID', async () => {
      const connections = await (extractor as any).parseCsv(MOCK_CSV_CONTENT);
      expect(connections[0].id).toBe('john-doe-123');
      expect(connections[1].id).toBe('jane-smith-456');
    });
  });

  describe('URL validation', () => {
    it('should accept personal profile URLs', async () => {
      const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/in/john-doe,john@test.com,Microsoft,Engineer,01 Jan 2024`;
      const connections = await (extractor as any).parseCsv(csv);
      expect(connections).toHaveLength(1);
    });
    it('should reject company URLs', async () => {
      const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/company/microsoft,john@test.com,Microsoft,Engineer,01 Jan 2024`;
      await expect((extractor as any).parseCsv(csv)).rejects.toThrow(
        'No valid connections found in CSV'
      );
    });
    it('should reject URLs without /in/', async () => {
      const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/feed/,john@test.com,Microsoft,Engineer,01 Jan 2024`;
      await expect((extractor as any).parseCsv(csv)).rejects.toThrow(
        'No valid connections found in CSV'
      );
    });
  });
});
