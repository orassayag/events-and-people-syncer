import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompanyCache } from '../companyCache';

vi.mock('../../settings', () => ({
  SETTINGS: {
    linkedin: {
      cachePath: '/tmp/test-cache',
      cacheExpirationDays: 1,
    },
  },
}));

describe('CompanyCache', () => {
  let cache: CompanyCache;
  beforeEach(() => {
    cache = new CompanyCache();
  });

  describe('get', () => {
    it('should return null if cache file does not exist', async () => {
      const result = await cache.get();
      expect(result).toBeNull();
    });
    it('should return null if cache is expired', async () => {
      const expiredData = {
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        mappings: [{ label: 'Job', companyName: 'TestCompany' }],
      };
      await cache.set(expiredData);
      const result = await cache.get();
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should create cache directory if it does not exist', async () => {
      const data = {
        timestamp: Date.now(),
        mappings: [{ label: 'HR', companyName: 'Microsoft' }],
      };
      await expect(cache.set(data)).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should not throw if cache file does not exist', async () => {
      await expect(cache.invalidate()).resolves.not.toThrow();
    });
  });
});
