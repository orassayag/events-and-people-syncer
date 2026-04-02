import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { FolderManager } from '../folderManager';

vi.mock('fs/promises');

describe('FolderManager', () => {
  let manager: FolderManager;

  beforeEach(() => {
    manager = new FolderManager();
    vi.clearAllMocks();
  });

  describe('trimFolderName', () => {
    it('should trim leading whitespace', () => {
      expect(manager.trimFolderName('  Test')).toBe('Test');
    });

    it('should trim trailing whitespace', () => {
      expect(manager.trimFolderName('Test  ')).toBe('Test');
    });

    it('should trim both leading and trailing whitespace', () => {
      expect(manager.trimFolderName('  Test  ')).toBe('Test');
    });

    it('should handle tabs and newlines', () => {
      expect(manager.trimFolderName('\t\nTest\n\t')).toBe('Test');
    });
  });

  describe('validateFolderName', () => {
    it('should accept valid folder name', () => {
      expect(manager.validateFolderName('ValidFolder')).toBe(true);
    });

    it('should reject empty folder name', () => {
      const result = manager.validateFolderName('');
      expect(result).toBe('Folder name cannot be empty.');
    });

    it('should reject folder name with only whitespace', () => {
      const result = manager.validateFolderName('   ');
      expect(result).toBe('Folder name cannot be empty.');
    });

    it('should reject folder name less than 2 characters', () => {
      const result = manager.validateFolderName('A');
      expect(result).toBe('Folder name must be at least 2 characters.');
    });

    it('should reject illegal character forward slash', () => {
      const result = manager.validateFolderName('Test/Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character backslash', () => {
      const result = manager.validateFolderName('Test\\Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character colon', () => {
      const result = manager.validateFolderName('Test:Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character asterisk', () => {
      const result = manager.validateFolderName('Test*Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character question mark', () => {
      const result = manager.validateFolderName('Test?Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character double quote', () => {
      const result = manager.validateFolderName('Test"Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character less than', () => {
      const result = manager.validateFolderName('Test<Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character greater than', () => {
      const result = manager.validateFolderName('Test>Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject illegal character pipe', () => {
      const result = manager.validateFolderName('Test|Folder');
      expect(result).toBe('Folder name cannot contain: / \\ : * ? " < > |');
    });

    it('should reject emoji', () => {
      const result = manager.validateFolderName('Test😀Folder');
      expect(result).toBe(
        'Folder name cannot contain emojis or special Unicode characters.'
      );
    });

    it('should reject Windows reserved name CON', () => {
      const result = manager.validateFolderName('CON');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject Windows reserved name PRN', () => {
      const result = manager.validateFolderName('prn');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject Windows reserved name AUX', () => {
      const result = manager.validateFolderName('Aux');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject Windows reserved name NUL', () => {
      const result = manager.validateFolderName('NUL');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject Windows reserved name COM1', () => {
      const result = manager.validateFolderName('COM1');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject Windows reserved name LPT1', () => {
      const result = manager.validateFolderName('LPT1');
      expect(result).toContain('reserved by the operating system');
    });

    it('should reject very long path exceeding max length', () => {
      const longName = 'a'.repeat(300);
      const result = manager.validateFolderName(longName);
      expect(result).toBe(
        'Folder path exceeds maximum length for your operating system.'
      );
    });
  });

  describe('parseFolderName', () => {
    it('should parse Job folder name correctly', () => {
      const result = manager.parseFolderName('Job_Microsoft', true);

      expect(result).toEqual({
        label: 'Job',
        companyName: 'Microsoft',
      });
    });

    it('should parse HR folder name correctly', () => {
      const result = manager.parseFolderName('HR_Google', true);

      expect(result).toEqual({
        label: 'HR',
        companyName: 'Google',
      });
    });

    it('should throw error for invalid Job/HR format', () => {
      expect(() => manager.parseFolderName('job_Microsoft', true)).toThrow(
        'Invalid folder format'
      );
    });

    it('should throw error for Job/HR folder without underscore', () => {
      expect(() => manager.parseFolderName('JobMicrosoft', true)).toThrow(
        'Invalid folder format'
      );
    });

    it('should parse life event folder with last word as label', () => {
      const result = manager.parseFolderName('Alex Z OSR', false);

      expect(result).toEqual({
        label: 'OSR',
      });
    });

    it('should parse single word life event folder', () => {
      const result = manager.parseFolderName('Airbnb', false);

      expect(result).toEqual({
        label: 'Airbnb',
      });
    });

    it('should throw error for life event folder with label less than 2 chars', () => {
      expect(() => manager.parseFolderName('Alex Z A', false)).toThrow(
        'must be at least 2 characters'
      );
    });

    it('should trim whitespace before parsing', () => {
      const result = manager.parseFolderName('  Job_Microsoft  ', true);

      expect(result).toEqual({
        label: 'Job',
        companyName: 'Microsoft',
      });
    });
  });

  describe('createFolder', () => {
    it('should create folder successfully', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.mkdir as any) = vi.fn().mockResolvedValue(undefined);

      const result = await manager.createFolder('/base/path', 'TestFolder');

      expect(result).toBe('/base/path/TestFolder');
      expect(fs.mkdir).toHaveBeenCalledWith('/base/path/TestFolder');
    });

    it('should throw error when parent directory does not exist', async () => {
      (fs.access as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' });

      await expect(
        manager.createFolder('/base/path', 'TestFolder')
      ).rejects.toThrow('Parent directory no longer exists: /base/path');
    });

    it('should throw error for invalid folder name', async () => {
      await expect(manager.createFolder('/base/path', 'A')).rejects.toThrow(
        'Folder name must be at least 2 characters.'
      );
    });

    it('should trim folder name before creating', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.mkdir as any) = vi.fn().mockResolvedValue(undefined);

      await manager.createFolder('/base/path', '  TestFolder  ');

      expect(fs.mkdir).toHaveBeenCalledWith('/base/path/TestFolder');
    });
  });

  describe('isEmptyFolder', () => {
    it('should return false when folder contains visible files', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['file.txt'] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(false);
    });

    it('should return true when folder is empty', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue([] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(true);
    });

    it('should ignore hidden files starting with dot', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue(['.DS_Store', '.hidden'] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(true);
    });

    it('should ignore Windows junk file Thumbs.db', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['Thumbs.db'] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(true);
    });

    it('should ignore Windows junk file desktop.ini', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['desktop.ini'] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(true);
    });

    it('should return false when folder has visible files despite hidden files', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue(['.DS_Store', 'file.txt'] as any);

      const result = await manager.isEmptyFolder('/path/to/folder');

      expect(result).toBe(false);
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder successfully', async () => {
      (fs.rmdir as any) = vi.fn().mockResolvedValue(undefined);

      await manager.deleteFolder('/path/to/folder');

      expect(fs.rmdir).toHaveBeenCalledWith('/path/to/folder');
    });
  });

  describe('renameFolder', () => {
    it('should rename folder successfully', async () => {
      (fs.rename as any) = vi.fn().mockResolvedValue(undefined);

      await manager.renameFolder('/old/path', '/new/path');

      expect(fs.rename).toHaveBeenCalledWith('/old/path', '/new/path');
    });
  });

  describe('checkFolderExists', () => {
    it('should return true when folder exists with exact case', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['TestFolder'] as any);

      const result = await manager.checkFolderExists(
        'TestFolder',
        '/base/path'
      );

      expect(result).toBe(true);
    });

    it('should return true when folder exists with different case', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['TestFolder'] as any);

      const result = await manager.checkFolderExists(
        'testfolder',
        '/base/path'
      );

      expect(result).toBe(true);
    });

    it('should return false when folder does not exist', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['OtherFolder'] as any);

      const result = await manager.checkFolderExists(
        'TestFolder',
        '/base/path'
      );

      expect(result).toBe(false);
    });

    it('should trim folder name before checking', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue(['TestFolder'] as any);

      const result = await manager.checkFolderExists(
        '  TestFolder  ',
        '/base/path'
      );

      expect(result).toBe(true);
    });
  });
});
