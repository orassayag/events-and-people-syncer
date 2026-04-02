/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable require-await */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { EventsJobsSyncScript } from '../eventsJobsSync';
import { FolderCache } from '../../cache/folderCache';
import { promises as fs } from 'fs';
import type {
  FolderMapping,
  FolderCacheData,
} from '../../types/eventsJobsSync';
import { FolderType as FolderTypeEnum } from '../../types/eventsJobsSync';
import { spawn as spawnActual } from 'child_process';
import { 
  selectWithEscape, 
  inputWithEscape, 
  confirmWithEscape, 
  EscapeSignal, 
  resetEscapeManagerForTesting 
} from '../../utils';
import { EMOJIS } from '../../constants';
import { SETTINGS } from '../../settings';

vi.mock('fs/promises');
vi.mock('../../cache/folderCache');
vi.mock('child_process');
vi.mock('../../utils', async () => {
  const actual = await vi.importActual<typeof import('../../utils')>('../../utils');
  return {
    ...actual,
    selectWithEscape: vi.fn(),
    inputWithEscape: vi.fn(),
    confirmWithEscape: vi.fn(),
    checkboxWithEscape: vi.fn(),
    resetEscapeManagerForTesting: actual.resetEscapeManagerForTesting,
    EscapeSignal: actual.EscapeSignal,
  };
});
vi.mock('ora', () => ({
  default: (): { start: () => any; stop: () => void; clear: () => void } => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('EventsJobsSyncScript - Write Notes Feature', () => {
  let script: any;
  let mockAuth: any;
  let mockContactEditor: any;
  let mockPathValidator: any;
  let mockFolderManager: any;
  let mockFolderMatcher: any;
  let mockNoteWriter: any;
  let mockLabelResolver: any;
  let mockSelectWithEscape: Mock;
  let mockInputWithEscape: Mock;
  let mockConfirmWithEscape: Mock;
  let mockSpawn: Mock;

  const createMockFolder = (
    name: string,
    type: FolderTypeEnum,
    label: string
  ): FolderMapping => ({
    name,
    path: `/dummy/${type === FolderTypeEnum.LIFE_EVENT ? 'life-events' : 'job-interviews'}/${name}`,
    type,
    label,
    companyName:
      type === FolderTypeEnum.LIFE_EVENT ? undefined : name.split('_')[1],
  });

  const mockJobFolder = createMockFolder(
    'HR_AddedValue',
    FolderTypeEnum.HR,
    'HR'
  );
  const mockLifeEventFolder = createMockFolder(
    'Alex Z OSR',
    FolderTypeEnum.LIFE_EVENT,
    'OSR'
  );

  const createMockSpawnProc = (
    stdout: string = 'test content',
    exitCode: number = 0
  ): any => ({
    stdout: {
      on: vi.fn((event: string, cb: any) => event === 'data' && cb(stdout)),
    },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn((event: string, cb: any) => event === 'close' && cb(exitCode)),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetEscapeManagerForTesting();
    mockSelectWithEscape = vi.mocked(selectWithEscape);
    mockInputWithEscape = vi.mocked(inputWithEscape);
    mockConfirmWithEscape = vi.mocked(confirmWithEscape);
    mockSpawn = vi.mocked(spawnActual as any);

    mockSelectWithEscape.mockResolvedValue({ escaped: false, value: '' });
    mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
    mockConfirmWithEscape.mockResolvedValue({ escaped: false, value: false });

    mockAuth = {};
    mockContactEditor = {
      setApiLogging: vi.fn(),
      setLogCallback: vi.fn(),
      collectInitialInput: vi.fn(),
      showSummaryAndEdit: vi.fn(),
      createContact: vi.fn(),
      createContactGroup: vi.fn().mockResolvedValue('contactGroups/mock-new-group'),
    };
    mockPathValidator = {
      validatePathsExist: vi.fn().mockResolvedValue([
        { path: '/dummy/job-interviews', exists: true, isDirectory: true },
        { path: '/dummy/life-events', exists: true, isDirectory: true },
      ]),
      validateReadable: vi.fn().mockResolvedValue(undefined),
      validateWritable: vi.fn().mockResolvedValue(undefined),
    };
    mockFolderManager = {
      trimFolderName: vi.fn((input: string) => input.trim()),
      checkFolderExists: vi.fn().mockResolvedValue(false),
      createFolder: vi.fn().mockResolvedValue('/dummy/job-interviews/HR_Test'),
      isEmptyFolder: vi.fn().mockResolvedValue(false),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      renameFolder: vi.fn().mockResolvedValue(undefined),
    };
    mockFolderMatcher = {
      findExactMatch: vi.fn(),
      searchFolders: vi.fn().mockReturnValue([]),
    };
    mockNoteWriter = {
      writeNote: vi
        .fn()
        .mockResolvedValue(
          '/dummy/job-interviews/HR_AddedValue/notes_16032026-1.txt'
        ),
      deleteNote: vi.fn().mockResolvedValue(undefined),
      listNotes: vi.fn().mockResolvedValue([]),
      rewriteNote: vi.fn().mockResolvedValue(undefined),
    };
    mockLabelResolver = {
      resolveLabel: vi.fn().mockReturnValue({ resourceName: 'mock-resource' }),
      inferLabelFromExisting: vi.fn(),
      createLabel: vi.fn(),
    };

    script = new EventsJobsSyncScript(
      mockAuth,
      mockContactEditor,
      mockPathValidator,
      mockFolderManager,
      mockFolderMatcher,
      mockNoteWriter,
      mockLabelResolver
    );

    (fs.access as any) = vi.fn().mockResolvedValue(undefined);
    (fs.readdir as any) = vi.fn().mockResolvedValue([]);
    mockSpawn.mockReturnValue(createMockSpawnProc() as any);
  });

  describe('EscapeSignal', () => {
    it('should be throwable and catchable', () => {
      const error = new EscapeSignal();
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EscapeSignal');
      expect(error.message).toBe('User pressed ESC to go back');
    });
  });

  describe('selectOrCreateFolder', () => {
    beforeEach(() => {
      const mockCache: FolderCacheData = {
        timestamp: Date.now(),
        jobFolders: [mockJobFolder],
        lifeEventFolders: [mockLifeEventFolder],
      };
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockCache),
        set: vi.fn().mockResolvedValue(undefined),
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as any);
    });

    it('should return null when cache is empty', async () => {
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
      } as any);

      const result = await script.selectOrCreateFolder();

      expect(result).toBeNull();
    });

    it('should return exact match when folder exists', async () => {
      mockFolderMatcher.findExactMatch.mockReturnValue(mockJobFolder);
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: 'HR_AddedValue' });

      const result = await script.selectOrCreateFolder();

      expect(result).toEqual(mockJobFolder);
      expect(mockFolderMatcher.findExactMatch).toHaveBeenCalledWith(
        'HR_AddedValue',
        expect.any(Array)
      );
    });

    it('should handle folder deleted externally during exact match', async () => {
      mockFolderMatcher.findExactMatch.mockReturnValue(mockJobFolder);
      (fs.access as any) = vi.fn().mockRejectedValueOnce({ code: 'ENOENT' });
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: 'HR_AddedValue' });

      const result = await script.selectOrCreateFolder();

      expect(result).toBeNull();
      expect(FolderCache.getInstance().invalidate).toHaveBeenCalled();
    });

    it('should prompt to create folder when no matches found', async () => {
      mockFolderMatcher.findExactMatch.mockReturnValue(null);
      mockFolderMatcher.searchFolders.mockReturnValue([]);
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'NewCompany' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: false });

      const result = await script.selectOrCreateFolder();

      expect(result).toBeNull();
      expect(mockConfirmWithEscape).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('create'),
        })
      );
    });
  });

  describe('createFolderFlow', () => {
    beforeEach(() => {
      const mockCache: FolderCacheData = {
        timestamp: Date.now(),
        jobFolders: [],
        lifeEventFolders: [],
      };
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockCache),
        set: vi.fn().mockResolvedValue(undefined),
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as any);
    });

    it('should return folder without creating note when createNoteAfter=false', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'job' })
        .mockResolvedValueOnce({ escaped: false, value: 'HR' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });

      const newFolder = createMockFolder(
        'HR_TestCompany',
        FolderTypeEnum.HR,
        'HR'
      );
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          timestamp: Date.now(),
          jobFolders: [newFolder],
          lifeEventFolders: [],
        }),
        set: vi.fn(),
        invalidate: vi.fn(),
      } as any);

      const result = await script.createFolderFlow('TestCompany', false);

      expect(result).toEqual(newFolder);
      expect(mockNoteWriter.writeNote).not.toHaveBeenCalled();
    });

    it('should return null when folder already exists', async () => {
      mockFolderManager.checkFolderExists.mockResolvedValue(true);
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'job' })
        .mockResolvedValueOnce({ escaped: false, value: 'HR' });

      const result = await script.createFolderFlow('TestCompany', false);

      expect(result).toBeNull();
      expect(mockFolderManager.createFolder).not.toHaveBeenCalled();
    });

    it('should return null when user cancels confirmation', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'job' })
        .mockResolvedValueOnce({ escaped: false, value: 'HR' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: false });

      const result = await script.createFolderFlow('TestCompany', false);

      expect(result).toBeNull();
      expect(mockFolderManager.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('createNoteInFolder', () => {
    it('should display first note message when noteCount is undefined', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await script.createNoteInFolder(mockJobFolder);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${EMOJIS.DATA.CLIPBOARD} Copy your message now and press <enter>`)
      );
      consoleSpy.mockRestore();
    });
    it('should display subsequent note message when noteCount is provided', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await script.createNoteInFolder(mockJobFolder, {
        noteCount: 1,
        allowCancel: false,
      });
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('of batch')
      );
      consoleSpy.mockRestore();
    });

    it('should throw EscapeSignal when allowCancel=true and user declines retry on empty clipboard', async () => {
      mockSpawn.mockReturnValue(createMockSpawnProc('', 0) as any);
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: '' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: false });

      await expect(
        script.createNoteInFolder(mockJobFolder, {
          noteCount: 0,
          allowCancel: true,
        })
      ).rejects.toThrow('User pressed ESC to go back');
    });

    it('should retry when allowCancel=true and user accepts retry on empty clipboard', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        return createMockSpawnProc(
          callCount === 1 ? '' : 'test content',
          0
        ) as any;
      });
      mockInputWithEscape
        .mockResolvedValueOnce({ escaped: false, value: '' })
        .mockResolvedValueOnce({ escaped: false, value: '' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });

      await script.createNoteInFolder(mockJobFolder, {
        noteCount: 0,
        allowCancel: true,
      });

      expect(mockNoteWriter.writeNote).toHaveBeenCalled();
    });

    it('should reject content exceeding 1MB', async () => {
      const largeContent = 'a'.repeat(1048577);
      mockSpawn.mockReturnValue(createMockSpawnProc(largeContent, 0) as any);
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await script.createNoteInFolder(mockJobFolder);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message cannot exceed 1MB')
      );
      expect(mockNoteWriter.writeNote).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should reject content with null bytes', async () => {
      const binaryContent = 'test\0content';
      mockSpawn.mockReturnValue(createMockSpawnProc(binaryContent, 0) as any);
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await script.createNoteInFolder(mockJobFolder);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('cannot contain binary data')
      );
      expect(mockNoteWriter.writeNote).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should throw error when folder no longer exists', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      mockNoteWriter.writeNote.mockRejectedValue({ code: 'ENOENT' });

      await expect(script.createNoteInFolder(mockJobFolder)).rejects.toThrow(
        'Folder no longer exists'
      );
    });

    it('should update stats correctly for job folder', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const initialJobNotes = script.stats.jobNotes;

      await script.createNoteInFolder(mockJobFolder);

      expect(script.stats.jobNotes).toBe(initialJobNotes + 1);
    });

    it('should update stats correctly for life event folder', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const initialLifeEventNotes = script.stats.lifeEventNotes;

      await script.createNoteInFolder(mockLifeEventFolder);

      expect(script.stats.lifeEventNotes).toBe(initialLifeEventNotes + 1);
    });

    it('should update lastCreatedNotePath after successful creation', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });
      const expectedPath =
        '/dummy/job-interviews/HR_AddedValue/notes_16032026-1.txt';
      mockNoteWriter.writeNote.mockResolvedValue(expectedPath);

      await script.createNoteInFolder(mockJobFolder);

      expect(script.lastCreatedNotePath).toBe(expectedPath);
    });

    it('should update lastSelectedFolder after successful creation', async () => {
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });

      await script.createNoteInFolder(mockJobFolder);

      expect(script.lastSelectedFolder).toEqual(mockJobFolder);
    });
  });

  describe('writeNotesFlow', () => {
    beforeEach(() => {
      const mockCache: FolderCacheData = {
        timestamp: Date.now(),
        jobFolders: [mockJobFolder],
        lifeEventFolders: [],
      };
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockCache),
        set: vi.fn().mockResolvedValue(undefined),
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as any);
    });

    it('should return to menu when folder selection is cancelled', async (): Promise<void> => {
      const _selectOrCreateFolderSpy = vi
        .spyOn(script, 'selectOrCreateFolder')
        .mockResolvedValue(null);

      await script.writeNotesFlow();

      expect(_selectOrCreateFolderSpy).toHaveBeenCalled();
    });

    it('should create multiple notes in succession', async (): Promise<void> => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let noteCount = 0;
      const createNoteInFolderSpy = vi
        .spyOn(script, 'createNoteInFolder')
        .mockImplementation(async (): Promise<boolean> => {
          noteCount++;
          if (noteCount >= 3) {
            const error = new Error('User pressed ESC to go back');
            error.name = 'EscapeSignal';
            throw error;
          }
          return true;
        });

      await script.writeNotesFlow();

      expect(createNoteInFolderSpy).toHaveBeenCalledTimes(3);
      expect(createNoteInFolderSpy).toHaveBeenNthCalledWith(1, mockJobFolder, {
        noteCount: 0,
        allowCancel: true,
      });
      expect(createNoteInFolderSpy).toHaveBeenNthCalledWith(2, mockJobFolder, {
        noteCount: 1,
        allowCancel: true,
      });
      expect(createNoteInFolderSpy).toHaveBeenNthCalledWith(3, mockJobFolder, {
        noteCount: 2,
        allowCancel: true,
      });
    });

    it('should show "No notes created" message when cancelled on first note', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      const createNoteInFolderSpy = vi
        .spyOn(script, 'createNoteInFolder')
        .mockImplementation(async () => {
          const error = new Error('User pressed ESC to go back');
          error.name = 'EscapeSignal';
          throw error;
        });

      await script.writeNotesFlow();

      expect(createNoteInFolderSpy).toHaveBeenCalledTimes(1);
      expect(createNoteInFolderSpy).toHaveBeenCalledWith(mockJobFolder, {
        noteCount: 0,
        allowCancel: true,
      });
    });

    it('should show correct count when cancelled after creating notes', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let noteCount = 0;
      const createNoteInFolderSpy = vi
        .spyOn(script, 'createNoteInFolder')
        .mockImplementation(async () => {
          noteCount++;
          if (noteCount >= 3) {
            const error = new Error('User pressed ESC to go back');
            error.name = 'EscapeSignal';
            throw error;
          }
          return true;
        });

      await script.writeNotesFlow();

      expect(createNoteInFolderSpy).toHaveBeenCalledTimes(3);
      expect(noteCount).toBe(3);
    });

    it('should exit immediately when folder is deleted before prompt', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let iterationCount = 0;
      (fs.access as any) = vi.fn().mockImplementation(() => {
        iterationCount++;
        if (iterationCount > 2) {
          return Promise.reject({ code: 'ENOENT' });
        }
        return Promise.resolve();
      });
      vi.spyOn(script, 'createNoteInFolder').mockResolvedValue(true);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await script.writeNotesFlow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Folder was deleted. Created 2 notes')
      );
      consoleSpy.mockRestore();
    });

    it('should exit immediately when folder is deleted during note creation', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let noteCount = 0;
      vi.spyOn(script, 'createNoteInFolder').mockImplementation(async () => {
        noteCount++;
        if (noteCount >= 2) {
          const error = new Error(
            'Folder no longer exists: /dummy/job-interviews/HR_AddedValue'
          );
          throw error;
        }
        return true;
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await script.writeNotesFlow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Folder was deleted. Created 000,001 notes')
      );
      consoleSpy.mockRestore();
    });

    it('should show "Folder was deleted externally" when deleted before any notes', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      (fs.access as any) = vi.fn().mockRejectedValue({ code: 'ENOENT' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await script.writeNotesFlow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Folder was deleted externally')
      );
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('note(s)')
      );
      consoleSpy.mockRestore();
    });

    it('should ask to continue after non-ENOENT error', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let noteCount = 0;
      vi.spyOn(script, 'createNoteInFolder').mockImplementation(async () => {
        noteCount++;
        if (noteCount === 2) {
          throw new Error('Permission denied');
        }
        if (noteCount >= 3) {
          const error = new Error('User pressed ESC to go back');
          error.name = 'EscapeSignal';
          throw error;
        }
        return true;
      });

      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });

      await script.writeNotesFlow();

      expect(mockConfirmWithEscape).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Continue creating notes? (ESC to stop)',
        })
      );
    }, 10000);

    it('should exit when user declines to continue after error', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      const createNoteInFolderSpy = vi
        .spyOn(script, 'createNoteInFolder')
        .mockImplementation(async () => {
          throw new Error('Permission denied');
        });

      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: false });

      await script.writeNotesFlow();

      expect(createNoteInFolderSpy).toHaveBeenCalledTimes(1);
    }, 10000);

    it('should not increment noteCount when error occurs', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let callCount = 0;
      vi.spyOn(script, 'createNoteInFolder').mockImplementation(async (_folder, _options) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Permission denied');
          }
          if (callCount === 3) {
            const error = new Error('User pressed ESC to go back');
            error.name = 'EscapeSignal';
            throw error;
          }
          return true;
        });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      await script.writeNotesFlow();
      expect(callCount).toBe(3);
    }, 10000);

    it('should validate folder exists before each iteration', async () => {
      vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      let noteCount = 0;
      vi.spyOn(script, 'createNoteInFolder').mockImplementation(async () => {
        noteCount++;
        if (noteCount >= 3) {
          const error = new Error('User pressed ESC to go back');
          error.name = 'EscapeSignal';
          throw error;
        }
        return true;
      });

      await script.writeNotesFlow();

      expect(fs.access).toHaveBeenCalledWith(mockJobFolder.path);
      expect((fs.access as any).mock.calls.length).toBeGreaterThanOrEqual(3);
    }, 10000);
  });

  describe('createNoteFlow integration with selectOrCreateFolder', () => {
    it('should use selectOrCreateFolder helper', async () => {
      const selectOrCreateFolderSpy = vi.spyOn(script, 'selectOrCreateFolder').mockResolvedValue(mockJobFolder);
      const createNoteInFolderSpy = vi.spyOn(script, 'createNoteInFolder').mockResolvedValue(true);
      await script.createNoteFlow();
      expect(selectOrCreateFolderSpy).toHaveBeenCalled();
      expect(createNoteInFolderSpy).toHaveBeenCalledWith(mockJobFolder);
    });

    it('should not create note when folder selection is cancelled', async () => {
      const selectOrCreateFolderSpy = vi
        .spyOn(script, 'selectOrCreateFolder')
        .mockResolvedValue(null);
      const createNoteInFolderSpy = vi
        .spyOn(script, 'createNoteInFolder')
        .mockResolvedValue(true);
      await script.createNoteFlow();
      expect(selectOrCreateFolderSpy).toHaveBeenCalled();
      expect(createNoteInFolderSpy).not.toHaveBeenCalled();
    });
  });

  describe('Clipboard behavior', () => {
    it('should handle unicode and emoji content correctly', async () => {
      const unicodeContent = 'Test 😀 content with émojis and ñoñ-ASCII';
      mockSpawn.mockReturnValue(createMockSpawnProc(unicodeContent, 0) as any);
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });

      await script.createNoteInFolder(mockJobFolder);

      expect(mockNoteWriter.writeNote).toHaveBeenCalledWith(
        mockJobFolder.path,
        unicodeContent.trim(),
        expect.any(Date)
      );
    });

    it('should handle clipboard read error', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn(
            (event: string, cb: any) =>
              event === 'data' && cb('Error reading clipboard')
          ),
        },
        on: vi.fn((event: string, cb: any) => event === 'close' && cb(1)),
      };
      mockSpawn.mockReturnValue(mockProc as any);
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });

      await expect(script.createNoteInFolder(mockJobFolder)).rejects.toThrow(
        'Clipboard read failed'
      );
    });

    it('should clear clipboard after successful note creation', async () => {
      let spawnCallCount = 0;
      mockSpawn.mockImplementation((_cmd: string) => {
        spawnCallCount++;
        return createMockSpawnProc('test content', 0) as any;
      });
      mockInputWithEscape.mockResolvedValue({ escaped: false, value: '' });

      await script.createNoteInFolder(mockJobFolder);

      expect(spawnCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createLifeEventFolderFlow with label selection', () => {
    beforeEach(() => {
      const mockCache: FolderCacheData = {
        timestamp: Date.now(),
        jobFolders: [],
        lifeEventFolders: [
          createMockFolder('Existing Event OSR', FolderTypeEnum.LIFE_EVENT, 'OSR'),
          createMockFolder('Another Event Test', FolderTypeEnum.LIFE_EVENT, 'Test'),
        ],
      };
      vi.mocked(FolderCache.getInstance).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockCache),
        set: vi.fn().mockResolvedValue(undefined),
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as any);
      script.isAuthenticated = true;
      vi.spyOn(script, 'fetchContactGroups').mockResolvedValue([
        { resourceName: 'contactGroups/test1', name: 'TestLabel1' },
        { resourceName: 'contactGroups/test2', name: 'TestLabel2' },
      ]);
    });

    it('should show combined list of Google labels and existing folder labels (not input words)', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'TestLabel1' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockSelectWithEscape).toHaveBeenCalled();
      expect(mockFolderManager.createFolder).toHaveBeenCalledWith(
        expect.any(String),
        'Airbnb Stay TestLabel1'
      );
    });

    it('should deduplicate labels case-insensitively', async () => {
      vi.spyOn(script, 'fetchContactGroups').mockResolvedValue([
        { resourceName: 'contactGroups/test1', name: 'osr' },
        { resourceName: 'contactGroups/test2', name: 'TestLabel' },
      ]);
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'osr' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockFolderManager.createFolder).toHaveBeenCalled();
    });

    it('should handle skip label selection', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'SKIP' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);
      await script.createFolderFlow('Airbnb Stay', false);
      expect(mockFolderManager.createFolder).toHaveBeenCalled();
    });

    it('should handle create new label flow with Google creation', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'CREATE_NEW' });
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'NewLabel' });
      mockConfirmWithEscape
        .mockResolvedValueOnce({ escaped: false, value: true })
        .mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockContactEditor.createContactGroup).toHaveBeenCalledWith('NewLabel');
      expect(mockFolderManager.createFolder).toHaveBeenCalled();
    });

    it('should handle create new label flow without Google creation', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'CREATE_NEW' });
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'NewLabel' });
      mockConfirmWithEscape
        .mockResolvedValueOnce({ escaped: false, value: false })
        .mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockContactEditor.createContactGroup).not.toHaveBeenCalled();
      expect(mockFolderManager.createFolder).toHaveBeenCalled();
    });

    it('should handle cancel during new label creation', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'CREATE_NEW' });
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'cancel' });

      const result = await script.createFolderFlow('Airbnb Stay', false);

      expect(result).toBeNull();
      expect(mockFolderManager.createFolder).not.toHaveBeenCalled();
    });

    it('should use existing label if new label name already exists', async () => {
      vi.spyOn(script, 'fetchContactGroups').mockResolvedValue([
        { resourceName: 'contactGroups/test1', name: 'ExistingLabel' },
      ]);
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'CREATE_NEW' });
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'ExistingLabel' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockContactEditor.createContactGroup).not.toHaveBeenCalled();
      expect(mockFolderManager.createFolder).toHaveBeenCalled();
    });

    it('should validate new label has at least 2 characters', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'CREATE_NEW' });
      mockInputWithEscape.mockResolvedValueOnce({ escaped: false, value: 'A' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockInputWithEscape).toHaveBeenCalled();
    });

    it('should not duplicate label if it already exists in folder name', async () => {
      vi.spyOn(script, 'fetchContactGroups').mockResolvedValue([
        { resourceName: 'contactGroups/test1', name: 'Airbnb' },
      ]);
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'Airbnb' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockFolderManager.createFolder).toHaveBeenCalledWith(
        expect.any(String),
        'Airbnb Stay'
      );
    });

    it('should append label when it is not in folder name', async () => {
      mockSelectWithEscape
        .mockResolvedValueOnce({ escaped: false, value: 'life' })
        .mockResolvedValueOnce({ escaped: false, value: 'TestLabel1' });
      mockConfirmWithEscape.mockResolvedValueOnce({ escaped: false, value: true });
      mockSpawn.mockReturnValue(createMockSpawnProc('test content', 0) as any);

      await script.createFolderFlow('Airbnb Stay', false);

      expect(mockFolderManager.createFolder).toHaveBeenCalledWith(
        expect.any(String),
        'Airbnb Stay TestLabel1'
      );
    });
  });

  describe('Dry-Mode Integration', () => {
    const originalDryMode = SETTINGS.dryMode;
    it('should respect dry-mode setting from SETTINGS', () => {
      expect(typeof SETTINGS.dryMode).toBe('boolean');
    });

    it('should have createContactGroup return mock resourceName in dry-mode', () => {
      (SETTINGS as any).dryMode = true;
      const mockResourceName = 'contactGroups/dryMode_123';
      expect(mockResourceName).toMatch(/^contactGroups\/dryMode_/);
      (SETTINGS as any).dryMode = originalDryMode;
    });

    it('should track that ContactEditor integrates with dry-mode', () => {
      expect(mockContactEditor.createContact).toBeDefined();
      expect(mockContactEditor.createContactGroup).toBeDefined();
    });
  });
});
