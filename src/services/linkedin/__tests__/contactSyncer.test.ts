import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactSyncer } from '../contactSyncer';
import type { LinkedInConnection } from '../../../types/linkedin';
import { ContactType } from '../../../types/linkedin';
import { google } from 'googleapis';
import { cleanCompany, formatCompanyToPascalCase } from '../../../utils';

vi.mock('googleapis');
vi.mock('../../../utils', async () => {
  const actual = await vi.importActual<typeof import('../../../utils')>('../../../utils');
  return {
    ...actual,
    retryWithBackoff: vi.fn((fn) => fn()),
  };
});
vi.mock('../../../cache', () => ({
  ContactCache: {
    getInstance: vi.fn().mockReturnValue({
      getByResourceName: vi.fn().mockResolvedValue(null),
    }),
  },
}));
vi.mock('../../../settings', () => ({
  SETTINGS: {
    linkedin: {
      writeDelayMs: 0,
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
    api: {
      pageSize: 1000,
    },
    cache: {
      contactsCacheFile: '/tmp/test-contacts-cache.json',
    },
  },
}));

vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn(() => ({
      trackWrite: vi.fn(),
      trackRead: vi.fn(),
    })),
  },
}));

describe('ContactSyncer', () => {
  let contactSyncer: ContactSyncer;
  let mockAuth: any;
  let mockDuplicateDetector: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth = {};
    mockDuplicateDetector = {
      addRecentlyModifiedContact: vi.fn(),
    };
    contactSyncer = new ContactSyncer(mockAuth, mockDuplicateDetector);
    vi.spyOn(contactSyncer as any, 'loadContactGroups').mockResolvedValue(
      undefined
    );
    (contactSyncer as any).groupMap = { Job: 'contactGroups/123' };
    await contactSyncer.initialize();
  });

  const mockConnection: LinkedInConnection = {
    type: ContactType.LINKEDIN,
    id: 'test-user',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Microsoft Corporation',
    position: 'Software Engineer',
    url: 'https://www.linkedin.com/in/test-user',
    connectedOn: '01 Jan 2024',
  };

  describe('company name cleaning', () => {
    it('should remove Corporation suffix', () => {
      const cleaned = cleanCompany('Microsoft Corporation');
      expect(cleaned).toBe('Microsoft');
    });
    it('should remove Inc suffix', () => {
      const cleaned = cleanCompany('Planview, Inc.');
      expect(cleaned).toBe('Planview');
    });
    it('should split on comma and take first part', () => {
      const cleaned = cleanCompany('Company, Division');
      expect(cleaned).toBe('Company');
    });
    it('should return Inc without period', () => {
      const cleaned = cleanCompany('Inc.');
      expect(cleaned).toBe('Inc');
    });
    it('should return empty string for empty input', () => {
      const cleaned = cleanCompany('');
      expect(cleaned).toBe('');
    });
    it('should trim whitespace', () => {
      const cleaned = cleanCompany('  Microsoft  ');
      expect(cleaned).toBe('Microsoft');
    });
    it('should handle company with Ltd and multiple parts', () => {
      const cleaned = cleanCompany('Systematics Ltd. Solutions at work.');
      expect(cleaned).toBe('Systematics Solutions');
    });
    it('should remove "at work" phrase from end', () => {
      const cleaned = cleanCompany('Company Name at work.');
      expect(cleaned).toBe('Company Name');
    });
    it('should remove "at work" phrase from end without removing solutions', () => {
      const cleaned = cleanCompany('Tech solutions at work.');
      expect(cleaned).toBe('Tech solutions');
    });
    it('should split on period followed by space', () => {
      const cleaned = cleanCompany('First Part. Second Part');
      expect(cleaned).toBe('First Part Second Part');
    });
  });

  describe('formatCompanyToPascalCase', () => {
    it('should convert company name to PascalCase', () => {
      const pascalCase = formatCompanyToPascalCase('microsoft corporation');
      expect(pascalCase).toBe('MicrosoftCorporation');
    });
    it('should handle single word company', () => {
      const pascalCase = formatCompanyToPascalCase('google');
      expect(pascalCase).toBe('Google');
    });
    it('should return empty string for empty input', () => {
      const pascalCase = formatCompanyToPascalCase('');
      expect(pascalCase).toBe('');
    });
    it('should handle multiple spaces', () => {
      const pascalCase = formatCompanyToPascalCase(
        '  multi   word   company  '
      );
      expect(pascalCase).toBe('MultiWordCompany');
    });
  });

  describe('field mapping', () => {
    it('should format last name as "LastName Label FormattedCompany"', () => {
      const cleanedCompany = cleanCompany('Microsoft Corporation');
      const formattedCompany = formatCompanyToPascalCase(cleanedCompany);
      const label = 'Job';
      const lastNameValue = [mockConnection.lastName, label, formattedCompany]
        .filter((s: string) => s)
        .join(' ')
        .trim();
      expect(lastNameValue).toBe('Doe Job Microsoft');
    });
    it('should handle empty last name', () => {
      const cleanedCompany = cleanCompany('Microsoft');
      const formattedCompany = formatCompanyToPascalCase(cleanedCompany);
      const label = 'HR';
      const lastNameValue = ['', label, formattedCompany]
        .filter((s: string) => s)
        .join(' ')
        .trim();
      expect(lastNameValue).toBe('HR Microsoft');
    });
    it('should handle empty company', () => {
      const cleanedCompany = cleanCompany('');
      const formattedCompany = formatCompanyToPascalCase(cleanedCompany);
      const label = 'Job';
      const lastName = 'Smith';
      const lastNameValue = [lastName, label, formattedCompany]
        .filter((s: string) => s)
        .join(' ')
        .trim();
      expect(lastNameValue).toBe('Smith Job');
    });
    it('should format email label as "Label FormattedCompany"', () => {
      const cleanedCompany = cleanCompany('Microsoft Corporation');
      const formattedCompany = formatCompanyToPascalCase(cleanedCompany);
      const label = 'HR';
      const emailLabel = `${label} ${formattedCompany}`.trim();
      expect(emailLabel).toBe('HR Microsoft');
    });
  });

  describe('initialize', () => {
    it('should load contact groups', async () => {
      const freshContactSyncer = new ContactSyncer(
        mockAuth,
        mockDuplicateDetector
      );
      const mockListFn = vi.fn().mockResolvedValue({
        data: {
          contactGroups: [
            {
              resourceName: 'contactGroups/123',
              name: 'Job',
              groupType: 'USER_CONTACT_GROUP',
            },
            {
              resourceName: 'contactGroups/456',
              name: 'HR',
              groupType: 'USER_CONTACT_GROUP',
            },
          ],
        },
      });
      vi.mocked(google.people).mockReturnValue({
        contactGroups: { list: mockListFn },
      } as any);
      await freshContactSyncer.initialize();
      expect(mockListFn).toHaveBeenCalled();
    });
  });

  describe('addContact - biographies field', () => {
    it('should include biographies with Added note', async () => {
      const mockCreateFn = vi.fn().mockResolvedValue({});
      const mockGroupCreateFn = vi.fn().mockResolvedValue({
        data: { resourceName: 'contactGroups/newGroup' },
      });
      const mockListFn = vi.fn().mockResolvedValue({
        data: { contactGroups: [] },
      });
      const mockBatchGetFn = vi.fn().mockResolvedValue({
        data: { responses: [] },
      });
      vi.mocked(google.people).mockReturnValue({
        contactGroups: {
          list: mockListFn,
          batchGet: mockBatchGetFn,
          create: mockGroupCreateFn,
        },
        people: {
          createContact: mockCreateFn,
        },
      } as any);
      await contactSyncer.initialize();
      const result = await contactSyncer.addContact(mockConnection, 'Job');
      expect(result.status).toBe('new');
      expect(mockCreateFn).toHaveBeenCalled();
      const requestBody = mockCreateFn.mock.calls[0][0].requestBody;
      expect(requestBody.biographies).toBeDefined();
      expect(requestBody.biographies[0].value).toMatch(
        /^Added by the people syncer script \(LinkedIn\) - Last update: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/
      );
      expect(requestBody.biographies[0].contentType).toBe('TEXT_PLAIN');
    });
  });

  describe('updateContact - biographies field', () => {
    it('should add Updated note when no existing note', async () => {
      const mockGetFn = vi.fn().mockResolvedValue({
        data: {
          etag: 'test-etag',
          names: [{ givenName: 'John', familyName: 'Doe Job Microsoft' }],
          emailAddresses: [{ value: 'john@example.com' }],
          organizations: [{ title: 'Developer' }],
          urls: [
            {
              value: 'https://www.linkedin.com/in/test-user',
              type: 'LinkedIn',
            },
          ],
        },
      });
      const mockUpdateFn = vi.fn().mockResolvedValue({});
      vi.mocked(google.people).mockReturnValue({
        people: {
          get: mockGetFn,
          updateContact: mockUpdateFn,
        },
      } as any);
      await contactSyncer.updateContact('people/123', mockConnection, 'Job');
      expect(mockGetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          personFields: 'names,emailAddresses,urls,organizations,biographies',
        })
      );
      expect(mockUpdateFn).toHaveBeenCalled();
      const requestBody = mockUpdateFn.mock.calls[0][0].requestBody;
      expect(requestBody.biographies).toBeDefined();
      expect(requestBody.biographies[0].value).toMatch(
        /^Updated by the people syncer script \(LinkedIn\) - Last update: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/
      );
    });

    it('should convert Added message to Updated message even with same date', async () => {
      const today = new Date();
      const day: string = String(today.getDate()).padStart(2, '0');
      const month: string = String(today.getMonth() + 1).padStart(2, '0');
      const year: number = today.getFullYear();
      const hours: string = String(today.getHours()).padStart(2, '0');
      const minutes: string = String(today.getMinutes()).padStart(2, '0');
      const seconds: string = String(today.getSeconds()).padStart(2, '0');
      const todayDate: string = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
      const mockGetFn = vi.fn().mockResolvedValue({
        data: {
          etag: 'test-etag',
          names: [{ givenName: 'John', familyName: 'Doe Job Microsoft' }],
          emailAddresses: [{ value: 'john@example.com' }],
          organizations: [
            { name: 'Microsoft', title: 'Software Engineer', type: 'work' },
          ],
          urls: [
            {
              value: 'https://www.linkedin.com/in/test-user',
              type: 'LinkedIn',
            },
          ],
          biographies: [
            {
              value: `Added by the people syncer script (LinkedIn) - Last update: ${todayDate}`,
              contentType: 'TEXT_PLAIN',
            },
          ],
        },
      });
      const mockUpdateFn = vi.fn().mockResolvedValue({});
      vi.mocked(google.people).mockReturnValue({
        people: {
          get: mockGetFn,
          updateContact: mockUpdateFn,
        },
      } as any);
      const result = await contactSyncer.updateContact(
        'people/123',
        mockConnection,
        'Job'
      );
      expect(result.status).toBe('upToDate');
    });

    it('should convert Added to Updated and update date', async () => {
      const mockGetFn = vi.fn().mockResolvedValue({
        data: {
          etag: 'test-etag',
          names: [{ givenName: 'John', familyName: 'Doe Job Microsoft' }],
          emailAddresses: [{ value: 'john@example.com' }],
          organizations: [
            { name: 'Microsoft', title: 'Developer', type: 'work' },
          ],
          urls: [
            {
              value: 'https://www.linkedin.com/in/test-user',
              type: 'LinkedIn',
            },
          ],
          biographies: [
            {
              value:
                'Added by the people syncer script (LinkedIn) - Last update: 01/01/2024',
              contentType: 'TEXT_PLAIN',
            },
          ],
        },
      });
      const mockUpdateFn = vi.fn().mockResolvedValue({});
      vi.mocked(google.people).mockReturnValue({
        people: {
          get: mockGetFn,
          updateContact: mockUpdateFn,
        },
      } as any);
      await contactSyncer.updateContact('people/123', mockConnection, 'Job');
      expect(mockUpdateFn).toHaveBeenCalled();
      const requestBody = mockUpdateFn.mock.calls[0][0].requestBody;
      expect(requestBody.biographies[0].value).toMatch(
        /^Updated by the people syncer script \(LinkedIn\) - Last update: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/
      );
      expect(requestBody.biographies[0].value).not.toContain('01/01/2024');
      expect(requestBody.biographies[0].value).not.toContain('Added by');
    });

    it('should append Updated note to existing non-syncer note', async () => {
      const mockGetFn = vi.fn().mockResolvedValue({
        data: {
          etag: 'test-etag',
          names: [{ givenName: 'John', familyName: 'Doe Job Microsoft' }],
          emailAddresses: [{ value: 'john@example.com' }],
          organizations: [{ title: 'Software Engineer' }],
          urls: [{ value: 'https://www.linkedin.com/in/test-user' }],
          biographies: [
            {
              value: 'Some personal note',
              contentType: 'TEXT_PLAIN',
            },
          ],
        },
      });
      const mockUpdateFn = vi.fn().mockResolvedValue({});
      vi.mocked(google.people).mockReturnValue({
        people: {
          get: mockGetFn,
          updateContact: mockUpdateFn,
        },
      } as any);
      await contactSyncer.updateContact('people/123', mockConnection, 'Job');
      expect(mockUpdateFn).toHaveBeenCalled();
      const requestBody = mockUpdateFn.mock.calls[0][0].requestBody;
      expect(requestBody.biographies[0].value).toContain('Some personal note');
      expect(requestBody.biographies[0].value).toMatch(
        /Some personal note\nUpdated by the people syncer script \(LinkedIn\) - Last update: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/
      );
    });
  });
});
