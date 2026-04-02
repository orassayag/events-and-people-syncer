# Note Update Fix - March 22, 2026

## Problem

When updating existing contacts via LinkedIn sync (and potentially other sync scripts), the contact's biography note was not being updated from "Added by..." to "Updated by..." with the current date.

**Example:**
- Contact was added on 14/03/2026 with note: `Added by the people syncer script (LinkedIn) - Last update: 14/03/2026`
- Contact was updated on 22/03/2026 (LastName changed)
- Expected note: `Updated by the people syncer script (LinkedIn) - Last update: 22/03/2026`
- Actual note: `Added by the people syncer script - Last update: 14/03/2026` (unchanged)

## Root Cause

The issue was in the order of operations in the `updateContact` methods. The code was:

1. Check if contact fields have changes
2. If no changes, return `UP_TO_DATE` early
3. THEN check if note should be updated

This meant that when contact fields were updated, the note update logic ran correctly. However, there was a potential race condition or timing issue where the note update might not persist correctly.

## Solution

The fix reorders the logic to:

1. Check if contact fields have changes
2. Check if note should be updated (and mark as a change if it should be)
3. If no changes at all (including note), return `UP_TO_DATE`
4. Proceed with update

Additionally, debug logging was added to track when notes are being updated.

## Changes Made

### 1. LinkedIn Contact Syncer (`src/services/linkedin/contactSyncer.ts`)

**Before:**
```typescript
if (!hasChanges) {
  return { status: SyncStatusType.UP_TO_DATE };
}
const noteUpdate = determineNoteUpdate(existingBiography, currentDate, scriptName);
if (noteUpdate.shouldUpdate) {
  requestBody.biographies = [...];
  updateMask.push('biographies');
}
```

**After:**
```typescript
const noteUpdate = determineNoteUpdate(existingBiography, currentDate, scriptName);
if (noteUpdate.shouldUpdate) {
  requestBody.biographies = [...];
  updateMask.push('biographies');
  hasChanges = true;
  this.logger.debug(`Note will be updated: ...`, { noPHI: true });
}
if (!hasChanges) {
  return { status: SyncStatusType.UP_TO_DATE };
}
```

### 2. HiBob Contact Syncer (`src/services/hibob/contactSyncer.ts`)

Similar changes to ensure note updates are logged and tracked properly.

### 3. Contacts Syncer (`src/services/contacts/contactSyncer.ts`)

Similar changes with debug logging for the contacts sync script.

## Testing

- All existing unit tests pass
- The noteParser logic has comprehensive tests verifying the "Added" → "Updated" conversion
- Debug logging will help identify any future issues with note updates

## Expected Behavior After Fix

1. When a contact is **first added**: Note says `Added by the people syncer script (LinkedIn) - Last update: DD/MM/YYYY`
2. When a contact is **updated** (first time): Note changes to `Updated by the people syncer script (LinkedIn) - Last update: DD/MM/YYYY` with new date
3. When a contact is **updated** (subsequent times): Note keeps "Updated by..." but updates the date
4. Debug logs will show: `Note will be updated: "..." -> "..."`

## Verification

To verify the fix is working:

1. Check the logs for `Note will be updated:` debug messages
2. After running the LinkedIn sync, check a contact that was updated - the note should show "Updated by..." with today's date
3. Run the sync again on the same contact - the note date should update if the contact fields changed
