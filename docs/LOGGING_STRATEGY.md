# Logging Strategy

## Overview

This document outlines the consistent logging strategy used throughout the application. All output follows a structured approach to ensure clarity and maintainability.

## Logger Types

### 1. Standard Logger (`Logger`)
Used for general application logging with automatic formatting.

**Usage:**
```typescript
import { Logger } from './logging';

const logger = new Logger('ComponentName');
logger.info('Operation completed');  // Console: ===Operation completed===
logger.warn('Operation needs attention');  // Console: ===⚠️  Operation needs attention===
logger.debug('Debug information');  // Console: ===Debug information===
logger.error('Operation failed', error);  // Console: ===✗ Operation failed===
```

**Console Output:**
- `info()`: Messages wrapped with `===` prefix/suffix
- `warn()`: Messages prefixed with `⚠️  ` and wrapped with `===`
- `debug()`: Messages wrapped with `===` (only in debug mode)
- `error()`: Messages prefixed with `❌` and wrapped with `===`

**File Output:**
- All messages are logged to file with full structured JSON format
- Includes timestamp, level, context, message, and any additional data

### 2. Sync Logger (`SyncLogger`)
Used for detailed sync operation tracking with two separate log files.

**Usage:**
```typescript
import { SyncLogger } from './logging';

const logger = SyncLogger.getInstance();
await logger.logMain('Sync started');
await logger.logClarification('Connection needs manual review', data);
```

## What to Use Console.log For

**Only use `console.log()` for pure UI elements:**

1. **Interactive Menu (inquirer)**
   ```typescript
   console.log('\n=== Events & People Syncer ===\n');
   ```

2. **Raw Data Display**
   ```typescript
   console.log(authUrl);  // Display URL for user to copy
   ```

3. **Exit Messages**
   ```typescript
   console.log('\n🚪 Exit script\n');
   ```

4. **Success Feedback**
   ```typescript
   console.log('\n✅ Script completed successfully\n');
   ```

**Do NOT use `console.log()` for:**
- Informational messages → Use `logger.info()`
- Warning messages → Use `logger.warn()`
- Debug messages → Use `logger.debug()`
- Error messages → Use `logger.error()` or `console.error()`

## Examples

### ❌ Before (Inconsistent)
```typescript
console.log('Starting sync...');
console.log('⚠️  Warning: Cache bypassed\n');
console.log(`Skipped: Invalid URL - ${url}`);
```

### ✅ After (Consistent)
```typescript
this.logger.info('Starting sync');
this.logger.warn('Cache bypassed');
this.logger.debug(`Invalid URL - ${url}`);
```

## Emoji Usage

Emojis are automatically added by the logger for specific message types:

- `⚠️  ` - Warnings (via `logger.warn()`)
- `❌` - Errors (via `logger.error()`)
- `✅` - Success (via spinner success messages)
- Other emojis should be used sparingly and only for UI elements

## Message Formatting Rules

1. **No ellipses** - Don't use `...` in messages
   - ❌ `'Fetching data...'`
   - ✅ `'Fetching data'`

2. **Clear and concise** - Messages should be descriptive but brief
   - ❌ `'Now we are going to start the process of fetching all the contacts'`
   - ✅ `'Fetching contacts'`

3. **Consistent terminology** - Use the same terms throughout
   - ✅ `'Contact synced'`, `'Connection synced'` (pick one and stick with it)

## File Logging

All logger messages are also written to log files with full context:

```json
{
  "timestamp": "2026-03-12T09:00:00.000Z",
  "level": "info",
  "context": "LinkedInSync",
  "message": "Starting sync",
  "data": {}
}
```

This provides detailed audit trails while keeping console output clean and user-friendly.

## Migration Checklist

When refactoring code to use the new logging strategy:

- [ ] Replace `console.log()` informational messages with `logger.info()`
- [ ] Replace `console.log()` warning messages with `logger.warn()`
- [ ] Replace `console.log()` debug messages with `logger.debug()`
- [ ] Keep `console.log()` only for pure UI elements (menu, raw data, exit messages)
- [ ] Remove `...` from all messages
- [ ] Remove manual emoji prefixes (logger adds them automatically for warnings/errors)
- [ ] Ensure logger instance is created: `private logger = new Logger('ClassName')`
