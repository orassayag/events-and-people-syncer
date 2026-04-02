import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContactSyncer } from '../contactSyncer';
import type { EditableContactData } from '../contactEditor';
import type { ContactData } from '../../../types/contact';
import { SETTINGS } from '../../../settings';
import { ApiTracker } from '../../api/apiTracker';
import { ContactCache } from '../../../cache';
import { google } from 'googleapis';

vi.mock('googleapis');
vi.mock('../../../cache', () => ({
  ContactCache: {
    getInstance: vi.fn().mockReturnValue({
      invalidate: vi.fn().mockResolvedValue(undefined),
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

describe('ContactSyncer - Dry Mode', () => {
  let contactSyncer: ContactSyncer;
  let mockAuth: any;
  let mockUiLogger: any;
  let mockService: any;
  const originalDryMode = SETTINGS.dryMode;
  const mockOriginalData: ContactData = {
    label: 'TestLabel',
    firstName: 'Bob',
    lastName: 'Smith',
    company: 'OldCompany',
    jobTitle: 'Engineer',
    emails: [{ value: 'bob@old.com', label: 'work' }],
    phones: [{ number: '+1234567890', label: 'mobile' }],
    websites: [],
    resourceName: 'people/999',
    biography: 'Test bio',
    etag: 'test-etag',
  };
  beforeEach(() => {
    mockService = {
      people: {
        get: vi.fn().mockResolvedValue({
          data: {
            names: [{ givenName: 'Bob', familyName: 'Smith' }],
            emailAddresses: [{ value: 'bob@old.com', type: 'work' }],
            phoneNumbers: [{ value: '+1234567890', type: 'mobile' }],
            organizations: [{ name: 'OldCompany', title: 'Engineer' }],
            urls: [],
            memberships: [
              {
                contactGroupMembership: {
                  contactGroupResourceName: 'contactGroups/123',
                },
              },
            ],
            biographies: [{ value: 'Test bio' }],
            etag: 'test-etag',
          },
        }),
      },
    };
    vi.mocked(google.people).mockReturnValue(mockService);
    mockAuth = {} as any;
    mockUiLogger = {
      displaySuccess: vi.fn(),
      displayError: vi.fn(),
      displayInfo: vi.fn(),
      info: vi.fn(),
    } as any;
    contactSyncer = new ContactSyncer(mockAuth);
    vi.spyOn(contactSyncer as any, 'fetchContactGroups').mockResolvedValue([
      { resourceName: 'contactGroups/123', name: 'TestLabel' },
    ]);
    vi.spyOn(contactSyncer as any, 'delay').mockResolvedValue(undefined);
  });
  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
    vi.clearAllMocks();
  });

  describe('updateContact', () => {
    const updatedData: EditableContactData = {
      firstName: 'Bob',
      lastName: 'Smith',
      company: 'NewCompany',
      jobTitle: 'Senior Engineer',
      emails: ['bob@new.com'],
      phones: ['+1234567890'],
      labelResourceNames: ['contactGroups/123'],
    };

    it('should skip API call in dry-mode with changes', async () => {
      (SETTINGS as any).dryMode = true;
      await contactSyncer.updateContact(
        'people/999',
        mockOriginalData,
        updatedData,
        mockUiLogger
      );
      expect(mockUiLogger.displaySuccess).toHaveBeenCalledWith(
        expect.stringContaining('[DRY MODE]')
      );
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await contactSyncer.updateContact(
        'people/999',
        mockOriginalData,
        updatedData,
        mockUiLogger
      );
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should invalidate cache in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      await contactSyncer.updateContact(
        'people/999',
        mockOriginalData,
        updatedData,
        mockUiLogger
      );
      expect(cache.invalidate).toHaveBeenCalled();
    });

    it('should skip update when no changes detected', async () => {
      (SETTINGS as any).dryMode = true;
      const noChangeData: EditableContactData = {
        firstName: 'Bob',
        lastName: 'Smith',
        company: 'OldCompany',
        jobTitle: 'Engineer',
        emails: ['bob@old.com'],
        phones: ['+1234567890'],
        labelResourceNames: ['contactGroups/123'],
      };
      await contactSyncer.updateContact(
        'people/999',
        mockOriginalData,
        noChangeData,
        mockUiLogger
      );
      expect(mockUiLogger.displaySuccess).not.toHaveBeenCalled();
    });
  });

  describe('createContactGroup', () => {
    it('should return mock resourceName in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const resourceName = await contactSyncer.createContactGroup('NewGroup');
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should prefix group name with [DRY-MODE] in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await contactSyncer.createContactGroup('NewGroup');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await contactSyncer.createContactGroup('TestGroup');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });
  });
});
