# Statistics Script Implementation Plan

## Overview

Create a new standalone "Statistics" script that provides comprehensive statistics about job interviews, HR contacts, life events, notes, and Google contacts. The script will scan directories, count various entities, and display formatted results with a progress indicator.

## User Requirements

- Add a new script called "Statistics" as the last option in the scripts menu
- Display statistics with emoji: 📊
- Show a progress bar animation while collecting data
- Display statistics in a formatted table with equal signs
- Format numbers with comma separators and leading zeros (e.g., 000,123)

## Statistics to Display

### Primary Statistics

1. **Jobs** - Count of folders starting with `Job_` in job-interviews directory
2. **HR** - Count of folders starting with `HR_` in job-interviews directory  
3. **Events** - Count of all folders in life-events directory
4. **Notes** - Total count of all `.txt` files in both job-interviews and life-events folders (recursive)
5. **Contacts** - Total count of Google contacts from the People API

### Additional Statistics

6. **Job Notes** - Count of `.txt` files in `Job_` folders
7. **HR Notes** - Count of `.txt` files in `HR_` folders
8. **Event Notes** - Count of `.txt` files in life-events folders
9. **Notes Created Today** - Count of `.txt` files created today
10. **Notes Created This Week** - Count of `.txt` files created in the last 7 days
11. **Empty Folders** - Count of folders with no `.txt` files
12. **Average Notes per Job** - Total job notes / job folders (or "N/A" if no folders)
13. **Average Notes per HR** - Total HR notes / HR folders (or "N/A" if no folders)
14. **Average Notes per Event** - Total event notes / event folders (or "N/A" if no folders)
15. **Most Active Folder** - Folder with the most notes (name + count)
16. **Oldest Note Date** - Date of the oldest `.txt` file (based on creation/modification time)
17. **Newest Note Date** - Date of the newest `.txt` file (based on creation/modification time)
18. **Total Storage Used** - Sum of all `.txt` file sizes in human-readable format (KB/MB)

### Display Format

```
========Statistics========
=======Jobs: 000,007======
========HR: 000,003=======
=====Events: 000,008======
======Notes: 000,060======
===Contacts: 002,847======
===Job Notes: 000,035=====
====HR Notes: 000,025=====
==Event Notes: 000,000====
==Notes Today: 000,003====
===Notes Week: 000,015====
=Empty Folders: 000,002===
===Avg Job: 5.0 notes====
====Avg HR: 8.3 notes====
==Avg Event: 0.0 notes==
==Most Active: Job_Acme==
=====(23 notes)=========
===Oldest: 15/03/2024===
===Newest: 18/03/2026===
===Storage: 2.5 MB======
```

## Files to Create

### 1. `src/types/statistics.ts`

TypeScript types for statistics data structures:

```typescript
export enum StatisticsStage {
  SCANNING_JOBS = 'scanning-jobs',
  SCANNING_EVENTS = 'scanning-events',
  COUNTING_NOTES = 'counting-notes',
  FETCHING_CONTACTS = 'fetching-contacts',
  CALCULATING = 'calculating',
}

export interface FolderStatistics {
  jobFolders: number;
  hrFolders: number;
  eventFolders: number;
  totalFolders: number;
  emptyFolders: number;
}

export interface NoteStatistics {
  jobNotes: number;
  hrNotes: number;
  eventNotes: number;
  totalNotes: number;
  notesToday: number;
  notesThisWeek: number;
}

export interface ContactStatistics {
  googleContacts: number;
}

export interface AverageStatistics {
  avgNotesPerJob: number | null;
  avgNotesPerHR: number | null;
  avgNotesPerEvent: number | null;
}

export interface ActivityStatistics {
  mostActiveFolder: string | null;
  mostActiveFolderCount: number;
  oldestNoteDate: Date | null;
  newestNoteDate: Date | null;
  totalStorageBytes: number;
}

export interface Statistics {
  folders: FolderStatistics;
  notes: NoteStatistics;
  contacts: ContactStatistics;
  averages: AverageStatistics;
  activity: ActivityStatistics;
  timestamp: number;
}

export interface StatisticsProgress {
  stage: StatisticsStage;
  percentage: number;
  message: string;
}
```

### 2. `src/services/statistics/statisticsCollector.ts`

Service class for collecting statistics from filesystem and API:

**Responsibilities:**
- Scan job-interviews folder for `Job_` and `HR_` folders
- Scan life-events folder for all folders
- Count ALL `.txt` files in each folder (not just notes_*.txt pattern)
- Count notes created today and this week based on file birthtime (fallback to mtime) using local timezone
- Calculate average notes per folder type
- Find the most active folder (folder with most notes)
- Track oldest and newest note dates
- Calculate total storage used by all `.txt` files (sum of file sizes, not disk usage)
- Count empty folders (folders with no `.txt` files)
- Handle errors gracefully (missing folders, permission issues, deleted folders mid-scan)
- Fetch contact count using existing DuplicateDetector service with cache support

**Key Methods:**
```typescript
async collectFolderStatistics(): Promise<FolderStatistics>
async collectNoteStatistics(): Promise<NoteStatistics>
async collectContactStatistics(): Promise<ContactStatistics>
async collectAverageStatistics(folders: FolderStatistics, notes: NoteStatistics): Promise<AverageStatistics>
async collectActivityStatistics(): Promise<ActivityStatistics>
async collectAll(spinner: Ora): Promise<Statistics>
```

**Implementation Notes:**
- Use `SETTINGS.eventsJobsSync.companyFoldersPath` for job-interviews path
- Use `SETTINGS.eventsJobsSync.lifeEventsPath` for life-events path
- Use `SETTINGS.statistics.displayWidth` for formatting width
- Use `promises as fs` from Node.js for filesystem operations
- Use regex patterns to match `Job_*` and `HR_*` folder names
- Count ALL `.txt` files (not just notes_*.txt pattern)
- **Error Handling:**
  - If both folder paths don't exist: **Throw an error** (at least one must exist)
  - If a folder is deleted mid-scan: **Ignore and continue** with other folders
  - If API rate limit is hit: **Retry with backoff** and show warning message
  - If note filenames are corrupted: **Ignore and skip** to the next file
  - If unicode/RTL folder names exist: **Ignore them** (filesystem should handle, but skip if issues)
- **Date Handling:**
  - Use `stats.birthtime` for file creation time (when available)
  - Fallback to `stats.mtime` if `birthtime` is not available or invalid
  - Use local timezone for all date calculations
  - Calculate "today" as dates from start of current day (00:00:00) in local timezone
  - Calculate "this week" as dates >= 7 days ago from current time
- Calculate storage by summing file sizes from `stats.size` (this is file size, not disk usage)
- **Contact Fetching:**
  - Inject `DuplicateDetector` service
  - Use `duplicateDetector` private method `fetchAllContacts()` which already handles cache
  - Respect `--no-cache` flag by clearing cache before collection if needed
  - Handle authentication failures gracefully (return -1 for "N/A")
- **Progress Updates:**
  - Update spinner text directly instead of using callback
  - Use consistent messages aligned with StatisticsStage enum

### 3. `src/scripts/statistics.ts`

Main statistics script implementation:

**Structure:**
```typescript
@injectable()
export class StatisticsScript {
  private readonly logger: Logger;
  private readonly uiLogger: Logger;
  
  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new Logger('Statistics');
    this.uiLogger = new Logger('StatisticsScript');
  }
  
  async run(): Promise<void> {
    // Main execution logic
    // Track API stats at start and end
    // Handle authentication like eventsJobsSync (optional, graceful failure)
  }
  
  private async collectStatistics(): Promise<Statistics> {
    // Collect all statistics with progress spinner
    // Handle --no-cache flag
  }
  
  private displayStatistics(stats: Statistics): void {
    // Format and display statistics
    // Handle -1 for contacts (display "N/A")
    // Validate consistency of statistics
  }
  
  private formatStorage(bytes: number): string {
    // Convert bytes to KB/MB/GB with proper TB support
  }
  
  private validateStatistics(stats: Statistics): void {
    // Check that totalNotes === jobNotes + hrNotes + eventNotes
    // Check that notesThisWeek >= notesToday
    // Log warnings if inconsistencies detected
  }
}
```

**Authentication Pattern:**
Follow the eventsJobsSync.ts pattern:
```typescript
async run(): Promise<void> {
  console.log('\n===Statistics===\n');
  
  // Try to authenticate, but don't fail if it doesn't work
  try {
    const authService = new AuthService();
    this.auth = await authService.authorize();
    // Auth successful - contacts will be fetched
  } catch (error) {
    // Auth failed - contacts will show "N/A"
    console.log('⚠️  Google authentication failed. Contact statistics will be unavailable.\n');
  }
  
  // Continue with statistics collection regardless of auth status
}
```

**Progress Bar Implementation:**
Use `ora` spinner with direct text updates (no callback):
```typescript
const ora = (await import('ora')).default;
const spinner = ora({
  text: 'Scanning job-interviews folder...',
  color: 'cyan',
}).start();

// Pass spinner to collector
const stats = await collector.collectAll(spinner);

spinner.stop();
spinner.clear();
```

**Display Logic:**
- Update `FormatUtils.formatNumberWithLeadingZeros()` to pad to 6 digits (000,000)
- Use `SETTINGS.statistics.displayWidth` for consistent width
- Display all statistics in a single formatted block
- Handle special cases:
  - Contacts: Show "N/A" if value is -1 (auth failure)
  - Averages: Show "N/A" if no folders exist, otherwise format as "X.X notes"
  - Most Active: Show folder name + count on separate lines
  - Dates: Format as DD/MM/YYYY
  - Storage: Show in human-readable format (B, KB, MB, GB, TB)
- Track and display API statistics (read/write counts) at the end
- Validate statistics consistency before display

**Export:**
```typescript
export const statisticsScript: Script = {
  metadata: {
    name: 'Statistics',
    description: 'Display comprehensive statistics about jobs, HR, events, notes, and contacts',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    estimatedDuration: '10-30 seconds',
    emoji: '📊',
  },
  run: async () => {
    const { container } = await import('../di/container');
    const { AuthService } = await import('../services/auth/authService');
    const authService = new AuthService();
    let auth: OAuth2Client;
    try {
      auth = await authService.authorize();
    } catch {
      auth = {} as OAuth2Client;
    }
    container.bind('OAuth2Client').toConstantValue(auth);
    const script = container.get(StatisticsScript);
    await script.run();
  },
};
```

## Files to Modify

### 1. `src/scripts/index.ts`

Register the new statistics script:

```typescript
import type { Script } from '../types/script';
import { linkedInSyncScript } from './linkedinSync';
import { contactsSyncScript } from './contactsSync';
import { eventsJobsSyncScript } from './eventsJobsSync';
import { statisticsScript } from './statistics';

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  'linkedin-sync': linkedInSyncScript,
  'contacts-sync': contactsSyncScript,
  'events-jobs-sync': eventsJobsSyncScript,
  'statistics': statisticsScript,
};

export function listScripts(): void {
  console.log('\nAvailable Scripts:\n');
  Object.entries(AVAILABLE_SCRIPTS).forEach(([key, script]) => {
    const { metadata } = script;
    console.log(`  ${key}`);
    console.log(`    Name: ${metadata.name}`);
    console.log(`    Description: ${metadata.description}`);
    console.log(`    Category: ${metadata.category}`);
    console.log(`    Duration: ${metadata.estimatedDuration || 'Unknown'}\n`);
  });
}
```

### 2. `src/index.ts`

Update the script order to place statistics last:

```typescript
// Line 27 - update scriptOrder array
const scriptOrder = [
  'contacts-sync',
  'events-jobs-sync',
  'linkedin-sync',
  'statistics'
];
```

### 3. `src/settings/settings.ts`

Add statistics configuration:

```typescript
export interface Settings {
  environment: 'test' | 'production';
  auth: { /* existing */ };
  api: { /* existing */ };
  paths: { /* existing */ };
  linkedin: { /* existing */ };
  contactsSync: { /* existing */ };
  eventsJobsSync: { /* existing */ };
  statistics: {
    displayWidth: number;
  };
}

export const SETTINGS: Settings = {
  // ... existing settings ...
  statistics: {
    displayWidth: 26,
  },
};
```

### 4. `src/constants/formatUtils.ts`

Update to support 6-digit padding:

```typescript
import { RegexPatterns } from '../regex/patterns';

export class FormatUtils {
  static formatNumberWithLeadingZeros(num: number, digits: number = 6): string {
    return num
      .toString()
      .padStart(digits, '0')
      .replace(RegexPatterns.NUMBER_GROUPING, ',');
  }

  static padLineWithEquals(content: string, totalWidth: number): string {
    const contentLength = content.length;
    if (contentLength >= totalWidth) {
      return content;
    }
    const paddingNeeded = totalWidth - contentLength;
    const leftPadding = Math.floor(paddingNeeded / 2);
    const rightPadding = paddingNeeded - leftPadding;
    return '='.repeat(leftPadding) + content + '='.repeat(rightPadding);
  }
}

## Technical Implementation Details

### Complete Implementation Flow

1. **Script Initialization:**
   ```typescript
   - Track API stats at start
   - Check and handle --no-cache flag
   - Validate that at least one directory exists (throw error if both missing)
   - Initialize progress spinner
   ```

2. **Data Collection Sequence:**
   ```typescript
   - Phase 1: Scan job-interviews folder (collect folder list + note metadata)
   - Phase 2: Scan life-events folder (collect folder list + note metadata)
   - Phase 3: Calculate derived statistics (averages, most active, dates)
   - Phase 4: Fetch Google contacts (with retry on rate limit)
   - Phase 5: Finalize and aggregate all statistics
   ```

3. **Display Results:**
   ```typescript
   - Stop spinner
   - Display formatted statistics table
   - Track and display API stats at end
   - Show success message
   ```

### Dependency Injection

The script follows the existing DI pattern:
- Use `@injectable()` decorator for the main script class
- Inject `OAuth2Client` for authentication (optional, graceful failure)
- Inject `DuplicateDetector` to leverage existing contact fetching with cache
- Follow eventsJobsSync pattern for authentication handling
- Register in the DI container using the same pattern as eventsJobsSync

### Error Handling

Handle errors gracefully without blocking the script:
- **Both folders missing:** Throw error "At least one directory must exist (job-interviews or life-events)"
- **Folder deleted mid-scan:** Ignore the folder, log warning, continue with remaining folders
- **Permission errors:** Log warning and skip the inaccessible folder/file
- **Authentication failures:** Show "N/A" for contacts, continue with other stats
- **API errors:** Catch and display error message, show "N/A" for contacts
- **API rate limit:** Retry with backoff using `retryWithBackoff()` utility, show warning if retries exhausted
- **Corrupted filenames:** Skip files that cause errors, continue processing
- **Unicode/RTL folder names:** Skip folders that cause filesystem errors (unlikely but defensive)

### No-Cache Mode Support

Respect the `--no-cache` flag for Google contacts:
```typescript
async run(): Promise<void> {
  const noCacheFlag = process.env.NO_CACHE === 'true';
  if (noCacheFlag) {
    await ContactCache.getInstance().invalidate();
  }
  // ... rest of execution
}
```

### API Tracking

Track API usage during the script execution:
```typescript
const apiTracker = ApiTracker.getInstance();
const startStats = await apiTracker.getStats();

// ... perform statistics collection ...

const endStats = await apiTracker.getStats();
const readCalls = endStats.read - startStats.read;
this.uiLogger.info(
  `[People API Stats] 📖 Read: ${readCalls}`,
  {},
  false
);
```

### Path Resolution

Use settings for all paths:
```typescript
const jobInterviewsPath = SETTINGS.eventsJobsSync.companyFoldersPath;
const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
```

### Folder Matching Logic

Use regex to match folder patterns:
- `Job_` folders: `/^Job_/`
- `HR_` folders: `/^HR_/`
- All folders in life-events (no prefix filter)

### Note Counting Logic

Count ALL `.txt` files in each folder:
```typescript
async function countNotesInFolder(folderPath: string): Promise<{
  count: number;
  files: Array<{ name: string; mtime: Date; size: number }>;
}> {
  try {
    const files = await fs.readdir(folderPath);
    const txtFiles: Array<{ name: string; mtime: Date; size: number }> = [];
    
    for (const file of files) {
      try {
        if (file.endsWith('.txt')) {
          const filePath = join(folderPath, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            txtFiles.push({
              name: file,
              mtime: stats.mtime,
              size: stats.size,
            });
          }
        }
      } catch (error) {
        // Skip corrupted files, continue with others
        continue;
      }
    }
    
    return { count: txtFiles.length, files: txtFiles };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      // Folder was deleted mid-scan, return empty result
      return { count: 0, files: [] };
    }
    throw error;
  }
}
```

### Date Calculations

Calculate notes created today and this week using local timezone:
```typescript
// Use birthtime when available, fallback to mtime
function getFileCreationDate(stats: fs.Stats): Date {
  // birthtime can be invalid on some filesystems (shows epoch time)
  const birthtime = stats.birthtime;
  const mtime = stats.mtime;
  
  // If birthtime is epoch (Jan 1, 1970), use mtime instead
  if (birthtime.getFullYear() === 1970 && birthtime.getMonth() === 0 && birthtime.getDate() === 1) {
    return mtime;
  }
  
  // If birthtime is in the future, use mtime
  if (birthtime > new Date()) {
    return mtime;
  }
  
  // Otherwise use birthtime
  return birthtime;
}

function isToday(date: Date): boolean {
  const today = new Date();
  // Compare dates at start of day (00:00:00) in local timezone
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return todayStart.getTime() === dateStart.getTime();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo;
}
```

### Contact Fetching Logic

Use DuplicateDetector service which already handles cache and API logic:
```typescript
@injectable()
export class StatisticsCollector {
  private readonly logger: Logger;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new Logger('StatisticsCollector');
  }

  async collectContactStatistics(): Promise<ContactStatistics> {
    try {
      // fetchAllContacts already handles:
      // - Cache checking and retrieval
      // - API pagination with retry and backoff
      // - API tracking
      const contacts = await this.duplicateDetector['fetchAllContacts']();
      return { googleContacts: contacts.length };
    } catch (error) {
      this.logger.error('Failed to fetch contacts', { noPHI: true });
      return { googleContacts: -1 };
    }
  }
}
```

**Key Points:**
- Access private method `fetchAllContacts()` from DuplicateDetector
- This method already respects ContactCache with TTL
- Already implements retry with backoff for rate limits
- Already tracks API calls with ApiTracker
- Returns -1 on any error (auth failure, network issues, etc.)

### Display Formatting

Use existing utility functions with updates:
```typescript
// Format number: 1234 -> "000,234" (with leading zeros to 6 digits)
const formatted = FormatUtils.formatNumberWithLeadingZeros(count, 6);

// Pad line with equals: "Jobs: 000,234" -> "=====Jobs: 000,234====="
const padded = FormatUtils.padLineWithEquals(`Jobs: ${formatted}`, SETTINGS.statistics.displayWidth);

// Handle special displays:
// - Contacts: Display "N/A" if -1
const contactDisplay = stats.contacts.googleContacts === -1 
  ? 'N/A' 
  : FormatUtils.formatNumberWithLeadingZeros(stats.contacts.googleContacts, 6);

// - Averages: Display "N/A" or "X.X notes"
const avgJobDisplay = stats.averages.avgNotesPerJob === null
  ? 'N/A'
  : `${stats.averages.avgNotesPerJob.toFixed(1)} notes`;

// - Dates: Format as DD/MM/YYYY
const dateDisplay = stats.activity.oldestNoteDate
  ? formatDateDDMMYYYY(stats.activity.oldestNoteDate)
  : 'N/A';

// - Storage: Convert bytes to human-readable (with TB support)
function formatStorage(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(k, clampedIndex)).toFixed(1)} ${units[clampedIndex]}`;
}
```

**Statistics Validation:**
Add validation before display to ensure data consistency:
```typescript
private validateStatistics(stats: Statistics): void {
  const { folders, notes } = stats;
  
  // Validate total notes calculation
  const calculatedTotal = notes.jobNotes + notes.hrNotes + notes.eventNotes;
  if (notes.totalNotes !== calculatedTotal) {
    this.logger.warn(
      `Statistics inconsistency: totalNotes (${notes.totalNotes}) does not match sum (${calculatedTotal})`,
      { noPHI: true }
    );
  }
  
  // Validate notes this week >= notes today
  if (notes.notesThisWeek < notes.notesToday) {
    this.logger.warn(
      `Statistics inconsistency: notesThisWeek (${notes.notesThisWeek}) < notesToday (${notes.notesToday})`,
      { noPHI: true }
    );
  }
  
  // Validate folder calculations
  const calculatedTotalFolders = folders.jobFolders + folders.hrFolders + folders.eventFolders;
  if (folders.totalFolders !== calculatedTotalFolders) {
    this.logger.warn(
      `Statistics inconsistency: totalFolders (${folders.totalFolders}) does not match sum (${calculatedTotalFolders})`,
      { noPHI: true }
    );
  }
  
  // Validate empty folders <= total folders
  if (folders.emptyFolders > folders.totalFolders) {
    this.logger.warn(
      `Statistics inconsistency: emptyFolders (${folders.emptyFolders}) > totalFolders (${folders.totalFolders})`,
      { noPHI: true }
    );
  }
}
```

## Testing Strategy

### Manual Testing

1. **Via Menu:**
   ```bash
   pnpm start
   # Select "📊 Statistics" from menu
   ```

2. **Direct Invocation:**
   ```bash
   pnpm script statistics
   ```

3. **With No-Cache Flag:**
   ```bash
   pnpm script statistics --no-cache
   ```

### Test Scenarios

1. **Normal Operation:**
   - All folders exist
   - Google authentication succeeds
   - Should display all statistics correctly

2. **Missing Both Folders:**
   - Delete both job-interviews and life-events folders
   - Should throw error: "At least one directory must exist"

3. **Missing One Folder:**
   - Delete only job-interviews OR life-events folder
   - Should display 0 for missing folder stats, continue with other stats

4. **No Authentication:**
   - Run without Google credentials
   - Should show "N/A" for contacts, all other stats normal

5. **Empty Folders:**
   - Create folders with no notes
   - Should show 0 notes, count as empty folders

6. **Large Dataset:**
   - Test with many folders and notes (e.g., 100 folders, 1000 notes)
   - Should complete within 10-30 seconds

7. **Folder Deleted Mid-Scan:**
   - Manually delete a folder while script is running
   - Should ignore the deleted folder and continue

8. **API Rate Limit:**
   - Trigger rate limit (if possible in test environment)
   - Should retry with backoff and show warning

9. **Corrupted Filenames:**
   - Add files with special characters or invalid names
   - Should skip problematic files and continue

10. **All Empty Folders:**
    - Create multiple folders with no `.txt` files
    - Should show empty folders count = total folders

11. **Files with Future Dates:**
    - Create files with modification times in the future (clock skew test)
    - Should handle gracefully, use birthtime or fallback to mtime

12. **Zero-byte Files:**
    - Create empty .txt files (0 bytes)
    - Should count them as notes but contribute 0 to storage

13. **Notes Created Exactly at Midnight:**
    - Create notes with timestamp exactly at 00:00:00
    - Should be counted as "today" if on current date

14. **Mixed Case File Extensions:**
    - Create files with .txt, .TXT, .Txt extensions
    - Should count all of them (case-insensitive check)

15. **Files with Special Characters:**
    - Create notes with emoji, unicode, RTL characters in filenames
    - Should handle gracefully or skip if filesystem issues occur

16. **Running Script Twice Rapidly:**
    - Run statistics command twice within cache TTL
    - Second run should use cached contact data (faster execution)

17. **Statistics Consistency:**
    - Verify totalNotes = jobNotes + hrNotes + eventNotes
    - Verify notesThisWeek >= notesToday
    - Verify totalFolders = jobFolders + hrFolders + eventFolders
    - Verify emptyFolders <= totalFolders

18. **Boundary Test - Exactly 1MB File:**
    - Create a .txt file with exactly 1,048,576 bytes
    - Should be counted correctly in storage calculation

19. **Number Formatting - Large Values:**
    - Test with > 99,999 notes to verify 6-digit padding works (000,000 format)
    - Test with > 999,999 contacts to verify overflow handling

20. **Authentication Token Expired:**
    - Test with expired Google token
    - Should show "N/A" for contacts, not crash the script

### Expected Output Example

```
[People API Stats] 📖 Read: 0, ✏️ Write: 0

===Statistics===

========Statistics========
=======Jobs: 000,007======
========HR: 000,003=======
=====Events: 000,008======
======Notes: 000,060======
===Contacts: 002,847======
===Job Notes: 000,035=====
====HR Notes: 000,025=====
==Event Notes: 000,000====
==Notes Today: 000,003====
===Notes Week: 000,015====
=Empty Folders: 000,002===
===Avg Job: 5.0 notes====
====Avg HR: 8.3 notes====
==Avg Event: 0.0 notes==
==Most Active: Job_Acme==
=====(23 notes)=========
===Oldest: 15/03/2024===
===Newest: 18/03/2026===
===Storage: 2.5 MB======
==========================

[People API Stats] 📖 Read: 3

✅ Statistics collected successfully
```

## Implementation Checklist

- [ ] Update `src/constants/formatUtils.ts` to support 6-digit padding (000,000 format)
- [ ] Update `src/settings/settings.ts` to add statistics configuration with displayWidth
- [ ] Create `src/types/statistics.ts` with comprehensive type definitions including StatisticsStage enum
- [ ] Create `src/services/statistics/statisticsCollector.ts` with collection logic
  - [ ] Implement `collectFolderStatistics()` - count folders and empty folders
  - [ ] Implement `collectNoteStatistics()` - count all .txt files with date tracking (birthtime, local timezone)
  - [ ] Implement `collectContactStatistics()` - use DuplicateDetector.fetchAllContacts() with cache
  - [ ] Implement `collectAverageStatistics()` - calculate averages
  - [ ] Implement `collectActivityStatistics()` - most active folder, dates, storage
  - [ ] Implement `collectAll()` - orchestrate all collection with spinner updates
  - [ ] Implement date helpers: `getFileCreationDate()`, `isToday()`, `isThisWeek()` with local timezone
- [ ] Create `src/scripts/statistics.ts` with main script implementation
  - [ ] Implement authentication handling following eventsJobsSync pattern
  - [ ] Implement progress spinner with ora (direct text updates, no callback)
  - [ ] Implement display formatting for all statistics with 6-digit numbers
  - [ ] Implement API tracking
  - [ ] Handle --no-cache flag
  - [ ] Add error handling for all edge cases
  - [ ] Implement `validateStatistics()` method for consistency checks
  - [ ] Implement `formatStorage()` with TB support
- [ ] Update `src/scripts/index.ts` to register the new script
- [ ] Update `src/index.ts` to add 'statistics' to script order (last position)
- [ ] Test via menu selection (`pnpm start`)
- [ ] Test via direct invocation (`pnpm script statistics`)
- [ ] Test with `--no-cache` flag
- [ ] Test all error scenarios:
  - [ ] Both folders missing (should throw error)
  - [ ] One folder missing (should continue)
  - [ ] No authentication (should show N/A for contacts)
  - [ ] Folder deleted mid-scan (should continue)
  - [ ] Empty folders (should count correctly)
  - [ ] Files with future dates (clock skew)
  - [ ] Zero-byte files
  - [ ] Notes created exactly at midnight
  - [ ] Mixed case file extensions (.txt, .TXT, .Txt)
  - [ ] Files with special characters in names
  - [ ] Running script twice rapidly (cache behavior)
  - [ ] Boundary test - exactly 1MB file
  - [ ] Number formatting with > 99,999 values
  - [ ] Expired authentication token
- [ ] Verify statistics consistency validation works correctly
- [ ] Verify number formatting with 6-digit leading zeros (000,000)
- [ ] Verify storage calculation is accurate (sum of file sizes)
- [ ] Verify date calculations use birthtime with mtime fallback and local timezone
- [ ] Verify most active folder detection
- [ ] Verify contact fetching uses DuplicateDetector with cache

## Future Enhancements

Potential additions for future versions:

1. **Detailed Breakdown:** Show per-folder statistics with drill-down capability
2. **Time-based Filtering:** Statistics for last week/month/year with date range selection
3. **Export to CSV/JSON:** Save statistics to a file for analysis
4. **Trend Analysis:** Compare with previous runs, show growth/decline
5. **Visual Charts:** ASCII charts for distribution (bar charts, histograms)
6. **Cache Statistics:** Include cache hit rates and sizes
7. **Performance Metrics:** Track and display script execution time per stage
8. **Custom Filters:** Allow filtering by folder type, date range, or note count threshold

## References

Existing code patterns to follow:
- [`src/scripts/contactsSync.ts`](../src/scripts/contactsSync.ts) - Script structure and DI
- [`src/scripts/eventsJobsSync.ts`](../src/scripts/eventsJobsSync.ts) - Folder scanning logic and error handling
- [`src/scripts/linkedinSync.ts`](../src/scripts/linkedinSync.ts) - Progress bar with ora and API tracking
- [`src/constants/formatUtils.ts`](../src/constants/formatUtils.ts) - Number formatting with leading zeros
- [`src/services/contacts/duplicateDetector.ts`](../src/services/contacts/duplicateDetector.ts) - Google API pattern reference
- [`src/settings/settings.ts`](../src/settings/settings.ts) - Path configuration
- [`src/utils/index.ts`](../src/utils/index.ts) - `retryWithBackoff` utility for API calls
- [`src/utils/dateFormatter.ts`](../src/utils/dateFormatter.ts) - Date formatting utilities

## Detailed Implementation Examples

### Example: Complete statisticsCollector.ts Structure

```typescript
import { promises as fs } from 'fs';
import { join } from 'path';
import { injectable, inject } from 'inversify';
import type { Ora } from 'ora';
import { Logger } from '../../logging/logger';
import { DuplicateDetector } from '../contacts/duplicateDetector';
import { SETTINGS } from '../../settings';
import { StatisticsStage } from '../../types/statistics';
import type {
  Statistics,
  FolderStatistics,
  NoteStatistics,
  ContactStatistics,
  AverageStatistics,
  ActivityStatistics,
} from '../../types/statistics';

type OAuth2Client = any;

interface FileMetadata {
  name: string;
  creationDate: Date;
  size: number;
}

interface FolderData {
  name: string;
  path: string;
  noteCount: number;
  files: FileMetadata[];
}

@injectable()
export class StatisticsCollector {
  private readonly logger: Logger;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new Logger('StatisticsCollector');
  }

  async collectAll(spinner: Ora): Promise<Statistics> {
    const timestamp = Date.now();
    await this.validateDirectories();
    spinner.text = 'Scanning job-interviews folder...';
    const jobData = await this.scanJobInterviewsFolder();
    spinner.text = 'Scanning life-events folder...';
    const eventData = await this.scanLifeEventsFolder();
    spinner.text = 'Calculating statistics...';
    const folders = this.calculateFolderStatistics(jobData, eventData);
    const notes = this.calculateNoteStatistics(jobData, eventData);
    const activity = this.calculateActivityStatistics(jobData, eventData);
    const averages = this.calculateAverages(folders, notes);
    spinner.text = 'Fetching Google contacts...';
    const contacts = await this.collectContactStatistics();
    return {
      folders,
      notes,
      contacts,
      averages,
      activity,
      timestamp,
    };
  }

  private async validateDirectories(): Promise<void> {
    const jobPath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
    let jobExists = false;
    let lifeEventsExists = false;
    try {
      await fs.access(jobPath);
      jobExists = true;
    } catch {}
    try {
      await fs.access(lifeEventsPath);
      lifeEventsExists = true;
    } catch {}
    if (!jobExists && !lifeEventsExists) {
      throw new Error(
        'At least one directory must exist (job-interviews or life-events)'
      );
    }
  }

  private getFileCreationDate(stats: any): Date {
    const birthtime = stats.birthtime;
    const mtime = stats.mtime;
    if (birthtime.getFullYear() === 1970 && birthtime.getMonth() === 0 && birthtime.getDate() === 1) {
      return mtime;
    }
    if (birthtime > new Date()) {
      return mtime;
    }
    return birthtime;
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return todayStart.getTime() === dateStart.getTime();
  }

  private isThisWeek(date: Date): boolean {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date >= weekAgo;
  }

  private async countNotesInFolder(
    folderPath: string
  ): Promise<{ count: number; files: FileMetadata[] }> {
    try {
      const files = await fs.readdir(folderPath);
      const txtFiles: FileMetadata[] = [];
      for (const file of files) {
        try {
          if (file.toLowerCase().endsWith('.txt')) {
            const filePath = join(folderPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              txtFiles.push({
                name: file,
                creationDate: this.getFileCreationDate(stats),
                size: stats.size,
              });
            }
          }
        } catch (error) {
          continue;
        }
      }
      return { count: txtFiles.length, files: txtFiles };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { count: 0, files: [] };
      }
      throw error;
    }
  }

  async collectContactStatistics(): Promise<ContactStatistics> {
    try {
      const contacts = await this.duplicateDetector['fetchAllContacts']();
      return { googleContacts: contacts.length };
    } catch (error) {
      this.logger.error('Failed to fetch contacts', { noPHI: true });
      return { googleContacts: -1 };
    }
  }

  // ... other methods similar to original plan but with updated date logic
}
```

### Example: Complete statistics.ts Display Logic

```typescript
private displayStatistics(stats: Statistics): void {
  const width = SETTINGS.statistics.displayWidth;
  
  const formatNumber = (num: number): string =>
    FormatUtils.formatNumberWithLeadingZeros(num, 6);
  
  const padLine = (content: string): string =>
    FormatUtils.padLineWithEquals(content, width);

  const contactDisplay =
    stats.contacts.googleContacts === -1
      ? 'N/A'
      : formatNumber(stats.contacts.googleContacts);

  const avgJobDisplay =
    stats.averages.avgNotesPerJob === null
      ? 'N/A'
      : `${stats.averages.avgNotesPerJob.toFixed(1)} notes`;
  const avgHRDisplay =
    stats.averages.avgNotesPerHR === null
      ? 'N/A'
      : `${stats.averages.avgNotesPerHR.toFixed(1)} notes`;
  const avgEventDisplay =
    stats.averages.avgNotesPerEvent === null
      ? 'N/A'
      : `${stats.averages.avgNotesPerEvent.toFixed(1)} notes`;

  const oldestDate = stats.activity.oldestNoteDate
    ? formatDateDDMMYYYY(stats.activity.oldestNoteDate)
    : 'N/A';
  const newestDate = stats.activity.newestNoteDate
    ? formatDateDDMMYYYY(stats.activity.newestNoteDate)
    : 'N/A';

  const storage = this.formatStorage(stats.activity.totalStorageBytes);

  const mostActive = stats.activity.mostActiveFolder || 'N/A';
  const mostActiveCount = stats.activity.mostActiveFolderCount;

  console.log('\n' + padLine('Statistics'));
  console.log(padLine(`Jobs: ${formatNumber(stats.folders.jobFolders)}`));
  console.log(padLine(`HR: ${formatNumber(stats.folders.hrFolders)}`));
  console.log(padLine(`Events: ${formatNumber(stats.folders.eventFolders)}`));
  console.log(padLine(`Notes: ${formatNumber(stats.notes.totalNotes)}`));
  console.log(padLine(`Contacts: ${contactDisplay}`));
  console.log(padLine(`Job Notes: ${formatNumber(stats.notes.jobNotes)}`));
  console.log(padLine(`HR Notes: ${formatNumber(stats.notes.hrNotes)}`));
  console.log(padLine(`Event Notes: ${formatNumber(stats.notes.eventNotes)}`));
  console.log(padLine(`Notes Today: ${formatNumber(stats.notes.notesToday)}`));
  console.log(padLine(`Notes Week: ${formatNumber(stats.notes.notesThisWeek)}`));
  console.log(padLine(`Empty Folders: ${formatNumber(stats.folders.emptyFolders)}`));
  console.log(padLine(`Avg Job: ${avgJobDisplay}`));
  console.log(padLine(`Avg HR: ${avgHRDisplay}`));
  console.log(padLine(`Avg Event: ${avgEventDisplay}`));
  console.log(padLine(`Most Active: ${mostActive}`));
  if (stats.activity.mostActiveFolder) {
    console.log(padLine(`(${mostActiveCount} notes)`));
  }
  console.log(padLine(`Oldest: ${oldestDate}`));
  console.log(padLine(`Newest: ${newestDate}`));
  console.log(padLine(`Storage: ${storage}`));
  console.log('='.repeat(width) + '\n');
}

private formatStorage(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(k, clampedIndex)).toFixed(1)} ${units[clampedIndex]}`;
}

private validateStatistics(stats: Statistics): void {
  const { folders, notes } = stats;
  
  const calculatedTotal = notes.jobNotes + notes.hrNotes + notes.eventNotes;
  if (notes.totalNotes !== calculatedTotal) {
    this.logger.warn(
      `Statistics inconsistency: totalNotes (${notes.totalNotes}) does not match sum (${calculatedTotal})`,
      { noPHI: true }
    );
  }
  
  if (notes.notesThisWeek < notes.notesToday) {
    this.logger.warn(
      `Statistics inconsistency: notesThisWeek (${notes.notesThisWeek}) < notesToday (${notes.notesToday})`,
      { noPHI: true }
    );
  }
  
  const calculatedTotalFolders = folders.jobFolders + folders.hrFolders + folders.eventFolders;
  if (folders.totalFolders !== calculatedTotalFolders) {
    this.logger.warn(
      `Statistics inconsistency: totalFolders (${folders.totalFolders}) does not match sum (${calculatedTotalFolders})`,
      { noPHI: true }
    );
  }
  
  if (folders.emptyFolders > folders.totalFolders) {
    this.logger.warn(
      `Statistics inconsistency: emptyFolders (${folders.emptyFolders}) > totalFolders (${folders.totalFolders})`,
      { noPHI: true }
    );
  }
}
```
