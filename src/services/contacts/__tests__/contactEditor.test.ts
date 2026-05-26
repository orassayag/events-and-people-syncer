import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactEditor } from '../contactEditor';
import { google } from 'googleapis';
import type { OAuth2Client } from '../../../types';

vi.mock('googleapis', () => {
  const mockPeople = {
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
    people: {
      createContact: vi
        .fn()
        .mockResolvedValue({ data: { resourceName: 'people/123' } }),
      updateContact: vi
        .fn()
        .mockResolvedValue({ data: { resourceName: 'people/123' } }),
    },
  };
  return {
    google: {
      people: vi.fn().mockReturnValue(mockPeople),
    },
  };
});

vi.mock('../../../logging', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
    display = vi.fn();
    displayInfo = vi.fn();
    displayWarning = vi.fn();
    displayError = vi.fn();
    displaySuccess = vi.fn();
  },
}));

vi.mock('../../../utils', () => ({
  selectWithEscape: vi.fn(),
  inputWithEscape: vi.fn(),
  checkboxWithEscape: vi.fn(),
  TextUtils: {
    formatCompanyToPascalCase: vi.fn((s) => s),
    parseFullName: vi.fn((s) => ({
      firstName: s.split(' ')[0],
      lastName: s.split(' ')[1],
    })),
  },
  retryWithBackoff: vi.fn((fn) => fn()),
  DryModeChecker: { isDryMode: vi.fn().mockReturnValue(false) },
  DryModeMocks: { getMockContact: vi.fn() },
}));

describe('ContactEditor', () => {
  let editor: ContactEditor;
  let mockAuth: OAuth2Client;
  let mockDuplicateDetector: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {} as OAuth2Client;
    mockDuplicateDetector = {
      checkDuplicateName: vi.fn().mockResolvedValue([]),
      checkDuplicateEmail: vi.fn().mockResolvedValue([]),
      checkDuplicatePhone: vi.fn().mockResolvedValue([]),
      checkDuplicateLinkedInUrl: vi.fn().mockResolvedValue([]),
      promptDuplicateSelectOrCreate: vi
        .fn()
        .mockResolvedValue({ action: 'create_new' }),
      setApiLogging: vi.fn(),
      setLogCallback: vi.fn(),
      setUiLogger: vi.fn(),
    };
    editor = new ContactEditor(mockAuth, mockDuplicateDetector);
  });

  describe('fetchContactGroups', () => {
    it('should fetch and cache contact groups', async () => {
      const groups = await editor.fetchContactGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Friends');

      // Second call should use cache
      await editor.fetchContactGroups();
      expect(google.people).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    it('should clear cached groups', async () => {
      await editor.fetchContactGroups();
      editor.clearCache();
      await editor.fetchContactGroups();
      expect(google.people).toHaveBeenCalledTimes(2);
    });
  });

  describe('setApiLogging', () => {
    it('should update duplicate detector logging', () => {
      editor.setApiLogging(true);
      expect(mockDuplicateDetector.setApiLogging).toHaveBeenCalledWith(true);
    });
  });
});
