import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listScripts, AVAILABLE_SCRIPTS } from '../index';

describe('Scripts Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have all expected scripts in AVAILABLE_SCRIPTS', () => {
    const expectedKeys = [
      'hibob-sync',
      'linkedin-sync',
      'linkedin-exporter',
      'contacts-sync',
      'events-jobs-sync',
      'other-contacts-sync',
      'sms-whatsapp-sync',
      'google-contacts-maintainer',
      'statistics',
      'clear-cache',
      'clear-logs',
    ];

    expectedKeys.forEach(key => {
      expect(AVAILABLE_SCRIPTS).toHaveProperty(key);
      expect(AVAILABLE_SCRIPTS[key]).toHaveProperty('metadata');
      expect(AVAILABLE_SCRIPTS[key]).toHaveProperty('run');
    });
  });

  it('should list scripts without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    expect(() => listScripts()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});
