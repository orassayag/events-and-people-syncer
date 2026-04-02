import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { FolderCache } from '../folderCache';
import type { FolderCacheData } from '../../types/eventsJobsSync';
import { FolderType } from '../../types/eventsJobsSync';

vi.mock('fs/promises');

describe('FolderCache', () => {
  let cache: FolderCache;
  const mockCacheData: FolderCacheData = {
    timestamp: Date.now(),
    jobFolders: [
      {
        name: 'Job_Microsoft',
        path: '/path/to/Job_Microsoft',
        type: FolderType.JOB,
        label: 'Job',
        companyName: 'Microsoft',
      },
    ],
    lifeEventFolders: [
      {
        name: 'Alex Z OSR',
        path: '/path/to/Alex Z OSR',
        type: FolderType.LIFE_EVENT,
        label: 'OSR',
      },
    ],
  };

  beforeEach(() => {
    cache = FolderCache.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = FolderCache.getInstance();
      const instance2 = FolderCache.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('get', () => {
    it('should return cached data when valid and within TTL', async () => {
      const validData = {
        ...mockCacheData,
        timestamp: Date.now(),
      };

      (fs.readFile as any) = vi
        .fn()
        .mockResolvedValue(JSON.stringify(validData));

      const result = await cache.get();

      expect(result).toEqual(validData);
    });

    it('should return null when cache is expired', async () => {
      const expiredData = {
        ...mockCacheData,
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      };

      (fs.readFile as any) = vi
        .fn()
        .mockResolvedValue(JSON.stringify(expiredData));
      (fs.unlink as any) = vi.fn().mockResolvedValue(undefined);

      const result = await cache.get();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return null when cache file does not exist', async () => {
      (fs.readFile as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' });

      const result = await cache.get();

      expect(result).toBeNull();
    });

    it('should invalidate and return null when JSON is malformed', async () => {
      (fs.readFile as any) = vi.fn().mockResolvedValue('{ invalid json }');
      (fs.unlink as any) = vi.fn().mockResolvedValue(undefined);

      const result = await cache.get();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should invalidate and return null when schema validation fails', async () => {
      const invalidData = {
        timestamp: Date.now(),
        jobFolders: [
          {
            name: 123,
            path: '/path',
          },
        ],
        lifeEventFolders: [],
      };

      (fs.readFile as any) = vi
        .fn()
        .mockResolvedValue(JSON.stringify(invalidData));
      (fs.unlink as any) = vi.fn().mockResolvedValue(undefined);

      const result = await cache.get();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should write cache data to file', async () => {
      (fs.mkdir as any) = vi.fn().mockResolvedValue(undefined);
      (fs.writeFile as any) = vi.fn().mockResolvedValue(undefined);

      await cache.set(mockCacheData);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('folder-mappings.json'),
        JSON.stringify(mockCacheData, null, 2),
        'utf-8'
      );
    });

    it('should throw error when write fails', async () => {
      (fs.mkdir as any) = vi.fn().mockResolvedValue(undefined);
      (fs.writeFile as any) = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));

      await expect(cache.set(mockCacheData)).rejects.toThrow(
        'Failed to write cache file - check permissions for:'
      );
    });
  });

  describe('invalidate', () => {
    it('should delete cache file', async () => {
      (fs.unlink as any) = vi.fn().mockResolvedValue(undefined);

      await cache.invalidate();

      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should not throw error when cache file does not exist', async () => {
      (fs.unlink as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' });

      await expect(cache.invalidate()).resolves.toBeUndefined();
    });
  });
});
