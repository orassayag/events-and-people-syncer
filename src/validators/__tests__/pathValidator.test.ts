import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { PathValidator } from '..';

vi.mock('fs/promises');

describe('PathValidator', () => {
  let validator: PathValidator;

  beforeEach(() => {
    validator = new PathValidator();
    vi.clearAllMocks();
  });

  describe('validatePathsExist', () => {
    it('should return exists true and isDirectory true for valid directory', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.stat as any) = vi.fn().mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const results = await validator.validatePathsExist(['/valid/path']);

      expect(results).toEqual([
        {
          path: '/valid/path',
          exists: true,
          isDirectory: true,
        },
      ]);
    });

    it('should return exists false when path does not exist', async () => {
      (fs.access as any) = vi.fn().mockRejectedValue(new Error('ENOENT'));

      const results = await validator.validatePathsExist(['/invalid/path']);

      expect(results).toEqual([
        {
          path: '/invalid/path',
          exists: false,
          isDirectory: false,
        },
      ]);
    });

    it('should return isDirectory false when path is a file', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.stat as any) = vi.fn().mockResolvedValue({
        isDirectory: () => false,
      } as any);

      const results = await validator.validatePathsExist(['/path/to/file.txt']);

      expect(results).toEqual([
        {
          path: '/path/to/file.txt',
          exists: true,
          isDirectory: false,
        },
      ]);
    });

    it('should handle multiple paths', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.stat as any) = vi
        .fn()
        .mockResolvedValueOnce({ isDirectory: () => true } as any)
        .mockResolvedValueOnce({ isDirectory: () => false } as any);

      const results = await validator.validatePathsExist(['/path1', '/path2']);

      expect(results).toHaveLength(2);
      expect(results[0].isDirectory).toBe(true);
      expect(results[1].isDirectory).toBe(false);
    });
  });

  describe('validateWritable', () => {
    it('should return true when path is writable', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);

      const result = await validator.validateWritable('/writable/path');

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(
        '/writable/path',
        fs.constants.W_OK
      );
    });

    it('should throw error when path is not writable', async () => {
      (fs.access as any) = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));

      await expect(
        validator.validateWritable('/readonly/path')
      ).rejects.toThrow('Insufficient permissions for path: /readonly/path');
    });
  });

  describe('validateReadable', () => {
    it('should return true when path is readable', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);

      const result = await validator.validateReadable('/readable/path');

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(
        '/readable/path',
        fs.constants.R_OK
      );
    });

    it('should throw error when path is not readable', async () => {
      (fs.access as any) = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));

      await expect(
        validator.validateReadable('/forbidden/path')
      ).rejects.toThrow('Insufficient permissions for path: /forbidden/path');
    });
  });
});
