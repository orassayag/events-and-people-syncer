import { describe, it, expect, vi, afterEach } from 'vitest';
import { DryModeChecker } from '../dryModeChecker';
import { SETTINGS } from '../../settings';

describe('DryModeChecker', () => {
  const originalDryMode = SETTINGS.dryMode;
  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
  });

  describe('isEnabled', () => {
    it('should return true when dryMode is enabled', () => {
      (SETTINGS as any).dryMode = true;
      expect(DryModeChecker.isEnabled()).toBe(true);
    });

    it('should return false when dryMode is disabled', () => {
      (SETTINGS as any).dryMode = false;
      expect(DryModeChecker.isEnabled()).toBe(false);
    });
  });

  describe('logApiCall', () => {
    it('should log with correct format using logger', () => {
      const mockLogger = {
        info: vi.fn(),
      };
      DryModeChecker.logApiCall(
        'service.people.createContact()',
        'Contact: John Smith',
        mockLogger
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith'
      );
    });

    it('should log to console when logger is undefined', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      DryModeChecker.logApiCall(
        'service.people.createContact()',
        'Contact: John Smith'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith'
      );
      consoleSpy.mockRestore();
    });

    it('should log to console when logger lacks info method', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const mockInvalidLogger = {} as any;
      DryModeChecker.logApiCall(
        'service.people.createContact()',
        'Contact: John Smith',
        mockInvalidLogger
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith'
      );
      consoleSpy.mockRestore();
    });
  });
});
