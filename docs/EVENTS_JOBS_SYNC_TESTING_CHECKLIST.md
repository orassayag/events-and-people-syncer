# Events & Jobs Sync - Manual E2E Testing Checklist

## Testing Overview

This checklist covers all 80+ manual end-to-end test scenarios specified in the implementation plan. Mark each item as you test it.

**Testing Date**: _________  
**Tester**: _________  
**Environment**: _________

---

## Prerequisites Setup

- [ ] Google Contacts labels "Job" and "HR" exist
- [ ] `dummy/job-interviews/` folder exists with proper permissions
- [ ] `dummy/life-events/` folder exists with proper permissions
- [ ] At least one existing Job folder (e.g., `Job_TestCompany`)
- [ ] At least one existing Life Event folder (e.g., `Test Event OSR`)

---

## Core Functionality Tests

### Folder Selection & Matching

- [ ] **Test 1**: Happy Path - Create note in existing folder
  - Enter exact folder name (case-insensitive)
  - Verify exact match found
  - Verify note created successfully
  
- [ ] **Test 3**: Fuzzy Match - Enter partial company name
  - Enter "Micro" to find "Microsoft"
  - Verify similar folders shown
  - Select from matches
  - Verify note created

- [ ] **Test 5**: Exact match with different case
  - Enter "microsoft" to find "Job_Microsoft"
  - Verify case-insensitive match works
  
- [ ] **Test 11**: Unicode/Emoji in folder name
  - Try creating folder with emoji: "Test😀Company"
  - Verify rejection with appropriate error message

- [ ] **Test 12**: Very long path
  - Try creating folder name with 300+ characters
  - Verify path length validation triggers

### Folder Creation - Job/HR

- [ ] **Test 2**: New Job folder creation
  - Create new folder for company not in list
  - Select "Job Interview" type
  - Select "Job" label
  - Enter company name: "NewCompany"
  - Verify PascalCase formatting: `Job_NewCompany`
  - Verify cache updated immediately
  
- [ ] **Test 6**: Job folder with multi-word company
  - Company: "elad software systems"
  - Verify formatted to: `Job_EladSoftwareSystems`

- [ ] **Test 10**: Case-insensitive duplicate detection
  - Try creating `Job_microsoft` when `Job_Microsoft` exists
  - Verify error shown
  - Verify folder not created

- [ ] **Test 14**: Windows reserved name validation
  - Try folder names: "CON", "PRN", "AUX", "NUL"
  - Try: "COM1", "LPT1"
  - Verify all rejected with appropriate message

- [ ] **Test 70**: Invalid folder format (wrong label case)
  - Manually create folder: `job_Microsoft` (lowercase "job")
  - Start script
  - Verify startup error with case-sensitive message

### Folder Creation - Life Events

- [ ] **Test 2b**: New Life Event folder
  - Create "John Doe Meeting"
  - Select which word is the label (e.g., "Meeting")
  - Verify folder created correctly
  - Verify label saved properly

- [ ] **Test 18**: Life Event label inference
  - Use existing folder with multiple words
  - Verify correct label inferred from Google Contacts
  - Test folder: "Alex Z OSR" where both "Alex" and "OSR" exist as labels
  - Verify **first match** ("Alex") is used

- [ ] **Test 66**: Multiple label matches - first match wins
  - Create labels "Test" and "Word" in Google Contacts
  - Create life event folder: "Test Word Event"
  - Verify "Test" (first word) is inferred as label

### Note Creation

- [ ] **Test 7**: Create 3 notes same folder same day
  - Create note 1 → Verify filename: `notes_DDMMYYYY-1.txt`
  - Create note 2 → Verify filename: `notes_DDMMYYYY-2.txt`
  - Create note 3 → Verify filename: `notes_DDMMYYYY-3.txt`

- [ ] **Test 15**: Counter starting at 0
  - Manually create: `notes_DDMMYYYY-0.txt`
  - Create new note
  - Verify next file is: `notes_DDMMYYYY-1.txt`

- [ ] **Test 15b**: Counter with gaps
  - Manually create files: `notes_DDMMYYYY-0.txt`, `notes_DDMMYYYY-2.txt`, `notes_DDMMYYYY-5.txt`
  - Create new note
  - Verify next file is: `notes_DDMMYYYY-6.txt` (max+1)

- [ ] **Test 16**: Mixed note formats
  - Manually create: `notes_DDMMYYYY.txt` (no counter)
  - Manually create: `notes_DDMMYYYY-1.txt`
  - Create new note
  - Verify next is: `notes_DDMMYYYY-2.txt` (ignores file without counter)

- [ ] **Test 69**: Binary data rejection
  - Try creating note with null bytes: "Test\0Content"
  - Verify rejected with error: "cannot contain binary data"

- [ ] **Test 75**: Note content max length
  - Try creating note with 1,048,577 characters (> 1MB)
  - Verify rejected
  - Try with exactly 1,048,576 characters
  - Verify accepted

- [ ] **Test 76**: Folder deleted before note creation (ENOENT)
  - Select folder
  - Manually delete folder externally
  - Try creating note
  - Verify clear error: "Folder no longer exists"

### Note Operations

- [ ] **Test 4**: Delete last note
  - Create note
  - Select "🗑️ Delete last note"
  - Verify confirmation prompt
  - Confirm deletion
  - Verify stats updated (deletedNotes++)
  - Verify jobNotes/lifeEventNotes decremented

- [ ] **Test 4b**: Delete last note - ENOENT handling
  - Create note
  - Manually delete note file externally
  - Try "Delete last note"
  - Verify graceful handling with warning message

- [ ] **Test 6**: Rewrite note
  - Create note with content "Original"
  - Select "📋 Rewrite note"
  - Select folder and note file
  - Enter new content: "Updated"
  - Verify content changed
  - Verify file not duplicated

### Folder Operations

- [ ] **Test 5**: Delete empty folder
  - Create new folder
  - Don't add any notes
  - Select "📁 Delete empty folder"
  - Select the folder
  - Verify confirmation prompt
  - Confirm deletion
  - Verify cache updated
  - Verify stats updated (deletedFolders++)

- [ ] **Test 17**: Delete folder with hidden files
  - Create folder
  - Add `.DS_Store` file
  - Add `Thumbs.db` file
  - Add `desktop.ini` file
  - Try delete empty folder
  - Verify folder considered empty (hidden files ignored)
  - Verify deletion succeeds

- [ ] **Test 16b**: Rename folder - Job/HR
  - Select existing Job folder
  - Rename to different company
  - Verify new format: `Job_NewCompany`
  - Verify cache updated
  - Verify stats updated (renamedFolders++)

- [ ] **Test 16c**: Rename folder - Life Event
  - Select existing life event folder
  - Enter new name
  - Select label from words
  - Verify folder renamed
  - Verify cache updated

- [ ] **Test 89**: Rename doesn't affect existing contacts
  - Create folder and contact
  - Rename folder
  - Check Google Contacts
  - Verify contact unchanged (biography doesn't reference folder name)

### Contact Creation

- [ ] **Test 1b**: Create contact after note
  - Create note in Job folder
  - Select "👤 Add contact"
  - Verify label pre-populated with "Job"
  - Verify company pre-populated
  - Enter contact details
  - Verify contact created in Google Contacts
  - Verify biography: "Added by events & jobs sync script - Last update: DD/MM/YYYY"

- [ ] **Test 2c**: Create contact in life event folder
  - Create note in life event folder
  - Add contact
  - If label missing, verify prompt to create
  - Create label if prompted
  - Verify contact created with correct label

- [ ] **Test 19**: Contact groups caching
  - Create first contact → Groups fetched from API
  - Create second contact → Groups loaded from cache
  - Verify log: "Using cached contact groups"
  - Create new label during contact creation
  - Verify cache updated

- [ ] **Test 67**: Required labels missing (Job/HR)
  - Manually delete "Job" label from Google Contacts
  - Try creating contact in Job folder
  - Verify script throws error
  - Verify error message: "Required label 'Job' does not exist"

- [ ] **Test 78**: Menu state - Add contact disabled
  - Start script fresh
  - Verify "Add contact" option NOT shown in menu
  - Create note
  - Verify "Add contact" option NOW shown

### Cache & Performance

- [ ] **Test 8**: --no-cache flag
  - Set: `NO_CACHE=true`
  - Run script
  - Verify console message: "Cache bypassed via --no-cache flag"
  - Verify cache deleted
  - Verify folders re-scanned

- [ ] **Test 71**: Malformed cache JSON
  - Manually corrupt `sources/.cache/folder-mappings.json`
  - Start script
  - Verify cache invalidated automatically
  - Verify re-scan happens
  - Verify no crash

### Error Handling & Edge Cases

- [ ] **Test 9**: Illegal characters in folder name
  - Try characters: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`
  - Verify each rejected
  - Verify error message lists forbidden characters

- [ ] **Test 10b**: Path validation - neither folder exists
  - Rename both `job-interviews` and `life-events`
  - Start script
  - Verify error: "Neither job-interviews nor life-events folder found"

- [ ] **Test 72**: Path exists but is file
  - Delete `job-interviews` folder
  - Create file named `job-interviews`
  - Start script
  - Verify error: "Path exists but is not a directory"

- [ ] **Test 73**: Path permissions
  - Remove write permissions: `chmod a-w dummy/job-interviews`
  - Start script
  - Verify error: "Insufficient permissions"
  - Restore permissions: `chmod u+w dummy/job-interviews`

- [ ] **Test 74**: Parent directory deleted during execution
  - Start script
  - In another terminal, delete `dummy` directory
  - Try creating folder
  - Verify error: "Parent directory no longer exists"

- [ ] **Test 63**: Folder deleted externally before note creation
  - Select folder (exact match)
  - Manually delete folder
  - Try proceeding
  - Verify warning and cache re-scan

- [ ] **Test 71b**: EEXIST during folder creation
  - Start creating folder
  - In another terminal, create same folder manually
  - Complete creation
  - Verify graceful handling with re-prompt

### Whitespace & Trimming

- [ ] **Test 64**: Whitespace trimming in folder names
  - Enter: "  TestCompany  " (with leading/trailing spaces)
  - Verify trimmed to: "TestCompany"
  - Verify folder created without spaces

- [ ] **Test 64b**: Tabs and newlines trimming
  - Enter folder name with tabs: "\tTest\t"
  - Verify trimmed correctly

### Timezone & Date Handling

- [ ] **Test 77**: System time behavior
  - Note current timezone
  - Create note → Check filename date
  - Change system timezone
  - Create another note in same folder
  - Verify date reflects new timezone

- [ ] **Test 90**: Date format consistency
  - Create note → Check filename format (DDMMYYYY without slashes)
  - Create contact → Check biography format (DD/MM/YYYY with slashes)
  - Verify same underlying date used (only format differs)

### Script State & Menu

- [ ] **Test 78**: Delete last note - only after creation
  - Start script
  - Verify "Delete last note" NOT in menu
  - Create note
  - Verify "Delete last note" NOW in menu

- [ ] **Test 78b**: Add contact - only after folder selection
  - Start script
  - Verify "Add contact" NOT in menu
  - Create note (selects folder)
  - Verify "Add contact" NOW in menu

### Signal Handling & Exit

- [ ] **Test 6b**: Graceful exit (Ctrl+C)
  - Start script
  - Create 2 notes
  - Press Ctrl+C
  - Verify summary displayed
  - Verify stats correct

- [ ] **Test 11b**: Exit via menu
  - Select "🚪 Exit"
  - Verify summary displayed
  - Verify clean exit

### Symlinks (if applicable)

- [ ] **Test 13**: Symlink behavior
  - Create symlink: `ln -s /actual/path dummy/job-interviews`
  - Start script
  - Verify symlink followed
  - Verify target directory scanned
  - **Warning**: Do not test circular symlinks (not supported)

### Label Resolution & Inference

- [ ] **Test 18b**: Life event label inference - no match
  - Create folder: "Random Words Here"
  - None of these words exist as labels
  - Try adding contact
  - Verify user selects label manually

- [ ] **Test 18c**: Life event label inference - single match
  - Ensure only "OSR" exists as label
  - Use folder: "Alex Z OSR"
  - Add contact
  - Verify "OSR" automatically inferred

### Logging & Privacy

- [ ] **Test 80**: Logging policy verification
  - Create note with content: "SECRET CONTENT"
  - Check log file: `logs/events-jobs-sync-DD_MM_YYYY.log`
  - Verify folder name logged
  - Verify note filename logged
  - Verify note content NOT logged

- [ ] **Test 80b**: Log all major actions
  - Perform various operations
  - Check log file
  - Verify logged: folder selection, note creation, folder creation, contact creation, errors, stats

---

## Summary & Notes

**Total Tests**: 80+  
**Passed**: ___  
**Failed**: ___  
**Skipped**: ___

### Issues Found:

1. _____________________________
2. _____________________________
3. _____________________________

### Notes:

_____________________________
_____________________________
_____________________________

### Recommendations:

_____________________________
_____________________________
_____________________________

---

**Testing Completed**: [ ] Yes [ ] No  
**Ready for Production**: [ ] Yes [ ] No  
**Sign-off**: ___________ Date: ___________
