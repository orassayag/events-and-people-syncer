import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsScript } from '../statistics';
import { StatisticsCollector } from '../../services/statistics';

// Mock dependencies
vi.mock('../../services/statistics', () => {
  return {
    StatisticsCollector: vi.fn().mockImplementation(function () {
      return {
        collectAll: vi.fn().mockResolvedValue({
          contacts: {
            googleContacts: 100,
            contactsToSync: 10,
            otherContactsToSync: 5,
          },
          averages: {
            avgNotesPerJob: 2.5,
            avgNotesPerHR: 1.2,
            avgNotesPerEvent: 3.0,
          },
          activity: {
            oldestNoteDate: new Date('2020-01-01'),
            newestNoteDate: new Date('2023-01-01'),
            totalStorageBytes: 1024 * 1024,
            mostActiveFolder: 'Work',
            mostActiveFolderCount: 50,
          },
          folders: {
            jobFolders: 5,
            hrFolders: 2,
            eventFolders: 10,
            totalFolders: 17,
            emptyFolders: 0,
          },
          notes: {
            jobNotes: 50,
            hrNotes: 20,
            eventNotes: 30,
            totalNotes: 100,
            notesToday: 1,
            notesThisWeek: 7,
          },
          timestamp: Date.now(),
        }),
      };
    }),
  };
});

vi.mock('../../logging', () => ({
  Logger: class {
    display = vi.fn();
    info = vi.fn();
    resetState = vi.fn();
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
  })),
}));

describe('StatisticsScript', () => {
  let script: StatisticsScript;
  let mockDuplicateDetector: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDuplicateDetector = {};
    script = new StatisticsScript(mockDuplicateDetector as any);
  });

  it('should run and display statistics', async () => {
    await script.run();

    const collectorInstance =
      vi.mocked(StatisticsCollector).mock.results[0].value;
    expect(collectorInstance.collectAll).toHaveBeenCalled();
  });

  it('should handle N/A values gracefully', async () => {
    vi.mocked(StatisticsCollector).mockImplementationOnce(function () {
      return {
        collectAll: vi.fn().mockResolvedValue({
          contacts: {
            googleContacts: -1,
            contactsToSync: -1,
            otherContactsToSync: -1,
          },
          averages: {
            avgNotesPerJob: null,
            avgNotesPerHR: null,
            avgNotesPerEvent: null,
          },
          activity: {
            oldestNoteDate: null,
            newestNoteDate: null,
            totalStorageBytes: 0,
            mostActiveFolder: null,
            mostActiveFolderCount: 0,
          },
          folders: {
            jobFolders: 0,
            hrFolders: 0,
            eventFolders: 0,
            totalFolders: 0,
            emptyFolders: 0,
          },
          notes: {
            jobNotes: 0,
            hrNotes: 0,
            eventNotes: 0,
            totalNotes: 0,
            notesToday: 0,
            notesThisWeek: 0,
          },
          timestamp: Date.now(),
        }),
      } as any;
    });

    await script.run();
    // Verification is successful if it doesn't throw and calls collector
    expect(StatisticsCollector).toHaveBeenCalled();
  });
});
