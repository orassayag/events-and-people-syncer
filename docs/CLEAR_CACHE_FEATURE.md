# Clear Cache and Clear Logs Features

## Summary
Added two new maintenance menu options to the main script menu:
1. **Clear Cache** - Positioned after "Statistics"
2. **Clear Logs** - Positioned after "Clear Cache"

Both features allow users to easily clear data without manually deleting files.

## Implementation Details

### New Files
- `src/scripts/clearCache.ts` - Script that handles cache clearing operations
- `src/scripts/clearLogs.ts` - Script that handles log clearing operations

### Modified Files
- `src/scripts/index.ts` - Added both scripts to `AVAILABLE_SCRIPTS`
- `src/index.ts` - Added both to `scriptOrder` array after `'statistics'`
- `src/di/container.ts` - Registered both scripts in the DI container
- `src/constants/emojis.ts` - Added space after `CLEANUP` emoji (`♻️ `)

## Clear Cache Behavior
The script performs the following operations:
1. Checks if the `sources/.cache` folder exists
2. Lists all files in the cache with their sizes
3. Deletes all files in the cache directory
4. Displays success message: `✅ Successfully cleared X files from cache`

### Cache Files Typically Cleared
- `company-mappings.json`
- `folder-mappings.json`
- `other-contacts-cache.json`

### Edge Cases Handled
- **No cache folder**: Displays "No cache folder found. Nothing to clear."
- **Empty cache**: Displays "Cache folder is already empty."
- **Files present**: Lists each file with size before clearing

## Clear Logs Behavior
The script performs the following operations:
1. Checks if the `logs` folder exists
2. Lists all `.log` files with their sizes
3. Deletes all log files from the logs directory
4. Displays success message: `✅ Successfully cleared X log files`

### Log Files Typically Cleared
- `linkedin-sync_DD_MM_YYYY.log`
- `hibob-sync_DD_MM_YYYY.log`
- `contacts-sync_DD_MM_YYYY.log`
- `other-contacts-sync_DD_MM_YYYY.log`
- And any other `.log` files in the folder

### Edge Cases Handled
- **No logs folder**: Displays "No logs folder found. Nothing to clear."
- **No log files**: Displays "No log files found."
- **Files present**: Lists each file with size before clearing, only deletes `.log` files

## Menu Placement
Both options appear in the main menu:
1. Statistics
2. ♻️  Clear Cache - Clear all cached data (company mappings, folder mappings, contacts)
3. ♻️  Clear Logs - Clear all log files from the logs folder

Both use the cleanup emoji (♻️ ) with proper spacing from `EMOJIS.ACTIONS.CLEANUP`.

## Testing
- Build completed successfully without errors
- No linter errors detected
- Both scripts follow existing patterns (injectable class, metadata export)
- Registered in DI container

## Expected Behavior

### Clear Cache
When users select "Clear Cache" from the menu:
1. Displays "Clear Cache" header
2. Lists all cache files with sizes (if any)
3. Clears all files from `sources/.cache`
4. Displays success message with count
5. Returns to main menu

### Clear Logs
When users select "Clear Logs" from the menu:
1. Displays "Clear Logs" header
2. Lists all `.log` files with sizes (if any)
3. Clears all `.log` files from `logs` folder
4. Displays success message with count
5. Returns to main menu
