import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsJobsSyncScript } from '../eventsJobsSync';
import { EscapeSignal } from '../../utils';

vi.mock('fs/promises');
vi.mock('../../cache/folderCache');
vi.mock('child_process');
vi.mock('googleapis', () => ({
  google: {
    people: vi.fn(),
  },
}));
vi.mock('../../logging/logger');
vi.mock('../../logging/syncLogger');
vi.mock('../../services/auth');
vi.mock('../../services/contacts');
vi.mock('../../services/folders');
vi.mock('../../services/notes');
vi.mock('../../services/labels');
vi.mock('../../validators');

vi.mock('../../utils', () => {
  const selectWithEscape = vi
    .fn()
    .mockResolvedValue({ escaped: false, value: '' });
  const inputWithEscape = vi
    .fn()
    .mockResolvedValue({ escaped: false, value: '' });
  const confirmWithEscape = vi
    .fn()
    .mockResolvedValue({ escaped: false, value: false });
  const checkboxWithEscape = vi
    .fn()
    .mockResolvedValue({ escaped: false, value: [] });
  const searchableSelectWithEscape = vi
    .fn()
    .mockResolvedValue({ escaped: false, value: '' });

  return {
    selectWithEscape,
    inputWithEscape,
    confirmWithEscape,
    checkboxWithEscape,
    searchableSelectWithEscape,
    resetEscapeManagerForTesting: vi.fn(),
    EscapeSignal: class EscapeSignal extends Error {
      constructor() {
        super('User pressed ESC to go back');
        this.name = 'EscapeSignal';
      }
    },
    TextUtils: {
      cleanName: (s: string): string => s.trim(),
      formatCompanyToPascalCase: (s: string): string => s,
    },
    retryWithBackoff: vi.fn((fn: any) => fn()),
    readFromClipboard: vi
      .fn()
      .mockResolvedValue({ content: 'test content', sizeBytes: 12 }),
    clearClipboard: vi.fn().mockResolvedValue(undefined),
    formatMixedHebrewEnglish: vi.fn((s: string) => s),
    formatDateTimeDDMMYYYY_HHMMSS: vi.fn(() => '30042026_162330'),
  };
});

describe('EventsJobsSyncScript - Minimal Tests', () => {
  let script: any;
  let mockAuth: any;
  let mockContactEditor: any;
  let mockPathValidator: any;
  let mockFolderManager: any;
  let mockFolderMatcher: any;
  let mockNoteWriter: any;
  let mockLabelResolver: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {};
    mockContactEditor = {
      setApiLogging: vi.fn(),
      setLogCallback: vi.fn(),
    };
    mockPathValidator = {
      validatePathsExist: vi.fn().mockResolvedValue([]),
    };
    mockFolderManager = {
      trimFolderName: vi.fn((input: string) => input.trim()),
    };
    mockFolderMatcher = {};
    mockNoteWriter = {};
    mockLabelResolver = {
      setUiLogger: vi.fn(),
    };

    script = new EventsJobsSyncScript(
      mockAuth,
      mockContactEditor,
      mockPathValidator,
      mockFolderManager,
      mockFolderMatcher,
      mockNoteWriter,
      mockLabelResolver
    );
  });

  it('should be throwable and catchable EscapeSignal', () => {
    const error = new EscapeSignal();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EscapeSignal');
    expect(error.message).toBe('User pressed ESC to go back');
  });

  it('should initialize correctly', () => {
    expect(script).toBeDefined();
  });
});
