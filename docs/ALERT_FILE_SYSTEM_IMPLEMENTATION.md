# Alert File System Implementation

## Overview

Both [`linkedinSync.ts`](../src/scripts/linkedinSync.ts) and [`hibobSync.ts`](../src/scripts/hibobSync.ts) currently track warnings, errors, and skipped contacts in memory during each run. We'll implement a persistent alert file system that:

1. Writes alerts to a **single persistent file per script** (`linkedin-sync_ALERTS.log` / `hibob-sync_ALERTS.log`)
2. Loads previous alerts on startup to initialize counters
3. Checks against previous alerts to skip already-processed problematic contacts
4. Displays alerts from the file in both pre-run and post-sync menus
5. Provides menu options to delete alert file or remove specific alerts by index
6. Shows alerts when file exceeds 200 entries threshold

## Key Design Decisions

**Single File Per Script**: 
- **LinkedIn**: `logs/linkedin-sync_ALERTS.log` (no date in filename)
- **HiBob**: `logs/hibob-sync_ALERTS.log` (no date in filename)
- Cumulative across all runs - never resets unless manually deleted
- Simplified management - no multiple files to track

**Matching Strategy**: Match contacts using all available fields with proper normalization
- LinkedIn: email (normalized), full name (normalized), and LinkedIn URL (normalized)
- HiBob: email (normalized) and full name (normalized)
- Email: proper validation (minimum check for @ symbol), case-insensitive, trimmed
- Names: Unicode normalization (NFC), case-insensitive, trimmed, extra spaces removed
- URLs: normalized (www prefix, trailing slashes handled), gracefully handles missing URLs for HiBob contacts

**File Format**: Text format with structured sections (similar to current log format but parseable)

**Counter Behavior**: Load ALL alerts from the file (cumulative across all runs) to prevent reprocessing

**Skip Behavior**: When a contact matches an existing alert, skip processing silently and track as "previously alerted"

**Observability**: Add `previouslyAlerted` counter to show how many contacts were skipped due to existing alerts

**CRITICAL - No Processing for Alerted Contacts**: 
- ⚠️ **WARNING**: Contacts with warnings (uncertain matches, multiple matches) are NOT added/updated to Google Contacts
- ⏭️ **SKIPPED**: Contacts that are skipped (missing required data) are NOT added to Google Contacts
- ❌ **ERROR**: Contacts with errors (API failures, validation errors) are NOT added to Google Contacts
- These contacts are logged to the alert file and completely bypassed in subsequent runs
- Once in the alert file, they will NEVER be processed unless manually removed from the file

**Manual Intervention**: Users can:
- Delete the entire alert file via menu option (available in both LinkedIn and HiBob sync scripts)
- Remove specific alerts by index via menu option (dropdown display with pagination)
- Manually edit the alert file in a text editor

**Alert Threshold Warning**: 
- When total alerts (warnings + errors + skipped) exceed 200 entries, display a prominent warning message
- Suggest reviewing and clearing old alerts
- Alert shown during pre-run menu initialization

## Implementation Steps

### 1. Add Pre-Run Menu to Both Scripts

Before processing contacts, both scripts will show a menu with options:

**Menu Options**:
```
👤 Process the contacts
⁉️  View Warnings / Skipped / Errors (with pagination)
🗑️  Delete Alert File (if alerts exist)
✏️  Remove Specific Alert (if alerts exist)
🚪 Exit
```

**Alert Threshold Warning**:
- If total alerts > 200, display warning before menu:
```
⚠️  WARNING: Alert file contains 250 entries (200+ threshold exceeded)
Consider reviewing and clearing old alerts to maintain performance.
```

**Menu Behavior**:
- If no alert file exists → only show "Process the contacts" and "Exit"
- If alert file exists → show all options including "View Alerts", "Delete Alert File", "Remove Specific Alert"
- "View Warnings / Skipped / Errors" displays alerts with pagination (show 10 at a time, option to show more)
- "Delete Alert File" prompts for confirmation, then deletes the entire file
- "Remove Specific Alert" shows paginated list of all alerts with indices, allows selection by dropdown

**Display Format** when viewing alerts (with pagination):
```
⚠️  Warnings (count):
====================
[list of first 10 warnings]

[Show More] or [Back to Menu]

⏭️  Skipped (count):
====================
[list of first 10 skipped]

[Show More] or [Back to Menu]

❌ Errors (count):
====================
[list of first 10 errors]

[Show More] or [Back to Menu]
```

**LinkedIn Sync Changes** ([`linkedinSync.ts`](../src/scripts/linkedinSync.ts)):
- Add `showPreRunMenu()` method before line 51 in the `run()` method
- Check if alert file exists and alert count
- Display threshold warning if alerts > 200
- Display menu using `selectWithEscape`
- If "Process" selected → continue to existing flow
- If "View Alerts" selected → call `displayAlertsWithPagination(alertLogger)` with pagination support
- If "Delete Alert File" selected → confirm and delete file, refresh menu
- If "Remove Specific Alert" selected → show paginated dropdown of alerts by index, remove selected, refresh menu
- If "Exit" selected → return gracefully

**HiBob Sync Changes** ([`hibobSync.ts`](../src/scripts/hibobSync.ts)):
- Add `showPreRunMenu()` method before line 47 in the `run()` method
- Same menu logic as LinkedIn sync with all options

### 2. Create Alert Logger Module

Create [`src/logging/alertLogger.ts`](../src/logging/alertLogger.ts) with the following capabilities:

**Logging System Role**:
- **AlertLogger**: Persistent alert tracking system for warnings, errors, and skipped contacts across runs
- **SyncLogger**: Daily run logs for debugging and audit trail (includes detailed sync operations)
- **Separation**: AlertLogger focuses on problematic contacts only; SyncLogger logs all operations
- Both systems work independently and serve different purposes

**File Management**:
- **Filename**: `${scriptName}_ALERTS.log` (NO DATE - single persistent file)
  - LinkedIn: `logs/linkedin-sync_ALERTS.log`
  - HiBob: `logs/hibob-sync_ALERTS.log`
- **Location**: `logs/` directory (same as current logs)
- **Mode**: Write immediately (no buffering) - each alert written synchronously to disk
- **Lifecycle**: File persists indefinitely until manually deleted
- **File Corruption**: If corruption detected during write, throw error immediately (fail fast)
- **Error Handling**: Comprehensive error handling with fallback strategies for all I/O operations

**Alert Entry Structure** (text-based, parseable):
```
[TYPE] === Alert Entry ===
[TYPE] Index: GLOBAL_INDEX
[TYPE] Timestamp: ISO_TIMESTAMP
[TYPE] Contact:
[TYPE]   -FirstName: VALUE
[TYPE]   -LastName: VALUE
[TYPE]   -Email: VALUE (or "(none)" if missing)
[TYPE]   -LinkedIn URL: VALUE (LinkedIn only, or "(none)" if missing)
[TYPE]   -Company: VALUE (LinkedIn only, or "(none)" if missing)
[TYPE] Reason: REASON_STRING
[TYPE] === End Entry ===
```

Where:
- `[TYPE]` is one of: `[WARNING]`, `[ERROR]`, `[SKIPPED]`
- `GLOBAL_INDEX` is a sequential number starting from 1, used for removing specific alerts

**Core Methods**:
- `async initialize()`: Create/open alert file, load existing alerts into memory with comprehensive error handling
- `async writeAlert(type, contact, reason)`: Write alert entry to file immediately (no buffering)
- `async deleteAlertFile()`: Delete the entire alert file
- `async removeAlertByIndex(index)`: Remove specific alert entry by its global index
- `isAlertedContact(contact)`: Check if contact matches any loaded alert using comprehensive matching
- `getAlertCounts()`: Return `{ warning: number, error: number, skipped: number, total: number }`
- `getCurrentRunAlerts()`: Return only alerts added during current run (for post-sync menu)
- `getAllAlerts()`: Return all alerts grouped by type with indices (for pre-run menu)
- `getAlertsByType(type, offset, limit)`: Return paginated array of alerts filtered by type
- `hasAlerts()`: Return true if alert file exists and has alerts
- `getPreviouslyAlertedCount()`: Return number of contacts skipped due to previous alerts
- `exceedsThreshold()`: Return true if total alerts > 200
- `checkForDuplicateAlert(contact)`: Check if alert for this contact already exists in current run (prevent duplicates)

**Matching Logic** (with proper normalization and Unicode support):
```typescript
private matchContact(contact: Contact, alertContact: AlertContact): boolean {
  // Priority 1: Email match (most reliable)
  if (this.hasValidEmail(contact) && this.hasValidEmail(alertContact)) {
    return this.normalizeEmail(contact.email) === this.normalizeEmail(alertContact.email);
  }
  
  // Priority 2: Name + URL match (for contacts without email)
  const namesMatch = this.normalizeFullName(contact) === this.normalizeFullName(alertContact);
  
  // Handle URLs gracefully for HiBob contacts (which don't have LinkedIn URLs)
  if (this.hasValidUrl(contact) && this.hasValidUrl(alertContact)) {
    return namesMatch && this.normalizeUrl(contact.url) === this.normalizeUrl(alertContact.url);
  }
  
  // Priority 3: Name-only match (when both missing email and URL)
  // Only match if names are identical after normalization
  return namesMatch && !this.hasValidEmail(contact) && !this.hasValidUrl(contact);
}

private normalizeEmail(email: string): string {
  // Minimum validation: must contain @
  if (!email.includes('@')) {
    return '';
  }
  return email.trim().toLowerCase();
}

private normalizeFullName(contact: Contact): string {
  // Use Unicode NFC normalization to handle accented characters properly
  const firstName = (contact.firstName || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const lastName = (contact.lastName || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${firstName} ${lastName}`.trim();
}

private normalizeUrl(url: string): string {
  // Gracefully handle missing URLs (return empty string)
  if (!url) {
    return '';
  }
  return url.trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')  // Remove protocol and www
    .replace(/\/$/, '');                   // Remove trailing slash
}

private hasValidEmail(contact: Contact): boolean {
  return !!contact.email && contact.email.trim().length > 0 && contact.email.includes('@');
}

private hasValidUrl(contact: Contact): boolean {
  // Gracefully handle missing URL field for HiBob contacts
  return !!contact.url && contact.url.trim().length > 0;
}
```

**Error Recovery & Handling**:
```typescript
interface ParseResult {
  validAlerts: Alert[];
  corruptedEntries: number;
  parseErrors: string[];
}

// During initialize():
// 1. Read entire file with try-catch for I/O errors
// 2. Parse entry by entry
// 3. Skip corrupted entries, log warning
// 4. Continue with valid entries
// 5. If entire file is corrupted, throw error (fail fast - do not silently continue)

// Comprehensive error handling:
// - File read errors: Log error and throw (cannot proceed without loading existing alerts)
// - File write errors: Throw immediately (corruption during write must be visible)
// - Permission errors: Throw with clear message
// - Disk full errors: Throw with clear message
// - Parse errors for individual entries: Skip entry, log warning, continue with others
// - Empty file: Treat as valid (no alerts yet)

// Fallback strategies:
// - If file doesn't exist: Create new file
// - If file is empty: Initialize with no alerts
// - If some entries corrupted: Load valid entries, log count of corrupted entries
// - If entire file corrupted: Throw error and require manual intervention (delete file)
```

**Duplicate Alert Prevention**:
- Before writing alert, check if contact already has alert in current run
- Use `checkForDuplicateAlert()` to prevent same contact being alerted multiple times in one run
- Track current run alerts separately from historical alerts

### 3. Integrate with LinkedIn Sync Script

Modify [`linkedinSync.ts`](../src/scripts/linkedinSync.ts):

**Pre-Run Menu** (beginning of `run()` method, before line 51):

```typescript
async run(): Promise<void> {
  this.isCancelled = false;
  this.warningConnections = [];
  this.errorConnections = [];
  this.skippedConnections = [];
  
  // Initialize alert logger to check for existing alerts
  const alertLogger = new AlertLogger('linkedin-sync');
  await alertLogger.initialize();
  
  // Show pre-run menu
  const shouldContinue = await this.showPreRunMenu(alertLogger);
  if (!shouldContinue) {
    return;
  }
  
  // Continue with existing flow...
  await LogCleanup.cleanOldLogs();
  // ...
}
```

**Add Pre-Run Menu Method**:

```typescript
private async showPreRunMenu(alertLogger: AlertLogger): Promise<boolean> {
  const hasAlerts = alertLogger.hasAlerts();
  
  while (true) {
    // Show threshold warning if alerts exceed 200
    if (alertLogger.exceedsThreshold()) {
      const counts = alertLogger.getAlertCounts();
      this.uiLogger.displayWarning(
        `⚠️  WARNING: Alert file contains ${counts.total} entries (200+ threshold exceeded)`
      );
      this.uiLogger.displayWarning(
        'Consider reviewing and clearing old alerts to maintain performance.'
      );
      this.uiLogger.breakline();
    }
    
    const choices: Array<{ name: string; value: string }> = [];
    
    choices.push({
      name: `${EMOJIS.FIELDS.PERSON} Process the contacts`,
      value: 'process',
    });
    
    if (hasAlerts) {
      const counts = alertLogger.getAlertCounts();
      const total = counts.warning + counts.error + counts.skipped;
      choices.push({
        name: `${EMOJIS.DATA.REASON} View Warnings / Skipped / Errors (${total})`,
        value: 'view_alerts',
      });
      choices.push({
        name: `${EMOJIS.ACTIONS.DELETE} Delete Alert File`,
        value: 'delete_file',
      });
      choices.push({
        name: `${EMOJIS.ACTIONS.EDIT} Remove Specific Alert`,
        value: 'remove_alert',
      });
    }
    
    choices.push({
      name: `${EMOJIS.NAVIGATION.EXIT} Exit`,
      value: 'exit',
    });
    
    const result = await selectWithEscape<string>({
      message: 'LinkedIn Sync - What would you like to do:',
      loop: false,
      choices,
    });
    
    if (result.escaped || result.value === 'exit') {
      this.uiLogger.displayExit();
      return false;
    }
    
    if (result.value === 'process') {
      return true;
    }
    
    if (result.value === 'view_alerts') {
      await this.displayAlertsWithPagination(alertLogger);
      continue;
    }
    
    if (result.value === 'delete_file') {
      const confirmed = await confirmWithEscape({
        message: 'Are you sure you want to delete the entire alert file? This cannot be undone.',
        default: false,
      });
      if (!confirmed.escaped && confirmed.value) {
        await alertLogger.deleteAlertFile();
        this.uiLogger.displayInfo('Alert file deleted successfully.');
        return await this.showPreRunMenu(alertLogger); // Refresh menu
      }
      continue;
    }
    
    if (result.value === 'remove_alert') {
      await this.removeSpecificAlert(alertLogger);
      continue;
    }
  }
}
```

**Add Display Alerts with Pagination Method**:

```typescript
private async displayAlertsWithPagination(alertLogger: AlertLogger): Promise<void> {
  const allAlerts = alertLogger.getAllAlerts();
  const counts = alertLogger.getAlertCounts();
  
  this.uiLogger.breakline();
  
  // Display each alert type with pagination
  await this.displayAlertTypeWithPagination('warning', allAlerts.warnings, counts.warning, alertLogger);
  await this.displayAlertTypeWithPagination('skipped', allAlerts.skipped, counts.skipped, alertLogger);
  await this.displayAlertTypeWithPagination('error', allAlerts.errors, counts.error, alertLogger);
}

private async displayAlertTypeWithPagination(
  type: 'warning' | 'skipped' | 'error',
  alerts: Alert[],
  count: number,
  alertLogger: AlertLogger
): Promise<void> {
  if (count === 0) {
    return;
  }
  
  const emoji = type === 'warning' ? EMOJIS.STATUS.WARNING : 
                type === 'skipped' ? EMOJIS.NAVIGATION.SKIP : 
                EMOJIS.STATUS.ERROR;
  const title = type === 'warning' ? 'Warnings' : 
                type === 'skipped' ? 'Skipped' : 
                'Errors';
  
  let offset = 0;
  const pageSize = 10;
  
  while (true) {
    this.uiLogger.info(
      `${emoji} ${title} (${FormatUtils.formatNumberWithLeadingZeros(count)}):`,
      {},
      false
    );
    this.uiLogger.info('='.repeat(55), {}, false);
    
    const pageAlerts = alerts.slice(offset, offset + pageSize);
    for (let i = 0; i < pageAlerts.length; i++) {
      this.displayAlertEntry(pageAlerts[i], offset + i + 1);
    }
    
    const hasMore = offset + pageSize < count;
    const remaining = count - (offset + pageSize);
    
    if (hasMore) {
      this.uiLogger.info(
        `... and ${remaining} more ${type} alerts`,
        {},
        false
      );
      
      const result = await selectWithEscape<string>({
        message: 'What would you like to do?',
        loop: false,
        choices: [
          { name: 'Show More', value: 'more' },
          { name: 'Back to Menu', value: 'back' },
        ],
      });
      
      if (result.escaped || result.value === 'back') {
        break;
      }
      
      if (result.value === 'more') {
        offset += pageSize;
        this.uiLogger.breakline();
        continue;
      }
    } else {
      break;
    }
  }
  
  this.uiLogger.breakline();
}

private displayAlertEntry(alert: Alert, index: number): void {
  const personNumber = FormatUtils.formatNumberWithLeadingZeros(index);
  this.uiLogger.info(`  Alert ${personNumber} (Index: ${alert.index}):`, {}, false);
  this.uiLogger.info(`    -Name: ${alert.contact.firstName} ${alert.contact.lastName}`, {}, false);
  if (alert.contact.email) {
    this.uiLogger.info(`    -Email: ${alert.contact.email}`, {}, false);
  }
  if (alert.contact.company) {
    this.uiLogger.info(`    -Company: ${alert.contact.company}`, {}, false);
  }
  if (alert.reason) {
    this.uiLogger.info(`    -Reason: ${alert.reason}`, {}, false);
  }
  this.uiLogger.info('', {}, false);
}
```

**Add Remove Specific Alert Method**:

```typescript
private async removeSpecificAlert(alertLogger: AlertLogger): Promise<void> {
  const allAlerts = alertLogger.getAllAlerts();
  const allAlertsList: Alert[] = [
    ...allAlerts.warnings,
    ...allAlerts.skipped,
    ...allAlerts.errors,
  ];
  
  if (allAlertsList.length === 0) {
    this.uiLogger.displayInfo('No alerts to remove.');
    return;
  }
  
  // Paginated display of alerts for selection
  let offset = 0;
  const pageSize = 10;
  
  while (true) {
    this.uiLogger.breakline();
    this.uiLogger.info('Select alert to remove:', {}, false);
    this.uiLogger.info('='.repeat(55), {}, false);
    
    const pageAlerts = allAlertsList.slice(offset, offset + pageSize);
    const choices: Array<{ name: string; value: string }> = [];
    
    for (const alert of pageAlerts) {
      const typeEmoji = alert.type === 'warning' ? EMOJIS.STATUS.WARNING :
                        alert.type === 'skipped' ? EMOJIS.NAVIGATION.SKIP :
                        EMOJIS.STATUS.ERROR;
      const name = `${typeEmoji} Index ${alert.index}: ${alert.contact.firstName} ${alert.contact.lastName} - ${alert.reason}`;
      choices.push({ name, value: String(alert.index) });
    }
    
    const hasMore = offset + pageSize < allAlertsList.length;
    if (hasMore) {
      choices.push({ name: 'Show More Alerts', value: 'more' });
    }
    
    choices.push({ name: 'Back to Menu', value: 'back' });
    
    const result = await selectWithEscape<string>({
      message: 'Select an alert to remove:',
      loop: false,
      choices,
    });
    
    if (result.escaped || result.value === 'back') {
      return;
    }
    
    if (result.value === 'more') {
      offset += pageSize;
      continue;
    }
    
    // Remove the selected alert
    const indexToRemove = parseInt(result.value, 10);
    await alertLogger.removeAlertByIndex(indexToRemove);
    this.uiLogger.displayInfo(`Alert ${indexToRemove} removed successfully.`);
    return;
  }
}
```

**Initialization** (after pre-run menu, ~line 62):

```typescript
// Alert logger already initialized in pre-run menu
const previousCounts = alertLogger.getAlertCounts();
```

**Status Bar Initialization** (~line 152):

```typescript
statusBar.startProcessPhase(connections.length, previousCounts);
// SyncStatusBar needs to accept initial counts
```

**Contact Processing Loop** (~line 163, start of for loop):

```typescript
for (const connection of connectionsToProcess) {
  if (this.isCancelled) break;
  
  // NEW: Check if contact was previously alerted
  if (alertLogger.isAlertedContact(connection)) {
    status.previouslyAlerted++;  // Track for observability
    statusBar.updateStatus(status);
    continue; // Skip silently, don't process
  }
  
  // Existing processing logic...
  // IMPORTANT: The existing logic already handles NOT adding contacts with issues:
  
  // 1. UNCERTAIN matches (warnings):
  if (matchResult.matchType === MatchType.UNCERTAIN) {
    // Check for duplicate alert in current run before writing
    if (!alertLogger.checkForDuplicateAlert(connection)) {
      status.warning++;
      await alertLogger.writeAlert('warning', connection, ALERT_REASONS.WARNING.UNCERTAIN_MATCH);
    }
    // NO CALL TO addContact() or updateContact() - contact is NOT added to Google
  }
  
  // 2. NONE matches - only add if NO issues:
  else if (matchResult.matchType === MatchType.NONE) {
    const syncStatus = await this.contactSyncer.addContact(connection, label, 'LinkedIn');
    
    if (syncStatus === SyncStatusType.NEW) {
      status.new++;  // SUCCESS - contact WAS added
    } 
    else if (syncStatus === SyncStatusType.SKIPPED) {
      // Check for duplicate alert before writing
      if (!alertLogger.checkForDuplicateAlert(connection)) {
        status.skipped++;
        await alertLogger.writeAlert('skipped', connection, ALERT_REASONS.SKIPPED.MISSING_REQUIRED_DATA);
      }
      // Contact was NOT added due to missing data
    } 
    else if (syncStatus === SyncStatusType.ERROR) {
      // Check for duplicate alert before writing
      if (!alertLogger.checkForDuplicateAlert(connection)) {
        status.error++;
        await alertLogger.writeAlert('error', connection, ALERT_REASONS.ERROR.API_CREATE_FAILED);
      }
      // Contact was NOT added due to API/validation error
    }
  }
  
  // 3. EXACT/FUZZY matches - only update if NO issues:
  else {
    const syncResult = await this.contactSyncer.updateContact(...);
    
    if (syncResult.status === SyncStatusType.UPDATED) {
      status.updated++;  // SUCCESS - contact WAS updated
    }
    else if (syncResult.status === SyncStatusType.UP_TO_DATE) {
      status.upToDate++;  // SUCCESS - no changes needed
    }
    else if (syncResult.status === SyncStatusType.ERROR) {
      // Check for duplicate alert before writing
      if (!alertLogger.checkForDuplicateAlert(connection)) {
        status.error++;
        await alertLogger.writeAlert('error', connection, ALERT_REASONS.ERROR.API_UPDATE_FAILED);
      }
      // Contact was NOT updated due to API/validation error
    }
  }
}
```

**Alert Recording** (replace in-memory array pushes):
- Line 175-189 (warning): `await alertLogger.writeAlert('warning', connection, reason)`
- Line 203-210 (skipped): `await alertLogger.writeAlert('skipped', connection, reason)`
- Line 212-220 (error): `await alertLogger.writeAlert('error', connection, reason)`
- Lines 224-232, 273-280, 289-297 (other errors): same pattern

**Post-Sync Menu** (~line 326):

```typescript
// Replace in-memory arrays with alert logger
await this.showPostSyncMenu(status, alertLogger);
```

**Display Method** (~line 529-543):

```typescript
private async showPostSyncMenu(status: SyncStatus, alertLogger: AlertLogger) {
  // IMPORTANT: Only show alerts from CURRENT RUN, not historical alerts
  // Use alertLogger.getCurrentRunAlerts() instead of getAllAlerts()
  const currentRunAlerts = alertLogger.getCurrentRunAlerts();
  
  // Display menu with options for warnings/errors/skipped from THIS RUN ONLY
}
```

### 4. Integrate with HiBob Sync Script

Apply the same pattern to [`hibobSync.ts`](../src/scripts/hibobSync.ts):

**Pre-Run Menu** (beginning of `run()` method, before line 47):

```typescript
async run(): Promise<void> {
  this.isCancelled = false;
  this.warningContacts = [];
  this.errorContacts = [];
  this.skippedContacts = [];
  
  // Initialize alert logger to check for existing alerts
  const alertLogger = new AlertLogger('hibob-sync');
  await alertLogger.initialize();
  
  // Show pre-run menu
  const shouldContinue = await this.showPreRunMenu(alertLogger);
  if (!shouldContinue) {
    return;
  }
  
  // Continue with existing flow...
  await LogCleanup.cleanOldLogs();
  // ...
}
```

**Add Pre-Run Menu Method** (same structure as LinkedIn with all new features):

```typescript
private async showPreRunMenu(alertLogger: AlertLogger): Promise<boolean> {
  const hasAlerts = alertLogger.hasAlerts();
  
  while (true) {
    // Show threshold warning if alerts exceed 200
    if (alertLogger.exceedsThreshold()) {
      const counts = alertLogger.getAlertCounts();
      this.uiLogger.displayWarning(
        `⚠️  WARNING: Alert file contains ${counts.total} entries (200+ threshold exceeded)`
      );
      this.uiLogger.displayWarning(
        'Consider reviewing and clearing old alerts to maintain performance.'
      );
      this.uiLogger.breakline();
    }
    
    const choices: Array<{ name: string; value: string }> = [];
    
    choices.push({
      name: `${EMOJIS.FIELDS.PERSON} Process the contacts`,
      value: 'process',
    });
    
    if (hasAlerts) {
      const counts = alertLogger.getAlertCounts();
      const total = counts.warning + counts.error + counts.skipped;
      choices.push({
        name: `${EMOJIS.DATA.REASON} View Warnings / Skipped / Errors (${total})`,
        value: 'view_alerts',
      });
      choices.push({
        name: `${EMOJIS.ACTIONS.DELETE} Delete Alert File`,
        value: 'delete_file',
      });
      choices.push({
        name: `${EMOJIS.ACTIONS.EDIT} Remove Specific Alert`,
        value: 'remove_alert',
      });
    }
    
    choices.push({
      name: `${EMOJIS.NAVIGATION.EXIT} Exit`,
      value: 'exit',
    });
    
    const result = await selectWithEscape<string>({
      message: 'HiBob Sync - What would you like to do:',
      loop: false,
      choices,
    });
    
    if (result.escaped || result.value === 'exit') {
      this.uiLogger.displayExit();
      return false;
    }
    
    if (result.value === 'process') {
      return true;
    }
    
    if (result.value === 'view_alerts') {
      await this.displayAlertsWithPagination(alertLogger);
      continue;
    }
    
    if (result.value === 'delete_file') {
      const confirmed = await confirmWithEscape({
        message: 'Are you sure you want to delete the entire alert file? This cannot be undone.',
        default: false,
      });
      if (!confirmed.escaped && confirmed.value) {
        await alertLogger.deleteAlertFile();
        this.uiLogger.displayInfo('Alert file deleted successfully.');
        return await this.showPreRunMenu(alertLogger); // Refresh menu
      }
      continue;
    }
    
    if (result.value === 'remove_alert') {
      await this.removeSpecificAlert(alertLogger);
      continue;
    }
  }
}
```

**Add Display Methods** (similar to LinkedIn but adapted for HiBob contact structure):

```typescript
private async displayAlertsWithPagination(alertLogger: AlertLogger): Promise<void> {
  // Same implementation as LinkedIn
  // Adapted to display HiBob contact fields (no company/LinkedIn URL fields)
}

private async displayAlertTypeWithPagination(
  type: 'warning' | 'skipped' | 'error',
  alerts: Alert[],
  count: number,
  alertLogger: AlertLogger
): Promise<void> {
  // Same implementation as LinkedIn
}

private displayAlertEntry(alert: Alert, index: number): void {
  // Adapted for HiBob - no company/LinkedIn URL fields
  const personNumber = FormatUtils.formatNumberWithLeadingZeros(index);
  this.uiLogger.info(`  Alert ${personNumber} (Index: ${alert.index}):`, {}, false);
  this.uiLogger.info(`    -Name: ${alert.contact.firstName} ${alert.contact.lastName || ''}`, {}, false);
  if (alert.contact.email) {
    this.uiLogger.info(`    -Email: ${alert.contact.email}`, {}, false);
  }
  if (alert.reason) {
    this.uiLogger.info(`    -Reason: ${alert.reason}`, {}, false);
  }
  this.uiLogger.info('', {}, false);
}

private async removeSpecificAlert(alertLogger: AlertLogger): Promise<void> {
  // Same implementation as LinkedIn
}
```

**Initialization** (~line 58):

```typescript
// Alert logger already initialized in pre-run menu
const previousCounts = alertLogger.getAlertCounts();
```

**Status Bar Initialization** (~line 191):

```typescript
statusBar.startProcessPhase(contactsToProcess.length, previousCounts);
```

**Contact Processing Loop** (~line 202):

```typescript
for (const contact of contactsToProcess) {
  if (this.isCancelled) break;
  
  // NEW: Check if contact was previously alerted
  if (alertLogger.isAlertedContact(contact)) {
    status.previouslyAlerted++;  // Track for observability
    statusBar.updateStatus(status);
    continue; // Skip silently
  }
  
  // Existing processing...
}
```

**Alert Recording** (replace in-memory pushes):
- Line 241-248 (warning): `await alertLogger.writeAlert('warning', contact, reason)`
- Line 259-266 (skipped): `await alertLogger.writeAlert('skipped', contact, reason)`
- Line 269-277 (error): `await alertLogger.writeAlert('error', contact, reason)`
- Lines 284-291, 310-317, 326-335 (other errors): same pattern

**Post-Sync Menu** (~line 359):

```typescript
await this.postSyncMenu(status, alertLogger);
```

**Display Method** (~line 538-543):

```typescript
private async postSyncMenu(status: SyncStatus, alertLogger: AlertLogger) {
  // IMPORTANT: Only show alerts from CURRENT RUN, not historical alerts
  const currentRunAlerts = alertLogger.getCurrentRunAlerts();
}
```

### 5. Update SyncStatusBar

Modify [`syncStatusBar.ts`](../src/flow/syncStatusBar.ts):

**Update `startProcessPhase` method** (~line 70):

```typescript
startProcessPhase(totalConnections: number, initialCounts?: Partial<SyncStatus>): void {
  this.phase = 'process';
  this.totalConnections = totalConnections;
  
  // DO NOT merge initial counts into current status
  // Keep them separate for display clarity
  this.previousCounts = initialCounts || { warning: 0, error: 0, skipped: 0 };
  
  // ... rest of method
}
```

**Update display format** to show previous vs. current:

```typescript
private formatProcessStatus(): string {
  // ... existing code ...
  
  // Show current run counters
  const line1 = `${spinnerPadding}This Run - Warning: ${warning} | Error: ${error} | Skipped: ${skipped}`;
  
  // Show previous alerts summary if any exist
  const prevTotal = this.previousCounts.warning + this.previousCounts.error + this.previousCounts.skipped;
  const line2 = prevTotal > 0 
    ? `${spinnerPadding}Previously Alerted: ${prevTotal} contacts (not reprocessed)`
    : '';
  
  result += `\n${line1}`;
  if (line2) {
    result += `\n${line2}`;
  }
  
  // ... rest of formatting
}
```

This provides clear separation between current run issues and historical alerts.

### 6. Update Type Definitions

**Add Type Definitions for Alert System** (new file or in alertLogger.ts):

```typescript
// Alert types
export type AlertType = 'warning' | 'error' | 'skipped';

// Alert entry structure
export interface Alert {
  index: number;  // Global sequential index for removal
  type: AlertType;
  timestamp: string;  // ISO string
  contact: AlertContact;
  reason: string;
}

// Contact information stored in alert
export interface AlertContact {
  firstName: string;
  lastName: string;
  email?: string;
  url?: string;  // LinkedIn URL (not present for HiBob contacts)
  company?: string;  // Company name (not present for HiBob contacts)
}

// Alert counts structure
export interface AlertCounts {
  warning: number;
  error: number;
  skipped: number;
  total: number;
}

// Grouped alerts structure
export interface GroupedAlerts {
  warnings: Alert[];
  errors: Alert[];
  skipped: Alert[];
}
```

**Standardized Alert Reasons** (add to alertLogger.ts or separate constants file):

```typescript
export const ALERT_REASONS = {
  WARNING: {
    UNCERTAIN_MATCH: 'Multiple matches or uncertain match',
    FUZZY_MATCH_LOW_CONFIDENCE: 'Fuzzy match with low confidence score',
  },
  ERROR: {
    API_CREATE_FAILED: 'Failed to create contact via Google API',
    API_UPDATE_FAILED: 'Failed to update contact via Google API',
    VALIDATION_FAILED: 'Contact data failed validation',
    MISSING_RESOURCE_NAME: 'Match found but no resourceName available',
    UNEXPECTED_ERROR: 'Unexpected error during processing',
  },
  SKIPPED: {
    MISSING_REQUIRED_DATA: 'Missing required data (email or name)',
    MISSING_EMAIL: 'Missing email address',
    MISSING_NAME: 'Missing first or last name',
    INVALID_EMAIL_FORMAT: 'Email address format is invalid',
  },
} as const;

// Type for alert reasons (for type safety)
export type AlertReason = 
  | typeof ALERT_REASONS.WARNING[keyof typeof ALERT_REASONS.WARNING]
  | typeof ALERT_REASONS.ERROR[keyof typeof ALERT_REASONS.ERROR]
  | typeof ALERT_REASONS.SKIPPED[keyof typeof ALERT_REASONS.SKIPPED];
```

Update [`linkedin.ts`](../src/types/linkedin.ts) to add `previouslyAlerted` counter:

```typescript
export interface SyncStatus {
  processed: number;
  new: number;
  upToDate: number;
  updated: number;
  warning: number;
  needClarification: number;
  error: number;
  skipped: number;
  previouslyAlerted: number; // NEW: contacts skipped due to existing alerts
}
```

Same update needed for [`hibob.ts`](../src/types/hibob.ts):

```typescript
export interface HibobSyncStatus {
  processed: number;
  new: number;
  upToDate: number;
  updated: number;
  warning: number;
  needClarification: number;
  error: number;
  skipped: number;
  previouslyAlerted: number; // NEW: contacts skipped due to existing alerts
}
```

### 7. Update LogCleanup to Exclude Alert Files

Modify [`logCleanup.ts`](../src/logging/logCleanup.ts) to exclude alert files from automatic cleanup:

```typescript
private static async cleanDirectory(dirPath: string, retentionMs: number, now: number): Promise<void> {
  try {
    const files: string[] = await fs.readdir(dirPath);
    for (const file of files) {
      if (file === '.health-check') {
        continue;
      }
      
      // NEW: Skip alert files (identified by _ALERTS.log suffix)
      if (file.endsWith('_ALERTS.log')) {
        continue;
      }
      
      const filePath: string = join(dirPath, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          const ageMs: number = now - stats.mtimeMs;
          if (ageMs > retentionMs) {
            await fs.unlink(filePath);
            console.log(`Deleted old log file: ${file} (age: ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days)`);
          }
        }
      } catch (error: unknown) {
        console.warn(`Failed to process file ${file}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  } catch (error: unknown) {
    console.warn(`Failed to clean directory ${dirPath}:`, error instanceof Error ? error.message : 'Unknown error');
  }
}
```

### 8. Remove In-Memory Alert Arrays

Both sync scripts maintain in-memory arrays (`warningConnections`, `errorConnections`, `skippedConnections`):
- [`linkedinSync.ts`](../src/scripts/linkedinSync.ts): lines 39-41
- [`hibobSync.ts`](../src/scripts/hibobSync.ts): lines 36-38

These can be removed after migration to AlertLogger, or kept as backup during transition.

## Data Flow

```
Script Start
    ↓
Initialize AlertLogger
    ↓
Load existing alerts from ALERTS file
    ↓
Show Pre-Run Menu
    ↓
User selects "View Alerts"? → YES → Display all alerts (warnings/skipped/errors) → Back to menu
    ↓ NO (Process selected)
Calculate initial counts
    ↓
Pass counts to StatusBar
    ↓
For each contact:
    ↓
    Check if alerted before → YES → Skip silently (no counter update)
    ↓ NO
    Process contact
    ↓
    Problem detected? → YES → Log to ALERTS file → STOP (DO NOT ADD TO GOOGLE CONTACTS)
    ↓ NO
    Contact is valid → Add/Update in Google Contacts
    ↓
    Update counters (only for NEW alerts and successful operations)
    ↓
Script End
    ↓
Display post-sync menu using alerts from file
```

## Important Processing Rules

### When Warnings Occur:
- **Contact is NOT added to Google Contacts**
- Written to alert file as `[WARNING]`
- Counter incremented
- Contact will be skipped on all future runs

### When Skipped:
- **Contact is NOT added to Google Contacts**
- Written to alert file as `[SKIPPED]`
- Counter incremented
- Contact will be skipped on all future runs
- Example: Missing required fields (email, name)

### When Errors Occur:
- **Contact is NOT added to Google Contacts**
- Written to alert file as `[ERROR]`
- Counter incremented
- Contact will be skipped on all future runs
- Example: API failures, validation errors

### Only Successful Contacts:
- Contacts with NO warnings, errors, or skip conditions
- These are added/updated in Google Contacts
- Counted as: NEW, UPDATED, or UP_TO_DATE

## File Example

`linkedin-sync_ALERTS.log` (single persistent file, no date):

```
[WARNING] === Alert Entry ===
[WARNING] Timestamp: 2026-03-21T10:30:15.123Z
[WARNING] Contact:
[WARNING]   -FirstName: John
[WARNING]   -LastName: Doe
[WARNING]   -Email: john.doe@example.com
[WARNING]   -LinkedIn URL: https://linkedin.com/in/johndoe
[WARNING]   -Company: Acme Corp
[WARNING] Reason: Multiple matches or uncertain match
[WARNING] === End Entry ===

[ERROR] === Alert Entry ===
[ERROR] Timestamp: 2026-03-21T10:30:20.456Z
[ERROR] Contact:
[ERROR]   -FirstName: Jane
[ERROR]   -LastName: Smith
[ERROR]   -Email: jane.smith@example.com
[ERROR]   -LinkedIn URL: https://linkedin.com/in/janesmith
[ERROR]   -Company: (none)
[ERROR] Reason: Failed to create contact
[ERROR] === End Entry ===

[SKIPPED] === Alert Entry ===
[SKIPPED] Timestamp: 2026-03-22T09:15:33.789Z
[SKIPPED] Contact:
[SKIPPED]   -FirstName: Bob
[SKIPPED]   -LastName: Johnson
[SKIPPED]   -Email: (none)
[SKIPPED]   -LinkedIn URL: (none)
[SKIPPED]   -Company: Tech Inc
[SKIPPED] Reason: Missing required data
[SKIPPED] === End Entry ===
```

**Note**: This file grows indefinitely. Users can:
1. Manually delete the entire file to start fresh
2. Manually edit the file to remove specific entries
3. Search the file to review specific contacts

## Testing Considerations

1. **First Run**: No alert file exists → counters start at 0, all contacts processed
2. **Second Run**: Alert file exists → alerted contacts skipped, `previouslyAlerted` counter shows how many
3. **New Alerts**: New problems found → appended to file, counters show new issues from this run
4. **Pre-Run Menu**: Shows ALL historical alerts from the single file
5. **Post-Sync Menu**: Shows ONLY alerts from current run
6. **File Growth**: File grows indefinitely - monitor size over time
7. **Manual Intervention**: Test deleting file, editing entries, partial corruption recovery

## Edge Cases & Error Handling

### 1. Contact Matching Edge Cases
- **Empty fields**: Contacts with missing email/name/URL require fallback matching
- **Name variations**: "John Smith" vs "john  smith" vs "JOHN SMITH" → all normalize to same via Unicode NFC
- **Unicode characters**: "José" normalized consistently using NFC normalization
- **URL variations**: "linkedin.com/in/john" vs "www.linkedin.com/in/john/" → normalize to same
- **Email validation**: Must contain "@" symbol, case-insensitive matching
- **Missing URLs**: Gracefully handled for HiBob contacts (which don't have LinkedIn URLs)

### 2. File Corruption Handling
- **Incomplete entries**: Parser skips to next valid entry, logs warning
- **Invalid format**: Log warning, continue with valid entries
- **Empty file**: Treat as valid (no alerts yet)
- **Fully corrupted**: Throw error requiring manual intervention (delete file)
- **Corruption during write**: Throw error immediately (fail fast)

### 3. Concurrent Runs
- **Not supported**: Scripts run only once at a time (no parallel execution)
- **File is not thread-safe**: Single run assumption is acceptable

### 4. Very Large Alert Files (>200 entries)
- **Warning displayed**: Prominent warning when file exceeds 200 entries
- **Performance**: Wait as long as needed for processing (no timeout)
- **Display**: Pagination supports files of any size
- **Menu options**: Delete file or remove specific alerts to manage size

### 5. Manual File Editing
- **Supported**: Users can manually edit or delete the alert file
- **Format**: Must maintain exact entry format or parser will skip corrupted entries
- **Menu options**: Delete via menu or remove specific alerts by index

### 6. Missing Required Fields
- **HiBob contacts**: May lack lastName, email, URL (gracefully handled)
- **LinkedIn contacts**: May lack company, email
- **Handling**: Write "(none)" for missing fields in alert file
- **Matching**: Handle missing fields gracefully in match logic

### 7. Duplicate Alerts in Same Run
- **Prevention**: `checkForDuplicateAlert()` prevents same contact from being alerted multiple times in single run
- **Implementation**: Track current run alerts separately, check before writing

## Files to Modify

1. **New File**: `src/logging/alertLogger.ts` (~500 lines including error handling, normalization, pagination support, and duplicate prevention)
2. **Update**: `src/scripts/linkedinSync.ts` (~250 lines added for pre-run menu with all options, pagination, alert removal, and integration)
3. **Update**: `src/scripts/hibobSync.ts` (~250 lines added for pre-run menu with all options, pagination, alert removal, and integration)
4. **Update**: `src/flow/syncStatusBar.ts` (~30 lines for separate current/previous display)
5. **Update**: `src/types/linkedin.ts` (~1 line for `previouslyAlerted` field)
6. **Update**: `src/types/hibob.ts` (~1 line for `previouslyAlerted` field)
7. **New File or Section**: Alert type definitions (~50 lines for Alert, AlertContact, AlertCounts, GroupedAlerts, ALERT_REASONS)
8. **Update**: `src/logging/logCleanup.ts` (~5 lines to exclude alert files by `_ALERTS.log` suffix)
9. **Update**: README.md (add user documentation section for alert file system)

## Key Improvements Over Initial Design

### 1. Single Persistent File
- **Before**: Daily files like `linkedin-sync_ALERTS_21_03_2026.log`
- **After**: Single file `linkedin-sync_ALERTS.log`
- **Benefits**: 
  - Simpler management
  - No date rollover edge cases
  - All alerts in one place
  - Easy to clear/archive

### 2. Observability Enhancement
- **Added**: `previouslyAlerted` counter
- **Benefit**: Users can see how many contacts were skipped due to existing alerts
- **Display**: "Previously Alerted: 50 contacts (not reprocessed)"

### 3. Alert Threshold Warning
- **Added**: Prominent warning when alerts exceed 200 entries
- **Display**: Shows at pre-run menu initialization
- **Benefit**: Users aware of large alert files and can take action

### 4. Menu-Driven Alert Management
- **Added**: Delete entire alert file via menu (with confirmation)
- **Added**: Remove specific alert by index via paginated dropdown
- **Benefit**: No need for manual file editing, user-friendly interface

### 5. Pagination Support
- **Added**: View alerts 10 at a time with "Show More" option
- **Added**: Paginated dropdown for selecting alert to remove
- **Benefit**: Works smoothly with large alert files (500+ entries)

### 6. Current vs. Historical Alert Separation
- **Pre-run menu**: Shows ALL historical alerts with pagination
- **Post-sync menu**: Shows ONLY current run alerts
- **Benefit**: Clear distinction between old issues and new issues

### 7. Robust Matching Algorithm
- **Email normalization**: Must contain @, case-insensitive, trimmed
- **Name normalization**: Unicode NFC normalization, extra spaces removed, case-insensitive
- **URL normalization**: Protocol/www removed, trailing slashes handled
- **Fallback strategy**: Email > Name+URL > Name-only
- **Edge cases**: Handles missing fields, unicode, accented characters
- **HiBob support**: Gracefully handles missing URL field

### 8. Error Recovery
- **Comprehensive**: Handles all I/O errors with clear messages
- **Fail fast**: Throws error on corruption during write
- **Partial corruption**: Skip corrupted entries, continue with valid
- **Full corruption**: Throw error, require manual intervention

### 9. Duplicate Prevention
- **Added**: Prevents duplicate alerts in same run
- **Benefit**: Same contact won't be alerted multiple times

### 10. Immediate Write (No Buffering)
- **Changed**: Write alerts immediately to disk
- **Benefit**: Alerts persisted even if script crashes

### 11. Status Bar Clarity
- **Separate display**: Current run issues vs. previously alerted count
- **No confusion**: Clear what's from this run vs. cumulative historical data

### 12. Standardized Alert Reasons
- **Added**: ALERT_REASONS constants with type safety
- **Benefit**: Consistent messaging, searchable, enables analytics

### 13. Logging System Clarity
- **Documented**: AlertLogger (persistent problematic contacts) vs SyncLogger (daily audit trail)
- **Benefit**: Clear separation of concerns

### 14. LogCleanup Exclusion
- **Added**: Alert files excluded from automatic cleanup by `_ALERTS.log` suffix
- **Reason**: No date in filename, should persist indefinitely
- **Manual**: Users can delete/archive via menu when needed

---

## Pre-Run Menu Screenshots

**First Run (no alerts file)**:
```
LinkedIn Sync - What would you like to do:
> 👤 Process the contacts
  🚪 Exit
```

**Subsequent Run (alerts exist, under threshold)**:
```
LinkedIn Sync - What would you like to do:
> 👤 Process the contacts
  ⁉️  View Warnings / Skipped / Errors (42)
  🗑️  Delete Alert File
  ✏️  Remove Specific Alert
  🚪 Exit
```

**Subsequent Run (alerts exceed 200 threshold)**:
```
⚠️  WARNING: Alert file contains 250 entries (200+ threshold exceeded)
Consider reviewing and clearing old alerts to maintain performance.

LinkedIn Sync - What would you like to do:
> 👤 Process the contacts
  ⁉️  View Warnings / Skipped / Errors (250)
  🗑️  Delete Alert File
  ✏️  Remove Specific Alert
  🚪 Exit
```

**Viewing Alerts (with pagination)**:
```
⚠️  Warnings (000,015):
====================
  Alert 001 (Index: 1):
    -Name: John Doe
    -Email: john@example.com
    -Company: Acme Corp
    -Reason: Multiple matches or uncertain match

  Alert 002 (Index: 2):
    ...
  
... and 5 more warning alerts

What would you like to do?
> Show More
  Back to Menu

⏭️  Skipped (000,010):
====================
  Alert 001 (Index: 16):
    ...

❌ Errors (000,017):
====================
  Alert 001 (Index: 26):
    ...
```

**Removing Specific Alert (with pagination)**:
```
Select alert to remove:
====================
> ⚠️  Index 1: John Doe - Multiple matches or uncertain match
  ⚠️  Index 2: Jane Smith - Multiple matches or uncertain match
  ...
  ⏭️  Index 16: Bob Johnson - Missing required data
  Show More Alerts
  Back to Menu

Alert 1 removed successfully.
```

## Backward Compatibility

- **Existing main log files**: `linkedin-sync_21_03_2026.log` remain unchanged
- **New alert files**: Completely separate from existing logs
- **First run behavior**: If alert file doesn't exist, behavior matches current implementation
- **No breaking changes**: Alert system is additive functionality
- **LogCleanup**: Alert files (without dates) should NOT be cleaned up by LogCleanup.cleanOldLogs()

## Manual Intervention & Maintenance

### Viewing Alerts File
Users can view the raw alert file at:
- `logs/linkedin-sync_ALERTS.log`
- `logs/hibob-sync_ALERTS.log`

### Clearing All Alerts
To retry all previously failed contacts:
```bash
rm logs/linkedin-sync_ALERTS.log
# or
rm logs/hibob-sync_ALERTS.log
```

### Removing Specific Alerts
1. Open the alert file in a text editor
2. Find the specific entry (search by name/email)
3. Delete the entire entry block (from `=== Alert Entry ===` to `=== End Entry ===`)
4. Save the file
5. Next run will reprocess that contact

### File Size Monitoring
- Alert files grow indefinitely
- Recommend periodic review (monthly/quarterly)
- Consider archiving old alerts after verifying all issues resolved
- Archive command example:
```bash
mv logs/linkedin-sync_ALERTS.log logs/archive/linkedin-sync_ALERTS_2026-03.log.bak
```

## Summary: Verification of "No Processing" Logic

### Current Implementation Already Correct ✓

Both `linkedinSync.ts` and `hibobSync.ts` already implement the correct behavior where problematic contacts are NOT added to Google Contacts:

#### LinkedIn Sync (lines 173-282):
1. **UNCERTAIN match (line 173)**: Logs warning, increments counter, does NOT call `addContact()` or `updateContact()`
2. **SKIPPED status (line 201)**: Returned by `addContact()`, contact was NOT created in Google
3. **ERROR status (line 211)**: Returned by `addContact()`, contact was NOT created in Google
4. **ERROR during update (line 271)**: Returned by `updateContact()`, contact was NOT updated in Google

#### HiBob Sync (lines 239-318):
1. **UNCERTAIN match (line 239)**: Logs warning, increments counter, does NOT call `addContact()` or `updateContact()`
2. **SKIPPED status (line 257)**: Returned by `addContact()`, contact was NOT created in Google
3. **ERROR status (line 267)**: Returned by `addContact()`, contact was NOT created in Google
4. **ERROR during update (line 308)**: Returned by `updateContact()`, contact was NOT updated in Google

### What We're Adding:

The AlertLogger system will:
1. **Persist these alerts** across runs (currently only in memory)
2. **Check on subsequent runs** and skip these contacts entirely before processing
3. **Display alerts** in a pre-run menu so users can review them before processing
4. **Prevent reprocessing** of known problematic contacts

### Guaranteed Behavior:

✅ **Warnings**: Contact never reaches Google Contacts API  
✅ **Skipped**: Contact never reaches Google Contacts API  
✅ **Errors**: Contact never reaches Google Contacts API  
✅ **Only clean contacts**: Successfully validated contacts are added/updated

## Implementation Checklist

### Pre-Implementation
- [ ] Review matching algorithm edge cases and normalization rules (including Unicode NFC)
- [ ] Define error recovery strategy for corrupted alert files (fail fast on full corruption)
- [ ] Define alert threshold at 200 entries with warning display
- [ ] Document manual intervention procedures for users

### Core Implementation
- [ ] Create AlertLogger class with single-file-per-script approach
- [ ] Implement robust parsing with error recovery (skip corrupted entries, throw on full corruption)
- [ ] Implement normalized contact matching with Unicode NFC (email with @ validation, name, URL)
- [ ] Add `getCurrentRunAlerts()` method to separate current vs. historical
- [ ] Add `previouslyAlerted` counter tracking
- [ ] Add file corruption handling (throw error on corruption during write)
- [ ] Remove buffering - write alerts immediately to disk
- [ ] Add `deleteAlertFile()` method
- [ ] Add `removeAlertByIndex()` method
- [ ] Add `exceedsThreshold()` method (>200 alerts)
- [ ] Add `checkForDuplicateAlert()` method for duplicate prevention
- [ ] Add global index to each alert entry for removal support
- [ ] Ensure graceful handling of missing URL field for HiBob contacts

### Script Integration
- [ ] Add pre-run menu to LinkedIn sync script with all options (Process, View, Delete File, Remove Alert, Exit)
- [ ] Add pre-run menu to HiBob sync script with all options
- [ ] Add threshold warning display (>200 alerts) in pre-run menu for both scripts
- [ ] Integrate AlertLogger into LinkedIn sync processing loop with duplicate prevention
- [ ] Integrate AlertLogger into HiBob sync processing loop with duplicate prevention
- [ ] Update post-sync menus to show only current-run alerts
- [ ] Add `previouslyAlerted` counter to status updates
- [ ] Use standardized ALERT_REASONS constants throughout

### UI Updates
- [ ] Update SyncStatusBar to separate current vs. previous counts
- [ ] Update type definitions to include `previouslyAlerted` field
- [ ] Display "previously alerted" information clearly in status bar
- [ ] Implement pagination for viewing alerts (show 10 at a time with "Show More")
- [ ] Implement paginated dropdown for removing specific alerts
- [ ] Add confirmation dialog for deleting entire alert file
- [ ] Display alert index in alert entries for easy identification

### Type Definitions
- [ ] Define Alert interface with index field
- [ ] Define AlertContact interface
- [ ] Define AlertCounts interface
- [ ] Define GroupedAlerts interface
- [ ] Define AlertType union type
- [ ] Define ALERT_REASONS constants with type safety
- [ ] Define AlertReason type for standardization

### Testing
- [ ] Test first run (no file) - creates new file
- [ ] Test second run (file exists) - skips alerted contacts correctly
- [ ] Test contact matching with various edge cases (missing fields, Unicode characters, normalization)
- [ ] Test email validation (must contain @)
- [ ] Test Unicode NFC normalization for names (e.g., "José")
- [ ] Test graceful handling of missing URL for HiBob contacts
- [ ] Test file corruption recovery (skip corrupted entries)
- [ ] Test file corruption during write (throws error)
- [ ] Test alert threshold warning (>200 entries)
- [ ] Test pagination - viewing alerts 10 at a time
- [ ] Test pagination - removing specific alert from paginated list
- [ ] Test delete alert file via menu with confirmation
- [ ] Test remove specific alert by index
- [ ] Test duplicate alert prevention in same run
- [ ] Test very large alert file (simulate 500+ alerts with pagination)
- [ ] Test manual file deletion and re-run
- [ ] Test manual entry removal and re-run
- [ ] Verify pre-run menu shows ALL alerts with pagination
- [ ] Verify post-sync menu shows ONLY current run alerts
- [ ] Verify `previouslyAlerted` counter accuracy
- [ ] Verify standardized alert reasons are used consistently

### Integration Testing
- [ ] End-to-end test: LinkedIn sync with alert file - full flow
- [ ] End-to-end test: HiBob sync with alert file - full flow
- [ ] Test pre-run menu → view paginated alerts → remove specific alert → process
- [ ] Test pre-run menu → delete file → process
- [ ] Test threshold warning display when >200 alerts
- [ ] Test alert file persists correctly across multiple runs
- [ ] Test mixing LinkedIn and HiBob sync runs (separate alert files)

### Performance Testing
- [ ] Benchmark startup time with 100, 200, 500, 1000 alerts (wait as long as needed)
- [ ] Verify pagination works smoothly with 1000+ alerts
- [ ] Memory usage monitoring with large alert files
- [ ] Test write performance (immediate write without buffering)

### Documentation & Cleanup
- [ ] Document alert file format for users in README
- [ ] Document manual intervention procedures in README
- [ ] Document menu options (delete file, remove alert) in README
- [ ] Document alert threshold (200 entries) in README
- [ ] Remove or deprecate in-memory alert arrays from both scripts
- [ ] Update LogCleanup to skip alert files by `_ALERTS.log` suffix
- [ ] Add code comments explaining AlertLogger role vs SyncLogger role

### Edge Cases & Error Scenarios
- [ ] Test with contacts missing email
- [ ] Test with contacts missing name
- [ ] Test with contacts missing URL (LinkedIn and HiBob)
- [ ] Test with contacts having unicode characters in names (various languages)
- [ ] Test with contacts having accented characters (é, ñ, ü, etc.)
- [ ] Test with empty alert file
- [ ] Test with partially corrupted alert file (some valid entries)
- [ ] Test with fully corrupted alert file (throws error)
- [ ] Test with invalid email (no @ symbol)
- [ ] Test selecting non-existent index for removal (gracefully ignore)
- [ ] Test multiple duplicate alerts in same run (only one written)

## Summary of Key Changes from Original Plan

### File Strategy
- ✅ **Changed**: Single persistent file per script (no date in filename)
- ✅ **Reason**: Simpler management, no date rollover complications
- ✅ **Files**: `linkedin-sync_ALERTS.log`, `hibob-sync_ALERTS.log`

### Observability
- ✅ **Added**: `previouslyAlerted` counter to track skipped contacts
- ✅ **Benefit**: Users know exactly how many contacts were skipped from previous runs
- ✅ **Display**: Shows in status bar and summary

### Alert Display Separation
- ✅ **Pre-run menu**: Shows ALL historical alerts (for review before starting)
- ✅ **Post-sync menu**: Shows ONLY current run alerts (new issues from this run)
- ✅ **Benefit**: Clear distinction between historical and new problems

### Matching Algorithm
- ✅ **Enhanced**: Proper normalization for email, name, and URL
- ✅ **Priority**: Email > Name+URL > Name-only
- ✅ **Edge cases**: Handles missing fields, unicode, case variations, extra spaces

### Error Handling
- ✅ **Added**: Corrupted file recovery with backup mechanism
- ✅ **Added**: Entry-level parsing (skip corrupted, continue with valid)
- ✅ **Added**: File size monitoring recommendations

### Status Bar
- ✅ **Changed**: Separate display for current run vs. previous alerts
- ✅ **Before**: Would have shown cumulative counts (confusing)
- ✅ **After**: "This Run: 5 errors" + "Previously Alerted: 50 contacts"

### Standardization
- ✅ **Added**: Standardized alert reason constants
- ✅ **Benefit**: Consistent messaging, searchable, enables analytics

### LogCleanup Exclusion
- ✅ **Added**: Alert files excluded from automatic cleanup
- ✅ **Reason**: No date in filename, should persist indefinitely
- ✅ **Manual**: Users can manually delete/archive when needed

---

## Quick Reference

### Alert File Locations
- LinkedIn: `logs/linkedin-sync_ALERTS.log`
- HiBob: `logs/hibob-sync_ALERTS.log`

### Clear All Alerts
```bash
rm logs/linkedin-sync_ALERTS.log
```

### View Alert Counts
Run the script → Choose "View Warnings / Skipped / Errors" from pre-run menu

### Remove Specific Alert
1. Open alert file in text editor
2. Delete the entry block (from `===` to `===`)
3. Save file
4. Re-run script

### Monitor File Size
```bash
ls -lh logs/*_ALERTS.log
```

## Summary of All Updates Based on Feedback

### Addressed Points:

1. ✅ **Concurrent runs**: Accepted - scripts run once at a time only
2. ✅ **Alert threshold**: Added 200-entry threshold with prominent warning display
3. ✅ **File management**: Added menu options to delete alert file (both scripts)
4. ✅ **Type definitions**: Defined all interfaces (Alert, AlertContact, AlertCounts, GroupedAlerts, AlertType, AlertReason)
5. ✅ **Testing gaps**: Added comprehensive test checklist with all scenarios
6. ✅ **Performance**: Accept waiting as long as needed for processing
7. ✅ **Unicode normalization**: Implemented Unicode NFC normalization for names
8. ✅ **Email validation**: Added @ symbol check as minimum validation
9. ✅ **Standardized reasons**: Enforced ALERT_REASONS constants with type safety
10. ✅ **Remove specific alert**: Added menu option with paginated dropdown (both scripts), gracefully ignore invalid index
11. ✅ **Pagination**: Implemented show 10 at a time with "Show More" (both scripts)
12. ✅ **Error handling**: Added comprehensive error handling with fallback strategies
13. ✅ **Buffering**: Removed buffering, write immediately to disk
14. ✅ **Logging roles**: Documented AlertLogger vs SyncLogger roles and purposes
15. ✅ **LogCleanup**: Detect alert files by `_ALERTS.log` suffix
16. ✅ **Duplicate alerts**: Added checkForDuplicateAlert() to prevent duplicates in same run
17. ✅ **File corruption**: Throw error on corruption (fail fast approach)
18. ✅ **HiBob URLs**: Ensure graceful handling of missing URL field
19. ✅ **Integration tests**: Added comprehensive integration test checklist
20. ✅ **Performance tests**: Added performance testing checklist

### Key Design Decisions Finalized:

- **Single persistent file** per script (no dates)
- **200-entry threshold** triggers warning
- **Pagination** of 10 entries per page
- **Unicode NFC normalization** for proper character handling
- **Email must contain @ symbol** as minimum validation
- **Immediate write** (no buffering) for data integrity
- **Fail fast** on file corruption during write
- **Standardized alert reasons** with type enforcement
- **Duplicate prevention** within single run
- **Menu-driven management** for user-friendly operations
- **Global index** on each alert for removal support

### Files Impacted:

1. `src/logging/alertLogger.ts` (new, ~500 lines)
2. `src/scripts/linkedinSync.ts` (update, ~250 lines added)
3. `src/scripts/hibobSync.ts` (update, ~250 lines added)
4. `src/flow/syncStatusBar.ts` (update, ~30 lines)
5. `src/types/linkedin.ts` (update, +1 field)
6. `src/types/hibob.ts` (update, +1 field)
7. Alert type definitions (new, ~50 lines)
8. `src/logging/logCleanup.ts` (update, ~5 lines)
9. README.md (update, user documentation)
