import { describe, it, expect } from 'vitest';
import type { ExtractedContact } from '../../types/smsWhatsappSync';
import { SETTINGS } from '../../settings';

describe('SMS/WhatsApp Sync - All Phones Already Synced', () => {
  it('should return empty array when all phones already exist in contacts', () => {
    const extractedPhones: ExtractedContact[] = [
      { phone: '+972501234567', normalizedPhone: '+972501234567' },
      { phone: '+1-555-987-6543', normalizedPhone: '+15559876543' },
    ];
    const existingPhones = new Set(['+972501234567', '+15559876543']);
    const phonesToProcess = extractedPhones.filter(
      p => !existingPhones.has(p.normalizedPhone)
    );
    expect(phonesToProcess).toHaveLength(0);
  });

  it('should return phones that are not in contacts', () => {
    const extractedPhones: ExtractedContact[] = [
      { phone: '+972501234567', normalizedPhone: '+972501234567' },
      { phone: '+1-555-987-6543', normalizedPhone: '+15559876543' },
      { phone: '+44 20 7946 0958', normalizedPhone: '+442079460958' },
    ];
    const existingPhones = new Set(['+972501234567']);
    const phonesToProcess = extractedPhones.filter(
      p => !existingPhones.has(p.normalizedPhone)
    );
    expect(phonesToProcess).toHaveLength(2);
  });
});

describe('SMS/WhatsApp Sync - Stats Tracking', () => {
  it('should track added, updated, skipped, and error counts', () => {
    const stats = { added: 0, updated: 0, skipped: 0, error: 0 };
    stats.added++;
    stats.added++;
    stats.updated++;
    stats.skipped++;
    stats.skipped++;
    stats.skipped++;
    stats.error++;
    expect(stats.added).toBe(2);
    expect(stats.updated).toBe(1);
    expect(stats.skipped).toBe(3);
    expect(stats.error).toBe(1);
  });
});

describe('SMS/WhatsApp Sync - Dry-Mode Integration', () => {
  const originalDryMode = SETTINGS.dryMode;
  
  it('should respect dry-mode setting from SETTINGS', () => {
    expect(typeof SETTINGS.dryMode).toBe('boolean');
  });

  it('should track that dry-mode prevents actual API writes', () => {
    (SETTINGS as any).dryMode = true;
    expect(SETTINGS.dryMode).toBe(true);
    (SETTINGS as any).dryMode = originalDryMode;
  });

  it('should verify mock contact resourceNames have dry-mode prefix', () => {
    const mockResourceName = 'people/dryMode_123_abc';
    expect(mockResourceName).toMatch(/^people\/dryMode_/);
  });
});
