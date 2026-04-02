# Note Date Always Update Fix - March 22, 2026

## Problem

When updating contacts, the note date was not always being updated to the current date. 

**Example:**
- Contact "guy lasry" was updated on `2026-03-22T16:09:16.828Z` (March 22)
- But the note showed: `Updated by the people syncer script - Last update: 19/03/2026` (March 19)
- Expected: `Updated by the people syncer script (LinkedIn) - Last update: 22/03/2026` (March 22)

The log entry showed:
```
[INFO] [2026-03-22T16:09:16.828Z] Updated contact: guy lasry (Israel Defense Forces) - Label: Job
```

With no change details, meaning the note was NOT updated.

## Root Cause

The `determineNoteUpdate` and `determineSyncNoteUpdate` functions had logic that checked if the existing date in the note matched the current date. If they matched, the function would return `shouldUpdate: false`, skipping the note update.

**Problematic code (lines 46-53 in noteParser.ts):**

```typescript
if (hasUpdatedMessage) {
  const existingDate: string | null = extractDateFromNote(existingNote);
  if (existingDate === currentDate) {
    return {
      shouldUpdate: false,  // ❌ BAD: Don't update if date is same
      newNoteValue: existingNote,
    };
  }
  return {
    shouldUpdate: true,
    newNoteValue: updateNoteDateOnly(existingNote, currentDate),
  };
}
```

This logic was flawed because:
1. It assumed that if the date is the same, we shouldn't update
2. But we should ALWAYS update the note when we update a contact, regardless of the date
3. The note might also be missing the script name (e.g., "Updated by the people syncer script" instead of "Updated by the people syncer script (LinkedIn)")

## Solution

Removed the date comparison logic. Now the functions ALWAYS return `shouldUpdate: true` when updating a contact, ensuring the date is always updated to the current date.

**Fixed code:**

```typescript
if (hasUpdatedMessage) {
  return {
    shouldUpdate: true,  // ✅ GOOD: Always update
    newNoteValue: updateNoteDateOnly(existingNote, currentDate),
  };
}
```

### Changes Made

**1. `src/services/linkedin/noteParser.ts` - `determineNoteUpdate` function**

- Removed the date comparison check (lines 47-52)
- Always returns `shouldUpdate: true` when there's an "Updated by..." message
- Simplified the logic

**2. `src/services/linkedin/noteParser.ts` - `determineSyncNoteUpdate` function**

- Applied the same fix for the contacts sync script
- Removed the date comparison check (lines 74-79)
- Always returns `shouldUpdate: true`

**3. Test Updates**

- `src/services/linkedin/__tests__/noteParser.test.ts` - Updated test to expect `shouldUpdate: true` even with same date
- `src/services/linkedin/__tests__/noteParserSync.test.ts` - Updated test to expect `shouldUpdate: true` even with same date

## Expected Behavior After Fix

### Always Update Date

When a contact is updated:
1. **If note says "Added by..."**: Change to "Updated by..." AND update date
2. **If note says "Updated by..."**: Keep "Updated by..." AND update date (even if date is the same)
3. **If note has no syncer message**: Append "Updated by..." with current date

### Example Scenarios

**Scenario 1: Update on same day**
- Existing note: `Updated by the people syncer script (LinkedIn) - Last update: 22/03/2026`
- Update happens on: 22/03/2026
- New note: `Updated by the people syncer script (LinkedIn) - Last update: 22/03/2026` (still updates, ensuring script name is correct)

**Scenario 2: Update on different day**
- Existing note: `Updated by the people syncer script - Last update: 19/03/2026`
- Update happens on: 22/03/2026
- New note: `Updated by the people syncer script - Last update: 22/03/2026` (date updated)

**Scenario 3: First update after add**
- Existing note: `Added by the people syncer script (LinkedIn) - Last update: 15/03/2026`
- Update happens on: 22/03/2026
- New note: `Updated by the people syncer script (LinkedIn) - Last update: 22/03/2026` (changed "Added" to "Updated" and updated date)

## Testing

- ✅ All 15 note parser tests pass
- ✅ All 8 sync note parser tests pass
- ✅ All 24 contact syncer tests pass
- ✅ No linter errors

## Files Modified

1. `src/services/linkedin/noteParser.ts` - Removed date comparison logic from both functions
2. `src/services/linkedin/__tests__/noteParser.test.ts` - Updated test expectations
3. `src/services/linkedin/__tests__/noteParserSync.test.ts` - Updated test expectations

## Impact

This fix applies to:
- **LinkedIn sync script** - Uses `determineNoteUpdate`
- **HiBob sync script** - Uses `determineNoteUpdate`
- **Contacts sync script** - Uses `determineSyncNoteUpdate`

All three scripts will now correctly update the note date whenever a contact is updated.
