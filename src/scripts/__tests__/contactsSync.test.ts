import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactsSyncScript } from '../contactsSync';

vi.mock('../../logging', () => ({
  SyncLogger: class {
    initialize = vi.fn().mockResolvedValue(undefined);
    logMain = vi.fn().mockResolvedValue(undefined);
    logError = vi.fn().mockResolvedValue(undefined);
  },
  Logger: class {
    display = vi.fn();
    error = vi.fn();
    displayError = vi.fn();
    displayExit = vi.fn();
    info = vi.fn();
    warn = vi.fn();
  },
}));

vi.mock('../../services/auth', () => ({
  AuthService: class {
    authorize = vi.fn().mockResolvedValue({});
  },
}));

vi.mock('../../utils', () => ({
  selectWithEscape: vi.fn(),
  inputWithEscape: vi.fn(),
  formatDateTimeDDMMYYYY_HHMMSS: vi.fn(() => '01/01/2026 12:00:00'),
  TextUtils: { cleanName: vi.fn((s) => s) },
}));

describe('ContactsSyncScript', () => {
  let script: ContactsSyncScript;
  let mockAuth: any;
  let mockContactSyncer: any;
  let mockContactEditor: any;
  let mockDuplicateDetector: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {};
    mockContactSyncer = {
      fetchContactsForSyncing: vi.fn().mockResolvedValue([]),
    };
    mockContactEditor = {
      setApiLogging: vi.fn(),
      setLogCallback: vi.fn(),
    };
    mockDuplicateDetector = {};

    script = new ContactsSyncScript(
      mockAuth,
      mockContactSyncer,
      mockContactEditor,
      mockDuplicateDetector
    );
  });

  describe('run', () => {
    it('should initialize and run main menu', async () => {
      // Mock mainMenu to exit immediately
      const mainMenuSpy = vi
        .spyOn(script as any, 'mainMenu')
        .mockResolvedValue(undefined);

      await script.run();

      expect(mainMenuSpy).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(script as any, 'validateAuth').mockRejectedValueOnce(
        new Error('Auth failed')
      );

      await script.run();

      // Should not throw
    });
  });
});
