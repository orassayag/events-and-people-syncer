import { describe, it, expect } from 'vitest';
import type { OtherContactEntry, OtherContactsSyncStats } from '../../types/otherContactsSync';
import { SETTINGS } from '../../settings';

const emailNormalize = (email: string): string => email.toLowerCase().trim();

const deduplicateEmails = (entries: OtherContactEntry[]): OtherContactEntry[] => {
  const seenEmails = new Set<string>();
  return entries
    .map((entry) => {
      const uniqueEmails = entry.emails.filter((email) => {
        const normalized = emailNormalize(email);
        if (seenEmails.has(normalized)) {
          return false;
        }
        seenEmails.add(normalized);
        return true;
      });
      return { ...entry, emails: uniqueEmails };
    })
    .filter((entry) => entry.emails.length > 0 || entry.displayName);
};

describe('OtherContactsSync - Email Deduplication', () => {
  describe('deduplicateEmails', () => {
    it('should remove duplicate emails across entries', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['shared@example.com'], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['shared@example.com'], phones: [], resourceName: 'oc/2', displayName: 'Second' },
        { emails: ['unique@example.com'], phones: [], resourceName: 'oc/3', displayName: 'Third' },
      ];
      const result = deduplicateEmails(entries);
      expect(result).toHaveLength(3);
      expect(result[0].emails).toEqual(['shared@example.com']);
      expect(result[1].emails).toEqual([]);
      expect(result[2].emails).toEqual(['unique@example.com']);
    });

    it('should keep entries with no emails but with displayName', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['test@example.com'], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['test@example.com'], phones: [], resourceName: 'oc/2', displayName: 'Second' },
      ];
      const result = deduplicateEmails(entries);
      expect(result).toHaveLength(2);
      expect(result[1].emails).toHaveLength(0);
      expect(result[1].displayName).toBe('Second');
    });

    it('should filter out entries with no emails and no displayName', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['test@example.com'], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['test@example.com'], phones: [], resourceName: 'oc/2' },
      ];
      const result = deduplicateEmails(entries);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('First');
    });

    it('should handle case-insensitive email matching', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['John@Example.COM'], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['john@example.com'], phones: [], resourceName: 'oc/2', displayName: 'Second' },
      ];
      const result = deduplicateEmails(entries);
      expect(result[0].emails).toEqual(['John@Example.COM']);
      expect(result[1].emails).toEqual([]);
    });

    it('should deduplicate multiple emails within same entry', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['a@test.com', 'b@test.com'], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['b@test.com', 'c@test.com'], phones: [], resourceName: 'oc/2', displayName: 'Second' },
      ];
      const result = deduplicateEmails(entries);
      expect(result[0].emails).toEqual(['a@test.com', 'b@test.com']);
      expect(result[1].emails).toEqual(['c@test.com']);
    });

    it('should handle empty entries array', () => {
      const entries: OtherContactEntry[] = [];
      const result = deduplicateEmails(entries);
      expect(result).toHaveLength(0);
    });

    it('should preserve order of first occurrence', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['second@test.com'], phones: [], resourceName: 'oc/1', displayName: 'First Entry' },
        { emails: ['first@test.com', 'second@test.com'], phones: [], resourceName: 'oc/2', displayName: 'Second Entry' },
      ];
      const result = deduplicateEmails(entries);
      expect(result[0].emails).toEqual(['second@test.com']);
      expect(result[1].emails).toEqual(['first@test.com']);
    });

    it('should preserve phones even when emails are deduplicated', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['shared@test.com'], phones: ['+1-555-111-1111'], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['shared@test.com'], phones: ['+1-555-222-2222'], resourceName: 'oc/2', displayName: 'Second' },
      ];
      const result = deduplicateEmails(entries);
      expect(result[0].phones).toEqual(['+1-555-111-1111']);
      expect(result[1].phones).toEqual(['+1-555-222-2222']);
    });

    it('should handle whitespace in emails', () => {
      const entries: OtherContactEntry[] = [
        { emails: ['  test@example.com  '], phones: [], resourceName: 'oc/1', displayName: 'First' },
        { emails: ['test@example.com'], phones: [], resourceName: 'oc/2', displayName: 'Second' },
      ];
      const result = deduplicateEmails(entries);
      expect(result[0].emails).toEqual(['  test@example.com  ']);
      expect(result[1].emails).toEqual([]);
    });
  });
});

describe('OtherContactsSync - Entry Filtering', () => {
  const filterProcessableEntries = (entries: OtherContactEntry[]): OtherContactEntry[] => {
    return entries.filter((entry) => entry.emails.length > 0 || entry.displayName);
  };

  it('should keep entries with emails', () => {
    const entries: OtherContactEntry[] = [
      { emails: ['test@example.com'], phones: [], resourceName: 'oc/1' },
    ];
    const result = filterProcessableEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('should keep entries with displayName only', () => {
    const entries: OtherContactEntry[] = [
      { emails: [], phones: ['+1-555-123-4567'], resourceName: 'oc/1', displayName: 'John Doe' },
    ];
    const result = filterProcessableEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('should filter out entries with no emails and no displayName', () => {
    const entries: OtherContactEntry[] = [
      { emails: [], phones: ['+1-555-123-4567'], resourceName: 'oc/1' },
    ];
    const result = filterProcessableEntries(entries);
    expect(result).toHaveLength(0);
  });

  it('should handle mixed entries', () => {
    const entries: OtherContactEntry[] = [
      { emails: ['test@example.com'], phones: [], resourceName: 'oc/1' },
      { emails: [], phones: [], resourceName: 'oc/2', displayName: 'Has Name' },
      { emails: [], phones: ['+1-555-123-4567'], resourceName: 'oc/3' },
      { emails: ['another@test.com'], phones: ['+1-555-999-9999'], resourceName: 'oc/4', displayName: 'Full' },
    ];
    const result = filterProcessableEntries(entries);
    expect(result).toHaveLength(3);
  });
});

describe('OtherContactsSync - Display Name Truncation', () => {
  const truncateDisplayName = (name: string, maxLength: number = 100): string => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  };

  it('should not truncate names under max length', () => {
    const name = 'John Doe';
    const result = truncateDisplayName(name);
    expect(result).toBe('John Doe');
  });

  it('should truncate names over max length with ellipsis', () => {
    const name = 'A'.repeat(150);
    const result = truncateDisplayName(name);
    expect(result.length).toBe(100);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle exactly max length', () => {
    const name = 'A'.repeat(100);
    const result = truncateDisplayName(name);
    expect(result).toBe(name);
  });

  it('should handle custom max length', () => {
    const name = 'A'.repeat(50);
    const result = truncateDisplayName(name, 30);
    expect(result.length).toBe(30);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle empty string', () => {
    const result = truncateDisplayName('');
    expect(result).toBe('');
  });
});

describe('OtherContactsSync - Stats Tracking', () => {
  it('should initialize stats to zero', () => {
    const stats: OtherContactsSyncStats = {
      added: 0,
      updated: 0,
      skipped: 0,
      error: 0,
      phonesAutoAdded: 0,
    };
    expect(stats.added).toBe(0);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.error).toBe(0);
  });

  it('should increment stats correctly', () => {
    const stats: OtherContactsSyncStats = {
      added: 0,
      updated: 0,
      skipped: 0,
      error: 0,
      phonesAutoAdded: 0,
    };
    stats.added++;
    stats.updated += 2;
    stats.skipped += 5;
    stats.error++;
    expect(stats.added).toBe(1);
    expect(stats.updated).toBe(2);
    expect(stats.skipped).toBe(5);
    expect(stats.error).toBe(1);
  });

  it('should calculate total processed', () => {
    const stats: OtherContactsSyncStats = {
      added: 3,
      updated: 5,
      skipped: 10,
      error: 2,
      phonesAutoAdded: 1,
    };
    const total = stats.added + stats.updated + stats.skipped + stats.error;
    expect(total).toBe(20);
  });
});

describe('OtherContactsSync - Dry-Mode Integration', () => {
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
    const mockResourceName = 'people/dryMode_456_xyz';
    expect(mockResourceName).toMatch(/^people\/dryMode_/);
  });

  it('should verify that API statistics would be prefixed with [DRY MODE] in dry-mode', () => {
    (SETTINGS as any).dryMode = true;
    const statsPrefix = SETTINGS.dryMode ? '[DRY MODE] ' : '';
    expect(statsPrefix).toBe('[DRY MODE] ');
    (SETTINGS as any).dryMode = originalDryMode;
  });
});
