import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContactEditor } from '../contactEditor';
import type { EditableContactData } from '../contactEditor';
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

describe('ContactEditor - Dry Mode', () => {
  let contactEditor: ContactEditor;
  let mockAuth: any;
  let mockDuplicateDetector: any;
  let mockService: any;
  const originalDryMode = SETTINGS.dryMode;
  beforeEach(() => {
    mockService = {
      people: {
        get: vi.fn().mockResolvedValue({
          data: {
            phoneNumbers: [],
            emailAddresses: [],
            etag: 'test-etag',
          },
        }),
      },
    };
    vi.mocked(google.people).mockReturnValue(mockService);
    mockAuth = {} as any;
    mockDuplicateDetector = {
      addRecentlyModifiedContact: vi.fn(),
      checkDuplicateName: vi.fn().mockResolvedValue([]),
      checkDuplicateEmail: vi.fn().mockResolvedValue([]),
      checkDuplicatePhone: vi.fn().mockResolvedValue([]),
      checkDuplicateLinkedInUrl: vi.fn().mockResolvedValue([]),
      promptForDuplicateContinue: vi.fn().mockResolvedValue(true),
      setApiLogging: vi.fn(),
      setUiLogger: vi.fn(),
      setLogCallback: vi.fn(),
    } as any;
    contactEditor = new ContactEditor(mockAuth, mockDuplicateDetector);
    vi.spyOn(contactEditor as any, 'fetchContactGroups').mockResolvedValue([
      { resourceName: 'contactGroups/123', name: 'TestLabel' },
    ]);
  });
  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
    vi.clearAllMocks();
  });

  describe('createContact', () => {
    const testData: EditableContactData = {
      firstName: 'John',
      lastName: 'Smith',
      emails: ['john@example.com'],
      phones: [],
      labelResourceNames: ['contactGroups/123'],
    };

    it('should skip API call in dry-mode and log operation', async () => {
      (SETTINGS as any).dryMode = true;
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      await contactEditor.createContact(testData, 'Test note');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('-Resource Name:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('(mock)')
      );
      consoleLogSpy.mockRestore();
    });

    it('should add mock contact to duplicate detector in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      await contactEditor.createContact(testData, 'Test note');
      expect(
        mockDuplicateDetector.addRecentlyModifiedContact
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Smith',
          resourceName: expect.stringMatching(/^people\/dryMode_/),
          etag: expect.stringMatching(/^dryMode_etag_/),
        })
      );
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await contactEditor.createContact(testData, 'Test note');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should continue operation if duplicate detector tracking fails', async () => {
      (SETTINGS as any).dryMode = true;
      mockDuplicateDetector.addRecentlyModifiedContact.mockImplementation(
        () => {
          throw new Error('Tracking failed');
        }
      );
      await expect(
        contactEditor.createContact(testData, 'Test note')
      ).resolves.not.toThrow();
    });
  });

  describe('createContactGroup', () => {
    it('should return mock resourceName in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const resourceName =
        await contactEditor.createContactGroup('TestCompany');
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should prefix group name with [DRY-MODE] in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      await contactEditor.createContactGroup('TestCompany');
      const apiTracker = ApiTracker.getInstance();
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await contactEditor.createContactGroup('TestGroup');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });
  });

  describe('addPhoneToExistingContact', () => {
    it('should skip API call in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      await contactEditor.addPhoneToExistingContact(
        'people/123',
        '+1234567890'
      );
      const apiTracker = ApiTracker.getInstance();
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should invalidate cache in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      await contactEditor.addPhoneToExistingContact(
        'people/123',
        '+1234567890'
      );
      expect(cache.invalidate).toHaveBeenCalled();
    });
  });

  describe('addEmailToExistingContact', () => {
    it('should skip API call in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      await contactEditor.addEmailToExistingContact(
        'people/123',
        'test@example.com'
      );
      const apiTracker = ApiTracker.getInstance();
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should invalidate cache in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const cache = ContactCache.getInstance();
      await contactEditor.addEmailToExistingContact(
        'people/123',
        'test@example.com'
      );
      expect(cache.invalidate).toHaveBeenCalled();
    });
  });
});
