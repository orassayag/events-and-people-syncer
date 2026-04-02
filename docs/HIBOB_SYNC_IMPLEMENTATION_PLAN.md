# Hibob Sync Script Implementation Plan

## Document Revision History

**Latest Update:** Post-review refinements based on comprehensive analysis
- **CHANGED: Label selection flow** - Removed separate label prompt; company name IS the label
  - User enters company name only (formatted to PascalCase)
  - System verifies if company exists as label in Google Contacts
  - If label doesn't exist: prompt user to create it (y/n)
  - If user declines or ESC: exit gracefully
  - Label value used for both company field and label membership
  - **FORMATTING DIFFERENCE:** HiBob uses single label value (NOT duplicated like LinkedIn)
    - HiBob: `firstName lastName label` and `email label`
    - LinkedIn: `firstName lastName label company` and `email label company`
- **CHANGED: Pre-sync confirmation** - Shows only label (not company + label)
  - Display: `🏷️ Label: Vim` (single line)
  - Simpler than LinkedIn which shows both company and label
- Added **Phase 0** for cross-platform path handling and LinkedIn sync enhancement (MUST BE DONE FIRST)
  - **NEW:** Biography note script identification (e.g., "Added by people syncer (LinkedIn)")
- **CHANGED: Duplicate detection** - Two-pass strategy: email first, then name matching
  - First pass: deduplicate by email (if present)
  - Second pass: check name-only entries against existing email entries by name
  - Uses conditional key format (email: vs name: prefixes)
- Changed JSON handling to support **multiple arrays** (parse independently, deduplicate across all)
- Changed JSON error handling to **skip problematic arrays/objects** instead of throwing errors
- Moved **email validation to syncer only** (removed from extractor for better logging context)
- Added **Hebrew/RTL text detection** in extractor (similar to LinkedIn sync)
  - Hebrew labels handled same as LinkedIn sync (no special treatment needed)
- Added **cross-platform path utilities** ported from folders-cleaner project
- **NEW: UTF-16 BOM detection** - Added UTF-16 BOM detection (\uFFFE or \uFEFF00)
- **CHANGED: Regex pattern order** - Explicitly documented correct matching sequence and order dependency
- Clarified **label merging implementation** with specific API call details (fresh people.get with memberships)
- Clarified **biography notes** for new vs updated contacts with script identification
- Clarified **pre-sync confirmation cancellation** behavior (throw error, display message)
- Added **multi-entry line error handling** (skip problematic entry, continue to next)
- **NEW:** Added test cases for compound names (Spanish, hyphenated, apostrophes, Dutch particles)
- **NEW:** Parallel sync prevention - Only one sync process allowed at a time
- **NEW:** Type discriminators for SyncStatusBar - Use enum-based type field instead of runtime checking
- Added comprehensive **test cases** for all edge cases
- Expanded **verification checklist** with Phase 0 items and detailed checks
- Updated **implementation order** to reflect Phase 0 priority
- Added **Decision 10.1** for duplicate key construction with code example
- Added **Decision 10.2** for two-pass deduplication strategy
- Added **Decision 6.2** for label creation confirmation flow
- Added **Decision 11.1** for type discriminators in contact types
- Added **Decision 4.11** for UTF-16 BOM detection
- Added **Decision 1.4** for compound name handling limitations
- Added **Decision 9.4** for email domain validation approach

---

## Overview

Create a batch script that reads Hibob contact data from a text file and syncs it to Google Contacts, positioned above LinkedIn Sync in the scripts menu.

## Goals

- Fetch names and emails from Hibob contacts file (`sources/hibob.txt`)
- Support both simple text format and JSON array format
- Deduplicate contacts within and across both formats
- Sync to Google Contacts with company name as the label (single input, dual purpose)
- Auto-create label if company name doesn't exist in Google Contacts (with user confirmation)
- Provide real-time progress feedback with status bar
- Display comprehensive summary with statistics

## File Structure Analysis

From the existing LinkedIn sync implementation, we'll reuse:

- `src/scripts/linkedinSync.ts` - Main script structure, progress bar integration, summary display, and post-sync menu
- `src/flow/syncStatusBar.ts` - Progress bar with real-time status updates
- `src/services/linkedin/contactSyncer.ts` - Contact creation logic
- `src/services/contacts/contactEditor.ts` - Label selection prompt (lines 1083-1132)
- `src/settings/settings.ts` - Configuration settings

## Implementation Steps

### 0. Phase 0: Cross-Platform Path Handling & LinkedIn Sync Enhancement (MUST BE DONE FIRST)

**This phase establishes the foundation for HiBob sync and must be completed before starting HiBob implementation.**

#### 0.1. Add Cross-Platform Path Utilities

**File:** `src/utils/pathValidator.ts` (NEW FILE)

Port path validation logic from `/Users/orassayag/Repos/folders-cleaner` project to handle different OS paths:

```typescript
import { access, constants, stat } from 'fs/promises';
import { homedir } from 'os';
import { resolve, normalize, dirname } from 'path';

export function isWindowsPath(pathStr: string): boolean {
  const drivePattern = /^[a-zA-Z]:[/\\]/;
  const uncPattern = /^[/\\]{2}/;
  return drivePattern.test(pathStr) || uncPattern.test(pathStr);
}

export async function validatePathPermissions(resolvedPath: string): Promise<void> {
  try {
    await access(resolvedPath, constants.R_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
      throw new Error(`Permission denied accessing path: ${resolvedPath}`);
    }
    throw error;
  }
}

export async function validateAndResolveFilePath(targetPath: string): Promise<string> {
  if (!targetPath || targetPath.trim() === '') {
    throw new Error('File path cannot be empty');
  }
  const resolvedPath = resolve(targetPath);
  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Target must be a file, not a folder: ${resolvedPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    throw error;
  }
  await validatePathPermissions(resolvedPath);
  return resolvedPath;
}

export function normalizePath(pathStr: string): string {
  return normalize(resolve(pathStr));
}
```

**Usage:** Apply to ALL file path configurations in settings (LinkedIn zip path, HiBob file path, etc.)

#### 0.2. Update Biography Note Functions to Include Script Name

**File:** `src/services/linkedin/noteParser.ts`

Update note building functions to include script identification:

```typescript
export function buildNewContactNote(date: Date, scriptName: string = 'LinkedIn'): string {
  return `Added by the people syncer script (${scriptName}) - Last update: ${formatDateDDMMYYYY(date)}`;
}

export function buildUpdatedContactNote(date: Date, existingNote: string, scriptName: string = 'LinkedIn'): string {
  if (!existingNote) {
    return `Updated by the people syncer script (${scriptName}) - Last update: ${formatDateDDMMYYYY(date)}`;
  }
  return `${existingNote}\nUpdated by the people syncer script (${scriptName}) - Last update: ${formatDateDDMMYYYY(date)}`;
}

export function determineNoteUpdate(existingNote: string, currentDate: string, scriptName: string = 'LinkedIn'): NoteUpdateResult {
  if (!existingNote) {
    return {
      shouldUpdate: true,
      newNoteValue: `Updated by the people syncer script (${scriptName}) - Last update: ${currentDate}`,
    };
  }
  const hasAddedMessage: boolean = RegexPatterns.SYNCER_ADDED_NOTE.test(existingNote);
  const hasUpdatedMessage: boolean = RegexPatterns.SYNCER_UPDATED_NOTE.test(existingNote);
  if (hasAddedMessage) {
    return {
      shouldUpdate: true,
      newNoteValue: existingNote
        .replace(RegexPatterns.SYNCER_ADDED_NOTE, `Updated by the people syncer script (${scriptName})`)
        .replace(RegexPatterns.SYNCER_NOTE_DATE, `Last update: ${currentDate}`),
    };
  }
  if (hasUpdatedMessage) {
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
    newNoteValue: `${existingNote}\nUpdated by the people syncer script (${scriptName}) - Last update: ${currentDate}`,
  };
}
```

**Note:** Also update regex patterns to match script-specific notes if needed.

#### 0.3. Update SyncStatusBar for File Path Display

**File:** `src/flow/syncStatusBar.ts`

Add file path tracking and display:

```typescript
export class SyncStatusBar {
  private filePath: string = ''; // Add this property
  
  setFilePath(path: string): void {
    this.filePath = path;
  }
  
  private formatProcessStatus(): string {
    let output = `Time: ${this.formatTime()} | Status: ${this.apiStatus}\n`;
    
    // Add file path line if set
    if (this.filePath) {
      output += `  Path: ${this.filePath}\n`;
    }
    
    // ... rest of status formatting
  }
}
```

#### 0.4. Update LinkedIn Sync to Use Script Identification

**File:** `src/scripts/linkedinSync.ts`

Update LinkedIn sync to pass script name to note functions:

```typescript
// When calling addContact
const syncStatus: SyncStatusType = await this.contactSyncer.addContact(connection, label, 'LinkedIn');

// When calling updateContact
const syncResult = await this.contactSyncer.updateContact(matchResult.resourceName, connection, label, 'LinkedIn');
```

**File:** `src/services/linkedin/contactSyncer.ts`

Update ContactSyncer methods to accept and pass script name:

```typescript
async addContact(
  connection: LinkedInConnection,
  label: string,
  scriptName: string = 'LinkedIn'
): Promise<SyncStatusType> {
  // ... existing code ...
  requestBody.biographies = [
    {
      value: buildNewContactNote(new Date(), scriptName),
      contentType: 'TEXT_PLAIN',
    },
  ];
  // ... rest of implementation
}

async updateContact(
  resourceName: string,
  connection: LinkedInConnection,
  label: string,
  scriptName: string = 'LinkedIn'
): Promise<SyncResult> {
  // ... existing code ...
  const currentDateFormatted = formatDateDDMMYYYY(new Date());
  const noteUpdate = determineNoteUpdate(existingBiography, currentDateFormatted, scriptName);
  // ... rest of implementation
}
```

#### 0.5. Update Contacts Sync Script (if applicable)

**File:** `src/scripts/contactsSync.ts` or similar

Update any other scripts that use note functions to pass their script name (e.g., 'ContactsSync').

#### 0.6. Update LinkedIn Sync to Use File Path Display

**File:** `src/scripts/linkedinSync.ts`

Add file path to status bar:

```typescript
// After creating statusBar instance (line ~62)
const zipPath = path.join(SETTINGS.linkedin.sourcesPath, SETTINGS.linkedin.zipFileName);
statusBar.setFilePath(zipPath);

// Before starting process phase (line ~143)
statusBar.startProcessPhase(connections.length);
```

**Test LinkedIn sync with new file path display and script identification before proceeding to HiBob implementation.**

---

### 1. Add Hibob Settings to Configuration

**File:** `src/settings/settings.ts`

Add `hibob` section to `Settings` interface (after `linkedin` section, around line 42):

```typescript
export interface Settings {
  // ... existing fields
  linkedin: {
    // ... existing linkedin config
  };
  hibob: {
    filePath: string;
    writeDelayMs: number;
    testContactLimit: number | null;
  };
  contactsSync: {
    // ... rest
  };
}
```

**Configuration Values in SETTINGS constant (around line 100):**
```typescript
hibob: {
  filePath: join(__dirname, '..', '..', 'sources', 'hibob.txt'),
  writeDelayMs: 2500,
  testContactLimit: null,
},
```

**Note:** Use `path.join()` for cross-platform compatibility, not hardcoded absolute paths.

---

### 2. Create Hibob Contact Type

**File:** `src/types/hibob.ts`

Define interfaces for Hibob contacts with type discriminator:

```typescript
export enum ContactType {
  HIBOB = 'hibob',
  LINKEDIN = 'linkedin',
}

export interface HibobContact {
  type: ContactType.HIBOB;
  firstName: string;
  lastName?: string;
  email?: string;
}

export interface HibobSyncStatus {
  processed: number;
  new: number;
  upToDate: number;
  updated: number;
  warning: number;
  needClarification: number;
  error: number;
  skipped: number;
}

export interface ContactWithDetails {
  contact: HibobContact;
  label: string;
  reason?: string;
}
```

**Also update:** `src/types/linkedin.ts` to add type discriminator:

```typescript
export interface LinkedInConnection {
  type: ContactType.LINKEDIN;
  firstName: string;
  lastName: string;
  // ... rest of fields
}
```

### 3. Create Hibob Extractor Service

**File:** `src/services/hibob/hibobExtractor.ts`

**Responsibilities:**
1. File validation (check if file exists and readable, throw error if missing/permissions issue)
2. Use cross-platform path validation from `pathValidator.ts`
3. Parse both contact formats from the file (simple text and JSON arrays)
4. Detect and mark Hebrew/RTL text in names (similar to LinkedIn sync)
5. Deduplicate contacts during extraction using two-pass strategy
6. Return array of unique contacts

**Format Parsing:**

**Simple Format (lines 1-7):**
Parse patterns like:
- `Name (email@domain.com)`
- `Name email@domain.com`
- Multiple entries per line separated by commas

**Parsing Rules:**
- Ignore trailing commas
- Normalize whitespace (multiple spaces → single space)
- Handle mixed entries: if name exists, extract it; if email exists, extract it
- Handle nicknames in parentheses: "Allen (Aaron) Jacobson" → firstName: "Allen", lastName: "(Aaron) Jacobson"
- **Pattern Matching Order for Simple Format (ORDER MATTERS):**
  1. **First try `NAME_WITH_NICKNAME`:** "Allen (Aaron) Jacobson (allenj@getvim.com)"
     - MUST be tested first to capture nickname structure before simpler patterns match
  2. **Then try `NAME_WITH_PARENS_EMAIL`:** "Name (email@domain.com)"
     - Matches simple name with email in parentheses
  3. **Then try `NAME_WITH_SPACE_EMAIL`:** "Name email@domain.com"
     - Matches name with space-separated email
  4. **Finally extract remaining email using `EMAIL_IN_STRING`**
     - Fallback for any missed email patterns
  - **CRITICAL:** Pattern order dependency must be maintained - testing NAME_WITH_NICKNAME first ensures nicknames are captured before simpler patterns consume the string
  - **Test case:** "Allen (Aaron) Jacobson (allenj@getvim.com)" MUST match NAME_WITH_NICKNAME, not NAME_WITH_PARENS_EMAIL
- **Line-by-line processing:** Each line in simple format represents one or more comma-separated entries; no multi-line spanning
- **Multi-entry line error handling:**
  - Parse each comma-separated entry independently
  - If an entry fails to parse: skip that specific entry, log INFO with line number and position
  - Continue processing remaining entries on the same line
  - Example: `Valid Entry, Invalid Garbage, Another Valid Entry` → processes entry 1 and 3, skips entry 2

Example:
```
Michael Lev (michaell@getvim.com), Allen (Aaron) Jacobson (allenj@getvim.com)
```

**JSON Array Format (lines 9+):**
Parse JSON array with structure:
```json
{
  "displayName": "Marija Ringwelski",
  "email": "marijar@getvim.com",
  "firstName": "Marija",
  "surname": "Ringwelski"
}
```

**Name Extraction Strategy:**
- **From JSON:** 
  - **Priority 1:** Use `displayName` field if present
  - **Priority 2:** If `displayName` is missing, use `firstName` + `surname`
  - **Skip:** If both `displayName` and `firstName`/`surname` are missing, skip the contact
- **From Simple Format:** Parse name before email/parentheses. Handle nicknames in parentheses (e.g., "Allen (Aaron) Jacobson" → firstName: "Allen", lastName: "(Aaron) Jacobson")

**JSON Error Handling:**
- **File Structure:** Expected format is:
  - Lines 1-N: Simple format (optional, can be absent)
  - Empty line separator (optional)
  - Lines N+1 to end: One or more JSON arrays (optional)
  - Text before/after JSON arrays: Skip and log as INFO
- **Multiple JSON Arrays:** Treat each JSON array `[...]` as a separate section
  - Parse each array independently
  - Apply deduplication within each array
  - Apply deduplication across all arrays (same as simple format deduplication)
  - Log INFO message for each array found: "Processing JSON array #X with Y objects"
- **JSON Parsing Errors:**
  - If entire JSON array parsing fails (invalid JSON structure): Skip that specific array, log ERROR, continue to next array
  - If individual objects in an array are malformed: Skip problematic object, log ERROR with index, continue processing valid objects
  - If partial/truncated JSON at file end: Parse what can be parsed (take what you can take), log WARNING
- **BOM Detection:** 
  - Check for UTF-8 BOM (`\uFEFF`) at file start
  - Check for UTF-16 BOM (`\uFFFE` or `\uFEFF\u0000`) at file start
  - If any BOM detected: throw error and exit (file encoding issue)
  - User should save file as UTF-8 without BOM
- **JSON Field Validation for each object:**
  - If `email` field is missing, empty string, or whitespace only: OK, process by name only
  - If both `displayName` AND (`firstName`+`surname`) are missing: skip this object, log INFO
  - Include emojis and special characters in names (e.g., "John 👨‍💻 Doe")
- **Text Between/Around JSON:**
  - Text before first `[`: Skip lines, log INFO per skipped line
  - Text after closing `]`: Skip lines, log INFO per skipped line
  - Text between two JSON arrays: Skip lines, log INFO per skipped line

**Duplicate Detection Logic:**
- Track unique contacts using a two-pass deduplication strategy
- Normalization: trim whitespace, convert to lowercase

**Two-Pass Deduplication Strategy:**

**Pass 1: Email-Based Deduplication**
- Build a map of all contacts with emails using email as key
- Format: `email:${normalizedEmail}` → contact
- If duplicate email found: skip subsequent occurrences, log INFO with details
- Also track names associated with each email for Pass 2

**Pass 2: Name-Based Cross-Check**
- For contacts without emails (name-only), check against Pass 1 email map by name
- Compare normalized `firstName|lastName` against names tracked in Pass 1
- If name matches an existing email-based contact: log WARNING "Contact 'John Doe' (name-only) might be duplicate of 'john@example.com'"
- Still include the name-only contact (don't skip) but flag for user review
- Build separate map for unique name-only contacts: `name:${normalizedFirstName}|${normalizedLastName}` → contact
- If duplicate name-only found: skip subsequent occurrences

**Composite Key Construction:**
```typescript
// Pass 1: Email-based key (if email exists)
const normEmail = email ? email.trim().toLowerCase() : '';
if (normEmail) {
  key = `email:${normEmail}`;
}

// Pass 2: Name-based key (for name-only contacts)
const normFirst = firstName.trim().toLowerCase();
const normLast = lastName ? lastName.trim().toLowerCase() : '';
key = `name:${normFirst}|${normLast}`;
```

- Skip duplicates found within the simple format section
- Skip duplicates found within the JSON array section  
- Skip duplicates found across both sections (using the same key formats)
- Log skipped duplicates for debugging with details (which field matched, key used)
- Log potential name/email conflicts as WARNINGs
- Only the first occurrence is kept
- Same logic as LinkedIn sync for handling contacts with missing data

**Validation Rules:**
- ✅ Name + Email (if not duplicate) - extract both
- ✅ Name only (if not duplicate) - extract name
- ❌ Email only - skip (emails alone are not processed)
- ❌ Neither name nor email (skip)
- ❌ Duplicate by name + email (skip)

**Email Validation:**
- Email validation is performed in the syncer only (NOT during extraction)
- Invalid emails will be skipped during sync with appropriate logging
- This allows better context logging (which contact had the invalid email)
- Same validation logic as LinkedIn sync (using `emailSchema` from entities in contactSyncer)

**Method Signature:**
```typescript
async extract(): Promise<HibobContact[]>
```

### 4. Create Hibob Contact Syncer

**File:** `src/services/hibob/contactSyncer.ts`

**Responsibilities:**
- Initialize contact groups
- Add new contacts to Google Contacts
- Update existing contacts (merge labels)
- Format contact data appropriately
- Invalidate cache after each write (same as LinkedIn sync)

**Similar to LinkedIn's ContactSyncer but simpler:**
- No company extraction (uses user-provided company - identical for all contacts)
- No position/job title handling
- User-provided label is identical for all contacts

**Method Signatures:**
```typescript
async addContact(
  contact: HibobContact,
  labelResourceName: string,
  labelValue: string
): Promise<SyncStatusType>

async updateContact(
  resourceName: string,
  contact: HibobContact,
  labelResourceName: string,
  labelValue: string
): Promise<SyncResult>
```

**Note:** 
- `labelResourceName` is the Google Contacts resourceName for the label (e.g., "contactGroups/12345")
- `labelValue` is the display name of the label (e.g., "Vim")
- `labelValue` is used for BOTH the company field assignment AND name/email formatting
- **Formatting difference from LinkedIn:** HiBob uses single label value (not "label + company"), so:
  - Name: `firstName lastName labelValue` (e.g., "Michael Lev Vim")
  - Email: `email labelValue` (e.g., "michaell@getvim.com Vim")

**Contact Structure:**
- **Name:** `firstName` + calculated lastName
  - Format: `lastName labelName` (NOT duplicated - only label name, no company name duplication)
  - Example: "Michael Lev Vim" (where "Vim" is the label, also used as company internally)
  - **Different from LinkedIn:** LinkedIn uses `lastName label company`, HiBob uses just `lastName label`
- **Email:** with label format: `labelName` (NOT duplicated)
  - Example: "michaell@getvim.com Vim" (where "Vim" is the label)
  - **Different from LinkedIn:** LinkedIn uses `email label company`, HiBob uses just `email label`
- **Company:** The label value is assigned to the company field (internal, not displayed in name/email format)
- **Label membership:** Single label derived from user input
- **Biography:** 
  - For new contacts: Use `buildNewContactNote(new Date(), 'HiBob')` - script name identifies HiBob sync
  - For updated contacts: Use `determineNoteUpdate(existingBiography, currentDate, 'HiBob')` - script name identifies HiBob sync
  - This ensures proper "Added by people syncer (HiBob)" vs "Updated by people syncer (HiBob)" note handling
  - Different from LinkedIn which uses 'LinkedIn' as script name

**Existing Contact Handling:**
- If contact already exists with different label: **merge labels** (existing + new)
- Use DuplicateDetector to find matches
- Update contact to include both old and new label memberships
- **Label Merging Logic (HiBob Sync ONLY):**
  - Make a FRESH API call to Google People API to get existing contact's memberships
    - Use `people.get()` with `personFields: 'memberships'`
    - Extract `contactGroupMembership.contactGroupResourceName` from each membership
  - Compare existing contact group resource names with the company-derived label
  - If label already exists in contact's memberships: don't add it (no duplicates), return `SyncStatusType.UP_TO_DATE`
  - If label doesn't exist: add it to the memberships array, return `SyncStatusType.UPDATED`
  - **Error Handling:** If membership API call fails, throw error (will be caught by retryWithBackoff)
  - **Performance Note:** This adds one extra read per existing contact; acceptable given retry backoff protection
  - This logic is ONLY used for HiBob sync, NOT for LinkedIn sync

**Return Values:**
- `SyncStatusType.NEW` - Contact created successfully
- `SyncStatusType.UPDATED` - Contact updated (label merged)
- `SyncStatusType.UP_TO_DATE` - Contact already has the label
- `SyncStatusType.SKIPPED` - Contact skipped (missing required data)
- `SyncStatusType.ERROR` - Error occurred during creation/update

**Cache Invalidation:**
- Invalidate cache after each write operation (same as LinkedIn sync line 116, 311)
- Ensures duplicate detection works on fresh data throughout the sync process

### 5. Create Main Hibob Sync Script

**File:** `src/scripts/hibobSync.ts`

**Structure** (reuse patterns from `linkedinSync.ts`):

```typescript
@injectable()
export class HibobSyncScript {
  constructor(
    @inject('OAuth2Client') _auth: OAuth2Client,
    @inject(HibobExtractor) private extractor: HibobExtractor,
    @inject(HibobContactSyncer) private contactSyncer: HibobContactSyncer,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}
  
  async run(): Promise<void> {
    // Implementation
  }
}
```

**Execution Flow:**

1. **Check for Concurrent Sync**
   - Verify no other sync process is currently running
   - Only one sync (LinkedIn, HiBob, etc.) allowed at a time
   - Prevents cache invalidation race conditions and file access conflicts

2. **File Validation & Display**
   - Display file path being processed
   - Validate file path via `HibobExtractor`
   - Throw error if file doesn't exist

3. **Extract Contacts**
   - Extract contacts with built-in two-pass duplicate detection
   - Display extraction statistics
   - Display warnings if name-only contacts might match email contacts
   - Throw error if no contacts found after deduplication

3. **Prompt for Company Name** (Required)
   - Use `inputWithEscape` pattern
   - Cannot be left empty (validate: trim and check length > 0)
   - Format to PascalCase using `TextUtils.formatCompanyToPascalCase`
   - Handle ESC cancellation (throw `Error('User cancelled')`)

4. **Verify/Create Label from Company Name**
   - Fetch existing contact groups using `ContactEditor.fetchContactGroups()`
   - Check if a label with the company name already exists (case-insensitive match)
   - **If label exists:** Use existing label's resourceName
   - **If label does NOT exist:**
     - Display: `The company "${companyName}" does not exist as a Label in Google Contacts. Should we create this label? (y/n)`
     - Use `confirmWithEscape` pattern
     - If user answers 'y': Create label using `ContactEditor.createContactGroup(companyName)`, then fetch groups again to get resourceName
     - If user answers 'n' or ESC: throw `Error('User cancelled')` and exit gracefully
   - Store the label resourceName for sync

5. **Display Pre-Sync Confirmation**
   - Show confirmation prompt with label only (label value is also used as company name internally)
   - Format:
     ```
     ================================
     🏷️ Label: Vim
     ================================
     
     Proceed? (y/N)
     ```
   - Use emoji from `EMOJIS.FIELDS.LABEL`
   - **Note:** The label value (e.g., "Vim") is used for BOTH the label membership AND the company field in the contact
   - If user answers No or ESC: throw `Error('User cancelled')` and exit gracefully (same as LinkedIn sync)
   - Display message: "User cancelled operation" via uiLogger.displayWarning()
   - Only proceed to sync if user confirms with Yes

6. **Fetch Google Contacts Count**
   - Use status bar fetch phase
   - Display progress while fetching
   - Store count for summary

7. **Process Each Contact**
   - Match against existing contacts via `DuplicateDetector`
   - For uncertain matches: add to warning list (same as LinkedIn sync)
   - For existing matches: update contact (merge labels)
   - For new contacts: create contact
   - Apply testContactLimit if set (same as LinkedIn sync behavior)
   - Update status bar with current contact details
   - Handle cancellation (ESC/Ctrl+C)
   - Invalidate cache after each write
   - **Note:** Use the single label (company name) for all formatting and memberships

8. **Calculate Contact Count**
   - After sync completes, calculate: `contactsAfter = contactsBefore + status.new`
   - This is a **calculation**, not a verification with actual API fetch
   - Display calculated count in summary (same as LinkedIn sync)

9. **Display Summary**
   - Show formatted summary with statistics
   - Align format with LinkedIn sync

10. **Post-Sync Menu**
    - Display warnings (if any)
    - Display errors (if any)
    - Display skipped contacts (if any)
    - Back to main menu
    - Exit

**Cancellation Logic:**
- ESC key handler (same as LinkedIn sync)
- Ctrl+C (SIGINT) handler (same as LinkedIn sync)
- Graceful cancellation message (same as LinkedIn sync)
- Cleanup and restore console (same as LinkedIn sync)
- Cleanup raw mode (same as LinkedIn sync)
- Remove SIGINT handler on completion (same as LinkedIn sync)

**Console Capture:**
- Capture console.log and console.error (same as LinkedIn sync)
- Redirect to SyncLogger (same as LinkedIn sync)
- Filter spinner characters (same as LinkedIn sync)
- Restore original console on completion/error (same as LinkedIn sync)

**Resource Cleanup on Error:**
- Status bar cleanup
- Console restoration
- Raw mode cleanup
- SIGINT handler removal
- Same cleanup strategy as LinkedIn sync (lines 327-333, 390-393)

**Error Recovery:**
- API rate limiting handled by `retryWithBackoff` utility (same as LinkedIn sync)
- Network errors handled with exponential backoff (same as LinkedIn sync)
- Log all errors to SyncLogger (same as LinkedIn sync)

**Progress Bar Display** (reuse `SyncStatusBar`):

**Status Bar Type Compatibility:**
- Make `SyncStatusBar` generic to accept both `LinkedInConnection` and `HibobContact`
- Update type definition: `updateStatus(status: Partial<SyncStatus>, currentConnection?: LinkedInConnection | HibobContact, currentLabel?: string)`
- Adapt contact display logic to handle both types

Display format:
```
⠧ Time: 00:00:06 | Status: Stable
  Path: /Users/orassayag/Repos/events-and-people-syncer/code/sources/hibob.txt
  Processing: 000,112 / 009,042 | New: 000,000 | Up-To-Date: 000,111 | Updated: 000,001
  Error: 000,000 | Warning: 000,000 | Skipped: 000,000
  Current:
  -Full name: Maayan Katz Vim
  -Labels: Vim
  -Company: Vim
  -Email: maayank@getvim.com Vim
```

**LinkedIn Sync Display format (add file path line):**
```
⠧ Time: 00:00:06 | Status: Stable
  Path: /Users/orassayag/Repos/events-and-people-syncer/code/sources/Basic_LinkedInDataExport_03-11-2026.zip
  Processing: 000,112 / 009,042 | New: 000,000 | Up-To-Date: 000,111 | Updated: 000,001
  Error: 000,000 | Warning: 000,000 | Skipped: 000,000
  Current:
  -Full name: Maayan Katz Job Prologic Ltd.
  -Labels: Job
  -Company: Prologic Ltd.
  -Job Title: Talent Acquisition Manager
  -Email: (none) Job Prologic Ltd.
  -LinkedIn URL: https://www.linkedin.com/in/maayan-katz LinkedIn
```

**Summary Display Format:**

```
=================Hibob Sync Summary=================
========Hibob Contacts from File: 009,042=========
===========New: 000,000 | Processed: 009,042===========
=========Warning: 000,000 | UpToDate: 000,111==========
===========Skipped: 000,000 | Error: 000,001===========
============Google Contacts Before: 002,598============
============Google Contacts After: 002,598=============
=======================================================
```

### 6. Register Script in Scripts Index

**File:** `src/scripts/index.ts`

```typescript
import { hibobSyncScript } from './hibobSync';

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  'hibob-sync': hibobSyncScript,      // Position ABOVE linkedin-sync
  'linkedin-sync': linkedInSyncScript,
  'contacts-sync': contactsSyncScript,
  // ... rest
};
```

**Script Metadata:**
```typescript
export const hibobSyncScript: Script = {
  metadata: {
    name: 'Hibob Sync',
    description: 'Syncs Hibob contacts from text file to Google Contacts',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: true,
    estimatedDuration: '5-10 minutes',
    emoji: EMOJIS.SCRIPTS.HIBOB,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(HibobSyncScript);
    await script.run();
  },
};
```

### 7. Add Emoji Constant & Regex Patterns

**File:** `src/constants/emojis.ts`

```typescript
SCRIPTS: {
  DEFAULT: "📄",
  CONTACTS_SYNC: "🔄",
  EVENTS_JOBS: "📝",
  HIBOB: "📇",           // ADD THIS (card index emoji)
  LINKEDIN: "🔗",
  OTHER_CONTACTS: "🗄️ ",
  SMS_WHATSAPP: "💬",
  STATISTICS: "📊",
}
```

**File:** `src/regex/patterns.ts`

Add HiBob parsing patterns:

```typescript
export const HIBOB_PATTERNS = {
  // Match: "Name (email@domain.com)" - captures name and email
  NAME_WITH_PARENS_EMAIL: /^(.+?)\s*\(([^)]+@[^)]+)\)$/,
  
  // Match name with nickname and email: "Allen (Aaron) Jacobson (allenj@getvim.com)"
  // Captures: firstName, nickname (with parens preserved), lastName, email
  NAME_WITH_NICKNAME: /^(.+?)\s+(\([^)]+\))\s+(.+?)\s*\(([^)]+@[^)]+)\)$/,
  
  // Match: "Name email@domain.com" - captures name and email
  NAME_WITH_SPACE_EMAIL: /^(.+?)\s+([^\s]+@[^\s]+)$/,
  
  // Match email anywhere in string (fallback)
  EMAIL_IN_STRING: /([^\s]+@[^\s]+)/,
  
  // Normalize whitespace
  MULTIPLE_SPACES: /\s+/g,
};
```

### 8. Update Dependency Injection Container & SyncStatusBar

**File:** `src/di/container.ts`

```typescript
import { HibobExtractor } from '../services/hibob/hibobExtractor';
import { HibobContactSyncer } from '../services/hibob/contactSyncer';
import { HibobSyncScript } from '../scripts/hibobSync';

// Register services
container.bind(HibobExtractor).toSelf().inSingletonScope();
container.bind(HibobContactSyncer).toSelf().inSingletonScope();
container.bind(HibobSyncScript).toSelf();
```

**File:** `src/flow/syncStatusBar.ts`

Make `SyncStatusBar` use type discriminators to support both LinkedInConnection and HibobContact:

```typescript
// Update imports
import { LinkedInConnection, ContactType } from '../types/linkedin';
import { HibobContact } from '../types/hibob';

// Update class to accept union type
type SupportedContact = LinkedInConnection | HibobContact;

export class SyncStatusBar {
  private currentConnection: SupportedContact | null = null;
  private filePath: string = ''; // Add file path tracking
  
  updateStatus(
    status: Partial<SyncStatus>,
    currentConnection?: SupportedContact,
    currentLabel?: string
  ): void {
    // ... implementation
  }
  
  setFilePath(path: string): void {
    this.filePath = path;
  }
  
  // Update formatProcessStatus to handle both types using type discriminator
  private formatProcessStatus(): string {
    let output = `Time: ${this.formatTime()} | Status: ${this.apiStatus}\n`;
    
    // Add file path line for both sync types
    if (this.filePath) {
      output += `  Path: ${this.filePath}\n`;
    }
    
    // ... rest of status formatting
    
    if (this.currentConnection) {
      // Use type discriminator instead of runtime checking
      if (this.currentConnection.type === ContactType.LINKEDIN) {
        // LinkedInConnection - compile-time safe
        const conn = this.currentConnection as LinkedInConnection;
        // Display: Full name, Labels, Company, Job Title, Email, LinkedIn URL
        // ... existing LinkedIn formatting
      } else if (this.currentConnection.type === ContactType.HIBOB) {
        // HibobContact - compile-time safe
        const conn = this.currentConnection as HibobContact;
        // Display: Full name, Labels, Company, Email (simpler, no Job Title or LinkedIn URL)
        // ... HiBob formatting
      }
    }
  }
}
```

## Key Reusable Components

### From LinkedInSync

**Progress Bar Integration** (lines 127-143):
- Start fetch phase
- Hook into fetchAllContacts to track progress
- Complete fetch and display count
- Start process phase

**Status Update Loop** (lines 154-289):
- Process each contact
- Check for cancellation
- Match contacts
- Handle warnings/errors/skipped
- Update status bar
- Log activities

**Summary Display Method** (lines 395-478):
- Format numbers with leading zeros
- Align text with equals padding
- Display all statistics
- Maintain consistent width

**Post-Sync Menu** (lines 479-533):
- Dynamic menu based on status counts
- Display warnings/errors/skipped
- Navigation options (back/exit)
- ESC handling

**Connection Display** (lines 535-594):
- Display first 10 items
- Show remaining count
- Format contact details
- PascalCase company names

**Console Capture** (lines 347-388):
- Override console.log/error
- Filter spinner characters
- Redirect to logger
- Restore on completion

**Cancellation Handling** (lines 66-88):
- ESC key press detection
- Ctrl+C signal handling
- Prevent duplicate calls
- Cleanup raw mode

### From ContactEditor

**Label Prompt Pattern** (lines 1083-1132):
- Check for existing labels
- Create new label if none exist
- Multi-select with validation
- Require at least one selection

**Company Input Pattern:**
- Use `inputWithEscape`
- Text validation
- Format to PascalCase
- Allow empty or provide value

### From SyncStatusBar

**Progress Bar Display:**
- Time tracking with HH:MM:SS format
- API status indicator
- Multi-line status display
- Current contact details
- Spinner animation

**Phase Management:**
- Fetch phase for loading contacts
- Process phase for syncing
- Cancel/fail states
- Cleanup intervals

## Validation Rules Summary

### Contact Extraction

| Condition | Action |
|-----------|--------|
| Name + Email | ✅ Include (if not duplicate) |
| Name only | ✅ Include (if not duplicate) |
| Email only | ❌ Skip (emails alone not processed) |
| Neither | ❌ Skip |
| Duplicate | ❌ Skip |
| Invalid email | ⚠️ Extract contact, skip email during sync (validate in syncer only) |
| Malformed JSON object | ❌ Skip individual object, log ERROR, continue processing |
| Invalid entire JSON array | ❌ Skip that array, log ERROR, continue to next array |
| Multiple JSON arrays | ✅ Process each array separately, deduplicate across all |
| Text before/after JSON | ✅ Skip lines, log INFO per line |
|| UTF-8 BOM detected | ❌ Throw error, exit script |
|| UTF-16 BOM detected | ❌ Throw error, exit script |
|| Parsing failure in multi-entry line | ❌ Skip problematic entry, log INFO, continue to next entry |
|| Name-only matching email contact | ⚠️ Include contact, log WARNING about potential duplicate |
### Duplicate Detection

**Two-Pass Deduplication Strategy:**

**Pass 1: Email-Based Deduplication**
```typescript
// Build map of contacts with emails
const emailMap = new Map<string, HibobContact>();
const emailToNamesMap = new Map<string, string>(); // Track names for Pass 2

for (const contact of allContacts) {
  if (contact.email) {
    const key = `email:${contact.email.trim().toLowerCase()}`;
    if (!emailMap.has(key)) {
      emailMap.set(key, contact);
      const nameKey = `${contact.firstName.trim().toLowerCase()}|${contact.lastName?.trim().toLowerCase() || ''}`;
      emailToNamesMap.set(key, nameKey);
    } else {
      // Skip duplicate, log INFO: "Skipped duplicate: John Doe - matched by email:johndoe@test.com"
    }
  }
}
```

**Pass 2: Name-Based Cross-Check and Deduplication**
```typescript
// Check name-only contacts against email map
const nameOnlyContacts: HibobContact[] = [];
const nameMap = new Map<string, HibobContact>();

for (const contact of allContacts) {
  if (!contact.email) {
    const nameKey = `${contact.firstName.trim().toLowerCase()}|${contact.lastName?.trim().toLowerCase() || ''}`;
    
    // Check if this name matches any email-based contact
    let potentialDuplicate = false;
    for (const [emailKey, trackedName] of emailToNamesMap.entries()) {
      if (trackedName === nameKey) {
        // Log WARNING: "Contact 'John Doe' (name-only) might be duplicate of contact with email 'john@example.com'"
        potentialDuplicate = true;
        // Still include the contact (don't skip), just warn user for review
        break;
      }
    }
    
    // Deduplicate name-only contacts among themselves
    const key = `name:${nameKey}`;
    if (!nameMap.has(key)) {
      nameMap.set(key, contact);
      nameOnlyContacts.push(contact);
    } else {
      // Skip duplicate name-only, log INFO: "Skipped duplicate: Jane Smith - matched by name:jane|smith"
    }
  }
}

// Combine: email-based contacts + unique name-only contacts
return [...emailMap.values(), ...nameOnlyContacts];
```

**Key Formats:**
- Email-based: `email:johndoe@example.com`
- Name-based: `name:john|doe`

**Normalization:**
- Trim whitespace
- Convert to lowercase

**Detection Levels:**
1. Within simple format section
2. Within each JSON array section
3. Across all JSON arrays
4. Across simple format and all JSON arrays

**Policy:**
- Only the first occurrence is kept
- Subsequent duplicates are skipped
- Name-only contacts that match email-based contacts by name are included with WARNING
- Skipped duplicates are logged with details (which field matched, key format used)

**Logging:**
- Log to SyncLogger with INFO level for true duplicates (same as LinkedIn sync)
- Log with WARNING level for potential name/email conflicts
- Include details: which contact was kept vs. skipped, matched key
- Example: "Skipped duplicate: John Doe - matched by email:johndoe@test.com"
- Example: "Skipped duplicate: Jane Smith - matched by name:jane|smith"
- Example: "WARNING: Contact 'John Doe' (name-only) might be duplicate of contact with email 'john@example.com' - including both for user review"

### User Inputs

| Input | Requirement | Validation |
|-------|-------------|------------|
| Company | Required | Cannot be empty string; must be at least 2 characters; formatted to PascalCase |
| Label Creation | Conditional | If company name doesn't exist as label, user must confirm creation (y/n) |
| Pre-sync Confirmation | Required | User must confirm company name (which is also the label) before proceeding |

**Company Input:**
- Use `inputWithEscape` pattern
- If user presses ESC: throw `Error('User cancelled')` and exit gracefully
- Validation:
  - Cannot be empty or whitespace only
  - Must be at least 2 characters after trimming
- Format using `TextUtils.formatCompanyToPascalCase`

**Label Verification/Creation:**
- After company input, fetch existing labels using `ContactEditor.fetchContactGroups()`
- Check if label with company name exists (case-insensitive match)
- **If label exists:** Use existing label's resourceName, proceed to pre-sync confirmation
- **If label does NOT exist:**
  - Display: `The company "${companyName}" does not exist as a Label in Google Contacts. Should we create this label? (y/n)`
  - Use `confirmWithEscape` pattern
  - If user answers 'y': Create label, fetch groups again to get resourceName, proceed to pre-sync confirmation
  - If user answers 'n' or ESC: throw `Error('User cancelled')` and exit gracefully

**Pre-Sync Confirmation:**
- Display label only (label value is used internally for both label and company)
- Format:
  ```
  ================================
  🏷️ Label: Vim
  ================================
  
  Proceed? (y/N)
  ```
- Use emoji from `EMOJIS.FIELDS.LABEL`
- **Note:** The displayed label value (e.g., "Vim") is used for:
  - Label membership in Google Contacts
  - Company field value (internal, not shown in confirmation)
  - Name formatting: `firstName lastName label` (e.g., "Michael Lev Vim")
  - Email formatting: `email label` (e.g., "michaell@getvim.com Vim")
- If user answers No or ESC: throw `Error('User cancelled')` and exit gracefully (same as LinkedIn sync)
- Display message: "User cancelled operation" via uiLogger.displayWarning()
- Only proceed to sync if user confirms with Yes

## Testing Approach

### Test Cases

1. **File Validation**
   - Valid file path (cross-platform)
   - Invalid/missing file path
   - Empty file
   - File permission errors (read-only)
   - Windows paths (C:\..., \\UNC\...)
   - Unix paths (/home/..., ~/...)

2. **Format Parsing**
   - Simple format only
   - JSON format only
   - Mixed formats (simple + JSON)
   - Multiple JSON arrays
   - Text before first JSON array
   - Text after last JSON array
   - Text between JSON arrays
   - Malformed data (trailing commas, multiple spaces, etc.)
   - Names with nicknames in parentheses: "Allen (Aaron) Jacobson"
   - Invalid JSON structure (entire array)
   - Invalid JSON objects (individual items)
   - Multi-entry lines with parsing failures
   - Email as whitespace only in JSON
   - DisplayName with only first name (no surname)
   - Combined format: Simple format + multiple JSON arrays + text between them

3. **Duplicate Detection**
   - Duplicates within simple format
   - Duplicates within single JSON array
   - Duplicates across multiple JSON arrays
   - Duplicates across simple format and JSON
   - Case sensitivity handling
   - Email-based deduplication (Pass 1: email:xxx key format)
   - Name-based deduplication (Pass 2: name:xxx|yyy key format)
   - Name-only contacts matching email contacts by name (WARNING logged, both included)
   - Two-pass strategy: email first, then name cross-check

4. **Contact Validation**
   - Name + Email
   - Name only
   - Email only
   - Neither
   - Invalid email addresses (Zod schema validation in syncer)
   - Email with whitespace only
   - Compound names: Spanish double surnames (María García López)
   - Compound names: Hyphenated first names (Jean-Pierre)
   - Compound names: Apostrophes in names (O'Brien)
   - Compound names: Dutch particles (van der Berg)

5. **User Interaction**
   - Company input (required, minimum 2 characters)
   - Company input validation (empty, whitespace, too short)
   - Label verification (company name matches existing label)
   - Label creation prompt (if company doesn't exist as label)
   - Label creation confirmation (y/n)
   - Pre-sync confirmation
   - Cancellation (ESC/Ctrl+C) at each prompt
   - Pre-sync confirmation cancellation with proper message
   - Company name used as both company and label

6. **Sync Process**
   - New contacts
   - Existing contacts (merge labels)
   - Uncertain matches (warnings)
   - Errors
   - Progress bar updates
   - Cache invalidation after each write
   - testContactLimit behavior (applied to extracted contacts, same as LinkedIn)
   - Label merging API call success
   - Label merging API call failure (retry logic)

7. **Summary Display**
   - Statistics accuracy
   - Format alignment
   - Post-sync menu
   - Contact count verification (before vs. after)

8. **Special Characters & Encoding**
   - Names with special characters (Müller, Søren)
   - Hebrew/RTL names (handled with formatHebrewText, same as LinkedIn sync)
   - UTF-8 encoding (same as LinkedIn sync)
   - UTF-8 BOM detection at file start
   - UTF-16 BOM detection at file start (\uFFFE or \uFEFF00)
   - Emojis in names

9. **Biography Notes**
   - New contacts get "Added by people syncer (HiBob)" note with script identification
   - Updated contacts get "Updated by people syncer (HiBob)" note with script identification
   - Note date format verification
   - Script name properly identifies HiBob sync vs LinkedIn sync

10. **Regex Pattern Matching**
    - Test all patterns in declared order (ORDER MATTERS)
    - Verify NAME_WITH_NICKNAME matches correctly (MUST be tested first)
    - Verify NAME_WITH_PARENS_EMAIL matches correctly (tested second)
    - Verify NAME_WITH_SPACE_EMAIL matches correctly (tested third)
    - Test case proving order dependency: "Allen (Aaron) Jacobson (allenj@getvim.com)" must match NAME_WITH_NICKNAME
    - Test edge cases for each pattern

11. **Test Contact Limit**
    - testContactLimit exceeds extracted count
    - testContactLimit = 0 (should process all)
    - testContactLimit = null (should process all)

12. **Concurrency & Process Management**
    - Only one sync process allowed at a time (LinkedIn, HiBob, or other)
    - System prevents parallel sync execution
    - Proper error message if another sync is running

### Test Configuration

**File Path:**
```
/Users/orassayag/Repos/events-and-people-syncer/code/sources/hibob.txt
```

**Test Limit:**
- Use `testContactLimit` setting for limited testing
- Applied to contacts AFTER extraction and deduplication (slice the extracted array)
- Same behavior as LinkedIn sync lines 114-126: slice `extractedContacts` to `testContactLimit`
- Log shows: "TEST MODE: Limited to X contacts for testing" (where X = testContactLimit)
- Test with 10-20 contacts first
- Full run with all contacts

### Verification Checklist

**Phase 0:**
- [ ] Cross-platform path utilities created in `src/utils/pathValidator.ts`
- [ ] Path utilities handle Windows paths (drive letters, UNC)
- [ ] Path utilities handle Unix paths (absolute, relative, ~)
- [ ] Biography note functions updated with script name parameter
- [ ] LinkedIn sync updated to pass 'LinkedIn' as script name
- [ ] Contacts sync updated to pass appropriate script name
- [ ] SyncStatusBar updated with filePath property and display
- [ ] LinkedIn sync uses new file path display
- [ ] LinkedIn sync tested with file path in status bar and script identification
- [ ] ContactType enum created with HIBOB and LINKEDIN values
- [ ] LinkedInConnection interface updated with type discriminator
- [ ] HibobContact interface created with type discriminator

**File & Path Validation:**
- [ ] File validation throws appropriate errors
- [ ] File path uses cross-platform normalization
- [ ] File permission errors handled correctly
- [ ] File path displayed at start of sync
- [ ] File path displayed in status bar during sync

**Format Parsing:**
- [ ] Both simple and JSON formats parsed correctly
- [ ] Multiple JSON arrays processed independently
- [ ] Text before/after/between JSON arrays skipped with INFO logs
- [ ] Names with nicknames parsed correctly: "Allen (Aaron) Jacobson"
- [ ] Trailing commas ignored
- [ ] Multiple spaces normalized
- [ ] Multi-entry line parsing failures handled per entry
- [ ] Email whitespace-only treated as empty
- [ ] DisplayName with only first name handled

**Email & Validation:**
- [ ] Email validation performed in syncer only (NOT extractor)
- [ ] Invalid emails logged with contact context
- [ ] Malformed JSON objects skipped, valid ones processed
- [ ] Invalid entire JSON array skipped, next array processed
- [ ] UTF-8 BOM detection throws error
- [ ] UTF-16 BOM detection throws error

**Duplicate Detection:**
- [ ] Two-pass deduplication strategy implemented
- [ ] Pass 1: Email-based deduplication working (email:xxx)
- [ ] Pass 2: Name-based deduplication working (name:xxx|yyy)
- [ ] Name-only contacts checked against email contacts by name
- [ ] WARNING logged for potential name/email duplicates
- [ ] Both contacts included (not skipped) when name matches
- [ ] Duplicates removed within simple format
- [ ] Duplicates removed within each JSON array
- [ ] Duplicates removed across multiple JSON arrays
- [ ] Duplicates removed across simple format and JSON
- [ ] Different key prefixes prevent false matches

**Regex & Patterns:**
- [ ] Regex patterns defined in `src/regex/patterns.ts`
- [ ] All patterns tested independently
- [ ] Pattern matching order verified: NAME_WITH_NICKNAME first, then NAME_WITH_PARENS_EMAIL, then NAME_WITH_SPACE_EMAIL
- [ ] Test case proves order dependency
- [ ] Nickname parsing preserves parentheses
- [ ] Compound name test cases added (Spanish, hyphenated, apostrophes, Dutch)

**User Interaction:**
- [ ] Company prompt requires input (minimum 2 characters)
- [ ] Company input validates empty/whitespace/too short
- [ ] Company name formatted to PascalCase
- [ ] Label verification checks if company name exists as label (case-insensitive)
- [ ] Label creation prompt displayed if label doesn't exist
- [ ] Label creation confirmation works (y creates, n/ESC cancels)
- [ ] Pre-sync confirmation shows company name as both company and label with emojis
- [ ] Pre-sync confirmation cancellation throws Error('User cancelled')
- [ ] Pre-sync confirmation cancellation displays warning message
- [ ] ESC handling works at all prompts (company, label creation, pre-sync)

**Sync & Progress:**
- [ ] Progress bar updates in real-time
- [ ] Progress bar handles HibobContact type correctly using type discriminator
- [ ] SyncStatusBar uses ContactType enum for type checking
- [ ] Cancellation works with ESC and Ctrl+C at all stages
- [ ] Cache invalidated after each write
- [ ] Existing contacts have labels merged (not replaced)
- [ ] Label merging makes fresh API call to get memberships
- [ ] Label merging API failure handled with retry backoff
- [ ] No parallel sync processes running (documented)

**Biography & Notes:**
- [ ] Biography notes added to new contacts with script name: "Added by people syncer (HiBob)"
- [ ] Biography notes updated for existing contacts with script name: "Updated by people syncer (HiBob)"
- [ ] Note format includes script identification
- [ ] Different from LinkedIn which uses 'LinkedIn' as script name

**Display & Summary:**
- [ ] Contact count calculation after sync (contactsAfter = contactsBefore + status.new)
- [ ] Summary display matches LinkedIn sync format
- [ ] Post-sync menu shows correct counts
- [ ] Google Contacts created with correct data
- [ ] Warnings displayed for uncertain matches
- [ ] Errors logged appropriately to SyncLogger

**Testing & Limits:**
- [ ] testContactLimit applied after deduplication
- [ ] testContactLimit exceeding extracted count handled
- [ ] testContactLimit = 0 processes all contacts
- [ ] testContactLimit = null processes all contacts

**Cleanup & Error Handling:**
- [ ] Resource cleanup on error (console, raw mode, SIGINT handler)
- [ ] Hebrew/special characters detected and handled correctly (same as LinkedIn)
- [ ] UTF-8 BOM detection throws error
- [ ] UTF-16 BOM detection throws error
- [ ] File encoding issues handled
- [ ] Cross-platform path handling verified on Windows and Unix
- [ ] Compound names tested (Spanish, hyphenated, apostrophes, Dutch)
- [ ] Email domain validation documented as sufficient (format only)

## Implementation Order

**0. Phase 0: Cross-Platform Foundation & LinkedIn Enhancement (MUST BE DONE FIRST)**
   - Create `src/utils/pathValidator.ts` with cross-platform path handling
   - Add `isWindowsPath()` function
   - Add `validatePathPermissions()` function
   - Add `validateAndResolveFilePath()` function
   - Add `normalizePath()` function
   - Create ContactType enum in `src/types/` with HIBOB and LINKEDIN values
   - Update `src/types/linkedin.ts` to add `type: ContactType.LINKEDIN` discriminator field
   - Update `src/services/linkedin/noteParser.ts` to accept script name parameter
   - Add `scriptName` parameter to `buildNewContactNote()`, `buildUpdatedContactNote()`, and `determineNoteUpdate()`
   - Update `src/services/linkedin/contactSyncer.ts` to accept and pass script name
   - Update `src/scripts/linkedinSync.ts` to pass 'LinkedIn' as script name
   - Update any other sync scripts (contacts sync, etc.) to pass their script names
   - Update `SyncStatusBar` to support file path tracking and display
   - Add `setFilePath(path: string)` method
   - Update `formatProcessStatus()` to display file path
   - Update `SyncStatusBar` to use ContactType enum for type discrimination
   - Update `linkedinSync.ts` to use file path display
   - Test LinkedIn sync with new file path display and script identification
   - **VERIFY THIS PHASE WORKS BEFORE PROCEEDING TO HIBOB**

**1. Phase 1: Foundation**
   - Update settings.ts to add hibob section (use path.join for cross-platform paths)
   - Create type definitions in `src/types/hibob.ts` with ContactType.HIBOB discriminator
   - Add emoji constant (📇) to `src/constants/emojis.ts`
   - Add regex patterns to `src/regex/patterns.ts` (HIBOB_PATTERNS)
   - Document pattern matching order in comments

**2. Phase 2: Services**
   - Update SyncStatusBar to use ContactType enum for type discrimination (already done in Phase 0)
   - Create HibobExtractor (`src/services/hibob/hibobExtractor.ts`) with:
     - Cross-platform file path validation
     - UTF-8 and UTF-16 BOM detection
     - Multiple JSON array support
     - Text before/after/between JSON handling
     - Hebrew text detection and marking (same as LinkedIn)
     - Two-pass deduplication strategy (email first, then name cross-check)
     - Conditional duplicate key format (email: vs name:)
     - WARNING logging for name-only contacts matching email contacts
     - Multi-entry line error handling
     - Per-entry and per-line logging
     - Pattern matching in correct order (NAME_WITH_NICKNAME first)
   - Create HibobContactSyncer (`src/services/hibob/contactSyncer.ts`) with:
     - Add contact method passing 'HiBob' as script name
     - Update contact method with fresh API call for label merging
     - Cache invalidation after writes
     - Biography notes with script identification (buildNewContactNote(..., 'HiBob'))
     - Email validation in syncer only

**3. Phase 3: Script**
   - Create main HibobSyncScript (`src/scripts/hibobSync.ts`)
   - Implement execution flow:
     - Check no other sync process is running (documented requirement)
     - Cross-platform file path validation
     - File path display in status bar
     - Contact extraction with Hebrew detection and two-pass deduplication
     - Display warnings for potential name/email duplicate conflicts
     - Label selection
     - Company input
     - Pre-sync confirmation prompt with proper cancellation
     - Progress bar integration using ContactType enum
     - Contact processing with label merging (fresh API calls)
     - Contact count calculation
   - Add all cancellation handlers (same as LinkedIn sync)
   - Add console capture (same as LinkedIn sync)
   - Add resource cleanup (same as LinkedIn sync)

**4. Phase 4: Integration**
   - Register in scripts index (position above LinkedIn sync)
   - Update DI container (`src/di/container.ts`)
   - Test SyncStatusBar with both contact types
   - Verify cross-platform path handling

**5. Phase 5: Testing**
   - Test with limited contacts (testContactLimit)
   - Verify all parsing scenarios (nicknames, trailing commas, multiple arrays, etc.)
   - Verify regex pattern matching order (NAME_WITH_NICKNAME first, then others)
   - Test compound names (Spanish, hyphenated, apostrophes, Dutch particles)
   - Verify email validation in syncer only
   - Verify UTF-8 and UTF-16 BOM detection
   - Verify JSON error handling (per array, per object, per entry)
   - Verify two-pass deduplication strategy
   - Verify name-only contacts checked against email contacts
   - Verify WARNING logging for potential duplicates
   - Verify both contacts included (not skipped) when name matches
   - Verify label merging with fresh API calls
   - Verify pre-sync confirmation cancellation
   - Verify biography notes with script identification ('HiBob')
   - Verify SyncStatusBar uses ContactType enum correctly
   - Test full workflow
   - Verify summary display
   - Verify contact count matches
   - Test on Windows and Unix/macOS paths
   - Test Hebrew/RTL text handling (same as LinkedIn)
   - Verify no parallel sync processes (document user instructions)

## Success Criteria

**Phase 0 (Prerequisites):**
- ✅ Cross-platform path utilities created and tested
- ✅ ContactType enum created with HIBOB and LINKEDIN values
- ✅ Type discriminators added to LinkedInConnection and HibobContact interfaces
- ✅ Biography note functions updated with script name parameter
- ✅ LinkedIn sync updated to use script identification
- ✅ SyncStatusBar supports file path display
- ✅ SyncStatusBar uses ContactType enum for type discrimination
- ✅ LinkedIn sync displays file path in status bar
- ✅ Path handling works on Windows and Unix/macOS

**HiBob Sync:**
- ✅ Script appears in menu above LinkedIn Sync
- ✅ Uses 📇 emoji in menu display
- ✅ Displays file path at start of sync and in status bar
- ✅ Validates file path with cross-platform support
- ✅ Parses both simple and multiple JSON array formats
- ✅ Handles text before/after/between JSON arrays
- ✅ Handles names with nicknames: "Allen (Aaron) Jacobson"
- ✅ Regex pattern matching order correct (NAME_WITH_NICKNAME first)
- ✅ Compound names tested (Spanish, hyphenated, apostrophes, Dutch)
- ✅ Normalizes whitespace and ignores trailing commas
- ✅ Email validation performed in syncer only (not extractor)
- ✅ Hebrew/RTL text detected and handled in extractor (same as LinkedIn)
- ✅ UTF-8 BOM detection throws error
- ✅ UTF-16 BOM detection throws error
- ✅ Handles JSON errors (skip arrays/objects/entries, log appropriately)
- ✅ Two-pass deduplication strategy implemented
- ✅ Pass 1: Email-based deduplication using email:xxx format
- ✅ Pass 2: Name-based deduplication using name:xxx|yyy format
- ✅ Name-only contacts checked against email contacts by name
- ✅ WARNING logged for potential name/email duplicates
- ✅ Both contacts included (not skipped) when name matches email contact
- ✅ Uses email as primary deduplication key when available
- ✅ Prompts for required company name (minimum 2 characters)
- ✅ Validates company input (empty, whitespace, too short)
- ✅ Formats company name to PascalCase
- ✅ Verifies if company name exists as label in Google Contacts
- ✅ Prompts to create label if company doesn't exist as label
- ✅ Label creation confirmation works (y creates, n/ESC exits)
- ✅ Shows pre-sync confirmation with company name (used as both company and label)
- ✅ Pre-sync confirmation cancellation throws error and displays message
- ✅ Shows real-time progress with status bar
- ✅ Status bar handles HibobContact type correctly
- ✅ Syncs contacts to Google successfully
- ✅ Merges labels for existing contacts with fresh API call
- ✅ Label merging API failures handled with retry backoff
- ✅ Adds biography notes with script identification: "Added by people syncer (HiBob)"
- ✅ Updates biography notes with script identification: "Updated by people syncer (HiBob)"
- ✅ Biography notes distinguish HiBob sync from LinkedIn sync
- ✅ Invalidates cache after each write
- ✅ Calculates contact count after sync (arithmetic, not API fetch)
- ✅ Displays aligned summary matching LinkedIn sync
- ✅ Handles cancellation gracefully at all stages (company, label creation, pre-sync)
- ✅ Shows post-sync menu with counts
- ✅ SyncStatusBar uses ContactType enum for type checking
- ✅ Cleans up resources on error (console, raw mode, SIGINT)
- ✅ No duplicate contacts created in Google
- ✅ testContactLimit applied after deduplication
- ✅ testContactLimit edge cases handled (0, null, exceeds count)
- ✅ Regex patterns defined in constants with comprehensive tests
- ✅ Hebrew/special characters handled correctly (same as LinkedIn)
- ✅ Multi-entry line parsing errors handled per entry
- ✅ Email domain validation documented as sufficient (format only)
- ✅ Parallel sync prevention documented (user instructions)

## Post-Implementation Tasks

1. **Phase 0 Verification** (completed before HiBob work begins)
   - ✅ Cross-platform path utilities working on Windows and Unix
   - ✅ LinkedIn sync displays file path correctly
   
2. **HiBob Sync Verification**
   - Verify SyncStatusBar works with both contact types (LinkedInConnection | HibobContact)
   - Document new regex patterns in `src/regex/patterns.ts`
   - Verify label merging logic works correctly with fresh API calls (HiBob only)
   - Verify label merging handles API failures with retry backoff
   - Test nickname parsing with parentheses preserved: "(Aaron)"
   - Test emoji and special character handling in names
   - Test Hebrew/RTL text detection and formatting
   - Test multiple JSON arrays with deduplication across all
   - Test conditional duplicate key format (email: vs name:)
   - Test biography notes for new vs updated contacts
   - Verify cross-platform path handling on actual Windows and Unix systems

---

## Design Decisions & Edge Case Handling

This section documents all design decisions made during planning to address edge cases and ambiguities.

### Name Parsing

**Decision 1.1: displayName vs firstName Priority (JSON)**
- **Decision:** Use `displayName` field from JSON. If not present, fallback to `firstName + surname`
- **Rationale:** displayName represents how the person prefers to be called (e.g., "Joe" vs "Joseph")

**Decision 1.2: Nickname Handling (Simple Format)**
- **Example:** "Allen (Aaron) Jacobson (allenj@getvim.com)"
- **Decision:** firstName: "Allen", lastName: "(Aaron) Jacobson"
- **Rationale:** Preserve all name information; parentheses distinguish nickname from family name
- **Implementation:** Regex captures nickname WITH parentheses preserved: `(\([^)]+\))` captures "(Aaron)"

**Decision 1.3: Names Without Last Names**
- **Decision:** Keep same logic as LinkedIn sync - if no clear separation, treat as firstName only
- **Rationale:** Consistency with existing codebase patterns

### Email & Contact Validation

**Decision 2.0: Company Name Validation**
- **Decision:** Company name must be at least 2 characters after trimming, cannot be empty or whitespace-only
- **Implementation:**
  - Validate input: `trim().length >= 2`
  - Reject empty, whitespace-only, or single-character inputs
  - Display clear error message: "Company name must be at least 2 characters"
- **Rationale:** 
  - Prevents accidental single-letter typos
  - Ensures meaningful label names
  - Consistent with typical company name lengths

**Decision 2.1: Email Validation Location**
- **Decision:** Validate emails in syncer only (NOT during extraction)
- **Rationale:** 
  - Easier logging with full contact context
  - Extractor doesn't need email schema dependency
  - Same pattern as LinkedIn sync
  - Invalid emails can still be logged with contact name during sync

**Decision 2.2: Email-Only Contacts**
- **Decision:** Skip contacts with only email (no name)
- **Rationale:** HiBob sync requires at least a name; email-only entries are not processed

**Decision 2.3: Name-Only Contacts**
- **Decision:** Accept contacts with only name (no email)
- **Rationale:** Consistent with LinkedIn sync behavior

**Decision 2.4: Email Whitespace Handling**
- **Decision:** Treat whitespace-only email as empty (process by name only)
- **Rationale:** Whitespace is not a valid email; equivalent to missing email

### Text Parsing Edge Cases

**Decision 3.1: Names Without Emails (Mixed With Named Emails)**
- **Decision:** If entry has name, extract it; if entry has email, extract it
- **Rationale:** Maximize data extraction; each field is independent

**Decision 3.2: Trailing Commas**
- **Decision:** Ignore trailing commas
- **Rationale:** Common formatting artifact; doesn't represent data

**Decision 3.3: Multiple Spaces**
- **Decision:** Normalize to single space
- **Rationale:** Spacing inconsistencies shouldn't affect parsing

**Decision 3.4: Empty Lines**
- **Decision:** Ignore empty lines
- **Rationale:** No data to extract

**Decision 3.5: Multi-Line Entries**
- **Decision:** Each line is processed independently; no multi-line spanning
- **Rationale:** Simple line-by-line processing; if entry spans multiple lines, it's treated as incomplete

**Decision 3.6: Multi-Entry Line Parsing Failures**
- **Decision:** Parse each comma-separated entry independently; skip problematic entry and continue to next
- **Example:** `Valid Entry, Invalid Garbage, Another Valid Entry` → processes 1 and 3, skips 2
- **Logging:** Log INFO for each skipped entry with line number and position
- **Rationale:** Maximize successful imports; one bad entry shouldn't fail entire line

### JSON Error Handling

**Decision 4.1: File Structure**
- **Decision:** Support flexible structure:
  - Simple format section (optional)
  - One or more JSON arrays (optional)
  - Text before/after/between arrays: skip and log INFO
- **Rationale:** Real-world files may have mixed content and comments

**Decision 4.2: Multiple JSON Arrays**
- **Decision:** Treat each JSON array `[...]` as a separate section
- **Processing:** Parse each independently, deduplicate within and across all arrays
- **Logging:** Log INFO for each array found: "Processing JSON array #X with Y objects"
- **Rationale:** Users may have multiple exports concatenated; maximize data extraction
- **CHANGED FROM:** Previous plan to throw error on multiple arrays

**Decision 4.3: Entire JSON Array Parsing Failure**
- **Decision:** Skip that specific array, log ERROR, continue to next array
- **Rationale:** One corrupted array shouldn't fail entire import
- **CHANGED FROM:** Previous plan to throw error and exit

**Decision 4.4: Individual Malformed JSON Objects**
- **Decision:** Skip malformed object, log ERROR with array# and index, continue processing valid objects
- **Rationale:** Maximize successful imports; log skipped objects for review

**Decision 4.5: Text Before/After/Between JSON**
- **Decision:** Skip these lines, log INFO per skipped line
- **Rationale:** May contain comments or instructions; not contact data

**Decision 4.6: Missing Email in JSON Object**
- **Decision:** If `email` field is missing, empty string, or whitespace only, process by name only
- **Rationale:** Name is sufficient to create contact; email can be added later

**Decision 4.7: Missing Name Fields in JSON Object**
- **Decision:** If both `displayName` AND (`firstName`+`surname`) are missing, skip the object
- **Rationale:** At least one name is required to identify the contact

**Decision 4.8: UTF-8 BOM Detection**
- **Decision:** Check for `\uFEFF` at file start; if detected, throw error and exit
- **Rationale:** File encoding issue; user should save without BOM

**Decision 4.9: Partial/Truncated JSON**
- **Decision:** Parse what can be parsed from partial JSON (take what you can take), log WARNING
- **Rationale:** Maximize data extraction even if file is incomplete

**Decision 4.10: Special Characters and Emojis in Names**
- **Decision:** Include emojis and special characters in names (e.g., "John 👨‍💻 Doe", "Müller")
- **Rationale:** Modern names can include Unicode characters; preserve them

### Contact Syncing

**Decision 5.1: Cache Invalidation**
- **Decision:** Same as LinkedIn sync - invalidate after each write
- **Rationale:** Ensures duplicate detection works on fresh data throughout sync

**Decision 5.2: SyncStatusBar Type Compatibility**
- **Decision:** Make SyncStatusBar generic to accept `LinkedInConnection | HibobContact`
- **Rationale:** Reuse existing infrastructure without code duplication

**Decision 5.3: Company Name as Label**
- **Decision:** User enters company name once; company name IS the label name
- **Implementation:**
  - User inputs company name (formatted to PascalCase)
  - Fetch existing labels and check if company name exists as a label (case-insensitive)
  - If label exists: use existing label's resourceName
  - If label doesn't exist: prompt user to create it (y/n)
  - Use the same value for both company field and label membership
- **Rationale:** 
  - Simplifies UX - one input instead of two
  - HiBob data is for a single company, so label = company makes semantic sense
  - Reduces potential for user error (selecting wrong label for company)

**Decision 5.4: Label Merging for Existing Contacts (HiBob Sync ONLY)**
- **Decision:** Merge labels (existing + new) when contact already exists
- **Implementation:** 
  - Make FRESH API call using `people.get()` with `personFields: 'memberships'`
  - Extract `contactGroupMembership.contactGroupResourceName` from response
  - Compare existing resource names with the company-derived label (single label)
  - If label already exists: return `SyncStatusType.UP_TO_DATE`
  - If label doesn't exist: add it to memberships array, return `SyncStatusType.UPDATED`
- **Error Handling:** API failures handled by retryWithBackoff utility
- **Performance:** One extra read per existing contact; acceptable given retry protection
- **Scope:** This logic is ONLY implemented for HiBob sync, NOT for LinkedIn sync
- **Rationale:** Preserve existing labels; contacts can belong to multiple groups

**Decision 5.5: Biography Notes**
- **Decision:** 
  - For new contacts: Use `buildNewContactNote(new Date())` - same as LinkedIn sync
  - For updated contacts: Use `determineNoteUpdate(existingBiography, new Date())` - same as LinkedIn sync
- **Rationale:** 
  - Proper "Added by..." vs "Updated by..." note handling
  - Track when contact was synced
  - Consistent with LinkedIn sync patterns

### User Experience

**Decision 6.1: Pre-Sync Confirmation Display**
- **Decision:** Show confirmation prompt with label only (simpler than LinkedIn sync)
- **Format:**
  ```
  ================================
  🏷️ Label: Vim
  ================================
  
  Proceed? (y/N)
  ```
- **Internal Usage:** The label value ("Vim") is used for:
  - Label membership assignment
  - Company field value (internal, not displayed in confirmation)
  - Name formatting: `firstName lastName label` (NOT `firstName lastName label company`)
  - Email formatting: `email label` (NOT `email label company`)
- **Difference from LinkedIn:**
  - LinkedIn: Shows both company and label, uses `lastName label company` format
  - HiBob: Shows only label, uses `lastName label` format (single value, no duplication)
- **Cancellation Handling:**
  - If user answers No or ESC: throw `Error('User cancelled')`
  - Catch error in main run() method
  - Display message: "User cancelled operation" via uiLogger.displayWarning()
  - Exit gracefully (same pattern as LinkedIn sync)
- **Rationale:** 
  - Simpler UX - label value serves dual purpose
  - User verifies critical parameter before expensive API operations
  - Cleaner contact names without redundant company suffix

**Decision 6.2: Label Creation Confirmation**
- **Decision:** If company name doesn't exist as a label, prompt user to create it
- **Format:**
  ```
  The company "Vim" does not exist as a Label in Google Contacts. Should we create this label? (y/n)
  ```
- **Cancellation Handling:**
  - If user answers 'y': Create label via ContactEditor.createContactGroup(), proceed to pre-sync confirmation
  - If user answers 'n' or ESC: throw `Error('User cancelled')`, exit gracefully
- **Rationale:** 
  - Prevents accidental label creation
  - User maintains control over Google Contacts structure
  - Explicit confirmation before making changes

**Decision 6.3: File Path Display**
- **Decision:** Display file path in status bar during sync (not just at start)
- **Location:** Add "Path:" line to status bar display, appears on every status update
- **Implementation Order:** 
  1. Implement first for LinkedIn sync (to establish pattern)
  2. Then reuse for HiBob sync
- **Display Format:**
  ```
  ⠧ Time: 00:00:06 | Status: Stable
    Path: /path/to/file
    Processing: ...
  ```
- **Rationale:** User confirms correct file is being processed throughout sync

**Decision 6.4: Contact Count Calculation**
- **Decision:** Calculate `contactsAfter = contactsBefore + status.new` (no API fetch verification)
- **Implementation:** Same as LinkedIn sync line 293 - simple arithmetic calculation
- **Rationale:** Avoid extra API call; calculation sufficient for display purposes

**Decision 6.5: Cancellation Handling**
- **Decision:** Same as LinkedIn sync for all cancellation scenarios
- **Rationale:** Consistent UX; proven implementation

**Decision 6.6: Error Recovery**
- **Decision:** Same as LinkedIn sync (retryWithBackoff, exponential backoff)
- **Rationale:** Proven robust error handling

### Testing & Configuration

**Decision 7.1: testContactLimit Application**
- **Decision:** Apply after extraction and deduplication by slicing the extracted contacts array
- **Implementation:** `contactsToProcess = testLimit ? extractedContacts.slice(0, testLimit) : extractedContacts`
- **Edge Cases:**
  - If testLimit > extracted count: processes all (slice handles gracefully)
  - If testLimit = 0: processes all contacts (falsy value, uses extractedContacts)
  - If testLimit = null: processes all contacts (explicit setting)
- **Logging:** "TEST MODE: Processing X of Y contacts (limit set in settings)"
- **Same as LinkedIn sync lines 114-126**
- **Rationale:** Test actual sync process, not parsing process

**Decision 7.2: Regex Patterns Location**
- **Decision:** Define all HiBob parsing patterns in `src/regex/patterns.ts`
- **Testing:** Add comprehensive tests for all patterns, verify order independence
- **Rationale:** Centralized pattern management; testable and reusable

**Decision 7.3: Special Characters & Encoding**
- **Decision:** Handle UTF-8, Hebrew, special characters, emojis same as LinkedIn sync
- **Include:** Emojis (👨‍💻), special characters (Müller, Søren), Hebrew/RTL names
- **Detection:** Add Hebrew detection step in HibobExtractor (similar to LinkedIn sync)
- **Display:** Use `formatHebrewText` utility for RTL display in status bar and logs
- **BOM Handling:** Check for `\uFEFF` at file start; throw error if detected
- **Rationale:** Consistent international character support

**Decision 7.4: Cross-Platform Path Handling**
- **Decision:** Use path utilities from `pathValidator.ts` for all file paths
- **Implementation:** Port logic from `/Users/orassayag/Repos/folders-cleaner` project
- **Support:** Windows paths (C:\, \\UNC), Unix paths (/home, ~)
- **Application:** Apply to ALL path parameters in settings (LinkedIn, HiBob, etc.)
- **Rationale:** Ensure codebase works across different operating systems

### Logging & Debugging

**Decision 8.1: Duplicate Skip Logging**
- **Decision:** Log to SyncLogger with INFO level, include details (which field matched)
- **Rationale:** Same as LinkedIn sync; aids debugging without cluttering errors

**Decision 8.2: Resource Cleanup**
- **Decision:** Same cleanup as LinkedIn sync (console, raw mode, SIGINT handlers)
- **Rationale:** Prevent terminal corruption on error/cancellation

### Concurrency & File Access

**Decision 9.1: Single Process Execution**
- **Decision:** Only one sync process runs at a time (no concurrent execution)
- **Rationale:** Prevents race conditions with cache invalidation and file access

**Decision 9.2: File Size & Memory**
- **Decision:** Load entire file into memory (no streaming/pagination)
- **Current File:** 3560 lines with JSON objects (~reasonable size)
- **Rationale:** Simplifies parsing logic; file size manageable for modern systems

**Decision 9.3: File Modification During Sync**
- **Decision:** No file locking; assume file is not modified during sync
- **Rationale:** Single-user tool; risk is low; complexity not warranted

### Duplicate Detection Key Construction

**Decision 10.1: Conditional Key Format Implementation**
- **Decision:** Use conditional key format to prevent false matches between email-based and name-based duplicates
- **Code Implementation:** See "Duplicate Detection" section above for full two-pass implementation
- **Key Formats:**
  - Email-based: `email:johndoe@example.com`
  - Name-based: `name:john|doe`
- **Benefits:**
  - Prevents collision between name-based and email-based keys
  - Clear semantic meaning of each key type
  - Easy to debug (key prefix shows matching strategy)
- **Rationale:** Option 2 from analysis; provides clarity and prevents edge case bugs

**Decision 10.2: Two-Pass Deduplication Strategy**
- **Decision:** Implement two-pass deduplication to handle email vs name-only edge cases
- **Pass 1:** Deduplicate all contacts with emails using email as primary key
  - Track names associated with each email for Pass 2 cross-check
- **Pass 2:** Process name-only contacts
  - Check if name matches any email-based contact's name
  - If match found: log WARNING but include both contacts (user review needed)
  - Deduplicate name-only contacts among themselves
- **Rationale:**
  - Prevents false negatives: "John Doe john@example.com" and "John Doe" (no email) might be same person
  - Safer to include with warning than to skip automatically
  - User can manually review WARNING entries and remove duplicates if needed
  - Email is most reliable identifier, names are ambiguous

### Type Discriminators

**Decision 11.1: Use Enum-Based Type Field Instead of Runtime Checking**
- **Decision:** Add `type` field (enum) to LinkedInConnection and HibobContact interfaces
- **Implementation:**
  ```typescript
  export enum ContactType {
    HIBOB = 'hibob',
    LINKEDIN = 'linkedin',
  }
  
  export interface HibobContact {
    type: ContactType.HIBOB;
    // ... other fields
  }
  
  export interface LinkedInConnection {
    type: ContactType.LINKEDIN;
    // ... other fields
  }
  ```
- **Usage in SyncStatusBar:**
  ```typescript
  if (this.currentConnection.type === ContactType.LINKEDIN) {
    // TypeScript knows this is LinkedInConnection
  } else if (this.currentConnection.type === ContactType.HIBOB) {
    // TypeScript knows this is HibobContact
  }
  ```
- **Benefits:**
  - Compile-time type safety
  - No runtime field checking ('position' in object)
  - Explicit and maintainable
  - Easier to add new contact types in future
- **Rationale:** Runtime checking with `'position' in connection` is fragile and breaks if field names change

### File Encoding

**Decision 4.11: UTF-16 BOM Detection**
- **Decision:** Check for UTF-16 BOM in addition to UTF-8 BOM
- **Implementation:**
  ```typescript
  // Check for UTF-8 BOM
  if (fileContent.startsWith('\uFEFF')) {
    throw new Error('File contains UTF-8 BOM. Please save as UTF-8 without BOM.');
  }
  
  // Check for UTF-16 BOM (both LE and BE)
  if (fileContent.startsWith('\uFFFE') || fileContent.startsWith('\uFEFF\u0000')) {
    throw new Error('File contains UTF-16 BOM. Please save as UTF-8 without BOM.');
  }
  ```
- **Rationale:**
  - UTF-16 files can cause parsing errors
  - Better to fail fast with clear error message
  - User can resave file with correct encoding

### Name Parsing

**Decision 1.4: Compound Name Handling Limitations**
- **Decision:** Document limitations for compound names
- **Supported:**
  - Simple names: "John Doe"
  - Nicknames: "Allen (Aaron) Jacobson"
  - Email extraction for all formats
- **Limitations (Document Only):**
  - Spanish double surnames: "María García López" → firstName: "María García", lastName: "López" (acceptable)
  - Hyphenated first names: "Jean-Pierre Dubois" → firstName: "Jean-Pierre", lastName: "Dubois" (works correctly)
  - Apostrophes: "O'Brien" → works correctly as single token
  - Dutch particles: "van der Berg" → firstName: "van der", lastName: "Berg" (acceptable)
- **Test Cases:** Add test cases for all compound name patterns to verify behavior
- **Rationale:**
  - Complex name parsing requires NLP or specialized libraries
  - Current simple split logic is sufficient for most cases
  - Edge cases are acceptable given HiBob context (company employees)
  - Document limitations rather than over-engineer solution

### Email Domain Validation

**Decision 9.4: Email Domain Validation Approach**
- **Decision:** Current email validation logic (format only) is sufficient
- **Not Implemented:**
  - Disposable email domain blocking
  - Company domain whitelist checking
  - Domain typo detection (e.g., @getvom.com vs @getvim.com)
- **Rationale:**
  - HiBob data comes from trusted company source
  - Domain issues are rare in employee data
  - Over-validation could reject valid emails
  - User can manually review if suspicious emails detected
- **Note:** If domain validation becomes needed, add as future enhancement

### Concurrency Control

**Decision 9.5: Single Sync Process Enforcement**
- **Decision:** Only one sync process (LinkedIn, HiBob, etc.) allowed at a time
- **Enforcement:** Application-level check (not file-based lock)
- **Implementation:**
  - No parallel sync prevention mechanism (relies on user behavior)
  - User should not run multiple sync scripts simultaneously
  - Document in user instructions: "Do not run multiple sync processes concurrently"
- **Rationale:**
  - Risk of concurrent execution is low (single-user tool)
  - Cache invalidation and file access conflicts prevented by user discipline
  - Complexity of file locking not warranted for current use case
  - If concurrent execution becomes an issue, can add file-based locking later

### Out of Scope

The following features were explicitly decided as not needed:

- ❌ File backup before processing
- ❌ Dry-run mode (use testContactLimit instead)
- ❌ Validation-only mode
- ❌ Dynamic rate limiting adjustment (use fixed writeDelayMs)
- ❌ Multi-line name parsing (process line-by-line only)
- ❌ File locking/concurrent modification detection
- ❌ Streaming/pagination for large files

---

## References

### Key Files Referenced

- `src/scripts/linkedinSync.ts` - Main reference implementation
- `src/services/linkedin/contactSyncer.ts` - Contact creation/update patterns
- `src/services/contacts/contactEditor.ts` - Label prompt patterns (lines 1083-1132)
- `src/flow/syncStatusBar.ts` - Progress bar implementation
- `src/logging/syncLogger.ts` - Logging patterns
- `src/services/contacts/duplicateDetector.ts` - Duplicate detection logic
- `src/utils/textUtils.ts` - Text formatting utilities

### Key Patterns to Reuse

1. **Console Capture** (linkedinSync.ts lines 347-388)
2. **Cancellation Handling** (linkedinSync.ts lines 66-88)
3. **Progress Bar Integration** (linkedinSync.ts lines 127-143)
4. **Summary Display** (linkedinSync.ts lines 395-478)
5. **Post-Sync Menu** (linkedinSync.ts lines 479-533)
6. **Cache Invalidation** (contactSyncer.ts lines 116, 311)
7. **Label Merging** (to be implemented based on contactEditor patterns)

---

## Plan Update Summary

**Latest Changes Applied:**

1. ✅ **Two-Pass Deduplication** - Email-based first, then name cross-checking with WARNING logs
2. ✅ **UTF-16 BOM Detection** - Added alongside UTF-8 BOM detection
3. ✅ **Regex Pattern Order** - Explicitly documented NAME_WITH_NICKNAME must be tested first
4. ✅ **Biography Script Identification** - Added script name parameter ('HiBob', 'LinkedIn', etc.)
5. ✅ **Type Discriminators** - Using ContactType enum instead of runtime field checking
6. ✅ **Compound Name Test Cases** - Spanish, hyphenated, apostrophes, Dutch particles
7. ✅ **Parallel Sync Prevention** - Documented as user responsibility (no file locking)
8. ✅ **Hebrew Label Handling** - Same as LinkedIn sync (no special treatment)
9. ✅ **Email Domain Validation** - Documented as sufficient (format only, no domain checks)
10. ✅ **New Design Decisions** - Added Decisions 10.2, 11.1, 4.11, 1.4, 9.4, 9.5

**Phase 0 Enhancements:**
- Biography note functions now include script identification
- ContactType enum for type-safe discrimination
- SyncStatusBar enhanced for both file path display and type discrimination
- All changes must be tested with LinkedIn sync before proceeding to HiBob

**Implementation Ready:** Plan is comprehensive and addresses all identified gaps and edge cases.

