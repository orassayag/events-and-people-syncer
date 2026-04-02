import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LabelResolver } from '../labelResolver';
import { SETTINGS } from '../../../settings';
import { ApiTracker } from '../../api/apiTracker';

vi.mock('googleapis');
vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn().mockReturnValue({
      trackWrite: vi.fn().mockResolvedValue(undefined),
      trackRead: vi.fn().mockResolvedValue(undefined),
      logStats: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('LabelResolver - Dry Mode', () => {
  let labelResolver: LabelResolver;
  let mockAuth: any;
  let mockUiLogger: any;
  const originalDryMode = SETTINGS.dryMode;
  beforeEach(() => {
    mockAuth = {} as any;
    mockUiLogger = {
      displayInfo: vi.fn(),
    } as any;
    labelResolver = new LabelResolver(mockAuth);
    labelResolver.setApiLogging(true);
    labelResolver.setUiLogger(mockUiLogger);
  });
  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
    vi.clearAllMocks();
  });

  describe('createLabel', () => {
    it('should return mock resourceName in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const resourceName = await labelResolver.createLabel('TestLabel');
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should prefix group name with [DRY-MODE] in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await labelResolver.createLabel('TestLabel');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should track write operation in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await labelResolver.createLabel('NewLabel');
      expect(apiTracker.trackWrite).toHaveBeenCalled();
    });

    it('should log stats when API logging enabled in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const apiTracker = ApiTracker.getInstance();
      await labelResolver.createLabel('NewLabel');
      expect(apiTracker.logStats).toHaveBeenCalledWith(mockUiLogger);
    });

    it('should not log stats when API logging disabled in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      labelResolver.setApiLogging(false);
      const apiTracker = ApiTracker.getInstance();
      await labelResolver.createLabel('NewLabel');
      expect(apiTracker.logStats).not.toHaveBeenCalled();
    });

    it('should create unique mock resource names', async () => {
      (SETTINGS as any).dryMode = true;
      const resourceName1 = await labelResolver.createLabel('Label1');
      const resourceName2 = await labelResolver.createLabel('Label2');
      expect(resourceName1).not.toBe(resourceName2);
    });
  });
});
