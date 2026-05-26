import { describe, it, expect, vi, beforeEach } from 'vitest';
import { access, stat, constants } from 'fs/promises';
import { resolve } from 'path';
import {
  isWindowsPath,
  validatePathPermissions,
  validateAndResolveFilePath,
  normalizePath,
} from '../pathValidator';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  stat: vi.fn(),
  constants: {
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    F_OK: 0,
  },
}));

describe('pathValidator utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isWindowsPath', () => {
    it('should return true for drive letter paths', () => {
      expect(isWindowsPath('C:\\path')).toBe(true);
      expect(isWindowsPath('d:/path')).toBe(true);
    });

    it('should return true for UNC paths', () => {
      expect(isWindowsPath('\\\\server\\share')).toBe(true);
      expect(isWindowsPath('//server/share')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isWindowsPath('relative/path')).toBe(false);
      expect(isWindowsPath('./relative')).toBe(false);
    });

    it('should return false for unix absolute paths', () => {
      expect(isWindowsPath('/usr/bin')).toBe(false);
    });
  });

  describe('validatePathPermissions', () => {
    it('should resolve if access is granted', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      await expect(
        validatePathPermissions('/valid/path')
      ).resolves.toBeUndefined();
      expect(access).toHaveBeenCalledWith('/valid/path', constants.R_OK);
    });

    it('should throw permission error for EACCES', async () => {
      const error = new Error('access denied') as any;
      error.code = 'EACCES';
      vi.mocked(access).mockRejectedValue(error);

      await expect(validatePathPermissions('/forbidden/path')).rejects.toThrow(
        'Permission denied accessing path: /forbidden/path'
      );
    });

    it('should throw permission error for EPERM', async () => {
      const error = new Error('perm denied') as any;
      error.code = 'EPERM';
      vi.mocked(access).mockRejectedValue(error);

      await expect(validatePathPermissions('/forbidden/path')).rejects.toThrow(
        'Permission denied accessing path: /forbidden/path'
      );
    });

    it('should rethrow other errors', async () => {
      const error = new Error('Other error') as any;
      error.code = 'OTHER';
      vi.mocked(access).mockRejectedValue(error);

      await expect(validatePathPermissions('/other/path')).rejects.toThrow(
        'Other error'
      );
    });
  });

  describe('validateAndResolveFilePath', () => {
    it('should throw if path is empty', async () => {
      await expect(validateAndResolveFilePath('')).rejects.toThrow(
        'File path cannot be empty'
      );
      await expect(validateAndResolveFilePath('   ')).rejects.toThrow(
        'File path cannot be empty'
      );
    });

    it('should resolve and validate a valid file', async () => {
      const target = 'test.txt';
      const resolved = resolve(target);

      vi.mocked(stat).mockResolvedValue({ isFile: () => true } as any);
      vi.mocked(access).mockResolvedValue(undefined);

      const result = await validateAndResolveFilePath(target);
      expect(result).toBe(resolved);
      expect(stat).toHaveBeenCalledWith(resolved);
      expect(access).toHaveBeenCalledWith(resolved, constants.R_OK);
    });

    it('should throw if path is a directory', async () => {
      const target = 'folder';
      const resolved = resolve(target);

      vi.mocked(stat).mockResolvedValue({ isFile: () => false } as any);

      await expect(validateAndResolveFilePath(target)).rejects.toThrow(
        `Target must be a file, not a folder: ${resolved}`
      );
    });

    it('should throw if file does not exist', async () => {
      const target = 'missing.txt';
      const resolved = resolve(target);
      const error = new Error('not found') as any;
      error.code = 'ENOENT';

      vi.mocked(stat).mockRejectedValue(error);

      await expect(validateAndResolveFilePath(target)).rejects.toThrow(
        `File not found: ${resolved}`
      );
    });

    it('should rethrow other stat errors', async () => {
      const error = new Error('stat error') as any;
      error.code = 'UNKNOWN';
      vi.mocked(stat).mockRejectedValue(error);

      await expect(validateAndResolveFilePath('test.txt')).rejects.toThrow(
        'stat error'
      );
    });
  });

  describe('normalizePath', () => {
    it('should normalize and resolve path', () => {
      const input = './some/../path';
      const expected = resolve(input);
      expect(normalizePath(input)).toBe(expected);
    });
  });
});
