import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HibobContactSyncer } from '../contactSyncer';
import { SETTINGS } from '../../../settings';
import { SyncStatusType, ContactType } from '../../../types/linkedin';
import type { HibobContact } from '../../../types/hibob';
import { ApiTracker } from '../../api/apiTracker';
import { ContactCache } from '../../../cache';
import { google } from 'googleapis';

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
      invalidate: vi.fn().mockResolvedValue(undefined),
      getByResourceName: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn().mockReturnValue({
      trackWrite: vi.fn().mockResolvedValue(undefined),
      trackRead: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockResolvedValue({ read: 0, write: 0 }),
      logStats: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('HiBob ContactSyncer - Dry Mode', () => {
  let contactSyncer: HibobContactSyncer;
  let mockAuth: any;
  let mockDuplicateDetector: any;
  let mockService: any;
  const originalDryMode = SETTINGS.dryMode;
  const mockContact: HibobContact = {
    type: ContactType.HIBOB,
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@company.com',
  };
  beforeEach(() => {
    vi.useFakeTimers();
    mockService = {
      people: {
        get: vi.fn().mockResolvedValue({
          data: {
            names: [{ givenName: 'Alice', familyName: 'Johnson CompanyLabel' }],
            emailAddresses: [
              { value: 'alice@company.com', type: 'CompanyLabel' },
            ],
            urls: [],
            organizations: [{ name: 'CompanyName', title: 'Product Manager' }],
            memberships: [],
            biographies: [
              {
                value:
                  'Added by the people syncer script (HiBob) - Last update: 01/01/2024 00:00:00',
              },
            ],
            etag: 'test-etag',
          },
        }),
      },
    };
    vi.mocked(google.people).mockReturnValue(mockService);
    mockAuth = {} as any;
    mockDuplicateDetector = {
      addRecentlyModifiedContact: vi.fn(),
    } as any;
    contactSyncer = new HibobContactSyncer(mockAuth, mockDuplicateDetector);
  });
  afterEach(() => {
    vi.useRealTimers();
    (SETTINGS as any).dryMode = originalDryMode;
    vi.clearAllMocks();
  });

  describe('addContact', () => {
    it('should return NEW status in dry-mode without API call', async () => {
      (SETTINGS as any).dryMode = true;
      const resultPromise = contactSyncer.addContact(
        mockContact,
        'contactGroups/456',
        'CompanyLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.NEW);
    });

    it('should add mock contact to duplicate detector in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const resultPromise = contactSyncer.addContact(
        mockContact,
        'contactGroups/456',
        'CompanyLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      await resultPromise;
      expect(
        mockDuplicateDetector.addRecentlyModifiedContact
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Alice',
          lastName: 'Johnson',
          resourceName: expect.stringMatching(/^people\/dryMode_/),
          etag: expect.stringMatching(/^dryMode_etag_/),
        })
      );
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      const resultPromise = contactSyncer.addContact(
        mockContact,
        'contactGroups/456',
        'CompanyLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      await resultPromise;
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should continue operation if duplicate detector tracking fails', async () => {
      (SETTINGS as any).dryMode = true;
      mockDuplicateDetector.addRecentlyModifiedContact.mockImplementation(
        () => {
          throw new Error('Tracking failed');
        }
      );
      const resultPromise = contactSyncer.addContact(
        mockContact,
        'contactGroups/456',
        'CompanyLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.NEW);
    });

    it('should handle contact without email in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const contactWithoutEmail = {
        ...mockContact,
        email: '',
      };
      const resultPromise = contactSyncer.addContact(
        contactWithoutEmail,
        'contactGroups/456',
        'CompanyLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.NEW);
    });
  });

  describe('updateContact', () => {
    it('should return UPDATED status in dry-mode without API call', async () => {
      (SETTINGS as any).dryMode = true;
      const resultPromise = contactSyncer.updateContact(
        'people/789',
        'contactGroups/456'
      );
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.UPDATED);
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      const resultPromise = contactSyncer.updateContact(
        'people/789',
        'contactGroups/456'
      );
      await vi.runAllTimersAsync();
      await resultPromise;
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should invalidate cache in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      const resultPromise = contactSyncer.updateContact(
        'people/789',
        'contactGroups/456'
      );
      await vi.runAllTimersAsync();
      await resultPromise;
      expect(cache.invalidate).toHaveBeenCalled();
    });
  });
});
