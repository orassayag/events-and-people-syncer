import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiTracker } from '../apiTracker';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { SETTINGS } from '../../../settings';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../settings', () => ({
  SETTINGS: {
    paths: {
      apiStatsFile: 'mock-api-stats.json',
    },
    dryMode: false,
  },
}));

describe('ApiTracker', () => {
  let tracker: ApiTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore - access private static member for testing
    ApiTracker.instance = undefined;
    tracker = ApiTracker.getInstance();
  });

  describe('trackRead', () => {
    it('should increment read count', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockStats = { date: new Date().toISOString().split('T')[0], read_count: 5, write_count: 2 };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockStats));

      await tracker.trackRead();

      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"read_count": 6'),
        'utf-8'
      );
    });
  });

  describe('trackWrite', () => {
    it('should increment write count', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const mockStats = { date: new Date().toISOString().split('T')[0], read_count: 5, write_count: 2 };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockStats));

      await tracker.trackWrite();

      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"write_count": 3'),
        'utf-8'
      );
    });
  });

  describe('loadStats', () => {
    it('should reset stats if date has changed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const oldStats = { date: '2020-01-01', read_count: 100, write_count: 50 };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(oldStats));

      const stats = await tracker.getStats();
      expect(stats.read).toBe(0);
      expect(stats.write).toBe(0);
    });

    it('should create initial stats if file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      
      const stats = await tracker.getStats();
      expect(stats.read).toBe(0);
      expect(writeFile).toHaveBeenCalled();
    });
  });
});
