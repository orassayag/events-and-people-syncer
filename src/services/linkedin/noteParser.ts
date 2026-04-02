import { RegexPatterns } from '../../regex';
import { formatDateTimeDDMMYYYY_HHMMSS } from '../../utils';
import type { NoteUpdateResult } from '../../types';

export { NoteUpdateResult };

export function buildNewContactNote(
  date: Date,
  scriptName: string = 'LinkedIn'
): string {
  return `Added by the people syncer script (${scriptName}) - Last update: ${formatDateTimeDDMMYYYY_HHMMSS(date)}`;
}

export function buildUpdatedContactNote(
  date: Date,
  existingNote: string,
  scriptName: string = 'LinkedIn'
): string {
  if (!existingNote) {
    return `Updated by the people syncer script (${scriptName}) - Last update: ${formatDateTimeDDMMYYYY_HHMMSS(date)}`;
  }
  return `${existingNote}\nUpdated by the people syncer script (${scriptName}) - Last update: ${formatDateTimeDDMMYYYY_HHMMSS(date)}`;
}

export function extractDateFromNote(note: string): string | null {
  const match = note.match(RegexPatterns.SYNCER_NOTE_DATE);
  return match ? match[1] : null;
}

export function updateNoteDateOnly(note: string, newDate: string): string {
  return note.replace(
    RegexPatterns.SYNCER_NOTE_DATE,
    `Last update: ${newDate}`
  );
}

export function determineNoteUpdate(
  existingNote: string,
  currentDate: string,
  scriptName: string = 'LinkedIn'
): NoteUpdateResult {
  if (!existingNote) {
    return {
      shouldUpdate: true,
      newNoteValue: `Updated by the people syncer script (${scriptName}) - Last update: ${currentDate}`,
    };
  }
  const hasAddedMessage: boolean =
    RegexPatterns.SYNCER_ADDED_NOTE.test(existingNote);
  const hasUpdatedMessage: boolean =
    RegexPatterns.SYNCER_UPDATED_NOTE.test(existingNote);
  if (hasAddedMessage) {
    return {
      shouldUpdate: true,
      newNoteValue: existingNote
        .replace(
          RegexPatterns.SYNCER_ADDED_NOTE,
          `Updated by the people syncer script (${scriptName})`
        )
        .replace(RegexPatterns.SYNCER_NOTE_DATE, `Last update: ${currentDate}`),
    };
  }
  if (hasUpdatedMessage) {
    return {
      shouldUpdate: true,
      newNoteValue: updateNoteDateOnly(existingNote, currentDate),
    };
  }
  return {
    shouldUpdate: true,
    newNoteValue: `${existingNote}\nUpdated by the people syncer script (${scriptName}) - Last update: ${currentDate}`,
  };
}

export function determineSyncNoteUpdate(
  existingNote: string,
  currentDate: string
): NoteUpdateResult {
  if (!existingNote) {
    return {
      shouldUpdate: true,
      newNoteValue: `Updated by the contacts sync script - Last update: ${currentDate}`,
    };
  }
  const hasUpdatedMessage: boolean =
    RegexPatterns.SYNC_UPDATED_NOTE.test(existingNote);
  if (hasUpdatedMessage) {
    return {
      shouldUpdate: true,
      newNoteValue: updateNoteDateOnly(existingNote, currentDate),
    };
  }
  return {
    shouldUpdate: true,
    newNoteValue: `${existingNote}\nUpdated by the contacts sync script - Last update: ${currentDate}`,
  };
}
