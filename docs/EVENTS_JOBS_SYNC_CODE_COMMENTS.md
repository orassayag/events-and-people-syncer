# Code Documentation Comments - Implementation Guide

This document lists all critical inline comments that should be added to the codebase to document important behaviors and edge cases.

## Files Requiring Comments

### 1. `src/services/notes/noteWriter.ts`

#### At top of file (after imports):
```typescript
/**
 * NoteWriter service handles all note file operations for Events & Jobs Sync.
 * 
 * File Naming Convention:
 * - Format: notes_DDMMYYYY-N.txt (e.g., notes_15032026-1.txt)
 * - Uses system local time (timezone-aware)
 * - Counter logic: Always uses max+1, ignoring gaps in sequence
 * - Counter CAN start at 0: If notes_15032026-0.txt exists, next is -1.txt
 * - Only files matching regex /^notes_\d{8}-\d+\.txt$/ are considered
 * - Files without counter (e.g., notes_15032026.txt) are ignored
 * 
 * Timezone Behavior:
 * - All date operations use system local timezone
 * - If timezone changes between runs, dates reflect new timezone
 * - If timezone changes DURING execution, subsequent operations use new timezone
 * - If system time goes backwards, may see warnings about "future" files (non-fatal)
 * 
 * Content Validation:
 * - Max size: 1MB (~1,048,576 characters)
 * - Binary data (null bytes) automatically rejected
 */
```

#### In `getNextFileName()` method (before maxCounter calculation):
```typescript
    let maxCounter = 0;
    for (const file of matchingFiles) {
      const match = file.match(/notes_\d{8}-(\d+)\.txt$/);
      if (match) {
        const counter = parseInt(match[1], 10);
        if (counter > maxCounter) {
          maxCounter = counter;
        }
      }
    }
    return `notes_${dateStr}-${maxCounter + 1}.txt`;
  }
```

### 2. `src/scripts/eventsJobsSync.ts`

#### At top of class (after member variables):
```typescript
export class EventsJobsSyncScript {
  /**
   * Events & Jobs Sync Script
   * 
   * Language Support: English only (no localization)
   * 
   * Logging Policy:
   * - Logs all actions: folder names, file paths, user selections, stats, errors
   * - NEVER logs: note content (may contain sensitive/personal information)
   * 
   * Single-User Design:
   * - Designed for single local user only
   * - No concurrent access handling needed (only one instance runs at a time)
   * 
   * Symlink Behavior:
   * - Follows symlinks to their target directories
   * - If dummy/job-interviews is a symlink, script scans the target
   * - Circular symlinks are NOT handled - user responsibility to avoid
   */
```

#### In `scanFolders()` method (before reading directories):
```typescript
  private async scanFolders(): Promise<void> {
    const jobFolders: FolderMapping[] = [];
    const lifeEventFolders: FolderMapping[] = [];
    const jobPath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
    try {
      await fs.access(jobPath);
      await this.logger.logMain('Scanning job-interviews folder...');
      const jobFiles = await fs.readdir(jobPath);
      for (const folderName of jobFiles) {
        const fullPath = join(jobPath, folderName);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) continue;
```

#### In `addContactFlow()` (before label inference):
```typescript
    let labelString = this.lastSelectedFolder.label;
    if (this.lastSelectedFolder.type === FolderTypeEnum.LIFE_EVENT) {
      const inferredLabel = this.labelResolver.inferLabelFromExisting(
        this.lastSelectedFolder.name,
        this.cachedContactGroups
      );
      if (inferredLabel) {
        labelString = inferredLabel;
        await this.logger.logMain(`Inferred label from existing folder: '${inferredLabel}'`);
      }
    }
```

### 3. `src/services/labels/labelResolver.ts`

#### In `inferLabelFromExisting()` method:
```typescript
  inferLabelFromExisting(folderName: string, contactGroups: ContactGroup[]): string | null {
    const words = folderName.trim().split(' ');
    for (const word of words) {
      const match = contactGroups.find((group: ContactGroup) => group.name === word);
      if (match) {
        return match.name;
      }
    }
    return null;
  }
```

### 4. `src/services/folders/folderManager.ts`

#### At top of class:
```typescript
export class FolderManager {
  /**
   * FolderManager - Centralized folder operations and parsing
   * 
   * SINGLE SOURCE OF TRUTH for folder parsing logic.
   * All folder name parsing MUST go through this service.
   * 
   * Validation Rules:
   * - Min length: 2 characters (after trimming)
   * - Illegal characters: / \ : * ? " < > |
   * - Reserved OS names: CON, PRN, AUX, NUL, COM1-9, LPT1-9 (Windows, case-insensitive)
   * - Path length: Max ~255 characters for full path
   * - Unicode: Rejects emojis and problematic Unicode characters
   * - Whitespace: Always trims leading/trailing spaces before processing
   * 
   * Empty Folder Detection:
   * - Filters hidden files (starting with '.')
   * - Filters Windows junk files (Thumbs.db, desktop.ini)
   * - Only counts visible files
   * 
   * Duplicate Detection:
   * - Case-insensitive check before folder creation
   * - Prevents "Job_Microsoft" and "Job_microsoft" conflicts
   */
```

### 5. `src/cache/folderCache.ts`

#### At top of class:
```typescript
export class FolderCache {
  /**
   * FolderCache - Singleton cache for folder mappings
   * 
   * Cache File: sources/.cache/folder-mappings.json
   * TTL: 24 hours
   * 
   * Validation:
   * - Zod schema validation on read
   * - Malformed JSON automatically invalidated
   * - Schema validation failures trigger automatic invalidation
   * 
   * Update Strategy:
   * - Immediate invalidation when folders created/deleted/renamed
   * - Automatic rescan after invalidation
   * - No stale data tolerated
   */
```

## Implementation Notes

### Why These Comments Matter

1. **Counter Starting at 0**: Non-obvious behavior that could confuse developers
2. **Timezone Behavior**: Critical for understanding date handling across timezone changes
3. **Symlink Following**: Default fs behavior but worth documenting
4. **Logging Policy**: Privacy/security concern - must be clear what gets logged
5. **English-Only**: Sets expectations for localization
6. **Reserved Names**: Windows-specific edge case that's easy to forget
7. **First-Match Logic**: Label inference behavior needs to be explicit

### How to Add These Comments

1. Copy relevant comment blocks from this file
2. Paste into the appropriate locations in source files
3. Adjust formatting to match existing code style
4. Ensure comments don't break linting rules

### Linting Considerations

- Keep lines under 120 characters
- Use JSDoc format (`/**  */`) for class/method documentation
- Use inline comments (`//`) for implementation details
- Avoid obvious comments (e.g., "increment counter")

## Related Documentation

- Setup Guide: `./EVENTS_JOBS_SYNC_SETUP.md`
- Implementation Plan: `./EVENTS_JOBS_SYNC_IMPLEMENTATION_PLAN.md`
- Testing Checklist: `./EVENTS_JOBS_SYNC_TESTING_CHECKLIST.md`
