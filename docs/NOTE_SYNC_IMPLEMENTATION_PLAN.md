# LinkedIn Contact Note Sync Implementation Plan

## Overview

Add automated note tracking to the LinkedIn contact syncer that records when contacts are added or updated by the script. The notes will use the `biographies` field in Google Contacts (same as POC implementation) and will track creation vs. update actions with timestamps in `dd/MM/yyyy` format.

## Note Format Specifications

### New Contact Note
```
Added by the people syncer script - Last update: 13/03/2026
```

### Updated Contact Note (appended)
```
[existing note content]
Updated by the people syncer script - Last update: 13/03/2026
```

### Line Break Strategy
- Use single newline (`\n`) to separate existing notes from new syncer notes
- Only add line break if existing notes are present

### Date Handling
- Format: `dd/MM/yyyy` (e.g., `13/03/2026`)
- Only update date if different from current date in note
- Preserve all other existing note content when updating dates

## Implementation Logic

### 1. Add Note for New Contacts

**Location**: `src/services/linkedin/contactSyncer.ts` - `addContact()` method

**Logic**:
- When creating a new contact (lines 28-112), add a `biographies` field to the request body
- Format: `"Added by the people syncer script - Last update: dd/MM/yyyy"`
- Use current date in `dd/MM/yyyy` format
- Insert after the `memberships` field setup (around line 95)

**Code Addition**:
```typescript
if (Object.keys(requestBody).length === 0) {
  return SyncStatusType.SKIPPED;
}

// Add syncer note for tracking
requestBody.biographies = [
  {
    value: buildNewContactNote(new Date()),
    contentType: 'TEXT_PLAIN',
  },
];

await retryWithBackoff(async () => {
  await service.people.createContact({ requestBody });
});
```

### 2. Update Note for Existing Contacts

**Location**: `src/services/linkedin/contactSyncer.ts` - `updateContact()` method

**Logic Flow** (lines 114-249):

#### a. Fetch existing contact with biographies
- Update the `personFields` parameter in `service.people.get()` call (line 125)
- Change from: `personFields: 'names,emailAddresses,urls,organizations'`
- Change to: `personFields: 'names,emailAddresses,urls,organizations,biographies'`

#### b. Parse existing note content
- Extract existing `biographies` field from `existingData.biographies?.[0]?.value`
- Check for presence of syncer-related messages

#### c. Apply update logic based on note state

**Case 1: Contains "Added by the people syncer script"**
- Convert "Added by" to "Updated by" to reflect that the contact was modified
- Extract the date from the note using `RegexPatterns.SYNCER_NOTE_DATE`
- Update the date to current date
- Message format: `"Updated by the people syncer script - Last update: dd/MM/yyyy"`

**Case 2: Contains "Updated by the people syncer script"**
- Extract the date from the note
- Compare extracted date with current date
- If dates differ: Update "Last update: dd/MM/yyyy" to current date
- If dates match: Skip note update (no changes needed)
- Preserve the "Updated by" message

**Case 3: No syncer message present**
- Check if existing notes exist (non-empty biography)
- If yes: Append `\n` + new note message
- If no: Set note message directly
- Message format: `"Updated by the people syncer script - Last update: dd/MM/yyyy"`

#### d. Add to update request
- If note changes are needed, add `biographies` to `requestBody`
- Add `'biographies'` to the `updateMask` array
- Set `hasChanges = true`

**Code Addition** (after line 227):
```typescript
// Handle note updates
const existingNote = existingData.biographies?.[0]?.value?.trim() || '';
const currentDate = formatDateDDMMYYYY(new Date());
const noteUpdate = determineNoteUpdate(existingNote, currentDate);

if (noteUpdate.shouldUpdate) {
  requestBody.biographies = [
    {
      value: noteUpdate.newNoteValue,
      contentType: 'TEXT_PLAIN',
    },
  ];
  updateMask.push('biographies');
  hasChanges = true;
}
```

## Required Utilities

### Date Formatting Utility

**File**: `src/utils/dateFormatter.ts` (new file)

Create a utility function to format dates:
```typescript
import { RegexPatterns } from '../regex/patterns';

export function formatDateDDMMYYYY(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, '0');
  const month: string = String(date.getMonth() + 1).padStart(2, '0');
  const year: number = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function parseDateDDMMYYYY(dateStr: string): Date | null {
  const match = dateStr.match(RegexPatterns.DATE_DD_MM_YYYY);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}
```

### Note Parser Utility

**File**: `src/services/linkedin/noteParser.ts` (new file)

Create utilities to:
- Extract date from syncer note using regex
- Determine if note contains "Added by" or "Updated by" messages
- Build updated note with new date while preserving other content
- Build new note for contacts without existing syncer messages

```typescript
import { RegexPatterns } from '../../regex/patterns';
import { formatDateDDMMYYYY } from '../../utils/dateFormatter';

export interface NoteUpdateResult {
  shouldUpdate: boolean;
  newNoteValue: string;
}

export function buildNewContactNote(date: Date): string {
  return `Added by the people syncer script - Last update: ${formatDateDDMMYYYY(date)}`;
}

export function buildUpdatedContactNote(date: Date, existingNote: string): string {
  if (!existingNote) {
    return `Updated by the people syncer script - Last update: ${formatDateDDMMYYYY(date)}`;
  }
  return `${existingNote}\nUpdated by the people syncer script - Last update: ${formatDateDDMMYYYY(date)}`;
}

export function extractDateFromNote(note: string): string | null {
  const match = note.match(RegexPatterns.SYNCER_NOTE_DATE);
  return match ? match[1] : null;
}

export function updateNoteDateOnly(note: string, newDate: string): string {
  return note.replace(RegexPatterns.SYNCER_NOTE_DATE, `Last update: ${newDate}`);
}

export function determineNoteUpdate(existingNote: string, currentDate: string): NoteUpdateResult {
  if (!existingNote) {
    return {
      shouldUpdate: true,
      newNoteValue: `Updated by the people syncer script - Last update: ${currentDate}`,
    };
  }
  const hasAddedMessage: boolean = RegexPatterns.SYNCER_ADDED_NOTE.test(existingNote);
  const hasUpdatedMessage: boolean = RegexPatterns.SYNCER_UPDATED_NOTE.test(existingNote);
  if (hasAddedMessage || hasUpdatedMessage) {
    const existingDate: string | null = extractDateFromNote(existingNote);
    if (existingDate === currentDate) {
      return {
        shouldUpdate: false,
        newNoteValue: existingNote,
      };
    }
    return {
      shouldUpdate: true,
      newNoteValue: updateNoteDateOnly(existingNote, currentDate),
    };
  }
  return {
    shouldUpdate: true,
    newNoteValue: `${existingNote}\nUpdated by the people syncer script - Last update: ${currentDate}`,
  };
}
```

### Regex Patterns

**File**: `src/regex/patterns.ts`

Add new regex patterns for note syncing:
```typescript
static readonly SYNCER_ADDED_NOTE = /Added by the people syncer script/;
static readonly SYNCER_UPDATED_NOTE = /Updated by the people syncer script/;
static readonly SYNCER_NOTE_DATE = /Last update: (\d{2}\/\d{2}\/\d{4})/;
static readonly DATE_DD_MM_YYYY = /(\d{2})\/(\d{2})\/(\d{4})/;
```

**Usage**: All regex patterns must be imported from `RegexPatterns` class - no inline regex allowed in implementation files.

## Types Updates

**File**: `src/types/linkedin.ts`

No changes needed to existing types - `biographies` field is part of Google People API schema.

## Implementation Steps

1. **Create date formatter utility** (`src/utils/dateFormatter.ts`)
   - Implement `formatDateDDMMYYYY()` function
   - Implement `parseDateDDMMYYYY()` function (for future use)
   - Add unit test to verify format correctness

2. **Add regex patterns** (`src/regex/patterns.ts`)
   - Add `SYNCER_ADDED_NOTE` - Detects "Added by the people syncer script"
   - Add `SYNCER_UPDATED_NOTE` - Detects "Updated by the people syncer script"
   - Add `SYNCER_NOTE_DATE` - Extracts date from "Last update: dd/MM/yyyy"
   - Add `DATE_DD_MM_YYYY` - General date parsing pattern for dd/MM/yyyy format

3. **Create note parser utility** (`src/services/linkedin/noteParser.ts`)
   - Implement `parseExistingNote()` - extract note type and date
   - Implement `updateNoteDate()` - replace date in existing note
   - Implement `buildNewContactNote()` - create "Added by" message
   - Implement `buildUpdatedContactNote()` - create "Updated by" message or append to existing
   - Implement `determineNoteUpdate()` - main logic to determine what to do
   - Add unit tests for all parsing scenarios

4. **Modify `addContact()` method** (`src/services/linkedin/contactSyncer.ts`)
   - After line 95 (memberships setup), add biographies field
   - Use `buildNewContactNote()` utility
   - Import necessary utilities

5. **Modify `updateContact()` method** (`src/services/linkedin/contactSyncer.ts`)
   - Update `personFields` to include `biographies` (line 125)
   - After line 227 (URL update logic), add logic to parse and update note
   - Use note parser utilities to determine update strategy
   - Add note to update request if changes detected

6. **Add unit tests** (`src/services/linkedin/__tests__/contactSyncer.test.ts`)
   - Test new contact note creation
   - Test updating existing "Added by" note with same date (no change)
   - Test updating existing "Added by" note with different date (update)
   - Test updating existing "Updated by" note with same date (no change)
   - Test updating existing "Updated by" note with different date (update)
   - Test appending "Updated by" to existing non-syncer notes
   - Test adding "Updated by" when no existing notes

7. **Update type mocks** if needed (`src/services/linkedin/__mocks__/`)
   - Add biographies field examples to contact mocks

## Edge Cases to Handle

1. **Multiple syncer messages**: Only update the last/most relevant one (first match in regex)
2. **Malformed date in existing note**: If regex doesn't match, treat as no syncer message and append new note
3. **Empty biography field**: Treat as no existing notes
4. **Biography with only whitespace**: Treat as no existing notes (after trim)
5. **Date comparison**: Compare date strings directly (format is consistent)
6. **Note is null vs empty string**: Handle both as "no existing note"
7. **Very long existing notes**: No truncation - preserve everything

## Testing Strategy

### Unit Tests

#### Date Formatter Tests (`src/utils/__tests__/dateFormatter.test.ts`)
```typescript
describe('formatDateDDMMYYYY', () => {
  it('should format date correctly', () => {
    expect(formatDateDDMMYYYY(new Date(2026, 2, 13))).toBe('13/03/2026');
  });
  it('should pad single digit day and month', () => {
    expect(formatDateDDMMYYYY(new Date(2026, 0, 5))).toBe('05/01/2026');
  });
  it('should handle leap year', () => {
    expect(formatDateDDMMYYYY(new Date(2024, 1, 29))).toBe('29/02/2024');
  });
  it('should handle year boundary', () => {
    expect(formatDateDDMMYYYY(new Date(2025, 11, 31))).toBe('31/12/2025');
  });
});
```

#### Note Parser Tests (`src/services/linkedin/__tests__/noteParser.test.ts`)
```typescript
describe('buildNewContactNote', () => {
  it('should create note with correct format', () => {
    const note = buildNewContactNote(new Date(2026, 2, 13));
    expect(note).toBe('Added by the people syncer script - Last update: 13/03/2026');
  });
});

describe('determineNoteUpdate', () => {
  it('should not update if Added message with same date', () => {
    const existingNote = 'Added by the people syncer script - Last update: 13/03/2026';
    const result = determineNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(false);
  });

  it('should update if Added message with different date', () => {
    const existingNote = 'Added by the people syncer script - Last update: 12/03/2026';
    const result = determineNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe('Added by the people syncer script - Last update: 13/03/2026');
  });

  it('should append Updated message to existing non-syncer note', () => {
    const existingNote = 'Some personal note';
    const result = determineNoteUpdate(existingNote, '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe('Some personal note\nUpdated by the people syncer script - Last update: 13/03/2026');
  });

  it('should create Updated message for empty note', () => {
    const result = determineNoteUpdate('', '13/03/2026');
    expect(result.shouldUpdate).toBe(true);
    expect(result.newNoteValue).toBe('Updated by the people syncer script - Last update: 13/03/2026');
  });
});
```

#### Contact Syncer Integration Tests
- Test new contact creation includes biography
- Test update contact with no existing note adds Updated message
- Test update contact with existing syncer note updates date
- Test update contact with existing syncer note same date skips update

### Manual Testing
- Run sync with new contacts → verify "Added by" note in Google Contacts
- Run sync again same day → verify no changes, "Up-To-Date" status
- Run sync next day → verify date updated
- Manually edit contact note → run sync → verify "Updated by" appended
- Test with existing syncer notes from previous runs

## Files to Create

1. `src/utils/dateFormatter.ts` - Date formatting utility
2. `src/services/linkedin/noteParser.ts` - Note parsing and building logic
3. `src/utils/__tests__/dateFormatter.test.ts` - Date formatter tests
4. `src/services/linkedin/__tests__/noteParser.test.ts` - Note parser tests

## Files to Modify

1. `src/regex/patterns.ts` - Add syncer note regex patterns (4 new patterns):
   - `SYNCER_ADDED_NOTE`
   - `SYNCER_UPDATED_NOTE`
   - `SYNCER_NOTE_DATE`
   - `DATE_DD_MM_YYYY`
2. `src/services/linkedin/contactSyncer.ts` - Add note logic to add/update methods
3. `src/services/linkedin/__tests__/contactSyncer.test.ts` - Add comprehensive tests (if exists)

## Success Criteria

- ✅ New contacts get "Added by" note with current date
- ✅ Re-syncing on same day doesn't update note (no unnecessary API calls)
- ✅ Re-syncing on different day updates only the date portion
- ✅ Existing non-syncer notes are preserved
- ✅ "Updated by" messages are properly appended with line breaks
- ✅ All unit tests pass
- ✅ Manual testing confirms expected behavior
- ✅ No PHI logged (dates are not PHI, but actual note content might be)

## Security Considerations

- Notes are stored in Google Contacts `biographies` field (plain text)
- Date format is consistent and parseable
- No PII/PHI is added by the syncer (only metadata about sync timing)
- Existing user notes are preserved (never deleted or overwritten)
- Regex patterns are specific enough to avoid false matches

## Performance Impact

- Minimal: One additional field (`biographies`) in API requests
- No additional API calls (using existing fetch/update operations)
- Date comparison is string-based (no parsing overhead unless needed)
- Note updates only occur when date differs (idempotent)

## Future Enhancements

- Add sync source tracking (manual vs LinkedIn sync)
- Add sync statistics (how many times contact was updated)
- Add change log tracking (what fields changed)
- Add support for timezone-aware dates
