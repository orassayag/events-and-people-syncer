# Events & Jobs Sync Script - Implementation Plan (v5)

## Version History

- **v1**: Initial plan
- **v2**: Updated plan addressing all review feedback and architectural improvements
- **v3**: Critical fixes based on deep technical review
- **v4**: Final refinements based on comprehensive review feedback
- **v5**: Edge cases and validation improvements based on comprehensive review

### Key Improvements in v5 (Edge Cases & Validation)

1. **Life Event Label Inference Clarification**: When multiple words from folder name exist as labels, use first match found
2. **Single-User Scope**: Script designed for single local user only (no concurrent access handling needed)
3. **Folder Name Whitespace Trimming**: Always trim leading/trailing whitespace from folder names
4. **Counter Edge Case**: Document behavior when `notes_DDMMYYYY-0.txt` exists (max+1 still applies, counter can start at 0)
5. **Pre-populated Field Clearing**: User can clear pre-populated fields in ContactEditor (fields become optional when pre-populated)
6. **API Retry Strategy**: Use existing retry service from LinkedInScript for all API calls
7. **Date Format Consistency Tests**: Add tests to ensure both date formatters use same underlying date
8. **Menu State Validation**: Validate that "Add contact" is only enabled when folder was selected in current session
9. **Folder Deletion ENOENT Handling**: Handle case where folder is deleted externally before note creation
10. **Symlink Behavior**: Follow symlinks to their targets (same as reading regular directories)
11. **Timezone During Execution**: Document that timezone changes during execution affect subsequent operations
12. **Reserved OS Filenames**: Validate against Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`)
13. **Note Content Binary Validation**: Reject note content containing null bytes or binary data
14. **English-Only Support**: Document that script supports English language only
15. **Logging Policy**: Log all actions except note content (folder names logged, note content never logged)
16. **Folder Parsing Centralization**: All folder parsing logic centralized in FolderManager service
17. **EventsContactEditor Subclass**: Create subclass instead of modifying ContactEditor to avoid regression risk

### Key Improvements in v4 (Final Refinements)

1. **Date Formatting Fixed**: New utility `formatDateDDMMYYYYCompact()` returns format without slashes for filenames
2. **ContactEditor Pre-population Clarified**: Pre-populated fields shown as defaults (user can override), with skip logic detailed
3. **Contact Groups Caching**: Cache contact groups at script level, update cache when creating new labels
4. **Life Event Label Persistence**: For existing folders, check Google Contacts to infer which word is the label
5. **Timezone Documentation**: Added notes about system time behavior and timezone handling
6. **Case-Insensitive Folder Duplicate Detection**: Check for duplicates case-insensitively before folder creation
7. **Mixed Counter Format Clarification**: Files with mixed formats (with/without counter) will have counter continue from max
8. **Windows Hidden Files Support**: Filter common Windows junk files (`Thumbs.db`, `desktop.ini`) in addition to dot-files
9. **Parent Directory ENOENT Handling**: Handle case where parent directory gets deleted during script execution
10. **Note Content Max Length**: Enforce 1MB limit (~1,048,576 characters) on note content
11. **Settings Structure Updated**: Reference existing `companyFoldersPath` under `linkedin` config
12. **Setup Documentation Added**: Prerequisites documented including required labels and folder structure
13. **Fuzzy Match Threshold Documented**: Using 0.1 initially, to be tested with real data
14. **LabelResolver Service Extracted**: New service for label resolution logic with caching
15. **Menu Options as Enum**: Menu choices defined as enum for type safety
16. **Script State Machine**: State tracking improved with clear enum definitions
17. **Stats Counter Added**: `renamedFolders` added to stats tracking
18. **Additional Test Scenarios**: Unicode/emoji, very long paths, symlinks, concurrent ops tested
19. **Empty Object Test**: ContactEditor tested with empty object `{}` for backward compatibility
20. **Folder Rename Impact**: Documented that folder renames do not affect existing contacts
21. **API Rate Limiting**: Use existing retry with backoff pattern from LinkedIn script
22. **Path Length Validation**: Enforce OS path limits (typically 255 chars) on folder names

### Key Improvements in v2

1. **ContactEditor Integration**: Modified to accept pre-populated label and company data
2. **Zod Schema Validation Added**: New schema file for cache data validation
3. **Folder Parsing Logic Clarified**: Explicit regex patterns for Job/HR vs Life Events
4. **Cache Update Strategy**: Immediate cache invalidation when folders created/deleted
5. **--no-cache Flag Aligned**: Implementation matches LinkedInSyncScript pattern
6. **Summary Formatting Fixed**: Uses FormatUtils.padLineWithEquals
7. **Comprehensive Logging Added**: All major actions logged
8. **Delete Operations Added**: Delete last note and delete empty folder features
9. **Rewrite Note Feature Added**: Overwrite existing note content
10. **Testing Strategy Detailed**: Specific test cases and mock patterns defined

## Overview

Build a new CLI script that allows users to create timestamped note files in either job-interview or life-event folders, with fuzzy matching for folder selection and integration with the existing contact management system. Supports pre-populating contact label and company from selected folder.

**Important Context**: This script is designed for **single-user, local-only use**. Only one instance of the script runs at a time (the user themselves), so no concurrent access handling or file locking is required.

## Architecture

### Script Structure

Following the pattern of `ContactsSyncScript`:

- Main script class: `EventsJobsSyncScript` in `src/scripts/eventsJobsSync.ts`
- Metadata with emoji, description, category: 'interactive', requiresAuth: conditional
- Stats tracking: `jobNotes`, `lifeEventNotes`, `contacts`, `deletedNotes`, `deletedFolders`, `renamedFolders`
- Signal handlers for graceful shutdown (Ctrl+C)
- Console capture via `SyncLogger`
- Comprehensive logging for all major actions (similar to ContactsSyncScript)
- State machine for tracking script state: `ScriptState` enum (IDLE, NOTE_CREATED, FOLDER_SELECTED)

### Core Components to Build

#### 1. EventsJobsSyncScript (Main Orchestrator)

- **Path**: `src/scripts/eventsJobsSync.ts`
- Follows ContactsSyncScript pattern: `run()` → validate → loop
- Main flow: validate paths → check --no-cache → sync caches → note creation loop → contact creation → summary
- Stats: `{ jobNotes: 0, lifeEventNotes: 0, contacts: 0, deletedNotes: 0, deletedFolders: 0, renamedFolders: 0 }`
- Script state: Uses `ScriptState` enum to track current state (IDLE, NOTE_CREATED, FOLDER_SELECTED)
- Contact groups cache: Stores fetched contact groups at script level to avoid repeated API calls

#### 2. FolderCache (New Cache Service)

- **Path**: `src/cache/folderCache.ts`
- **Singleton pattern** using `getInstance()` (following `ContactCache` pattern, not DI)
- File: `sources/.cache/folder-mappings.json`
- Data: `{ timestamp, jobFolders: FolderMapping[], lifeEventFolders: FolderMapping[] }`
- FolderMapping: `{ name, path, type: FolderType, label: string, companyName?: string }`
- TTL: 24h (from VALIDATION_CONSTANTS.CACHE.TTL_MS)
- Methods: `getInstance()`, `get()`, `set()`, `invalidate()`
- Scans both `companyFoldersPath` (job-interviews) and `lifeEventsPath`
- **Cache is updated immediately** when new folder is created

#### 3. FolderMatcher (Fuzzy Matching Service)

- **Path**: `src/services/folders/folderMatcher.ts`
- Uses Fuse.js like `DuplicateDetector.checkDuplicateName()`
- Config: `threshold: 0.1`, `keys: ['name']`, `includeScore: true`
- Methods:
  - `searchFolders(input: string, folders: FolderMapping[]): FolderMatch[]`
  - `findExactMatch(input: string, folders: FolderMapping[]): FolderMapping | null` (case-insensitive)
- Returns: `FolderMatch[] = { folder: FolderMapping, score: number }[]`

#### 4. NoteWriter (File Creation Service)

- **Path**: `src/services/notes/noteWriter.ts`
- Methods:
  - `getNextFileName(folderPath: string, date: Date): string` - generates `notes_DDMMYYYY-N.txt`
  - `writeNote(folderPath: string, content: string, date: Date): Promise<string>` - returns created file path
  - `deleteNote(filePath: string): Promise<void>` - deletes a specific note file, handles ENOENT gracefully
  - `listNotes(folderPath: string): Promise<string[]>` - returns list of note files in folder
  - `rewriteNote(filePath: string, content: string): Promise<void>` - overwrites existing note
- Counter logic: 
  - **Only match files with counter**: Use regex `/notes_\d{8}-\d+\.txt$/` to match `notes_DDMMYYYY-N.txt`
  - Ignore files without counter (e.g., `notes_15032026.txt`)
  - Find max N from all matched files, use N+1 (ignoring gaps in sequence)
  - **Counter can start at 0**: If `notes_15032026-0.txt` exists, next file is `notes_15032026-1.txt` (max+1 logic applies)
  - Example: files 0, 1, 3, 5 exist → next is 6
  - Example: only file 0 exists → next is 1
  - **Mixed format handling**: If both `notes_15032026.txt` and `notes_15032026-1.txt` exist, next will be `notes_15032026-2.txt`
- **Handles "future date" files**: If files exist with dates ahead of system time, warn but continue
- **Uses system local time**: Document this behavior in code comments (timezone-aware, uses local system timezone)
- **Timezone behavior**: All date operations use system local timezone; if timezone changes between runs, dates reflect new timezone; if timezone changes **during** script execution, subsequent operations use new timezone
- Uses new utility `formatDateDDMMYYYYCompact()` from `src/utils/dateFormatter.ts` for filename date formatting (returns `DDMMYYYY` without slashes)
- Uses `fs.readdir()`, regex to match pattern, `fs.writeFile()`, `fs.unlink()` to manage notes
- **Note content validation**: 
  - Max 1MB (~1,048,576 characters) enforced before writing
  - **Binary data rejection**: Reject content containing null bytes (`\0`) or other binary data
  - Check for null bytes: `if (content.includes('\0')) throw new Error('Note content cannot contain binary data')`
- **ENOENT handling**: If folder is deleted externally before note creation, throw clear error: "Folder no longer exists: [folderPath]"

#### 5. PathValidator (Startup Validation)

- **Path**: `src/validators/pathValidator.ts`
- Methods:
  - `validatePathsExist(paths: string[]): Promise<{ path: string, exists: boolean, isDirectory: boolean }[]>` - returns validation results
  - `validateWritable(path: string): Promise<boolean>` - throws error if not writable
  - `validateReadable(path: string): Promise<boolean>` - throws error if not readable
- Checks: 
  - Existence via `fs.access()`
  - Type check via `fs.stat()` - verify path is directory (not file)
  - Write permissions via `fs.constants.W_OK` - throw error if not writable
  - Read permissions via `fs.constants.R_OK` - throw error if not readable

#### 6. FolderManager (Folder Operations Service)

- **Path**: `src/services/folders/folderManager.ts`
- **Centralizes ALL folder parsing logic** - no parsing happens elsewhere
- Methods:
  - `createFolder(basePath: string, folderName: string, type: FolderType): Promise<string>` - creates folder and returns path
  - `validateFolderName(name: string, type: FolderType): string | true` - validates folder name for filesystem compatibility
  - `parseFolderName(folderName: string, type: FolderType): { label: string, companyName?: string }` - extracts label and company (SINGLE SOURCE OF TRUTH for parsing)
  - `deleteEmptyFolder(folderPath: string): Promise<boolean>` - deletes folder if empty (ignoring hidden files), returns true if deleted
  - `renameFolder(oldPath: string, newPath: string): Promise<void>` - renames folder with validation
  - `checkFolderExists(folderName: string, basePath: string): boolean` - case-insensitive duplicate check
  - `trimFolderName(name: string): string` - trims leading/trailing whitespace
- Folder name validation: 
  - **Always trim leading/trailing whitespace** before any processing
  - Checks for illegal filesystem characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
  - Validates folder name format (no emojis, basic ASCII validation)
  - **Path length validation**: Enforce OS path limits (~255 characters for full path)
  - **Unicode/emoji detection**: Reject folder names containing emojis or problematic Unicode characters
  - **Reserved OS filenames**: Reject Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`, `COM2`, ..., `COM9`, `LPT1`, `LPT2`, ..., `LPT9`) case-insensitively
- Parsing logic (CENTRALIZED HERE):
  - Job/HR: `Job_Microsoft` → label: "Job", company: "Microsoft"
  - Life Event: `Alex Z OSR` → Extract all words, user selects which word is the label
- Empty folder check: Filters out hidden files (starting with `.` like `.DS_Store`) and common Windows junk files (`Thumbs.db`, `desktop.ini`)
- **Case-insensitive duplicate detection**: Before creating folder, check if any existing folder matches case-insensitively

#### 7. LabelResolver (Label Resolution Service) - NEW

- **Path**: `src/services/labels/labelResolver.ts`
- Handles all label resolution and creation logic
- Methods:
  - `resolveLabel(labelName: string, required: boolean, contactGroups: ContactGroup[]): Promise<{ resourceName: string, created: boolean }>` - resolves label string to resourceName
  - `inferLabelFromExisting(folderName: string, contactGroups: ContactGroup[]): string | null` - for existing life event folders, infers which word is the label by checking which exists in Google Contacts
    - **Multiple matches behavior**: If multiple words exist as labels, use **first match found** (left-to-right order)
    - Example: "Alex Z OSR" where both "Alex" and "OSR" exist → returns "Alex" (first match)
- Logic:
  - For required labels (Job/HR): throw error if not found
  - For optional labels (life events): prompt user to create if missing
  - Returns resourceName and whether label was newly created
  - Uses retry with backoff pattern (from LinkedInScript) - reference existing retry service implementation
- Injected into EventsJobsSyncScript via DI

### Configuration Changes

#### settings.ts Updates

Add to `Settings` interface and `SETTINGS` object:

```typescript
eventsJobsSync: {
  companyFoldersPath: string; // Reference SETTINGS.linkedin.companyFoldersPath
  lifeEventsPath: string; // join(__dirname, '..', '..', 'dummy', 'life-events')
}
```

**Implementation**:
```typescript
eventsJobsSync: {
  companyFoldersPath: SETTINGS.linkedin.companyFoldersPath, // Reference existing path
  lifeEventsPath: join(__dirname, '..', '..', 'dummy', 'life-events'),
}
```

**Date Formatting**: New utility `formatDateDDMMYYYYCompact()` in `src/utils/dateFormatter.ts` returns format `DDMMYYYY` (no slashes) for use in filenames.

### Types & Entities

#### New Types File

- **Path**: `src/types/eventsJobsSync.ts`

```typescript
export enum FolderType {
  JOB = 'job',
  HR = 'hr',
  LIFE_EVENT = 'life-event'
}

export enum ScriptState {
  IDLE = 'idle',
  NOTE_CREATED = 'note_created',
  FOLDER_SELECTED = 'folder_selected'
}

export enum MenuOption {
  CREATE_NOTE = 'create_note',
  REWRITE_NOTE = 'rewrite_note',
  DELETE_LAST_NOTE = 'delete_last_note',
  DELETE_EMPTY_FOLDER = 'delete_empty_folder',
  RENAME_FOLDER = 'rename_folder',
  ADD_CONTACT = 'add_contact',
  EXIT = 'exit'
}

export interface FolderMapping {
  name: string; // Display name (e.g., "Job_Microsoft", "Alex Z OSR")
  path: string; // Full filesystem path
  type: FolderType;
  label: string; // Extracted label (e.g., "Job", "HR", "OSR")
  companyName?: string; // Extracted company (e.g., "Microsoft", undefined for life events)
}

export interface FolderMatch {
  folder: FolderMapping;
  score: number;
}

export interface FolderCacheData {
  timestamp: number;
  jobFolders: FolderMapping[];
  lifeEventFolders: FolderMapping[];
}

export interface EventsJobsSyncStats {
  jobNotes: number;
  lifeEventNotes: number;
  contacts: number;
  deletedNotes: number;
  deletedFolders: number;
  renamedFolders: number;
}

export interface ContactGroup {
  resourceName: string;
  name: string;
}
```

#### New Schema File

- **Path**: `src/entities/eventsJobsSync.schema.ts`

```typescript
import { z } from 'zod';

export const folderTypeSchema = z.enum(['job', 'hr', 'life-event']);

export const folderMappingSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  type: folderTypeSchema,
  label: z.string().trim().min(1),
  companyName: z.string().trim().optional(),
});

export const folderCacheDataSchema = z.object({
  timestamp: z.number(),
  jobFolders: z.array(folderMappingSchema),
  lifeEventFolders: z.array(folderMappingSchema),
});
```

### CLI Flow Implementation

#### Main Loop Steps

1. **Startup Validation**

- Validate that EITHER `companyFoldersPath` OR `lifeEventsPath` exists (at least one must exist)
- Use `PathValidator.validatePathsExist()` to check both paths
- For each path that exists:
  - Use `fs.stat()` to verify it's a directory (not a file)
  - If path is a file, throw error: "Path exists but is not a directory: [path]"
  - Validate read permissions using `fs.access()` with `fs.constants.R_OK`
  - Validate write permissions using `fs.access()` with `fs.constants.W_OK`
  - If permissions fail, throw error: "Insufficient permissions for path: [path]"
- If NEITHER exists, throw clear error: "Neither job-interviews nor life-events folder found. At least one must exist at: [paths]"
- If at least one exists, log which paths are available
- Auth validation happens only when user chooses to add contact (lazy validation)
- Log: "Validating paths..."
- Log: "✅ Found job-interviews folder: [path]" (if exists and valid)
- Log: "✅ Found life-events folder: [path]" (if exists and valid)

2. **Cache Initialization**

- Check `--no-cache` flag: `const noCacheFlag = process.env.NO_CACHE === 'true'`
- If `noCacheFlag` is true:
  - Call `FolderCache.getInstance().invalidate()`
  - Log: "Cache bypassed via --no-cache flag - deleting cache and re-scanning folders"
  - Console: "Cache bypassed via --no-cache flag - deleting cache and re-scanning folders"
- Call `FolderCache.getInstance().get()` 
- If cache retrieval fails with Zod validation error:
  - Log: "⚠️ Malformed cache file detected, invalidating and re-scanning"
  - Call `FolderCache.getInstance().invalidate()`
  - Set cache to null to trigger rescan
- If cache is null (expired, deleted, or invalid), scan filesystem
- Log: "Loading folder cache..."

3. **Folder Scanning** (if cache is null)

- Log: "Scanning job-interviews folder..."
- Scan `companyFoldersPath` (if exists): parse folders matching pattern `{Label}_{CompanyName}`
  - Pattern regex: `/^(Job|HR)_([^ ].+)$/` (case-sensitive, company must start with non-space)
  - For each folder:
    - Extract label (must be exactly "Job" or "HR")
    - Extract company (e.g., "Microsoft")
    - Create FolderMapping: `{ name: folderName, path: fullPath, type: FolderType.JOB or FolderType.HR, label, companyName }`
  - **Validation**: If any folder doesn't match the pattern, throw error:
    - "Invalid folder format in job-interviews: '[folderName]'. Expected format: 'Job_CompanyName' or 'HR_CompanyName' (case-sensitive)"
  - Ignore nested subfolders (only scan direct children)
  - Log: "Found [N] job/HR folders"
- Log: "Scanning life-events folder..."
- Scan `lifeEventsPath` (if exists): parse folders with label extraction
  - For each folder:
    - Split folder name by space: `const words = folderName.split(' ')`
    - Extract last word as label: `const label = words[words.length - 1]`
    - Validate label is at least 2 characters
    - Company name is undefined for life events
    - Example: "Alex Z OSR" → label: "OSR" (3 chars), companyName: undefined
    - Example: "Airbnb" → label: "Airbnb" (6 chars), companyName: undefined
    - Create FolderMapping: `{ name: folderName, path: fullPath, type: FolderType.LIFE_EVENT, label, companyName: undefined }`
  - **Validation**: If extracted label is less than 2 characters, throw error:
    - "Invalid folder name in life-events: '[folderName]'. Extracted label '[label]' must be at least 2 characters"
  - Ignore nested subfolders (only scan direct children)
  - Log: "Found [N] life-event folders"
- Save via `FolderCache.getInstance().set()`
- If save fails (permissions), throw error: "Failed to write cache file - check permissions for: [cachePath]"
- Log: "✅ Folder cache updated"

4. **Main Menu Loop**

- Display menu with options (using `MenuOption` enum):
  1. "📝 Create note" (default) → MenuOption.CREATE_NOTE
  2. "📋 Rewrite note" → MenuOption.REWRITE_NOTE
  3. "🗑️ Delete last note" → MenuOption.DELETE_LAST_NOTE (only if `lastCreatedNotePath` exists)
  4. "📁 Delete empty folder" → MenuOption.DELETE_EMPTY_FOLDER
  5. "✏️ Rename folder" → MenuOption.RENAME_FOLDER
  6. "👤 Add contact" → MenuOption.ADD_CONTACT (only if `lastSelectedFolder` exists)
  7. "🚪 Exit" → MenuOption.EXIT
- **Menu state validation**:
  - "Delete last note" option: Only show if `this.lastCreatedNotePath` is not null
  - "Add contact" option: Only show if `this.lastSelectedFolder` is not null (folder selected in current session)
  - If user somehow triggers disabled option, show error: "No folder selected in this session. Please create a note first."
- Log each user selection
- Continue loop until user exits

5. **Folder Selection Flow** (for "Create note" option)

- Prompt: "Enter event/company name:" (inquirer input)
- **Trim whitespace**: Always trim leading/trailing whitespace from user input using `FolderManager.trimFolderName()`
- Validation:
  - Non-empty: `if (!input.trim()) return 'Folder name cannot be empty.'`
  - Min 2 chars: `if (input.trim().length < 2) return 'Folder name must be at least 2 characters.'`
  - No Hebrew: `InputValidator.validateText(input, false)`
  - No illegal filesystem characters: Use `FolderManager.validateFolderName(input, type)` after type selection
- Log: "Searching for folder: '[input]'..."
- Call `FolderMatcher.findExactMatch()` (case-insensitive)
- If exact match found:
  - Log: "✅ Exact match found: '[folderName]'"
  - **Check folder still exists**: Verify folder wasn't deleted externally using `fs.access()`
  - If ENOENT: Re-invalidate cache, show error, return to folder search
  - Use that folder's path, skip to note input (step 6)
- If no exact match:
  - Log: "No exact match found. Searching for similar folders..."
  - Call `FolderMatcher.searchFolders()` with threshold 0.1
  - Show fuzzy matches in `inquirer.list`:
    - Choices: matched folders sorted by score (best first), display as "[name] ([type])"
    - Plus option: "➕ Create new folder"
  - Log: "Found [N] similar folders"
- If user selects existing folder:
  - Log: "User selected existing folder: '[folderName]'"
  - **Check folder still exists**: Verify folder wasn't deleted externally
  - Use that path, skip to note input (step 6)
- If user selects "Create new folder":
  - Proceed to folder creation flow (step 5a)

5a. **Folder Creation Flow**

- Prompt: "Select folder type:" (inquirer list)
  - Choices: "Job Interview", "Life Event"
- Log: "User selected: '[choice]'"
- If "Job Interview":
  - Prompt: "Select label:" (inquirer list)
    - Choices: **ONLY** "Job" and "HR" (case-sensitive, exact match)
  - Log: "User selected label: '[label]'"
  - Re-prompt for company name: "Enter company name:" (inquirer input)
    - Validation:
      - Non-empty: required
      - Min 2 chars: required
      - No Hebrew characters
      - **No illegal filesystem characters**: `/[\/\\:*?"<>|]/` → show error: "Company name cannot contain: / \ : * ? \" < > |"
      - **Path length check**: Validate full path will not exceed OS limits (~255 chars)
    - Format using `TextUtils.formatCompanyToPascalCase()`
    - Final folder name: `{Label}_{PascalCaseCompany}` (e.g., "Job_Microsoft", "HR_EladSoftwareSystems")
  - **Final validation**: After formatting, validate again for illegal characters
  - Log: "Formatting company name to PascalCase: '[original]' → '[formatted]'"
  - **Case-insensitive duplicate check**: Call `FolderManager.checkFolderExists()` to detect case-insensitive duplicates
    - If duplicate found: Show error, re-prompt for different name
- If "Life Event":
  - Use the originally entered name (from step 5)
  - Format: Capitalize first letter of each word
  - Example: "alex z osr" → "Alex Z Osr"
  - **Label Selection**:
    - Split formatted name by spaces: `const words = formattedName.split(' ')`
    - Prompt user: "Select which word should be the label:" (inquirer list)
    - Choices: All words from the name (e.g., "Alex", "Z", "Osr")
    - User selects one word as the label
    - Validate selected label is at least 2 characters
      - If less than 2 chars, show error: "Label must be at least 2 characters. Please enter a different name."
      - Return to name input
  - Log: "User selected label: '[label]' from folder name '[formattedName]'"
  - **Case-insensitive duplicate check**: Call `FolderManager.checkFolderExists()`
- Show confirmation: "About to create folder: '[finalFolderName]'. Proceed? (Y/n)"
  - Log: "Awaiting user confirmation..."
- If confirmed:
  - Determine base path (job-interviews or life-events)
  - Create full path: `join(basePath, finalFolderName)`
  - **Check parent directory exists**: Before creating, verify parent path exists
    - If ENOENT on parent: Throw error with message "Parent directory no longer exists: [basePath]"
  - Try to create using `FolderManager.createFolder()`
  - **Handle EEXIST error**: if folder already exists:
    - Log: "⚠️ Folder already exists: '[folderName]'"
    - Console: "⚠️ Folder already exists, please choose a different name"
    - Call `FolderCache.getInstance().invalidate()` then re-scan
    - Re-prompt user from beginning of folder creation flow (return to step 5a)
  - **Handle permission errors**: throw error with clear message
  - **Immediately update cache**: Call `FolderCache.getInstance().invalidate()` then re-scan and set
  - Log: "✅ Folder created: '[folderPath]'"
  - Console: "✅ Folder created: [folderName]"
  - Set script state: `this.scriptState = ScriptState.FOLDER_SELECTED`
  - Proceed to note input (step 6)
- If cancelled:
  - Log: "Folder creation cancelled by user"
  - Return to main menu

6. **Note Creation Flow**

- Prompt: "Enter your message (paste content):" (inquirer input, unlimited length)
- Validate: 
  - Non-empty: `if (!input.trim()) return 'Message cannot be empty.'`
  - **Max length**: `if (input.length > 1048576) return 'Message cannot exceed 1MB (~1,048,576 characters).'`
  - **Binary data check**: `if (input.includes('\0')) return 'Message cannot contain binary data (null bytes).'`
- Log: "Creating note in folder: '[folderPath]'..."
- Call `NoteWriter.writeNote(folderPath, message, new Date())`
  - Inside writeNote:
    - Use `formatDateDDMMYYYYCompact(new Date())` from `src/utils/dateFormatter.ts` (returns `DDMMYYYY` without slashes)
    - Scan for existing notes matching pattern `/notes_\d{8}-\d+\.txt$/`
    - Extract counters from matched files, find max N
    - Use N+1 for new file (ignore gaps in sequence)
    - **Counter can start at 0**: If `notes_15032026-0.txt` exists, next is `-1.txt`
    - **Mixed format handling**: If `notes_15032026.txt` and `notes_15032026-1.txt` both exist, next is `notes_15032026-2.txt`
    - If files exist with "future dates" (dates > today), log warning:
      - Log: "⚠️ Found note files with future dates in folder. System time may have changed."
    - Create file: `notes_DDMMYYYY-N.txt` where N is counter
    - Write message content as-is (no trimming, no formatting)
    - Return created file path
  - If folder was deleted externally (ENOENT): Throw error "Folder no longer exists: [folderPath]"
  - If write fails (permissions): throw error "Failed to write note file - check permissions"
- Log: "✅ Note saved: '[filePath]'"
- Console: "✅ Note saved: [fileName]"
- Update stats: `if (folder.type === FolderType.JOB || folder.type === FolderType.HR) { stats.jobNotes++ } else { stats.lifeEventNotes++ }`
- Track last created note path for potential deletion: `this.lastCreatedNotePath = filePath`
- Track last selected folder for contact creation: `this.lastSelectedFolder = folder`
- Set script state: `this.scriptState = ScriptState.NOTE_CREATED`

7. **Rewrite Note Flow** (new feature)

- Prompt: "Select folder:" (inquirer list, show all cached folders)
- Log: "User selected folder: '[folderName]'"
- Call `NoteWriter.listNotes(folderPath)` to get list of note files
- If no notes exist:
  - Console: "⚠️ No notes found in this folder."
  - Log: "No notes found in folder: '[folderPath]'"
  - Return to main menu
- Prompt: "Select note to rewrite:" (inquirer list, show note filenames)
- Log: "User selected note: '[noteFileName]'"
- Prompt: "Enter new message content:" (inquirer input, unlimited length)
- Validate: non-empty
- Show confirmation: "About to overwrite '[noteFileName]'. Proceed? (Y/n)"
- If confirmed:
  - Call `NoteWriter.rewriteNote(noteFilePath, newContent)`
  - Log: "✅ Note rewritten: '[noteFilePath]'"
  - Console: "✅ Note rewritten: [noteFileName]"
- If cancelled:
  - Log: "Note rewrite cancelled by user"

8. **Delete Last Note Flow**

- Check if `this.lastCreatedNotePath` exists
- If not: Console: "⚠️ No note has been created in this session."
- If exists:
  - Show confirmation: "About to delete: '[noteFileName]'. Proceed? (Y/n)"
  - Log: "Awaiting confirmation to delete note: '[noteFilePath]'"
- If confirmed:
  - Try to call `NoteWriter.deleteNote(this.lastCreatedNotePath)`
  - **Handle ENOENT gracefully**: 
    - Catch error with code 'ENOENT'
    - Console: "⚠️ Note file was already deleted externally"
    - Log: "Note file not found (already deleted): '[noteFilePath]'"
    - Clear: `this.lastCreatedNotePath = null`
    - Return to main menu (don't update stats)
  - If successful:
    - Update stats: decrement appropriate counter (jobNotes or lifeEventNotes)
    - Increment `stats.deletedNotes`
    - Log: "✅ Note deleted: '[noteFilePath]'"
    - Console: "✅ Note deleted: [noteFileName]"
    - Clear: `this.lastCreatedNotePath = null`
- If cancelled:
  - Log: "Note deletion cancelled by user"

9. **Delete Empty Folder Flow**

- Prompt: "Select folder to delete:" (inquirer list, show all cached folders)
- Log: "User selected folder: '[folderName]'"
- Check if folder is empty using `FolderManager.deleteEmptyFolder()`
  - Filter out hidden files (files starting with `.` like `.DS_Store`, `Thumbs.db`)
  - Only count visible files
- If folder is not empty:
  - Console: "⚠️ Cannot delete folder: contains files"
  - Log: "Folder deletion failed: folder not empty: '[folderPath]'"
  - Return to main menu
- Show confirmation: "About to delete empty folder: '[folderName]'. Proceed? (Y/n)"
  - Log: "Awaiting confirmation to delete folder: '[folderPath]'"
- If confirmed:
  - Delete folder using `fs.rmdir()`
  - **Handle errors**: If folder doesn't exist (ENOENT), show warning and continue
  - **Immediately update cache**: Call `FolderCache.getInstance().invalidate()` then re-scan
  - Increment `stats.deletedFolders`
  - Log: "✅ Folder deleted: '[folderPath]'"
  - Console: "✅ Folder deleted: [folderName]"
- If cancelled:
  - Log: "Folder deletion cancelled by user"

9a. **Rename Folder Flow** (new feature)

- Prompt: "Select folder to rename:" (inquirer list, show all cached folders)
- Log: "User selected folder: '[oldFolderName]'"
- Display current name: Console: "Current name: [oldFolderName]"
- Determine folder type from cached FolderMapping
- If Job/HR folder:
  - Prompt: "Select new label:" (inquirer list)
    - Choices: **ONLY** "Job" and "HR" (case-sensitive)
  - Prompt: "Enter new company name:" (inquirer input)
    - Validation: same as folder creation (min 2 chars, no Hebrew, no illegal chars, path length check)
    - Format using `TextUtils.formatCompanyToPascalCase()`
  - New folder name: `{Label}_{PascalCaseCompany}`
- If Life Event folder:
  - Prompt: "Enter new folder name:" (inquirer input)
    - Validation: min 2 chars, no Hebrew, no illegal chars, path length check
    - Format: Capitalize first letter of each word
  - Prompt user to select label from words (same as folder creation)
  - New folder name: formatted input
- **Case-insensitive duplicate check**: Call `FolderManager.checkFolderExists()` for new name
  - If duplicate found: Show error, re-prompt for different name
- Show confirmation: "Rename '[oldFolderName]' to '[newFolderName]'? (Y/n)"
- Log: "Awaiting confirmation to rename folder"
- If confirmed:
  - Build old and new paths
  - Call `FolderManager.renameFolder(oldPath, newPath)`
  - **Handle errors**:
    - If new name already exists (EEXIST): show error, re-prompt for new name
    - If old folder doesn't exist (ENOENT): show error, return to main menu
    - If permission error: throw with clear message
  - **Immediately update cache**: Call `FolderCache.getInstance().invalidate()` then re-scan
  - Increment `stats.renamedFolders`
  - Log: "✅ Folder renamed: '[oldFolderName]' → '[newFolderName]'"
  - Console: "✅ Folder renamed successfully"
  - **Note**: Folder renames do NOT affect existing contacts; contact biographies don't reference folder names
- If cancelled:
  - Log: "Folder rename cancelled by user"

10. **Contact Creation Flow**

- **Validate state**: Check if `this.lastSelectedFolder` exists
  - If not: Console: "⚠️ No folder selected in this session. Please create a note first."
  - Return to main menu
- Prompt: "Add person details?" (inquirer confirm, default: false)
- Log: "Awaiting user decision on contact creation..."
- If No:
  - Log: "User declined contact creation"
  - Exit to summary (step 11)
- If Yes:
  - Log: "User confirmed contact creation"
  - Lazy auth validation: check if already authenticated, otherwise call `AuthService.authorize()`
  - Log: "Authenticating with Google..."
  - Log: "✅ Authentication successful"
  
  - **Fetch and Cache Contact Groups** (if not already cached):
    - If `this.cachedContactGroups` is null or empty:
      - Call `await this.contactEditor.fetchContactGroups()` with retry/backoff (use existing retry service from LinkedInScript)
      - Store in `this.cachedContactGroups` for script-level caching
      - Log: "✅ Fetched [N] contact groups from Google Contacts"
    - Else: Log: "Using cached contact groups ([N] groups)"
  
  - **Label Resolution and Validation** (using LabelResolver service):
    - Extract label string from `lastSelectedFolder.label` (e.g., "Job", "HR", "OSR")
    
    - **For existing life event folders**: If folder already exists and type is LIFE_EVENT:
      - Call `LabelResolver.inferLabelFromExisting(folderName, cachedContactGroups)`
      - This checks which word from folder name exists as a label in Google Contacts
      - **Multiple matches**: Uses **first match found** (left-to-right order)
      - Example: "Alex Z OSR" where both "Alex" and "OSR" exist → uses "Alex" (first match)
      - If no match found, user must select label (same as folder creation flow)
    
    - Call `LabelResolver.resolveLabel(labelString, isRequired, cachedContactGroups)`
      - `isRequired` = true for Job/HR labels, false for life events
      - Returns: `{ resourceName: string, created: boolean }`
    
    - **For Job/HR labels** ("Job" or "HR"):
      - If label doesn't exist: **Throw error**: "Required label '[label]' does not exist. Please create it in Google Contacts first."
      - Script must exit - these are mandatory labels
      - Log: "❌ Missing required label: '[label]'"
    
    - **For Life Event labels** (any other label):
      - If label doesn't exist:
        - Console: "⚠️ Label '[label]' does not exist in your contacts"
        - Prompt: "Would you like to create it now? (Y/n)"
        - Log: "Prompting user to create missing label: '[label]'"
        - If Yes:
          - Console: "Creating label: '[label]'..."
          - Call `await this.contactEditor.createContactGroup(label)` with retry/backoff (use existing retry service)
          - Store new group in `this.cachedContactGroups` (update cache)
          - Log: "✅ Created new label: '[label]'"
          - Console: "✅ Label created successfully"
        - If No:
          - Log: "User declined label creation - cancelling contact creation"
          - Console: "Contact creation cancelled"
          - Return to main menu (don't create contact)
    
    - If label exists or was just created, use `resourceName` from result
  
  - **Pre-populate contact data**:
    ```typescript
    const prePopulatedData: Partial<EditableContactData> = {
      labelResourceNames: [resolvedResourceName], // Resolved resource name from LabelResolver
      company: lastSelectedFolder.companyName || '',
    };
    ```
  
  - Call `EventsContactEditor.collectInitialInput(prePopulatedData)` (using subclass)
    - EventsContactEditor shows pre-populated fields as **defaults** (user can override or clear)
    - If `labelResourceNames` is provided and not empty: show as default, allow edit or clear
    - If `company` is provided and not empty: show as default, allow override or clear
    - User can clear pre-populated fields to make them empty (fields are optional when pre-populated)
    - This allows full flexibility while providing convenience
  - Call `EventsContactEditor.showSummaryAndEdit(initialData, 'Create')`
  - If finalData is null:
    - Log: "Contact creation cancelled by user"
    - Console: "\nContact creation cancelled.\n"
    - Return to main menu
  - Create note text for contact biography:
    - Format: `"Added by events & jobs sync script - Last update: {DD/MM/YYYY}"`
    - Use `formatDateDDMMYYYY(new Date())` from `src/utils/dateFormatter.ts` (with slashes for display)
  - Call `EventsContactEditor.createContact(finalData, note)`
  - Increment `stats.contacts`
  - Log: "✅ Contact created successfully"
  - Console: "✅ Contact created"
  - Important: Only ONE contact per script run (no loop here)

11. **Exit & Summary**

- Display formatted summary using `FormatUtils.padLineWithEquals()` (following existing pattern):

```typescript
const totalWidth = 56;
const title = 'Events & Jobs Sync Summary';
const line1 = `Job: ${FormatUtils.formatNumberWithLeadingZeros(stats.jobNotes)} | Life: ${FormatUtils.formatNumberWithLeadingZeros(stats.lifeEventNotes)} | Contacts: ${FormatUtils.formatNumberWithLeadingZeros(stats.contacts)}`;
const line2 = `Deleted Notes: ${FormatUtils.formatNumberWithLeadingZeros(stats.deletedNotes)} | Deleted Folders: ${FormatUtils.formatNumberWithLeadingZeros(stats.deletedFolders)}`;
const line3 = `Renamed Folders: ${FormatUtils.formatNumberWithLeadingZeros(stats.renamedFolders)}`;
console.log('\n' + FormatUtils.padLineWithEquals(title, totalWidth));
console.log(FormatUtils.padLineWithEquals(line1, totalWidth));
console.log(FormatUtils.padLineWithEquals(line2, totalWidth));
console.log(FormatUtils.padLineWithEquals(line3, totalWidth));
console.log('='.repeat(totalWidth));
```

- Log final stats: "Script ended - Job notes: [N], Life event notes: [N], Contacts: [N], Deleted notes: [N], Deleted folders: [N], Renamed folders: [N]"
- Restore console (cleanup console capture)

### Integration Points

#### Reusable Services

1. **EventsContactEditor** (`src/services/contacts/eventsContactEditor.ts`) - NEW SUBCLASS

- **IMPORTANT**: Create a **subclass** of ContactEditor instead of modifying the original
- This avoids regression risk to existing scripts (contactsSync.ts, linkedInSync.ts)
- **Path**: `src/services/contacts/eventsContactEditor.ts`
- Extends `ContactEditor` class
- Override `collectInitialInput()` to accept optional pre-populated data:
  ```typescript
  async collectInitialInput(prePopulated?: Partial<EditableContactData>): Promise<EditableContactData>
  ```
- **Pre-population behavior**: Show pre-populated fields as **defaults** (user can override or clear)
  - If `prePopulated.labelResourceNames` is provided and not empty: show as default in prompt, allow user to change or clear
  - If `prePopulated.company` is provided and not empty: show as default in prompt, allow user to override or clear
  - User can clear pre-populated fields to make them empty (fields become optional when pre-populated)
  - This provides convenience while maintaining full flexibility
- **Implementation approach**:
  - For labels: Use inquirer's `default` option to show pre-populated labels, but still prompt with option to clear
  - For company: Use inquirer's `default` option with pre-populated value, allow clearing
  - User can accept defaults by pressing Enter or override/clear by typing new values
- Inherit existing `showSummaryAndEdit()` and `createContact()` methods from parent
- **No duplication**: All shared logic stays in parent `ContactEditor` class
- **Backward compatibility**: Original ContactEditor unchanged, existing scripts unaffected

2. **ContactEditor** (`src/services/contacts/contactEditor.ts`) - UNCHANGED

- **NO MODIFICATIONS** to this class
- Remains backward compatible with existing scripts
- EventsContactEditor subclass extends this without modifying original

2. **AuthService** (`src/services/auth/authService.ts`)

- Lazy validate: only when contact creation chosen
- Use existing `authorize()` method
- Track authentication state in script to avoid re-authenticating

3. **TextUtils** (`src/utils/textUtils.ts`)

- Use `formatCompanyToPascalCase()` for Job/HR folder names
- Use `parseFullName()` if needed in contact flow

4. **InputValidator** (`src/validators/inputValidator.ts`)

- Use `validateText()` for folder name and message input
- Custom validator for min 2 chars on folder name
- Custom validator for illegal filesystem characters

5. **FormatUtils** (`src/constants/formatUtils.ts`)

- Use `formatNumberWithLeadingZeros()` for stats formatting
- Use `padLineWithEquals()` for summary box formatting (consistent with ContactDisplay)

6. **SyncLogger** (`src/logging/syncLogger.ts`)

- Create instance: `new SyncLogger('events-jobs-sync')`
- Log file: `logs/events-jobs-sync-{DD_MM_YYYY}.log`
- Log all major actions (following ContactsSyncScript pattern)
- **Logging policy**: Log all actions EXCEPT note content
  - ✅ Log: folder names, file paths, user selections, stats, errors
  - ❌ Never log: note content (may contain sensitive information)
  - Example: Log "Note created: notes_15032026-1.txt" but not the note's content

7. **Retry Service** (from LinkedInScript) - REUSE EXISTING

- Use existing retry service implementation from LinkedInScript for all API calls
- No need to create new retry logic - reference existing pattern
- Apply to: fetchContactGroups(), createContactGroup(), resolveLabel() API calls

### Script Registration

#### Add to `src/scripts/index.ts`

```typescript
import { eventsJobsSyncScript } from "./eventsJobsSync";

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  "linkedin-sync": linkedInSyncScript,
  "contacts-sync": contactsSyncScript,
  "events-jobs-sync": eventsJobsSyncScript, // NEW
};
```

#### Export Script Object

In `src/scripts/eventsJobsSync.ts`:

```typescript
export const eventsJobsSyncScript: Script = {
  metadata: {
    name: "Events & Jobs Sync",
    description: "Create notes and contacts for job interviews and life events",
    version: "1.0.0",
    category: "interactive",
    requiresAuth: false, // conditional - only if user adds contact
    estimatedDuration: "2-5 minutes",
    emoji: "📝",
  },
  run: async () => {
    const { container } = await import('../di/container');
    const { AuthService } = await import('../services/auth/authService');
    // Note: Auth is lazy-loaded when user chooses to create contact
    const script = container.get(EventsJobsSyncScript);
    await script.run();
  },
};
```

### Dependency Injection Setup

#### Update `src/di/container.ts`

Bind new services:

```typescript
import { EventsJobsSyncScript } from '../scripts/eventsJobsSync';
import { FolderMatcher } from '../services/folders/folderMatcher';
import { NoteWriter } from '../services/notes/noteWriter';
import { FolderManager } from '../services/folders/folderManager';
import { PathValidator } from '../validators/pathValidator';
import { LabelResolver } from '../services/labels/labelResolver';
import { EventsContactEditor } from '../services/contacts/eventsContactEditor';

// ... existing bindings ...

// New bindings for Events & Jobs Sync
container.bind(FolderMatcher).toSelf(); // Transient (stateless service)
container.bind(NoteWriter).toSelf(); // Transient (stateless service)
container.bind(FolderManager).toSelf(); // Transient (stateless service)
container.bind(PathValidator).toSelf(); // Transient (stateless service)
container.bind(LabelResolver).toSelf(); // Transient (stateless service)
container.bind(EventsContactEditor).toSelf(); // Transient (subclass of ContactEditor)
container.bind(EventsJobsSyncScript).toSelf(); // Transient (script)
```

**Note**: `FolderCache` is NOT bound in DI - it uses singleton `getInstance()` pattern like `ContactCache`.

### Error Handling

1. **Path Validation Errors**: 
   - Clear message with missing path(s)
   - "Neither job-interviews nor life-events folder found. At least one must exist at: [paths]"
   - "Path exists but is not a directory: [path]"
   - "Insufficient permissions for path: [path]"

2. **Folder Format Validation Errors**:
   - Job/HR folders: "Invalid folder format in job-interviews: '[folderName]'. Expected format: 'Job_CompanyName' or 'HR_CompanyName' (case-sensitive)"
   - Life event folders: "Invalid folder name in life-events: '[folderName]'. Extracted label '[label]' must be at least 2 characters"

3. **Illegal Filesystem Characters**:
   - Validate input for characters: `/ \ : * ? " < > |`
   - Error message: "Company name cannot contain: / \ : * ? \" < > |"

4. **Folder Creation Errors**: 
   - EEXIST: Invalidate cache, re-prompt user for different name
   - Permission errors: Throw with message "Failed to create folder - check permissions"

5. **File Write Errors**: 
   - Permission errors: Throw with message "Failed to write note file - check permissions"
   - Disk full: Throw with message "Failed to write note - disk may be full"

6. **User Interruption (Ctrl+C)**: 
   - Show summary, exit gracefully via signal handlers
   - Restore console before exit

7. **Contact Creation Errors**: 
   - Missing required labels (Job/HR): Throw error, script exits
   - Missing optional labels (Life Events): Prompt user to create, cancel if declined
   - **API rate limiting**: Use retry with backoff pattern (from LinkedInScript) for all API calls
   - Catch and log other errors
   - Continue script flow (don't break)
   - Show error to user but allow them to return to main menu

8. **Future Date Files Warning**:
   - Log: "⚠️ Found note files with future dates in folder. System time may have changed."
   - Continue execution (non-fatal)

9. **File Deletion Errors**:
   - ENOENT (file doesn't exist): Show warning, continue gracefully
   - Permission errors: Throw with clear message

10. **Cache Errors**:
    - Zod validation failure: Log warning, invalidate cache, rescan
    - Write permission errors: Throw with message "Failed to write cache file - check permissions for: [cachePath]"

11. **Folder Rename Errors**:
    - EEXIST (new name exists): Show error, re-prompt for new name
    - ENOENT (old folder doesn't exist): Show error, return to main menu
    - Permission errors: Throw with clear message

12. **Parent Directory Errors**:
    - ENOENT during folder creation: Throw error "Parent directory no longer exists: [basePath]"
    - This handles case where parent directory deleted during script execution

13. **Note Content Validation Errors**:
    - Content exceeds 1MB: Show error "Message cannot exceed 1MB (~1,048,576 characters)."
    - Empty content: Show error "Message cannot be empty."

14. **Path Length Errors**:
    - Full path exceeds OS limit: Show error "Folder path exceeds maximum length for your operating system."

15. **Reserved Filename Errors**:
    - Windows reserved names detected: Show error "Folder name '[name]' is reserved by the operating system and cannot be used."
    - Applies to: CON, PRN, AUX, NUL, COM1-9, LPT1-9 (case-insensitive)

16. **Binary Data Errors**:
    - Note content contains null bytes: Show error "Message cannot contain binary data (null bytes)."

17. **Language Support**:
    - This script supports **English only**
    - Error messages, prompts, and logs are in English
    - No localization or internationalization support

### --no-cache Flag Support

Implementation at start of `run()` method (aligned with LinkedInSyncScript pattern):

```typescript
const noCacheFlag = process.env.NO_CACHE === 'true';
if (noCacheFlag) {
  await FolderCache.getInstance().invalidate();
  console.log('Cache bypassed via --no-cache flag - deleting cache and re-scanning folders');
  await this.logger.logMain('Cache bypassed via --no-cache flag - deleting cache and re-scanning folders');
}
```

### File Naming Details

#### Note File Pattern

- **Format**: `notes_DDMMYYYY-N.txt` where N is counter (can start at 0 or 1)
- **Regex to match**: `/notes_\d{8}-\d+\.txt$/`
- Examples: `notes_15032026-0.txt`, `notes_15032026-1.txt`, `notes_15032026-2.txt`
- Counter is per-date per folder (resets daily)
- **Counter logic**: Find max N from all matched files, use N+1 (ignore gaps)
  - **Can start at 0**: If only `notes_15032026-0.txt` exists, next is `-1.txt`
  - Example: files 0, 2, 5 exist → next is 6
  - Example: files 1, 3, 5 exist → next is 6
  - Files without counter (e.g., `notes_15032026.txt`) are **ignored**
  - **Mixed format**: If `notes_15032026.txt` and `notes_15032026-1.txt` both exist, next is `notes_15032026-2.txt` (only counter files considered)
- **Uses system local time**: Documented in code comments
  - Timezone: Uses system local timezone for all date operations
  - If system timezone changes **between runs**, dates reflect new timezone
  - If system timezone changes **during execution**, subsequent operations use new timezone
  - If system time goes backwards, may see warnings about "future" files (non-fatal)
- **Handles future date files**: Warns but continues if files exist with dates > today
- **Date formatting**: Uses new utility `formatDateDDMMYYYYCompact()` from `src/utils/dateFormatter.ts` (returns `DDMMYYYY` without slashes)

#### Folder Naming Conventions

- **Job Interviews**: `Job_{PascalCaseCompany}` or `HR_{PascalCaseCompany}`
  - Example: input "elad software" → `Job_EladSoftware` or `HR_EladSoftware`
  - Pattern regex: `/^(Job|HR)_([^ ].+)$/` (case-sensitive, company must start with non-space)
  - Label extraction: First part before `_` (must be exactly "Job" or "HR")
  - Company extraction: Everything after `_`
  - Labels "Job" and "HR" are **mandatory** - script throws error if they don't exist
  
- **Life Events**: Capitalize first letter of each word (not concatenated)
  - Example: "alex z osr" → "Alex Z Osr"
  - Label extraction: User selects from words in folder name
  - Validation: Selected label must be at least 2 characters
  - Company: undefined (not applicable for life events)
  - Labels are **optional** - script prompts to create if missing

#### Illegal Filesystem Characters

Characters that cannot be used in folder/company names:
- Forward slash: `/`
- Backslash: `\`
- Colon: `:`
- Asterisk: `*`
- Question mark: `?`
- Double quote: `"`
- Less than: `<`
- Greater than: `>`
- Pipe: `|`

Validation regex: `/[\/\\:*?"<>|]/`

Validation happens:
1. During initial input (before fuzzy matching)
2. After folder type selection (final validation before creation)
3. After PascalCase formatting (for Job/HR folders)

This prevents filesystem errors and ensures cross-platform compatibility.

#### Reserved OS Filenames

**Windows reserved filenames** (case-insensitive) that cannot be used:
- Device names: `CON`, `PRN`, `AUX`, `NUL`
- Serial ports: `COM1`, `COM2`, `COM3`, `COM4`, `COM5`, `COM6`, `COM7`, `COM8`, `COM9`
- Parallel ports: `LPT1`, `LPT2`, `LPT3`, `LPT4`, `LPT5`, `LPT6`, `LPT7`, `LPT8`, `LPT9`

These names are reserved even with extensions (e.g., `CON.txt` is also invalid).

Validation pattern:
```typescript
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
```

If reserved name detected, show error: "Folder name '[name]' is reserved by the operating system and cannot be used."

#### Symlink Behavior

- **Symlinks are followed**: The script treats symlinks as their target directories
- If `dummy/job-interviews` is a symlink to another folder, the script follows it and scans the target
- Same behavior applies to `dummy/life-events`
- Circular symlinks are not explicitly handled (would cause infinite loop) - user responsibility to avoid
- Document this behavior in code comments

### Testing Strategy

#### Unit Tests Structure

Following existing patterns in `src/services/contacts/__tests__/`, create:

1. **`src/cache/__tests__/folderCache.test.ts`**
   - Mock `fs.readdir`, `fs.readFile`, `fs.writeFile`, `fs.unlink` using `vi.mock('fs/promises')`
   - Test cases:
     - Cache hit: valid cache within TTL returns cached data
     - Cache miss: expired cache returns null
     - Cache set: writes data correctly
     - Cache invalidate: deletes cache file
     - Schema validation: rejects invalid cache data
     - Malformed JSON: invalidates cache and returns null

2. **`src/services/folders/__tests__/folderMatcher.test.ts`**
   - Test cases:
     - Exact match (case-insensitive): "Microsoft" matches "microsoft"
     - Fuzzy match: "Microsft" matches "Microsoft" with score < 0.1
     - No match: completely different input returns empty array
     - Multiple matches: sorts by score (best first)
     - Threshold edge cases: score exactly at 0.1

3. **`src/services/notes/__tests__/noteWriter.test.ts`**
   - Mock filesystem operations
   - Test cases:
     - Counter logic with no existing files: starts at 1
     - Counter logic with existing files: finds max N, uses N+1
     - **Counter logic starting at 0**: If only `notes_15032026-0.txt` exists, next is `-1.txt`
     - Counter logic with gaps (files 0, 2, 5): next is 6
     - Counter logic with gaps (files 1, 3, 5): next is 6
     - Counter logic ignores files without counter (notes_15032026.txt)
     - Date boundary: files from yesterday vs today (counter resets)
     - Future date files: logs warning, continues
     - Write note: creates file with correct content
     - Write note (folder deleted): throws clear error with ENOENT
     - **Binary data rejection**: Throws error if content contains null bytes
     - Delete note: removes file successfully
     - Delete note (ENOENT): handles gracefully with warning
     - List notes: returns sorted list of note files
     - Rewrite note: overwrites existing file content

4. **`src/services/folders/__tests__/folderManager.test.ts`**
   - Test cases:
     - **Trim whitespace**: Folder names with leading/trailing spaces are trimmed
     - Validate folder name: rejects illegal characters
     - **Validate reserved names**: Rejects Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) case-insensitively
     - Validate folder name: accepts legal characters
     - Parse folder name (Job): "Job_Microsoft" → label: "Job", company: "Microsoft"
     - Parse folder name (HR): "HR_EladSoftware" → label: "HR", company: "EladSoftware"
     - Parse folder name (Life): "Alex Z OSR" → extract words, validate label selection
     - **Centralized parsing**: All parsing logic uses FolderManager.parseFolderName() (no parsing elsewhere)
     - Create folder: calls fs.mkdir with correct path
     - Create folder (EEXIST): returns error for re-prompting
     - Delete empty folder: removes folder (filters hidden files)
     - Delete non-empty folder: returns false
     - Rename folder: renames successfully
     - Rename folder (EEXIST): returns error for re-prompting
     - Rename folder (ENOENT): throws error

5. **`src/validators/__tests__/pathValidator.test.ts`**
   - Test cases:
     - Path exists and is directory: returns true
     - Path missing: returns false
     - Path exists but is file: throws error
     - Path readable: returns true
     - Path not readable: throws error
     - Path writable: returns true
     - Path not writable: throws error

6. **`src/services/contacts/__tests__/eventsContactEditor.test.ts`** (NEW)
   - Test EventsContactEditor subclass modifications
   - Test cases:
     - collectInitialInput() with no prePopulated data: prompts for all fields (inherited behavior)
     - collectInitialInput() with prePopulated labelResourceNames: shows as default, allows override
     - collectInitialInput() with prePopulated company: shows as default, allows override
     - **User can clear pre-populated fields**: Pre-populated fields can be cleared/made empty
     - Inherited methods work correctly: showSummaryAndEdit(), createContact()
     - **No logic duplication**: Verify shared logic stays in parent ContactEditor class

7. **`src/utils/__tests__/dateFormatter.test.ts`** (NEW OR UPDATED)
   - Test date formatting utilities
   - **Critical**: Test both formatters use same underlying date
   - Test cases:
     - formatDateDDMMYYYYCompact() returns correct format (DDMMYYYY without slashes)
     - formatDateDDMMYYYY() returns correct format (DD/MM/YYYY with slashes)
     - **Same date consistency**: Both functions given same Date object produce consistent dates (only format differs)
     - Example: `new Date('2026-03-15')` → compact: `15032026`, display: `15/03/2026`
     - Timezone handling: Both use system local timezone consistently

8. **`src/services/labels/__tests__/labelResolver.test.ts`** (RENUMBERED)
   - Test label resolution logic
   - Test cases:
     - Resolve required label (Job/HR) - exists: returns resourceName
     - Resolve required label (Job/HR) - missing: throws error
     - Resolve optional label (life event) - exists: returns resourceName
     - Resolve optional label (life event) - missing: returns null (caller handles prompt)
     - **Multiple matches - first match wins**: "Alex Z OSR" where both "Alex" and "OSR" exist → returns "Alex"
     - Infer label from existing folder: finds first matching word
     - Infer label from existing folder: no matches, returns null
     - API rate limiting: retries with backoff on rate limit errors (uses existing retry service)

#### Testing Guidelines

- Follow existing test patterns (no over-mocking)
- Do not mock the function under test
- Use `expect(...).rejects.toThrow()` for async errors
- Use `expect(() => ...).toThrow()` for sync errors
- Keep tests minimal and focused
- Do not validate error order (just that errors are thrown)
- Keep blank lines between describe blocks and between tests
- Avoid unnecessary assertions

#### Manual End-to-End Testing Scenarios

1. **Happy Path**: Create note in existing folder → create contact
2. **New Folder**: Create new job folder → create note → verify cache update
3. **Fuzzy Match**: Enter partial company name → select from matches
4. **Delete Operations**: Create note → delete last note → verify stats
5. **Empty Folder Deletion**: Create folder → delete without adding notes
6. **Rewrite Note**: Create note → rewrite it → verify content changed
7. **Multiple Notes Same Day**: Create 3 notes same folder same day → verify counter: 1, 2, 3
8. **--no-cache Flag**: Run with flag → verify cache is bypassed
9. **Invalid Folder Name**: Try to create folder with illegal characters → verify error
10. **Path Validation**: Delete dummy folders → verify error on startup
11. **Case-Insensitive Duplicate**: Try creating `Job_microsoft` when `Job_Microsoft` exists → verify error
12. **Unicode/Emoji in Folder Name**: Try creating folder with emoji → verify rejection
13. **Very Long Path**: Try creating folder with very long name → verify path length validation
14. **Symlinks**: If dummy paths are symlinks → verify script follows them correctly
15. **Mixed Note Formats**: Create `notes_15032026.txt` and `notes_15032026-1.txt` → verify next is `-2.txt`
16. **Folder Rename**: Rename folder → verify cache updates, existing contacts unaffected
17. **Windows Hidden Files**: Create `.DS_Store` and `Thumbs.db` in folder → verify still considered empty
18. **Life Event Label Inference**: Use existing life event folder → verify correct label inferred from Google Contacts
19. **Contact Groups Caching**: Create multiple contacts → verify groups fetched once
20. **Parent Directory Deletion**: Delete parent directory during execution → verify clear error message

## Implementation Order

### Phase 1: Configuration & Types (Foundation)

1. Add types in `src/types/eventsJobsSync.ts` with enums: `FolderType`, `ScriptState`, `MenuOption`
2. Add `ContactGroup` interface to types
3. Add schema in `src/entities/eventsJobsSync.schema.ts` with Zod validation
4. Update `src/settings/settings.ts` with new config section (reference existing companyFoldersPath, add lifeEventsPath)
5. Create new utility `formatDateDDMMYYYYCompact()` in `src/utils/dateFormatter.ts` (returns `DDMMYYYY` without slashes)
6. Export new cache from `src/cache/index.ts` (if index file exists)

### Phase 2: Core Services (Bottom-Up)

1. **PathValidator** (`src/validators/pathValidator.ts`)
   - Implement `validatePathsExist()` and `validateWritable()`
   - Add unit tests

2. **FolderCache** (`src/cache/folderCache.ts`)
   - Implement singleton pattern with `getInstance()`
   - Implement `get()`, `set()`, `invalidate()` with Zod validation
   - Add unit tests

3. **FolderManager** (`src/services/folders/folderManager.ts`)
   - Implement `validateFolderName()`, `parseFolderName()`, `createFolder()`, `deleteEmptyFolder()`, `renameFolder()`, `checkFolderExists()`
   - Add illegal character validation, path length validation, Unicode/emoji detection
   - Add case-insensitive duplicate detection
   - Filter hidden files including Windows junk files (`Thumbs.db`, `desktop.ini`)
   - Add unit tests

4. **FolderMatcher** (`src/services/folders/folderMatcher.ts`)
   - Implement `findExactMatch()` and `searchFolders()` using Fuse.js (threshold 0.1)
   - Add unit tests

5. **NoteWriter** (`src/services/notes/noteWriter.ts`)
   - Implement `writeNote()`, `deleteNote()`, `listNotes()`, `rewriteNote()`
   - Implement counter logic with future date handling and mixed format support
   - Use `formatDateDDMMYYYYCompact()` for filenames
   - Enforce 1MB max content length
   - Add unit tests

6. **LabelResolver** (`src/services/labels/labelResolver.ts`)
   - Implement `resolveLabel()` and `inferLabelFromExisting()`
   - Add retry with backoff for API calls (pattern from LinkedInScript)
   - Handle required vs optional label logic
   - Add unit tests

### Phase 3: EventsContactEditor Subclass (NEW)

1. **Create EventsContactEditor subclass** (`src/services/contacts/eventsContactEditor.ts`)
   - Extend ContactEditor class (no modifications to original)
   - Override `collectInitialInput()` to accept optional `prePopulated` parameter
   - Add logic to show label as default (using inquirer `default` option) if `prePopulated.labelResourceNames` provided
   - Add logic to show company as default if `prePopulated.company` provided
   - Allow user to clear pre-populated fields (fields become optional when pre-populated)
   - Inherit all other methods from parent (no duplication)
   - Write unit tests for EventsContactEditor (`src/services/contacts/__tests__/eventsContactEditor.test.ts`)

2. **Add date formatter consistency tests**
   - Update or create `src/utils/__tests__/dateFormatter.test.ts`
   - Test that formatDateDDMMYYYYCompact() and formatDateDDMMYYYY() use same underlying date
   - Ensure both respect system timezone consistently

### Phase 4: Main Script (Top-Level Integration)

1. **EventsJobsSyncScript** (`src/scripts/eventsJobsSync.ts`)
   - Implement all CLI flows (steps 1-11 from flow section)
   - Set up signal handlers
   - Set up console capture via SyncLogger
   - Implement comprehensive logging for all actions
   - Track state using `ScriptState` enum: `lastCreatedNotePath`, `lastSelectedFolder`, `scriptState`
   - Implement contact groups caching at script level: `cachedContactGroups`
   - Use `MenuOption` enum for menu choices
   - Integrate `LabelResolver` service for label resolution
   - Use `formatDateDDMMYYYYCompact()` for note filenames
   - Use `formatDateDDMMYYYY()` for contact biography display dates

2. **Wire up DI container** (`src/di/container.ts`)
   - Add bindings for new services: FolderMatcher, NoteWriter, FolderManager, PathValidator, LabelResolver, EventsContactEditor, EventsJobsSyncScript
   - All transient except FolderCache which is singleton getInstance

3. **Register script** (`src/scripts/index.ts`)
   - Export `eventsJobsSyncScript` object
   - Add to `AVAILABLE_SCRIPTS`

### Phase 5: Testing & Polish

1. Run all unit tests: `pnpm test`
2. Manual end-to-end testing (see Testing Strategy section)
3. Test with `--no-cache` flag
4. Test edge cases:
   - No folders exist
   - Folders with illegal names (should error on scan)
   - Creating duplicate folder names
   - Permission errors
   - Empty folder operations
5. Verify summary formatting matches existing pattern (56 chars wide)
6. Verify all logging is comprehensive and follows existing patterns
7. Check linter errors: `pnpm lint`

## Key Files to Reference

- **Main Pattern**: `src/scripts/contactsSync.ts` (main flow, signal handlers, stats, logging)
- **Cache Pattern**: `src/cache/contactCache.ts` (singleton getInstance pattern)
- **Cache Alternative**: `src/cache/companyCache.ts` (instantiated pattern with TTL)
- **Fuzzy Matching**: `src/services/contacts/duplicateDetector.ts` (Fuse.js threshold 0.1)
- **Validation**: `src/validators/inputValidator.ts` (input validation patterns)
- **Text Formatting**: `src/utils/textUtils.ts` (formatCompanyToPascalCase)
- **Summary Display**: `src/services/contacts/contactDisplay.ts` (FormatUtils.padLineWithEquals)
- **Logging Pattern**: `src/logging/syncLogger.ts` (structured logging with timestamps)
- **Schema Validation**: `src/entities/linkedinConnection.schema.ts` (Zod patterns)

## Dependencies

No new npm packages needed:

- Fuse.js (already installed) - for fuzzy matching
- inquirer v9 (already installed) - for CLI prompts
- inversify (already installed) - for dependency injection
- Node.js fs/promises (built-in) - for filesystem operations
- zod (already installed) - for schema validation

## Setup & Prerequisites

### Required Google Contacts Labels

Before running this script, ensure the following labels exist in your Google Contacts:

1. **"Job"** (case-sensitive) - REQUIRED
   - Used for job interview contacts
   - Script will throw error if missing
   - Create at: https://contacts.google.com

2. **"HR"** (case-sensitive) - REQUIRED  
   - Used for HR representative contacts
   - Script will throw error if missing
   - Create at: https://contacts.google.com

3. **Life Event Labels** - OPTIONAL
   - Created on-demand when needed
   - Examples: "OSR", "Airbnb", etc.
   - Script prompts to create if missing

### Folder Structure

The script expects the following folder structure:

```
project-root/
├── dummy/
│   ├── job-interviews/    # Job/HR folders (referenced from SETTINGS.linkedin.companyFoldersPath)
│   │   ├── Job_Microsoft/
│   │   ├── HR_Google/
│   │   └── ...
│   └── life-events/       # Life event folders (new path in SETTINGS.eventsJobsSync.lifeEventsPath)
│       ├── Alex Z OSR/
│       ├── Airbnb/
│       └── ...
└── sources/
    └── .cache/
        └── folder-mappings.json    # Auto-generated cache
```

**Folder Naming Conventions**:
- Job/HR: Must match pattern `{Label}_{CompanyName}` where Label is exactly "Job" or "HR"
  - ✅ Valid: `Job_Microsoft`, `HR_EladSoftwareSystems`
  - ❌ Invalid: `job_Microsoft`, `JOB_Microsoft`, `Microsoft`
- Life Events: Any name, minimum 2 characters
  - ✅ Valid: `Alex Z OSR`, `Airbnb`, `John Doe Meeting`
  - ❌ Invalid: `A`, `X`

### Filesystem Requirements

- **Permissions**: Read/write access to `dummy/job-interviews/` and `dummy/life-events/`
- **Path Length**: Folder names must not exceed OS path limits (~255 characters for full path)
- **Character Restrictions**: No illegal filesystem characters: `/ \ : * ? " < > |`
- **Unicode**: Folder names should use basic ASCII; emojis and problematic Unicode characters are rejected

### First-Time Setup

1. Create required Google Contacts labels "Job" and "HR"
2. Create folder structure if it doesn't exist:
   ```bash
   mkdir -p dummy/job-interviews dummy/life-events
   ```
3. Verify permissions:
   ```bash
   # Should succeed without errors
   touch dummy/job-interviews/test && rm dummy/job-interviews/test
   touch dummy/life-events/test && rm dummy/life-events/test
   ```
4. Run script:
   ```bash
   pnpm start
   # Select "Events & Jobs Sync" from menu
   ```

### Troubleshooting

- **Error: "Required label 'Job' does not exist"**: Create "Job" label in Google Contacts
- **Error: "Neither job-interviews nor life-events folder found"**: Create at least one of the folders
- **Error: "Path exists but is not a directory"**: Remove file and create directory instead
- **Error: "Insufficient permissions"**: Fix folder permissions with `chmod`

## Notes & Important Decisions

### Design Decisions

1. **Message content is written exactly as pasted**: No formatting, no trimming (preserve user intent)
2. **Fuzzy matching threshold: 0.1**: Same as duplicate detection initially; will be validated with real-world data
3. **Auth is validated lazily**: Only when user chooses to add contact
4. **Folder case matching**: Always use existing filesystem casing
5. **Summary width: 56 characters**: Consistent with ContactDisplay pattern
6. **Stats formatting**: Zero-padded with commas (e.g., "00,001")
7. **Date format utilities**: 
   - `formatDateDDMMYYYYCompact()` for filenames (returns `DDMMYYYY` without slashes)
   - `formatDateDDMMYYYY()` for display dates in biography (returns `DD/MM/YYYY` with slashes)
8. **Note prefix hard-coded**: `notes_` prefix is not configurable
9. **System local time**: All timestamps use system local time (documented in code)
10. **Timezone behavior**: Uses system local timezone; timezone changes between runs are reflected in dates; time going backwards shows "future file" warnings (non-fatal)
11. **Cache pattern: Singleton getInstance**: Following ContactCache, not DI
12. **FolderType/MenuOption/ScriptState: Enums**: Using enums for type safety and maintainability
13. **One contact per session**: Simplified flow, user can run script again if needed
14. **Immediate cache update**: Cache is updated immediately when folders are created, deleted, or renamed (no stale data)
15. **Label Resolution**: Labels resolved from strings to resourceNames with validation before creating contact
16. **Job/HR Labels Mandatory**: "Job" and "HR" labels must exist in Google Contacts - script throws error if missing
17. **Life Event Labels Optional**: Life event labels prompt user to create if missing, with Y/N confirmation
18. **Life Event Label Inference**: For existing folders, infer label by checking which word exists in Google Contacts
19. **Contact Groups Caching**: Fetch groups once per script run, cache at script level, update when creating new labels
20. **Counter Logic Simplified**: Always use max+1, ignore gaps, only match files with counter pattern
21. **Mixed Format Handling**: If files with and without counter exist for same date, only counter files are considered for next counter value
22. **Hidden Files Ignored**: When checking if folder is empty, filter out files starting with `.` (macOS) and `Thumbs.db`, `desktop.ini` (Windows)
23. **ENOENT Handled Gracefully**: File/folder not found errors show warnings, don't crash script
24. **Rename Folder Feature**: Allows renaming with automatic cache invalidation and rescan
25. **Folder Renames Don't Affect Contacts**: Contact biographies don't reference folder names, so renames have no impact on existing contacts
26. **Case-Insensitive Duplicate Detection**: Before creating folder, check if any existing folder matches case-insensitively (cross-platform safety)
27. **Path Length Validation**: Enforce OS path limits (~255 chars) to prevent filesystem errors
28. **Unicode/Emoji Validation**: Reject folder names containing emojis or problematic Unicode characters
29. **Note Content Max Length**: Enforce 1MB (~1,048,576 characters) limit on note content
30. **API Retry with Backoff**: Use existing pattern from LinkedInScript for all API calls to handle rate limiting
31. **ContactEditor Pre-population**: Show pre-populated fields as defaults (user can override), not skip prompts entirely
32. **Backward Compatibility**: ContactEditor can be called with no argument or `{}` and behaves as before
33. **EventsContactEditor Subclass**: Create subclass instead of modifying ContactEditor to avoid regression risk (v5)
34. **Single-User Scope**: Script designed for single local user only, no concurrent access handling needed (v5)
35. **Whitespace Trimming**: Always trim leading/trailing whitespace from folder names (v5)
36. **Counter Can Start at 0**: If `notes_DDMMYYYY-0.txt` exists, next file is `-1.txt` (max+1 logic) (v5)
37. **Pre-populated Field Clearing**: User can clear pre-populated fields in EventsContactEditor (v5)
38. **First-Match Label Inference**: When multiple words match labels, use first match found (v5)
39. **Menu State Validation**: "Add contact" only enabled when folder selected in session (v5)
40. **Folder ENOENT Handling**: Handle case where folder deleted externally before note creation (v5)
41. **Timezone During Execution**: Document that timezone changes during execution affect subsequent operations (v5)
42. **Reserved OS Filenames**: Validate against Windows reserved names (CON, PRN, AUX, etc.) (v5)
43. **Binary Data Validation**: Reject note content containing null bytes (v5)
44. **English-Only Support**: Script supports English language only, no localization (v5)
45. **Logging Policy**: Log all actions except note content (folder names logged, content never logged) (v5)
46. **Centralized Parsing**: All folder parsing logic in FolderManager service (single source of truth) (v5)
47. **Symlink Following**: Follow symlinks to their targets (same as regular directories) (v5)
48. **Date Format Consistency**: Test both formatters use same underlying date with different formatting (v5)

### Path Validation Strategy

- At least ONE of `companyFoldersPath` OR `lifeEventsPath` must exist
- If neither exists: throw error and exit
- If only one exists: continue with available path
- Paths must be **directories** (not files) - verified using `fs.stat()`
- Paths must have **read and write permissions** - verified using `fs.access()` with `R_OK` and `W_OK`
- Permission errors throw immediately with clear messages
- This allows flexible deployment (users may only use job folders OR life event folders)

### Folder Naming Requirements

**Job/HR Folders** (in `dummy/job-interviews/`):
- **MUST** match pattern: `{Label}_{CompanyName}` where Label is exactly "Job" or "HR" (case-sensitive)
- Pattern regex: `/^(Job|HR)_([^ ].+)$/` (company must start with non-space character)
- Label selection: User selects from dropdown with **ONLY** "Job" and "HR" options
- Company name is formatted to PascalCase: "elad software" → "EladSoftware"
- Invalid folders cause script to fail on startup (strict validation)
- Examples: `Job_Microsoft`, `HR_EladSoftware`, `Job_Google`
- **Labels are MANDATORY**: If "Job" or "HR" labels don't exist in Google Contacts, script throws error

**Life Event Folders** (in `dummy/life-events/`):
- Can be any name with minimum 2 characters for the full folder name
- Formatted: Capitalize first letter of each word (not concatenated)
- Label extraction: User **selects** which word from folder name should be the label
- Validation: Selected label must be at least 2 characters
- No company name (undefined)
- Examples: 
  - "Alex Z OSR" → user selects "OSR" as label (or "Alex", "Z")
  - "Airbnb" → label is "Airbnb" (only option)
- **Labels are OPTIONAL**: If label doesn't exist in Google Contacts, script prompts "Create now? Y/N"

### Contact Label & Company Pre-population

When user creates a contact, the label and company are automatically determined from the selected folder:

**Job Folder** (`Job_Microsoft`):
- Label string: "Job" 
- Label resolution: Fetch all contact groups, find group with name "Job", extract resourceName
- If "Job" label doesn't exist: **Throw error** - "Required label 'Job' does not exist. Please create it in Google Contacts first."
- Company: "Microsoft"
- Contact's email label: "Job Microsoft"
- Contact's phone label: "Job Microsoft"
- Contact's last name suffix: "Job Microsoft"

**HR Folder** (`HR_EladSoftware`):
- Label string: "HR"
- Label resolution: Fetch all contact groups, find group with name "HR", extract resourceName
- If "HR" label doesn't exist: **Throw error** - "Required label 'HR' does not exist. Please create it in Google Contacts first."
- Company: "EladSoftware"
- Contact's email label: "HR EladSoftware"
- Contact's phone label: "HR EladSoftware"
- Contact's last name suffix: "HR EladSoftware"

**Life Event Folder** (`Alex Z OSR` with "OSR" selected as label):
- Label string: "OSR" (user-selected from folder name words)
- Label resolution: Fetch all contact groups, find group with name "OSR"
- If "OSR" label doesn't exist: 
  - Prompt: "⚠️ Label 'OSR' does not exist in your contacts. Would you like to create it now? (Y/n)"
  - If Yes: Create label, use resourceName
  - If No: Cancel contact creation, return to main menu
- Company: undefined
- Contact's email label: "OSR"
- Contact's phone label: "OSR"
- Contact's last name suffix: "OSR"

**Critical**: Label strings are resolved to Google Contacts resourceNames **before** calling `ContactEditor.collectInitialInput()`. The resourceName (not the string) is passed in `prePopulatedData.labelResourceNames`.

### Future Date File Handling

If note files exist with dates in the future (e.g., system time was changed), the script:
1. Logs a warning: "⚠️ Found note files with future dates in folder. System time may have changed."
2. Continues execution (non-fatal)
3. Uses the maximum counter found (even if it's from a "future" file)
4. This ensures no counter collisions or overwrites

### Illegal Filesystem Characters

The following characters are not allowed in folder names or company names:
- `/` (forward slash)
- `\` (backslash)
- `:` (colon)
- `*` (asterisk)
- `?` (question mark)
- `"` (double quote)
- `<` (less than)
- `>` (greater than)
- `|` (pipe)

Validation happens:
1. During initial input (before fuzzy matching)
2. After folder type selection (final validation before creation)

This prevents filesystem errors and ensures cross-platform compatibility.

## Implementation Tasks (Ordered Checklist)

### Phase 1: Foundation (Configuration & Types)
- [ ] 1. Create `src/types/eventsJobsSync.ts` with enums (`FolderType`, `ScriptState`, `MenuOption`) and all interfaces including `ContactGroup`
- [ ] 2. Create `src/entities/eventsJobsSync.schema.ts` with Zod schemas
- [ ] 3. Create new utility `formatDateDDMMYYYYCompact()` in `src/utils/dateFormatter.ts` (returns `DDMMYYYY` without slashes)
- [ ] 4. Update `src/settings/settings.ts` to add `eventsJobsSync` section (reference existing companyFoldersPath, add lifeEventsPath)
- [ ] 5. Export types and schemas in respective index files (if applicable)

### Phase 2: Core Services (Bottom-Up Implementation)
- [ ] 6. Implement `src/validators/pathValidator.ts` with path existence, directory validation, and read/write permission checks
- [ ] 7. Write unit tests for PathValidator (`src/validators/__tests__/pathValidator.test.ts`)
- [ ] 8. Implement `src/cache/folderCache.ts` with singleton `getInstance()` pattern, Zod validation, and malformed cache handling
- [ ] 9. Write unit tests for FolderCache (`src/cache/__tests__/folderCache.test.ts`) including malformed JSON test
- [ ] 10. Implement `src/services/folders/folderManager.ts` with validation (illegal chars, reserved names, path length, Unicode/emoji, whitespace trimming), parsing (centralized), create, delete, rename, and case-insensitive duplicate check
- [ ] 11. Write unit tests for FolderManager (`src/services/folders/__tests__/folderManager.test.ts`) including all validation tests (whitespace, reserved names, centralized parsing)
- [ ] 12. Implement `src/services/folders/folderMatcher.ts` with Fuse.js fuzzy matching (threshold 0.1)
- [ ] 13. Write unit tests for FolderMatcher (`src/services/folders/__tests__/folderMatcher.test.ts`)
- [ ] 14. Implement `src/services/notes/noteWriter.ts` with all note operations, counter logic (counter can start at 0, regex filter, mixed format handling), 1MB max length, binary data validation, and ENOENT handling
- [ ] 15. Write unit tests for NoteWriter (`src/services/notes/__tests__/noteWriter.test.ts`) including ENOENT, counter starting at 0, binary data rejection, and mixed format tests
- [ ] 16. Implement `src/services/labels/labelResolver.ts` with label resolution, creation, inference (first match wins), and retry/backoff logic (use existing retry service)
- [ ] 17. Write unit tests for LabelResolver (`src/services/labels/__tests__/labelResolver.test.ts`) including multiple match scenarios and API rate limiting tests

### Phase 3: EventsContactEditor Subclass
- [ ] 18. Create `src/services/contacts/eventsContactEditor.ts` as subclass of ContactEditor (no modifications to original ContactEditor)
- [ ] 19. Override `collectInitialInput()` to accept optional `prePopulated` parameter with default values and field clearing support
- [ ] 20. Ensure all shared logic remains in parent ContactEditor class (no duplication)
- [ ] 21. Write unit tests (`src/services/contacts/__tests__/eventsContactEditor.test.ts`) for prePopulated behavior including field clearing
- [ ] 22. Create or update `src/utils/__tests__/dateFormatter.test.ts` to test date format consistency between compact and display formats
- [ ] 23. Manually test that original ContactEditor still works in contactsSync.ts (run contacts sync script)

### Phase 4: Main Script Implementation
- [ ] 24. Create `src/scripts/eventsJobsSync.ts` with EventsJobsSyncScript class
- [ ] 25. Implement startup validation (paths must exist as directories with proper permissions)
- [ ] 26. Implement --no-cache flag handling with malformed cache detection
- [ ] 27. Implement folder scanning logic with case-sensitive Job/HR regex, life event label extraction, and whitespace trimming
- [ ] 28. Implement main menu loop using `MenuOption` enum with state-based menu options (conditional display of "Delete last note" and "Add contact")
- [ ] 29. Implement folder selection flow with fuzzy matching, case-insensitive duplicate detection, whitespace trimming, and folder existence checks
- [ ] 30. Implement folder creation flow with EEXIST re-prompting, life event label selection, reserved name validation, path length validation, parent directory ENOENT handling
- [ ] 31. Implement note creation flow with counter logic (counter can start at 0) using `formatDateDDMMYYYYCompact()`, 1MB max length validation, binary data rejection, and folder ENOENT handling
- [ ] 32. Implement rewrite note flow
- [ ] 33. Implement delete last note flow with ENOENT handling
- [ ] 34. Implement delete empty folder flow with hidden file filtering (including Windows junk files)
- [ ] 35. Implement rename folder flow with validation, cache update, and stats tracking
- [ ] 36. Implement contact groups caching at script level (`cachedContactGroups`)
- [ ] 37. Integrate `LabelResolver` service into contact creation flow with life event label inference (first match wins)
- [ ] 38. Implement contact creation flow with EventsContactEditor subclass, label resolution (Job/HR mandatory, life events optional with creation prompt), and state validation
- [ ] 39. Implement summary display using FormatUtils.padLineWithEquals (including `renamedFolders` counter)
- [ ] 40. Set up signal handlers (Ctrl+C) with graceful exit
- [ ] 41. Set up console capture via SyncLogger with logging policy (log all except note content)
- [ ] 42. Add comprehensive logging for ALL major actions (following contactsSync.ts pattern)
- [ ] 43. Track state using `ScriptState` enum: `lastCreatedNotePath`, `lastSelectedFolder`, `scriptState`

### Phase 5: Dependency Injection & Registration
- [ ] 44. Update `src/di/container.ts` to bind all new services (FolderMatcher, NoteWriter, FolderManager, PathValidator, LabelResolver, EventsContactEditor, EventsJobsSyncScript - all transient)
- [ ] 45. Create eventsJobsSyncScript export object in eventsJobsSync.ts
- [ ] 46. Register script in `src/scripts/index.ts` AVAILABLE_SCRIPTS

### Phase 6: Testing & Validation
- [ ] 47. Run all unit tests: `pnpm test` - ensure all pass
- [ ] 48. Manual E2E test: Create note in existing folder → create contact with label resolution
- [ ] 49. Manual E2E test: Create new job folder → verify "Job" label is required
- [ ] 50. Manual E2E test: Create new life event folder with label selection → verify label creation prompt
- [ ] 51. Manual E2E test: Fuzzy matching - enter partial name → select from matches
- [ ] 52. Manual E2E test: Delete last note → verify stats and ENOENT handling
- [ ] 53. Manual E2E test: Create folder → delete empty folder (with hidden files and Windows junk files present)
- [ ] 54. Manual E2E test: Rename folder → verify cache update and stats tracking
- [ ] 55. Manual E2E test: Create note → rewrite note → verify content changed
- [ ] 56. Manual E2E test: Create 3 notes same folder same day → verify counter: 1, 2, 3 (or starting from 0 if first file is -0.txt)
- [ ] 57. Manual E2E test: Mixed note formats (`notes_15032026.txt` + `-1.txt`) → verify next is `-2.txt`
- [ ] 58. Manual E2E test: Run with --no-cache flag → verify cache bypassed
- [ ] 59. Manual E2E test: Try illegal characters in folder name → verify error
- [ ] 60. Manual E2E test: Try emoji in folder name → verify rejection
- [ ] 61. Manual E2E test: Try reserved OS filename (CON, PRN, etc.) → verify rejection
- [ ] 62. Manual E2E test: Try very long folder name → verify path length validation
- [ ] 63. Manual E2E test: Try folder name with leading/trailing spaces → verify trimming works
- [ ] 64. Manual E2E test: Case-insensitive duplicate (`Job_microsoft` vs `Job_Microsoft`) → verify error
- [ ] 65. Manual E2E test: Delete dummy folders → verify path validation errors
- [ ] 66. Manual E2E test: Use existing life event folder with multiple matching labels → verify first match is used
- [ ] 67. Manual E2E test: Create multiple contacts in session → verify groups fetched once and cached
- [ ] 68. Manual E2E test: Try to add contact without selecting folder first → verify state validation error
- [ ] 69. Manual E2E test: Try binary data in note content (null bytes) → verify rejection
- [ ] 70. Edge case test: Invalid folder format in job-interviews → verify startup error with case-sensitive message
- [ ] 71. Edge case test: Folder already exists (EEXIST) → verify re-prompting flow
- [ ] 72. Edge case test: Malformed cache JSON → verify invalidation and rescan
- [ ] 73. Edge case test: Path is file not directory → verify error message
- [ ] 74. Edge case test: Parent directory deleted during execution → verify clear error message
- [ ] 75. Edge case test: Note content exceeds 1MB → verify validation error
- [ ] 76. Edge case test: Folder deleted externally before note creation → verify clear ENOENT error
- [ ] 77. Run contacts sync script manually → verify original ContactEditor still works (not affected by EventsContactEditor subclass)
- [ ] 78. Run linter: `pnpm lint` - fix any issues
- [ ] 79. Verify summary formatting is exactly 56 chars wide
- [ ] 80. Verify all logging matches ContactsSyncScript pattern and follows logging policy (no note content logged)

### Phase 7: Documentation & Final Review
- [ ] 81. Create setup documentation with prerequisites (required "Job" and "HR" labels, folder structure)
- [ ] 82. Review all code comments - ensure clarity and completeness
- [ ] 83. Document timezone behavior in code comments (including behavior when timezone changes during execution)
- [ ] 84. Document symlink behavior in code comments (symlinks are followed to targets)
- [ ] 85. Verify illegal character validation is comprehensive
- [ ] 86. Verify reserved OS filename validation works correctly
- [ ] 87. Verify future date file handling works correctly
- [ ] 88. Verify contact label/company resolution works end-to-end (including Job/HR requirement and life event inference with first match)
- [ ] 89. Verify rename folder feature works with all folder types and doesn't affect existing contacts
- [ ] 90. Test with real-world data to validate fuzzy match threshold (0.1)
- [ ] 91. Final smoke test: run through entire flow without errors
- [ ] 92. Mark implementation as complete

---

**Total Estimated Tasks**: 92 items (updated from 84)
**Critical Path**: Phase 2 → Phase 3 → Phase 4 (items 6-43)
**Testing Critical**: Phase 6 (items 47-80)
**New Features in v5**: EventsContactEditor subclass, Reserved OS filenames validation, Binary data validation, Whitespace trimming, Counter starting at 0, First-match label inference, Menu state validation, Logging policy, Date format consistency tests, English-only support
