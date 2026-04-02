# Add Write Notes Feature

## Overview

Add a new menu option "📓 Write notes" that enables continuous note creation in an endless loop for the same folder until the user chooses to stop.

## User Requirements

- New menu option: "📓 Write notes" (with notebook emoji) - **positioned as first menu option**
- Flow follows same company/event selection as "Write a note"
- After folder selection, enters an endless loop for creating multiple notes
- Loop stops when user leaves clipboard empty and responds "no" to "Try again?" prompt
- After exiting loop, returns to main menu (not exit script)
- Same clipboard paste message as existing note creation, with note counter
- All notes go to the same folder until loop is exited
- Display progress indicator showing which note number is being created

## Implementation Details

### 1. Menu Changes

**Location**: `src/scripts/eventsJobsSync.ts` - `mainMenu()` method (lines 297-341)

Add new menu option as **first option** in the menu:

```typescript
const choices = [
  { name: '📓 Write notes', value: MenuOptionEnum.WRITE_NOTES }, // NEW - First option
  { name: '📝 Write a note', value: MenuOptionEnum.CREATE_NOTE },
  { name: '📋 Rewrite a note', value: MenuOptionEnum.REWRITE_NOTE },
];
```

- Display name: `'📓 Write notes'`
- Value: `MenuOptionEnum.WRITE_NOTES` (new enum value)
- Handler: Call new method `writeNotesFlow()`

Add handler in the action switch statement:

```typescript
if (action === MenuOptionEnum.WRITE_NOTES) {
  await this.writeNotesFlow();
} else if (action === MenuOptionEnum.EXIT) {
  // ... existing code
}
```

### 2. Enum Update

**Location**: `src/types/eventsJobsSync.ts`

Add new enum value: `WRITE_NOTES = 'write_notes'` to the `MenuOption` enum

### 3. Refactor Folder Creation Methods

**Location**: `src/scripts/eventsJobsSync.ts`

**Problem**: Current `createJobFolderFlow()` and `createLifeEventFolderFlow()` automatically call `createNoteInFolder()` after folder creation (lines 552-554 and 642-644). This is problematic for the write-notes flow where we want to select/create a folder once and then create multiple notes in a loop.

**Solution**: Refactor both methods to accept an optional parameter controlling whether to create a note after folder creation.

**Updated Signatures**:
```typescript
private async createJobFolderFlow(initialInput: string, createNoteAfter: boolean = true): Promise<FolderMapping | null>
private async createLifeEventFolderFlow(initialInput: string, createNoteAfter: boolean = true): Promise<FolderMapping | null>
```

**Changes**:
1. Add `createNoteAfter` parameter with default `true` (maintains backward compatibility)
2. Change return type from `Promise<void>` to `Promise<FolderMapping | null>`
3. After folder creation, if `createNoteAfter === true`, call `createNoteInFolder()` and return null (existing behavior)
4. After folder creation, if `createNoteAfter === false`, fetch the folder from cache and return it
5. On cancellation or error, return null

**Example Changes**:
```typescript
// In createJobFolderFlow, after successful folder creation:
const cache = await FolderCache.getInstance().get();
const folder = cache?.jobFolders.find((f) => f.name === finalFolderName);
if (folder) {
  if (createNoteAfter) {
    await this.createNoteInFolder(folder);
    return null; // Existing behavior
  }
  return folder; // New behavior for batch mode
}
return null;
```

**Refactor `createFolderFlow()` Signature**:
```typescript
private async createFolderFlow(initialInput: string, createNoteAfter: boolean = true): Promise<FolderMapping | null>
```

This method passes the `createNoteAfter` parameter to the specific folder creation methods and returns their result.

### 4. New Helper Method: `selectOrCreateFolder()`

**Location**: `src/scripts/eventsJobsSync.ts`

Extract folder selection logic into a reusable helper method to avoid code duplication.

**Purpose**: Handle the complete folder selection flow including:
- Prompting for folder name
- Finding exact or fuzzy matches
- Handling folder creation if needed (WITHOUT creating a note)
- Validating folder still exists

**Signature**:
```typescript
private async selectOrCreateFolder(): Promise<FolderMapping | null>
```

**Returns**:
- `FolderMapping` - Successfully selected or created folder
- `null` - User cancelled the operation

**Implementation**: Extract lines 343-468 from `createNoteFlow()` into this helper method.

**Behavior**:
1. Check cache exists
2. Prompt for event/company name with validation
3. Search for exact match
4. If exact match found, validate folder exists (handle external deletion)
5. If no exact match, search for fuzzy matches
6. If no matches, prompt to create new folder via `createFolderFlow(trimmedInput, false)`
7. If fuzzy matches exist, show selection list with "Create new" option
8. If user selects "Create new", call `createFolderFlow(trimmedInput, false)` and return the created folder
9. Validate selected folder exists before returning
10. Return null if user cancels at any step

**Critical**: When calling `createFolderFlow()`, pass `false` for `createNoteAfter` parameter to prevent automatic note creation.

**Error Handling**:
- If folder deleted externally: invalidate cache, re-scan, return null
- If folder creation fails: log error, return null (handled by createFolderFlow returning null)
- If user cancels: log cancellation, return null

**Logging**: Include all existing log statements from the extracted code

### 5. Update `createNoteFlow()` to Use Helper

**Location**: `src/scripts/eventsJobsSync.ts` - `createNoteFlow()` method

Refactor to use the new `selectOrCreateFolder()` helper:

```typescript
private async createNoteFlow(): Promise<void> {
  const selectedFolder = await this.selectOrCreateFolder();
  if (selectedFolder) {
    await this.createNoteInFolder(selectedFolder);
  }
}
```

This simplifies the method from ~125 lines to ~5 lines.

### 6. New Method: `writeNotesFlow()`

**Location**: `src/scripts/eventsJobsSync.ts`

This method implements the continuous note creation loop.

**Signature**:
```typescript
private async writeNotesFlow(): Promise<void>
```

**Implementation Flow**:

1. **Initialization**:
   ```typescript
   await this.logger.logMain('Starting write notes flow');
   let noteCount = 0;
   ```

2. **Folder Selection Phase** (one-time):
   ```typescript
   const selectedFolder = await this.selectOrCreateFolder();
   if (!selectedFolder) {
     await this.logger.logMain('Folder selection cancelled - exiting write notes flow');
     return;
   }
   await this.logger.logMain(`Selected folder for batch notes: '${selectedFolder.name}'`);
   ```

3. **Endless Loop Phase**:
   ```typescript
   while (true) {
     // Check folder still exists before each iteration (handles race condition)
     try {
       await fs.access(selectedFolder.path);
     } catch {
       const message = noteCount === 0 
         ? '\n===⚠️  Folder was deleted externally===\n'
         : `\n===⚠️  Folder was deleted. Created ${noteCount} note(s)===\n`;
       console.log(message);
       await this.logger.logMain('Folder deleted during batch creation - exiting loop');
       return;
     }

     // Create note with progress indicator
     try {
       await this.createNoteInFolder(selectedFolder, { noteCount, allowCancel: true });
       noteCount++;
       await this.logger.logMain(`Note ${noteCount} created successfully in batch (${noteCount} of batch)`);
     } catch (error) {
       if (error instanceof UserCancelledError) {
         const message = noteCount === 0
           ? '\n===No notes created. Returning to main menu...===\n'
           : `\n===✅ Created ${noteCount} note(s). Returning to main menu...===\n`;
         console.log(message);
         await this.logger.logMain(`User exited write notes loop after ${noteCount} notes`);
         return;
       }
       // Handle ENOENT (folder deleted) as immediate exit
       if (error instanceof Error && error.message.includes('Folder no longer exists')) {
         const message = noteCount === 0
           ? '\n===⚠️  Folder was deleted===\n'
           : `\n===⚠️  Folder was deleted. Created ${noteCount} note(s)===\n`;
         console.log(message);
         await this.logger.logMain('Folder deleted during note creation - exiting loop');
         return;
       }
       // Other errors: log and ask user if they want to continue
       await this.logger.logError(`Error during note creation: ${(error as Error).message}`);
       console.log(`\n===⚠️  Error creating note: ${(error as Error).message}===`);
       const { shouldContinue } = await inquirer.prompt([
         {
           type: 'confirm',
           name: 'shouldContinue',
           message: 'Continue creating notes?',
           default: false,
         },
       ]);
       if (!shouldContinue) {
         await this.logger.logMain(`User stopped after error. Created ${noteCount} notes`);
         return;
       }
       // Note: noteCount is NOT incremented on error, so next prompt shows same note number
     }
   }
   ```

**Key Points**:
- All exit paths return to main menu (no process.exit)
- Folder existence validated before each iteration to catch external deletions early
- ENOENT errors cause immediate exit (folder deleted) without asking to continue
- Note counter only increments after successful creation
- Zero-notes case shows different message: "No notes created" instead of "Created 0 note(s)"
- Progress messages show "N of batch" for clarity

### 7. Create Custom Error Class

**Location**: `src/scripts/eventsJobsSync.ts` (near top of file with other classes/types)

Create a custom error class for type-safe cancellation handling:

```typescript
class UserCancelledError extends Error {
  constructor() {
    super('User cancelled note creation');
    this.name = 'UserCancelledError';
  }
}
```

**Benefits**:
- Type-safe error checking with `instanceof`
- No string comparison needed
- Clear intent and better maintainability
- Follows TypeScript best practices

### 8. Refactor `createNoteInFolder()` to Support Batch Mode

**Location**: `src/scripts/eventsJobsSync.ts`

**Current Signature**:
```typescript
private async createNoteInFolder(folder: FolderMapping): Promise<void>
```

**New Signature**:
```typescript
private async createNoteInFolder(
  folder: FolderMapping,
  options?: { noteCount?: number; allowCancel?: boolean }
): Promise<void>
```

**Parameters**:
- `folder`: The folder to create the note in
- `options.noteCount`: Optional note number for progress display (e.g., "Note 3")
- `options.allowCancel`: If true, allows user to exit on empty clipboard; if false, retries automatically (existing behavior)

**Changes**:

1. **Modified prompt message** (when `noteCount` provided):
   ```typescript
   const noteLabel = options?.noteCount !== undefined 
     ? `(Note ${options.noteCount + 1} of batch)` 
     : '';
   console.log(`\n===📋 Copy your message now and press Enter ${noteLabel}===\n`);
   ```

2. **Modified empty clipboard handling**:
   ```typescript
   while (!message.trim()) {
     console.log('\n===📋 Copy your message now and press Enter ${noteLabel}===\n');
     await inquirer.prompt([/* ... */]);
     // ... read clipboard ...
     
     if (!message.trim()) {
       if (options?.allowCancel) {
         // Batch mode: offer to exit
         console.log('\n===⚠️  Clipboard is empty===');
         await this.logger.logMain('⚠️  Clipboard validation failed: empty');
         const { shouldRetry } = await inquirer.prompt([
           {
             type: 'confirm',
             name: 'shouldRetry',
             message: 'Try again?',
             default: true,
           },
         ]);
         if (!shouldRetry) {
           throw new UserCancelledError();
         }
       } else {
         // Single note mode: auto-retry (existing behavior)
         console.log('\n===⚠️  Clipboard is empty. Please copy your message first===');
         await this.logger.logMain('⚠️  Clipboard validation failed: empty');
       }
     }
   }
   ```

3. **All other logic remains unchanged**: size validation, null byte check, file writing, clipboard clearing, stats update

**Backward Compatibility**: Both parameters are optional, so existing calls work without modification:
```typescript
await this.createNoteInFolder(folder); // Works as before
await this.createNoteInFolder(folder, { noteCount: 0, allowCancel: true }); // Batch mode
```

**Why This Approach (Alternative Approach from Original Plan)**:
- **Eliminates code duplication**: No need for `createNoteInFolderWithCounter()` (~80 lines saved)
- **Single source of truth**: All note creation logic in one place
- **Easier to maintain**: Bug fixes apply to both single and batch modes
- **Backward compatible**: Existing calls don't need changes
- **Clear intent**: Options object makes behavior explicit

**UX Difference - Deliberate Design**:
- **Single note mode** (`allowCancel: false` or undefined): Empty clipboard auto-retries indefinitely. User must paste content to proceed.
- **Batch note mode** (`allowCancel: true`): Empty clipboard offers exit option. This is the **intentional exit mechanism** for the batch loop.

**Rationale**: Single note creation assumes user wants to create exactly one note, so we force them to provide content. Batch mode needs a graceful exit mechanism that doesn't require Ctrl+C, so empty clipboard becomes the exit signal.

### 9. Key Differences from `createNoteFlow()`

- Folder selection happens **once** at the beginning using shared `selectOrCreateFolder()` helper
- Note creation happens in a **loop** instead of once
- User can exit loop by leaving clipboard empty and responding "no" to retry prompt (only in batch mode)
- Each note shows progress indicator (Note 1 of batch, Note 2 of batch, etc.)
- Folder existence validated at start of each loop iteration (catches external deletions early)
- ENOENT errors (folder deleted) cause immediate exit without asking to continue
- Other errors allow user to continue or stop the loop
- Note counter only increments after successful creation (errors retry same note number)
- Zero-notes case shows "No notes created" message instead of "Created 0 note(s)"
- Final summary shows total notes created and returns to main menu (all exit paths return to menu)

### 10. Code Reuse Strategy

**Decision**: 
1. Refactor folder creation methods to support both single-note and batch modes
2. Extract folder selection logic into shared helper `selectOrCreateFolder()`
3. Refactor `createNoteInFolder()` to accept optional parameters instead of duplicating code

**Benefits**:
- Eliminates ~125 lines of folder selection duplication
- Eliminates ~80 lines of note creation duplication
- Makes both `createNoteFlow` and `writeNotesFlow` cleaner and easier to maintain
- Centralizes folder selection and note creation logic for consistent behavior
- Single source of truth reduces maintenance burden and bug surface area
- Follows existing codebase pattern of extracting reusable components

**Affected Methods**:
1. `createFolderFlow()` - REFACTORED to return `Promise<FolderMapping | null>` and accept `createNoteAfter` param
2. `createJobFolderFlow()` - REFACTORED to return `Promise<FolderMapping | null>` and accept `createNoteAfter` param
3. `createLifeEventFolderFlow()` - REFACTORED to return `Promise<FolderMapping | null>` and accept `createNoteAfter` param
4. `selectOrCreateFolder()` - NEW helper (extracted from lines 343-468)
5. `createNoteFlow()` - REFACTORED to use helper
6. `createNoteInFolder()` - REFACTORED to accept optional `{ noteCount, allowCancel }` parameters
7. `writeNotesFlow()` - NEW method using helper and refactored note creation
8. `UserCancelledError` - NEW custom error class

### 11. Exit Mechanism

**User exits the loop by**:
- Leaving clipboard empty
- Responding "no" to "Try again?" prompt
- This throws `UserCancelledError` which is caught in the loop
- Loop displays summary and returns to main menu

**All exit paths return to main menu**:
- Folder selection cancelled → return to menu
- Folder deleted during loop → return to menu  
- User cancels on first note (zero notes) → return to menu with "No notes created" message
- User cancels after N notes → return to menu with "Created N note(s)" message
- User chooses not to continue after error → return to menu

**Not exiting the entire script**:
- The existing `process.on('SIGINT')` handler (line 116) will still exit the entire script if user presses Ctrl+C
- This is acceptable behavior as it matches existing script behavior across all flows

### 12. Error Handling

**During folder selection**:
- Cache empty: Show message, return to menu
- Folder deleted externally: Re-scan, return to menu
- User cancels: Return to menu
- All handled by `selectOrCreateFolder()` returning null

**During loop execution**:
- **Folder deleted between notes** (ENOENT): Show message, exit loop immediately, return to menu (not recoverable)
- **User cancels** (empty clipboard + no retry): Throw `UserCancelledError`, exit loop with summary, return to menu
- **Clipboard read error**: Throw error from spawn handlers (existing behavior)
- **File write error**: Caught by try/catch, ask user to continue or stop
- **Clipboard permission error**: Throw error, caught by loop's catch block, ask user to continue or stop

**Error Recovery Strategy**:
- **ENOENT errors** (folder deleted): Immediate exit - folder is gone, cannot continue
- **User cancellation**: Immediate exit - user explicitly requested exit
- **All other errors**: Ask "Continue creating notes?" before stopping - these may be transient

**Race Condition Handling**:
- Folder existence is checked at the start of each loop iteration
- However, there's a race condition window between the check and the actual file write
- If folder is deleted after check but before write, `createNoteInFolder()` will throw ENOENT
- This is caught and handled as immediate exit (same as if caught by pre-check)
- This design accepts the race condition exists but handles it gracefully

### 13. Logging Requirements

**writeNotesFlow() logs**:
- Flow entry: `'Starting write notes flow'`
- Folder selected: `'Selected folder for batch notes: [name]'`
- Folder cancelled: `'Folder selection cancelled - exiting write notes flow'`
- Each note created: `'Note N created successfully in batch (N of batch)'`
- Loop exit (with notes): `'User exited write notes loop after N notes'`
- Loop exit (zero notes): `'User exited write notes loop after 0 notes'`
- Folder deleted: `'Folder deleted during batch creation - exiting loop'` or `'Folder deleted during note creation - exiting loop'`
- Error stop: `'User stopped after error. Created N notes'`

**createNoteInFolder() logs**:
- Same as existing logs for regular flow
- Additional (when `allowCancel: true`): Log when user cancels on empty clipboard

**selectOrCreateFolder() logs**:
- All existing logs from extracted code (lines 343-468)

**createFolderFlow() logs**:
- Same as existing logs
- Return value changes don't affect logging

### 14. Stats Tracking

**Behavior**:
- Each note created increments `jobNotes` or `lifeEventNotes` (existing logic in `createNoteInFolder`)
- Each note updates `lastCreatedNotePath` and `lastSelectedFolder` (existing logic)
- If user creates 5 notes and deletes the last one, it deletes note #5 (correct behavior)
- Stats are cumulative across the entire script session, not per loop or per flow
- Stats are accurate per note created, regardless of which flow created them

**Edge Case Documentation**:
- User creates 3 notes in batch loop → stats show +3
- Loop encounters error on note 4 before creation completes → stats still show 3 (correct)
- User exits loop and deletes last note → stats show 2 notes + 1 deletion
- This behavior is consistent across all flows

**No changes needed** - existing stats logic in `createNoteInFolder` handles this correctly for both single and batch modes.

## Files to Modify

1. **`src/types/eventsJobsSync.ts`** - Add `WRITE_NOTES` enum value
2. **`src/scripts/eventsJobsSync.ts`** - Add menu option and implement `writeNotesFlow()` method

## Testing Considerations

### Happy Path Tests
- Test folder selection works correctly (exact match)
- Test folder selection with fuzzy matches
- Test folder creation flow (verify folder created WITHOUT note when called from batch mode)
- Test multiple note creation in succession (3-5 notes)
- Test stats are updated correctly for each note
- Test clipboard clearing after each note
- Test note counter displays correctly (Note 1 of batch, Note 2 of batch, etc.)
- Test exit loop via empty clipboard + "no" to retry
- Verify clipboard is actually cleared between notes (not showing stale content)

### Error & Edge Case Tests
- **Delete last note**: After creating multiple notes in loop, verify "Delete last note" deletes the final note from the batch
- **Folder validation (pre-check)**: Delete folder externally between note #2 and note #3 (before prompt), verify folder check catches it and loop exits
- **Folder validation (race condition)**: Delete folder after prompt but during file write, verify ENOENT error causes immediate exit
- **Empty clipboard retry**: Leave clipboard empty, select "yes" to retry, verify loop continues and shows same note number
- **Empty clipboard exit**: Leave clipboard empty, select "no" to retry, verify loop exits with summary
- **Empty clipboard exit (zero notes)**: Cancel on first note attempt, verify shows "No notes created" message
- **File write error**: Simulate permission error mid-loop, verify error prompt asks to continue
- **Continue after error**: Choose "yes" to continue after error, verify next note creation proceeds with same note number
- **Stop after error**: Choose "no" to continue after error, verify loop exits
- **Error on first note**: Error occurs on note 1, user stops, verify correct messaging
- **Stats accuracy**: Create 5 notes, verify stats show +5 for correct folder type (job vs life-event)
- **Last created path**: Verify `lastCreatedNotePath` points to the final note in the batch
- **Cache invalidation**: If folder deleted and cache refreshed during selection, verify graceful return to menu
- **Ctrl+C**: Verify Ctrl+C still exits entire script (existing behavior)
- **Size validation**: Test 1MB+ clipboard content is rejected (existing validation applies)
- **Null byte validation**: Test clipboard with null bytes is rejected (existing validation applies)
- **Unicode content**: Test notes with emoji and special characters save correctly
- **Note counter on retry after error**: Create note 1, error on note 2, retry note 2, verify counter shows correct sequence

### Integration Tests
- Create notes via "📓 Write notes" (3 notes), then create one via "📝 Write a note", verify all 4 notes exist
- Create notes in Job folder via batch, then in Life-event folder via batch, verify stats separate correctly
- Create 3 notes via batch, delete last one, create 2 more via batch in same folder, verify state consistency
- Create folder via batch flow (new folder), verify folder created without initial note, then batch notes created
- Create folder via single-note flow, verify folder created WITH initial note (existing behavior preserved)
- Rename folder after creating batch notes, verify existing notes preserved

### User Experience Tests
- Verify menu shows "📓 Write notes" as **first option**
- Verify progress indicator shows correct note number with "of batch" suffix
- Verify summary message shows correct count when exiting
- Verify zero-notes case shows "No notes created" instead of "Created 0 note(s)"
- Verify all console messages are clear and helpful
- Verify no confusing error messages on normal exit
- Verify folder deletion messages show note count when applicable
- Verify error messages maintain note counter consistency

### Clipboard Behavior Tests
- **Rapid note creation**: Create 5 notes rapidly, verify clipboard clear/read works correctly
- **Large content between notes**: Alternate between small and large (near 1MB) content, verify no issues
- **Permission denied on clipboard read**: Simulate permission error, verify graceful handling with continue option
- **Permission denied on clipboard clear**: Verify clear errors are caught and don't break flow (existing behavior at line 150)

### Performance Tests
- **Many notes in single batch**: Create 20+ notes in one batch, verify no memory leaks or performance degradation
- **Loop iteration limit**: Verify loop has no artificial limit (can create 50+ notes if desired)
- **Cache consistency during long batch**: Create 15+ notes, verify cache stays valid throughout

## Implementation Steps

1. **Add `UserCancelledError` class** near top of `src/scripts/eventsJobsSync.ts`

2. **Add `WRITE_NOTES` enum value** to `MenuOption` enum in `src/types/eventsJobsSync.ts`

3. **Refactor folder creation methods** to return `Promise<FolderMapping | null>` and accept `createNoteAfter` parameter:
   - Update `createFolderFlow()` signature and implementation
   - Update `createJobFolderFlow()` signature and implementation
   - Update `createLifeEventFolderFlow()` signature and implementation
   - Ensure folder is returned when `createNoteAfter === false`
   - Preserve backward compatibility with default `createNoteAfter: true`

4. **Extract `selectOrCreateFolder()` helper method**:
   - Create new private method
   - Move lines 343-468 from `createNoteFlow()` into the helper
   - Return `FolderMapping | null`
   - When calling `createFolderFlow()`, pass `false` for `createNoteAfter` parameter
   - Preserve all logging and error handling

5. **Refactor `createNoteFlow()`** to use the helper:
   - Replace folder selection logic with call to `selectOrCreateFolder()`
   - Simplify to ~5 lines

6. **Refactor `createNoteInFolder()`** to accept optional parameters:
   - Add `options?: { noteCount?: number; allowCancel?: boolean }` parameter
   - Update prompt message to include note counter when provided
   - Modify empty clipboard handling:
     - If `allowCancel === true`: Ask "Try again?", throw `UserCancelledError` on "no"
     - If `allowCancel === false` or undefined: Auto-retry (existing behavior)
   - Preserve all other existing logic

7. **Implement `writeNotesFlow()` method**:
   - Call `selectOrCreateFolder()` once
   - Implement endless loop with folder validation
   - Call `createNoteInFolder()` with `{ noteCount, allowCancel: true }`
   - Handle `UserCancelledError` for user exit
   - Handle ENOENT errors as immediate exit
   - Handle other errors with continue/stop prompt
   - Display appropriate summary messages (including zero-notes case)
   - Ensure note counter only increments after success

8. **Add menu option** to `mainMenu()`:
   - Add as **first choice** in choices array
   - Add handler in action switch

9. **Add logging** for all new operations

10. **Test the complete flow** using test plan above

11. **Verify no linter errors** in modified files

## Expected Behavior

```
Main Menu:
- 📓 Write notes      <-- NEW - First option
- 📝 Write a note
- 📋 Rewrite a note
- 🗑️  Delete last note
- 📁 Delete all empty folders
- ✏️  Rename a folder
- 🚪 Exit

User selects: 📓 Write notes

Enter event/company name: HR_AddedValue
✅ Exact match found: 'HR_AddedValue'

===📋 Copy your message now and press Enter (Note 1 of batch)===
[User pastes note 1, presses Enter]
===✅ Note added: HR_AddedValue/notes_16032026-16.txt===

===📋 Copy your message now and press Enter (Note 2 of batch)===
[User pastes note 2, presses Enter]
===✅ Note added: HR_AddedValue/notes_16032026-17.txt===

===📋 Copy your message now and press Enter (Note 3 of batch)===
[User pastes note 3, presses Enter]
===✅ Note added: HR_AddedValue/notes_16032026-18.txt===

===📋 Copy your message now and press Enter (Note 4 of batch)===
[User leaves clipboard empty, presses Enter]
===⚠️  Clipboard is empty===
? Try again? No

===✅ Created 3 note(s). Returning to main menu...===

[Back to Main Menu]
```

### Alternative Flow: Zero Notes Created

```
===📋 Copy your message now and press Enter (Note 1 of batch)===
[User leaves clipboard empty, presses Enter]
===⚠️  Clipboard is empty===
? Try again? No

===No notes created. Returning to main menu...===

[Back to Main Menu]
```

### Alternative Flow: Error Handling

```
===📋 Copy your message now and press Enter (Note 2 of batch)===
[Filesystem permission error occurs]
===⚠️  Error creating note: Permission denied===
? Continue creating notes? Yes

===📋 Copy your message now and press Enter (Note 2 of batch)===
[User retries and succeeds]
===✅ Note added: HR_AddedValue/notes_16032026-17.txt===
```

### Alternative Flow: Folder Deleted Externally (Before Prompt)

```
===📋 Copy your message now and press Enter (Note 3 of batch)===
===✅ Note added: HR_AddedValue/notes_16032026-18.txt===

[User deletes folder in Finder/Explorer]
[Loop checks folder existence before next prompt]

===⚠️  Folder was deleted. Created 3 note(s)===

[Back to Main Menu]
```

### Alternative Flow: Folder Deleted During Write (Race Condition)

```
===📋 Copy your message now and press Enter (Note 3 of batch)===
[Folder exists check passes]
[User pastes content, presses Enter]
[User deletes folder in Finder/Explorer during file write]
===⚠️  Error creating note: Folder no longer exists: /path/to/folder===

===⚠️  Folder was deleted. Created 2 note(s)===

[Back to Main Menu]
```

## Edge Cases & Design Decisions

### Clipboard Behavior
- **Rapid clipboard changes**: Not a concern - clipboard is read synchronously when user presses Enter
- **Unicode/emoji content**: Handled identically to single note creation (existing validation)
- **Very large content**: 1MB limit check is sufficient (existing validation)
- **Clipboard access denied on read**: Will throw error, caught by loop, user prompted to continue or exit
- **Clipboard clear failures**: Silently caught (line 150 in existing code), doesn't break flow

### Filesystem Operations
- **Folder deleted during loop (pre-check)**: Validated at start of each iteration via `fs.access()`, exits gracefully with message
- **Folder deleted during write (race condition)**: `createNoteInFolder()` throws ENOENT, caught as immediate exit
- **Permission errors**: User prompted to continue or stop (may be transient)
- **Race conditions**: Accepted and handled gracefully - no way to eliminate the window entirely

### Exit Mechanisms
- **User cancellation**: Empty clipboard + "no" to retry → throws `UserCancelledError` → exits with summary
- **Ctrl+C**: Exits entire script (existing behavior, unchanged)
- **Error-based exit**: User chooses "no" to continue after error
- **Folder deletion**: Immediate exit (ENOENT is not recoverable)
- **All paths return to main menu** (no process.exit calls in flow)

### State Management
- **lastCreatedNotePath**: Always points to most recent note (even across different flows)
- **Stats tracking**: Cumulative across all flows in session, accurate per note created
- **Cache consistency**: Validated during folder selection, invalidated if external changes detected
- **Note counter**: Only increments after successful creation; errors retry same note number

### User Experience Decisions
- **Note counter**: 1-indexed (Note 1, Note 2, ...) for user-friendliness
- **Progress indication**: Shows "Note N of batch" to distinguish from single-note mode
- **Summary on exit**: Shows total notes created ("Created N note(s)") or "No notes created" for zero case
- **Menu positioning**: First option for easy access to most common multi-note workflow
- **Empty clipboard behavior difference**:
  - **Single note mode**: Auto-retries indefinitely (user must provide content)
  - **Batch note mode**: Offers exit option (this IS the exit mechanism)
  - **Rationale**: Single mode assumes user wants exactly one note; batch mode needs graceful exit without Ctrl+C

### Integration with Existing Features
- **Delete last note**: Works correctly - deletes the most recent note from any flow (including batch)
- **Cross-flow consistency**: Stats and state are shared across single-note and batch-note flows
- **Folder creation from batch mode**: Creates folder WITHOUT initial note, then enters batch loop
- **Folder creation from single-note mode**: Creates folder WITH initial note (existing behavior preserved)

### Performance Considerations
- **Loop iteration limit**: None - by design, users can create unlimited notes in one batch
- **Memory**: No leaks expected - each iteration is independent, no accumulation
- **Cache validity**: Remains valid throughout batch (only invalidated on external folder changes)
- **Tested up to**: Plan assumes testing with 20-50 notes to verify no performance degradation

### Delete Last Note Integration
- **After batch creation**: "Delete last note" deletes the final note from the batch (correct)
- **Cross-flow deletion**: Works correctly across single and batch flows
- **Multiple deletions**: User can delete multiple times to remove notes from batch one by one (existing behavior)
- **State consistency**: Documented in testing plan

---

## Summary of Plan Improvements

This plan has been thoroughly reviewed and improved based on deep code analysis and edge case consideration. Key improvements include:

### Architecture Improvements
1. **Refactored folder creation methods** to return `Promise<FolderMapping | null>` and accept `createNoteAfter` parameter, solving the critical issue where folders were auto-creating notes
2. **Eliminated code duplication** by refactoring `createNoteInFolder()` to accept optional parameters instead of creating a duplicate method (~80 lines saved)
3. **Added custom `UserCancelledError` class** for type-safe error handling instead of string comparison
4. **Extracted folder selection logic** into reusable `selectOrCreateFolder()` helper (~125 lines of duplication eliminated)

### Error Handling Improvements
5. **ENOENT errors cause immediate exit** (folder deleted) instead of asking to continue
6. **Race condition explicitly documented and handled** - folder deletion between check and write is gracefully caught
7. **All exit paths return to main menu** - clearly documented in plan
8. **Zero-notes case handled specially** with "No notes created" message instead of "Created 0 note(s)"

### UX Improvements
9. **Progress indicators enhanced** with "Note N of batch" suffix to distinguish from single-note mode
10. **Empty clipboard behavior differences documented** with clear rationale for why single and batch modes differ
11. **Note counter behavior clarified** - only increments on success, errors retry same number
12. **All summary messages improved** to show appropriate context (note count, zero notes, folder deleted)

### Testing Improvements
13. **Comprehensive test coverage added** including:
    - Clipboard state verification between notes
    - Race condition testing (folder deletion timing)
    - Zero-notes case testing
    - Note counter consistency on errors
    - Performance testing with 20+ notes
    - Integration with existing "Delete last note" feature

### Documentation Improvements
14. **Stats tracking edge cases documented** with clear examples
15. **Performance considerations added** (no iteration limit, memory, cache validity)
16. **Integration with existing features clearly documented** (folder creation differences, delete last note)
17. **All design decisions have explicit rationale** (empty clipboard differences, exit mechanisms, etc.)

### Implementation Clarity
18. **Step-by-step implementation order** clearly defined with 11 numbered steps
19. **Backward compatibility explicitly maintained** through optional parameters and default values
20. **All affected methods clearly listed** with their changes documented

The plan is now production-ready with no critical gaps or ambiguities remaining.
