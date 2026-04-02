import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContactSyncer } from '../contactSyncer';
import { SETTINGS } from '../../../settings';
import { SyncStatusType, ContactType } from '../../../types/linkedin';
import type { LinkedInConnection } from '../../../types/linkedin';
import { ApiTracker } from '../../api/apiTracker';
import { ContactCache } from '../../../cache';
import { google } from 'googleapis';

vi.mock('googleapis');
vi.mock('../../../cache', () => ({
  ContactCache: {
    getInstance: vi.fn().mockReturnValue({
      invalidate: vi.fn().mockResolvedValue(undefined),
      getByResourceName: vi.fn().mockResolvedValue(null),
    }),
  },
}));
vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn().mockReturnValue({
      trackWrite: vi.fn().mockResolvedValue(undefined),
      trackRead: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('LinkedIn ContactSyncer - Dry Mode', () => {
  let contactSyncer: ContactSyncer;
  let mockAuth: any;
  let mockDuplicateDetector: any;
  let mockService: any;
  const originalDryMode = SETTINGS.dryMode;
  const mockConnection: LinkedInConnection = {
    type: ContactType.LINKEDIN,
    id: 'jane-doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    position: 'Software Engineer',
    company: 'TechCorp',
    url: 'https://linkedin.com/in/janedoe',
    connectedOn: '2024-01-01',
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    mockService = {
      people: {
        get: vi.fn().mockResolvedValue({
          data: {
            names: [
              { givenName: 'Jane', familyName: 'Doe TestLabel TechCorp' },
            ],
            emailAddresses: [
              { value: 'jane@example.com', type: 'TestLabel TechCorp' },
            ],
            urls: [
              { value: 'https://linkedin.com/in/janedoe', type: 'LinkedIn' },
            ],
            organizations: [{ name: 'TechCorp', title: 'Software Engineer' }],
            memberships: [],
            biographies: [
              {
                value:
                  'Added by the people syncer script (LinkedIn) - Last update: 01/01/2024 00:00:00',
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
    contactSyncer = new ContactSyncer(mockAuth, mockDuplicateDetector);
    vi.spyOn(contactSyncer as any, 'loadContactGroups').mockResolvedValue(
      undefined
    );
    (contactSyncer as any).groupMap = { TestLabel: 'contactGroups/123' };
    await contactSyncer.initialize();
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
        mockConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.NEW);
    });

    it('should add mock contact to duplicate detector in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const resultPromise = contactSyncer.addContact(
        mockConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      await resultPromise;
      expect(
        mockDuplicateDetector.addRecentlyModifiedContact
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Doe',
          resourceName: expect.stringMatching(/^people\/dryMode_/),
          etag: expect.stringMatching(/^dryMode_etag_/),
        })
      );
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      const resultPromise = contactSyncer.addContact(
        mockConnection,
        'TestLabel'
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
        mockConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.NEW);
    });
  });

  describe('updateContact', () => {
    it('should return UPDATED status in dry-mode without API call', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      (cache.getByResourceName as any).mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe TestLabel TechCorp',
        company: 'TechCorp',
        jobTitle: 'Software Engineer',
        emails: [{ value: 'jane@example.com', type: 'TestLabel TechCorp' }],
        websites: [
          { url: 'https://linkedin.com/in/janedoe', label: 'LinkedIn' },
        ],
        biography: 'Added by the people syncer script (LinkedIn)',
        etag: 'test-etag',
      });
      const updatedConnection = {
        ...mockConnection,
        position: 'Senior Software Engineer',
      };
      const resultPromise = contactSyncer.updateContact(
        'people/123',
        updatedConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.UPDATED);
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      const cache = ContactCache.getInstance();
      (cache.getByResourceName as any).mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe TestLabel TechCorp',
        company: 'TechCorp',
        jobTitle: 'Software Engineer',
        emails: [{ value: 'jane@example.com', type: 'TestLabel TechCorp' }],
        websites: [
          { url: 'https://linkedin.com/in/janedoe', label: 'LinkedIn' },
        ],
        biography: 'Added by the people syncer script (LinkedIn)',
        etag: 'test-etag',
      });
      const updatedConnection = {
        ...mockConnection,
        position: 'Senior Software Engineer',
      };
      const resultPromise = contactSyncer.updateContact(
        'people/123',
        updatedConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      await resultPromise;
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should invalidate cache in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      (cache.getByResourceName as any).mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe TestLabel TechCorp',
        company: 'TechCorp',
        jobTitle: 'Software Engineer',
        emails: [{ value: 'jane@example.com', type: 'TestLabel TechCorp' }],
        websites: [
          { url: 'https://linkedin.com/in/janedoe', label: 'LinkedIn' },
        ],
        biography: 'Added by the people syncer script (LinkedIn)',
        etag: 'test-etag',
      });
      const updatedConnection = {
        ...mockConnection,
        position: 'Senior Software Engineer',
      };
      const resultPromise = contactSyncer.updateContact(
        'people/123',
        updatedConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      await resultPromise;
      expect(cache.invalidate).toHaveBeenCalled();
    });

    it('should return UPDATED when no changes detected in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      (cache.getByResourceName as any).mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe TestLabel',
        company: 'TechCorp',
        jobTitle: 'Software Engineer',
        emails: [{ value: 'jane@example.com', type: 'TestLabel TechCorp' }],
        websites: [
          { url: 'https://linkedin.com/in/janedoe', label: 'LinkedIn' },
        ],
        biography: '',
        etag: 'test-etag',
      });
      const resultPromise = contactSyncer.updateContact(
        'people/123',
        mockConnection,
        'TestLabel'
      );
      await vi.advanceTimersByTimeAsync(2500);
      const result = await resultPromise;
      expect(result.status).toBe(SyncStatusType.UPDATED);
    });
  });

  describe('ensureGroupExists', () => {
    it('should return mock resourceName in dry-mode for new groups', async () => {
      (SETTINGS as any).dryMode = true;
      const resourceName = await (contactSyncer as any).ensureGroupExists(
        'NewGroup'
      );
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should prefix group name with [DRY-MODE] in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await (contactSyncer as any).ensureGroupExists('NewGroup');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should return existing group without creating new one', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      const resourceName = await (contactSyncer as any).ensureGroupExists(
        'TestLabel'
      );
      expect(resourceName).toBe('contactGroups/123');
      expect(apiTracker.trackWrite).not.toHaveBeenCalled();
    });
  });
});
