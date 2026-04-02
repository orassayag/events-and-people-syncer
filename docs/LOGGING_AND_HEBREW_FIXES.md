# Logging and Hebrew Character Fixes - March 22, 2026

## Problems Fixed

### Problem 1: Missing Change Details in Update Logs

When contacts were updated, the logs sometimes showed:
```
[INFO] [2026-03-22T16:08:47.249Z] Updated contact: Alex Greenshpun (10x Company) - Label: Job
```

Without showing WHAT was updated. This happened when only the note was updated (from "Added by..." to "Updated by..."), but the note update wasn't being logged.

### Problem 2: Hebrew Characters in LastName Field

The formatted company names were including Hebrew characters, resulting in LastName values like:
```
LastName: "Sahar zakon HR TidharGroup" -> "Sahar zakon HR TidharGroupקבוצתתדהר"
```

This violated the requirement that the calculated label (company name) should not include any Hebrew characters.

## Root Causes

### Issue 1: Note Updates Not Logged

The `UpdateDetails` interface didn't include a `noteUpdated` field, so when a contact's note was updated, there was no way to log what changed. The logging code in `linkedinSync.ts` only checked for:
- lastName changes
- jobTitle changes
- emailAdded
- linkedInUrlAdded
- linkedInUrlLabelFixed

But NOT note updates.

### Issue 2: Hebrew Characters in Company Names

The code was using `cleanCompany()` followed by `formatCompanyToPascalCase()`, but this didn't remove Hebrew characters. There was already a function `calculateFormattedCompany()` that does this correctly by:
1. Cleaning the company name
2. Extracting only English characters using `extractEnglishFromMixed()`
3. Formatting to PascalCase

## Solution

### Fix 1: Add Note Update Logging

**Changed files:**
1. `src/types/linkedin.ts` - Added `noteUpdated` field to `UpdateDetails` interface
2. `src/services/linkedin/contactSyncer.ts` - Set `noteUpdated` in updateDetails when note is updated
3. `src/scripts/linkedinSync.ts` - Added logging for note updates

**Changes:**

```typescript
// types/linkedin.ts
export interface UpdateDetails {
  lastName?: { from: string; to: string };
  jobTitle?: { from: string; to: string };
  emailAdded?: string;
  linkedInUrlAdded?: boolean;
  linkedInUrlLabelFixed?: boolean;
  noteUpdated?: { from: string; to: string };  // NEW
}

// contactSyncer.ts
if (noteUpdate.shouldUpdate) {
  // ... existing code ...
  updateDetails.noteUpdated = {
    from: existingBiography || '(empty)',
    to: noteUpdate.newNoteValue,
  };
}

// linkedinSync.ts
if (syncResult.updateDetails?.noteUpdated) {
  const fromNote = syncResult.updateDetails.noteUpdated.from.substring(0, 40);
  const toNote = syncResult.updateDetails.noteUpdated.to.substring(0, 40);
  changesParts.push(
    `Note: "${fromNote}..." -> "${toNote}..."`
  );
}
```

### Fix 2: Use calculateFormattedCompany to Remove Hebrew

**Changed file:**
- `src/services/linkedin/contactSyncer.ts`

**Changes:**

```typescript
// OLD:
import { retryWithBackoff, cleanCompany, formatCompanyToPascalCase } from '../../utils';
const cleanedCompany: string = cleanCompany(connection.company);
const formattedCompany: string = formatCompanyToPascalCase(cleanedCompany);

// NEW:
import { retryWithBackoff, calculateFormattedCompany } from '../../utils';
const formattedCompany: string = calculateFormattedCompany(connection.company);
```

This change was made in both the `addContact` and `updateContact` methods.

## Expected Behavior After Fix

### Logging

1. **All updates now show what changed:**
   ```
   [INFO] Updated contact: Alex Greenshpun (10x Company) - Label: Job [Note: "Added by the people syncer script (Li..." -> "Updated by the people syncer script (Li..."]
   ```

2. **Multiple changes are shown:**
   ```
   [INFO] Updated contact: Shira Zuriel (The National Institute...) - Label: HR [LastName: "Zuriel Job The" -> "Zuriel HR TheNationalInstitute...", Note: "Added by..." -> "Updated by..."]
   ```

### Hebrew Character Removal

Company names with Hebrew characters like:
- `Tidhar group | קבוצת תדהר` → `TidharGroup`
- `Bank Hapoalim בנק הפועלים` → `BankHapoalim`
- `MAX STOCK | מקס סטוק` → `MAXSTOCK`

The LastName field will now be:
- `Sahar zakon HR TidharGroup` (no Hebrew)
- `Minay HR BankHapoalim` (no Hebrew)
- `Hanuker HR MAXSTOCK` (no Hebrew)

## Testing

- All existing unit tests pass (24 tests in contactSyncer.test.ts)
- The `calculateFormattedCompany` function already has the logic to extract English-only characters
- No linter errors

## Files Modified

1. `src/types/linkedin.ts` - Added `noteUpdated` to UpdateDetails interface
2. `src/services/linkedin/contactSyncer.ts` - Use `calculateFormattedCompany`, add note update tracking
3. `src/scripts/linkedinSync.ts` - Add note update logging
