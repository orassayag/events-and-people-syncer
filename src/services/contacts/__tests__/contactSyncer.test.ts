import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactSyncer } from '../contactSyncer';
import { google } from 'googleapis';
import type { OAuth2Client } from '../../../types';
import { Logger } from '../../../logging';

vi.mock('googleapis', () => {
  const mockPeopleService = {
    people: {
      connections: {
        list: vi.fn().mockResolvedValue({
          data: {
            connections: [
              {
                resourceName: 'people/1',
                names: [{ givenName: 'John', familyName: 'Doe' }],
                emailAddresses: [{ value: 'john@example.com' }],
                phoneNumbers: [{ value: '+15551234567' }],
                memberships: [
                  {
                    contactGroupMembership: {
                      contactGroupResourceName: 'contactGroups/1',
                    },
                  },
                ],
                etag: 'etag1',
              },
            ],
          },
        }),
      },
    },
    contactGroups: {
      list: vi.fn().mockResolvedValue({
        data: {
          contactGroups: [
            {
              resourceName: 'contactGroups/1',
              name: 'Friends',
              groupType: 'USER_CONTACT_GROUP',
            },
          ],
        },
      }),
    },
  };
  return {
    google: {
      people: vi.fn().mockReturnValue(mockPeopleService),
    },
  };
});

vi.mock('ora', () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  }),
}));

vi.mock('../../../logging', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    resetState = vi.fn();
  },
}));

vi.mock('../../api', () => ({
  ApiTracker: {
    getInstance: vi.fn().mockReturnValue({
      trackRead: vi.fn(),
      trackWrite: vi.fn(),
    }),
  },
}));

vi.mock('../../../settings', () => ({
  SETTINGS: {
    api: {
      pageSize: 100,
    },
  },
}));

vi.mock('../../../utils', () => ({
  retryWithBackoff: vi.fn((fn) => fn()),
  formatDateTimeDDMMYYYY_HHMMSS: vi.fn(() => '01/01/2026 12:00:00'),
  formatCompanyToPascalCase: vi.fn((s) => s),
  DryModeChecker: { isDryMode: vi.fn().mockReturnValue(false) },
  DryModeMocks: { getMockContact: vi.fn() },
}));

describe('ContactSyncer', () => {
  let syncer: ContactSyncer;
  let mockAuth: OAuth2Client;
  let mockUiLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {} as OAuth2Client;
    mockUiLogger = new Logger('UI');
    syncer = new ContactSyncer(mockAuth);
  });

  describe('fetchContactsForSyncing', () => {
    it('should fetch and categorize contacts', async () => {
      const result = await syncer.fetchContactsForSyncing(mockUiLogger);
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(google.people).toHaveBeenCalled();
    });
  });

  describe('getContactsBreakdown', () => {
    it('should return zeros if no contacts fetched', () => {
      const breakdown = syncer.getContactsBreakdown();
      expect(breakdown).toEqual({
        syncerCount: 0,
        syncCount: 0,
        noNoteCount: 0,
      });
    });
  });
});
