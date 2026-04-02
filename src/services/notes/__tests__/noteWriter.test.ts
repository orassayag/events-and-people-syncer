import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { NoteWriter } from '../noteWriter';

vi.mock('fs/promises');
vi.mock(
  '../../../utils/dateFormatter',
  (): { formatDateDDMMYYYYCompact: (date: Date) => string } => ({
    formatDateDDMMYYYYCompact: (date: Date): string => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}${month}${year}`;
    },
  })
);

describe('NoteWriter', () => {
  let writer: NoteWriter;
  const testDate = new Date(2026, 2, 15);
  const dateStr = '15032026';

  beforeEach(() => {
    writer = new NoteWriter();
    vi.clearAllMocks();
  });

  describe('getNextFileName', () => {
    it('should return notes_DDMMYYYY-1.txt when no files exist', async () => {
      (fs.readdir as any) = vi.fn().mockResolvedValue([] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-1.txt`);
    });

    it('should find max counter and increment', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_${dateStr}-1.txt`,
          `notes_${dateStr}-2.txt`,
          `notes_${dateStr}-5.txt`,
        ] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-6.txt`);
    });

    it('should handle counter starting at 0', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([`notes_${dateStr}-0.txt`] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-1.txt`);
    });

    it('should handle counter with gaps', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_${dateStr}-0.txt`,
          `notes_${dateStr}-2.txt`,
          `notes_${dateStr}-5.txt`,
        ] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-6.txt`);
    });

    it('should ignore files without counter', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_${dateStr}.txt`,
          `notes_${dateStr}-1.txt`,
        ] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-2.txt`);
    });

    it('should handle mixed format files', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_${dateStr}.txt`,
          `notes_${dateStr}-1.txt`,
          `notes_${dateStr}-2.txt`,
        ] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-3.txt`);
    });

    it('should ignore files from different dates', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_14032026-1.txt`,
          `notes_${dateStr}-1.txt`,
          `notes_16032026-1.txt`,
        ] as any);

      const result = await writer.getNextFileName('/path/to/folder', testDate);

      expect(result).toBe(`notes_${dateStr}-2.txt`);
    });

    it('should warn when future date files exist', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          `notes_${dateStr}-1.txt`,
          `notes_16032026-1.txt`,
        ] as any);

      await writer.getNextFileName('/path/to/folder', testDate);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found note files with future dates')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('writeNote', () => {
    it('should write note successfully', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.readdir as any) = vi.fn().mockResolvedValue([] as any);
      (fs.writeFile as any) = vi.fn().mockResolvedValue(undefined);

      const content = 'Test note content';
      const result = await writer.writeNote(
        '/path/to/folder',
        content,
        testDate
      );

      expect(result).toBe(`/path/to/folder/notes_${dateStr}-1.txt`);
      expect(fs.writeFile).toHaveBeenCalledWith(
        `/path/to/folder/notes_${dateStr}-1.txt`,
        content,
        'utf-8'
      );
    });

    it('should throw error when content exceeds 1MB', async () => {
      const largeContent = 'a'.repeat(1048577);

      await expect(
        writer.writeNote('/path/to/folder', largeContent, testDate)
      ).rejects.toThrow('Message cannot exceed 1MB');
    });

    it('should allow content at exactly 1MB', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.readdir as any) = vi.fn().mockResolvedValue([] as any);
      (fs.writeFile as any) = vi.fn().mockResolvedValue(undefined);

      const content = 'a'.repeat(1048576);

      await expect(
        writer.writeNote('/path/to/folder', content, testDate)
      ).resolves.toBeDefined();
    });

    it('should reject content with null bytes', async () => {
      const binaryContent = 'Test\0content';

      await expect(
        writer.writeNote('/path/to/folder', binaryContent, testDate)
      ).rejects.toThrow('Note content cannot contain binary data');
    });

    it('should throw error when folder does not exist', async () => {
      (fs.access as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' });

      await expect(
        writer.writeNote('/path/to/folder', 'content', testDate)
      ).rejects.toThrow('Folder no longer exists: /path/to/folder');
    });

    it('should throw error when write fails due to permissions', async () => {
      (fs.access as any) = vi.fn().mockResolvedValue(undefined);
      (fs.readdir as any) = vi.fn().mockResolvedValue([] as any);
      (fs.writeFile as any) = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));

      await expect(
        writer.writeNote('/path/to/folder', 'content', testDate)
      ).rejects.toThrow('Failed to write note file - check permissions');
    });
  });

  describe('deleteNote', () => {
    it('should delete note successfully', async () => {
      (fs.unlink as any) = vi.fn().mockResolvedValue(undefined as any);

      await writer.deleteNote('/path/to/note.txt');

      expect(fs.unlink).toHaveBeenCalledWith('/path/to/note.txt');
    });

    it('should throw error when file does not exist', async () => {
      (fs.unlink as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' } as any);

      await expect(writer.deleteNote('/path/to/note.txt')).rejects.toThrow();
    });
  });

  describe('listNotes', () => {
    it('should return sorted list of note files', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          'notes_15032026-3.txt',
          'notes_15032026-1.txt',
          'notes_16032026-1.txt',
          'notes_15032026-2.txt',
          'other.txt',
        ] as any);

      const result = await writer.listNotes('/path/to/folder');

      expect(result).toEqual([
        'notes_15032026-1.txt',
        'notes_15032026-2.txt',
        'notes_15032026-3.txt',
        'notes_16032026-1.txt',
      ]);
    });

    it('should return empty array when no note files exist', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue(['other.txt', 'file.doc'] as any);

      const result = await writer.listNotes('/path/to/folder');

      expect(result).toEqual([]);
    });

    it('should filter out files without proper format', async () => {
      (fs.readdir as any) = vi
        .fn()
        .mockResolvedValue([
          'notes_15032026-1.txt',
          'notes_15032026.txt',
          'notes.txt',
          'notes_abc-1.txt',
        ] as any);

      const result = await writer.listNotes('/path/to/folder');

      expect(result).toEqual(['notes_15032026-1.txt']);
    });
  });

  describe('rewriteNote', () => {
    it('should rewrite note successfully', async () => {
      (fs.writeFile as any) = vi.fn().mockResolvedValue(undefined as any);

      const newContent = 'Updated content';
      await writer.rewriteNote('/path/to/note.txt', newContent);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/note.txt',
        newContent,
        'utf-8'
      );
    });

    it('should throw error when content exceeds 1MB', async () => {
      const largeContent = 'a'.repeat(1048577);

      await expect(
        writer.rewriteNote('/path/to/note.txt', largeContent)
      ).rejects.toThrow('Message cannot exceed 1MB');
    });

    it('should reject content with null bytes', async () => {
      const binaryContent = 'Test\0content';

      await expect(
        writer.rewriteNote('/path/to/note.txt', binaryContent)
      ).rejects.toThrow('Note content cannot contain binary data');
    });
  });
});
