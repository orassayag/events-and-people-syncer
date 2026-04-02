import { describe, it, expect } from 'vitest';
import {
  buildNewContactNote,
  buildUpdatedContactNote,
  extractDateFromNote,
  updateNoteDateOnly,
  determineNoteUpdate,
} from '../noteParser';

describe('buildNewContactNote', () => {
  it('should create note with correct format', () => {
    const note: string = buildNewContactNote(new Date(2026, 2, 13, 22, 34, 34));
    expect(note).toBe(
      'Added by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
});

describe('buildUpdatedContactNote', () => {
  it('should create updated note when no existing note', () => {
    const note: string = buildUpdatedContactNote(
      new Date(2026, 2, 13, 22, 34, 34),
      ''
    );
    expect(note).toBe(
      'Updated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should append updated note to existing note', () => {
    const note: string = buildUpdatedContactNote(
      new Date(2026, 2, 13, 22, 34, 34),
      'Some personal note'
    );
    expect(note).toBe(
      'Some personal note\nUpdated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
});

describe('extractDateFromNote', () => {
  it('should extract date from Added message', () => {
    const note: string =
      'Added by the people syncer script - Last update: 13/03/2026 22:34:34';
    expect(extractDateFromNote(note)).toBe('13/03/2026 22:34:34');
  });
  it('should extract date from Updated message', () => {
    const note: string =
      'Updated by the people syncer script - Last update: 13/03/2026 22:34:34';
    expect(extractDateFromNote(note)).toBe('13/03/2026 22:34:34');
  });
  it('should return null when no date present', () => {
    expect(extractDateFromNote('Some personal note')).toBeNull();
  });
});

describe('updateNoteDateOnly', () => {
  it('should replace date in Added message', () => {
    const note: string =
      'Added by the people syncer script - Last update: 12/03/2026 20:30:45';
    const updated: string = updateNoteDateOnly(note, '13/03/2026 22:34:34');
    expect(updated).toBe(
      'Added by the people syncer script - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should replace date in Updated message', () => {
    const note: string =
      'Updated by the people syncer script - Last update: 12/03/2026 20:30:45';
    const updated: string = updateNoteDateOnly(note, '13/03/2026 22:34:34');
    expect(updated).toBe(
      'Updated by the people syncer script - Last update: 13/03/2026 22:34:34'
    );
  });
});

describe('determineNoteUpdate', () => {
  it('should convert Added message to Updated message with any date', () => {
    const existingNote: string =
      'Added by the people syncer script - Last update: 13/03/2026 22:34:34';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should convert Added message to Updated message and update date', () => {
    const existingNote: string =
      'Added by the people syncer script - Last update: 12/03/2026 20:30:45';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should always update if Updated message (even with same date)', () => {
    const existingNote: string =
      'Updated by the people syncer script - Last update: 13/03/2026 22:34:34';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should update if Updated message with different date', () => {
    const existingNote: string =
      'Updated by the people syncer script - Last update: 12/03/2026 20:30:45';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should append Updated message to existing non-syncer note', () => {
    const existingNote: string = 'Some personal note';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Some personal note\nUpdated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should create Updated message for empty note', () => {
    const result = determineNoteUpdate('', '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Updated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
  it('should convert Added to Updated and preserve other note content', () => {
    const existingNote: string =
      'Some personal note\nAdded by the people syncer script - Last update: 12/03/2026 20:30:45';
    const result = determineNoteUpdate(existingNote, '13/03/2026 22:34:34');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe(
      'Some personal note\nUpdated by the people syncer script (LinkedIn) - Last update: 13/03/2026 22:34:34'
    );
  });
});
