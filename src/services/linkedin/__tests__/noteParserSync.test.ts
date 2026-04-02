import { describe, it, expect } from 'vitest';
import {
  determineSyncNoteUpdate,
  extractDateFromNote,
  updateNoteDateOnly,
} from '../noteParser';

describe('determineSyncNoteUpdate', () => {
  it('should create Updated message for empty note', () => {
    const result = determineSyncNoteUpdate('', '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should always update if Updated message (even with same date)', () => {
    const existingNote =
      'Updated by the contacts sync script - Last update: 13/03/2026';
    const result = determineSyncNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should update if Updated message with different date', () => {
    const existingNote =
      'Updated by the contacts sync script - Last update: 12/03/2026';
    const result = determineSyncNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should append Updated message to existing non-sync note', () => {
    const existingNote = 'Some personal note';
    const result = determineSyncNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Some personal note\nUpdated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should append Updated message to existing syncer note', () => {
    const existingNote =
      'Updated by the people syncer script - Last update: 10/03/2026';
    const result = determineSyncNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script - Last update: 10/03/2026\nUpdated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should preserve existing note content when updating Updated message', () => {
    const existingNote =
      'Personal note\nUpdated by the contacts sync script - Last update: 12/03/2026';
    const result = determineSyncNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Personal note\nUpdated by the contacts sync script - Last update: 13/03/2026'
    );
  });

  it('should use extractDateFromNote helper correctly', () => {
    const note =
      'Updated by the contacts sync script - Last update: 13/03/2026';
    const extractedDate = extractDateFromNote(note);
    expect(extractedDate).toBe('13/03/2026');
  });

  it('should use updateNoteDateOnly helper correctly', () => {
    const note =
      'Updated by the contacts sync script - Last update: 12/03/2026';
    const updated = updateNoteDateOnly(note, '13/03/2026');
    expect(updated).toBe(
      'Updated by the contacts sync script - Last update: 13/03/2026'
    );
  });
});
