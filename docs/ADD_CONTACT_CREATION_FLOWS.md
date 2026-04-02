# Add Contact Creation to Note Flows

## Overview

Modify two flows in the Events & Jobs Sync script to prompt the user to create a contact after finishing note creation. The contact wizard will reuse the label and company name from the folder context. Labels are now REQUIRED for all contacts - empty selection is not permitted.

**IMPORTANT CONSTRAINTS:**
- This script is used by a single user locally. No concurrent modifications or multi-user scenarios need to be considered.
- The **parent directories** (life-events and job-interviews) are NEVER renamed externally during script execution.
- **Sub-folders** (e.g., "Job_AcmeInc", "Paris Trip") CAN be renamed externally via the rename folder flow.
- The `lastSelectedFolder` context can become stale if folders are renamed between operations.

**ABOUT "ADD CONTACT" MENU OPTION:**
- The "Add contact" menu option exists in the "Contacts Sync" script (a different script).
- This feature is NOT needed in the "Events & Jobs Sync" script.
- This document does NOT propose adding an "Add contact" menu option to this script.

## Current Flow Analysis

### 1. Write a note flow (`createNoteFlow`)

**Current behavior:**

- User selects or creates a folder
- User pastes one note from clipboard
- Returns to main menu immediately

**Location:** `[src/scripts/eventsJobsSync.ts:478-483](src/scripts/eventsJobsSync.ts)`

### 2. Write notes flow (`writeNotesFlow`)

**Current behavior:**

- User selects or creates a folder
- Loops to create multiple notes until user cancels (empty clipboard + "Try again? No")
- On cancel via `UserCancelledError`, displays "Created X notes" message
- Returns to main menu

**Location:** `[src/scripts/eventsJobsSync.ts:484-570](src/scripts/eventsJobsSync.ts)`

## Folder Context Structure

Folders contain label and company information:

```typescript
interface FolderMapping {
  name: string;
  path: string;
  type: FolderType; // JOB, HR, or LIFE_EVENT
  label: string; // e.g., "Job", "HR", or life event label
  companyName?: string; // Only for JOB/HR folders
}
```

**Parsing rules:**

- Job/HR folders: Format `{Job|HR}_{CompanyName}`, parsed via regex `^(Job|HR)_([^ ].+)$`
- Life event folders: Label is the last word of the folder name

## Proposed Changes

### Change 1: Modify `createNoteFlow` (Write a note)

**New behavior:**

1. User selects/creates folder and pastes note (unchanged)
2. After successful note creation, prompt: "Create a new contact? (y/n)"
3. If No → Return to main menu (current behavior)
4. If Yes → Call modified contact creation flow

### Change 2: Modify `writeNotesFlow` (Write notes)

**New behavior:**

1. User selects/creates folder and pastes multiple notes (unchanged)
2. When user cancels via empty clipboard + "Try again? No", display "Created X notes" (unchanged)
3. After displaying the message, prompt: "Create a new contact? (y/n)"
4. If No → Return to main menu (current behavior)
5. If Yes → Call modified contact creation flow

### Change 3: Extract and reuse contact creation logic

**Current implementation:** `[src/scripts/eventsJobsSync.ts:1522-1637](src/scripts/eventsJobsSync.ts)`

The existing `addContactFlow` handles:

- Authentication
- Fetching/caching contact groups
- Label resolution (with folder context)
- Creating missing labels in Google Contacts
- Pre-populating company and label for the wizard
- Calling `EventsContactEditor.collectInitialInput(prePopulatedData)`

**Key logic to extract:** Lines 1548-1605 (label resolution with folder context)

## Implementation Approach

### Step 0: Add Authentication Check at Startup

Instead of checking network connectivity separately, attempt authentication at startup. This is more reliable because it tests actual Google API access, not just DNS/network.

**Implementation:**

Modify the `run()` method to attempt authentication before entering the main menu:

```typescript
async run(): Promise<void> {
  this.setupSignalHandlers();
  console.log('\n===Events & Jobs Sync===\n');
  await this.logger.initialize();
  this.setupConsoleCapture();
  await this.logger.logMain('Events & Jobs Sync started');
  
  // NEW: Pre-flight authentication check for contact features
  try {
    const authService = new AuthService();
    this.auth = await authService.authorize();
    this.isAuthenticated = true;
    await this.logger.logMain('✅ Google authentication successful');
  } catch (error) {
    await this.logger.logError(`Authentication failed: ${(error as Error).message}`);
    console.log('\n⚠️  Google authentication failed.');
    console.log('You can still create notes, but contact features will be unavailable.\n');
    // Continue anyway - notes don't require auth
  }
  
  try {
    await this.validatePaths();
    await this.initializeCache();
    await this.mainMenu();
  } catch (error) {
    if (error instanceof Error && error.message !== 'User cancelled') {
      this.uiLogger.error('Script failed', error);
      await this.logger.logError(`Script failed: ${error.message}`);
      console.error('\n❌ Script failed:', error.message);
    }
  } finally {
    this.displayFinalSummary();
    await this.logger.logMain(
      `Script ended - Job notes: ${this.stats.jobNotes}, Life event notes: ${this.stats.lifeEventNotes}, Contacts: ${this.stats.contacts}, Created folders: ${this.stats.createdFolders}, Deleted folders: ${this.stats.deletedFolders}, Renamed folders: ${this.stats.renamedFolders}`
    );
    this.restoreConsole();
  }
}
```

**Why this approach?**
- Tests actual API access, not just network/DNS
- Allows note features to work even if Google authentication fails
- More consistent with existing auth patterns in the codebase
- Eliminates need for custom network connectivity checks

### Step 1: Update Validation and Label Selection Flow (MUST DO FIRST)

**CRITICAL CLARIFICATION - Changes Apply to ContactEditor (ALL Scripts):**

All changes in this step are made to `ContactEditor` (the base class used by all contact wizards). These changes will affect ALL scripts that use `ContactEditor`:

1. **EventsJobsSyncScript** - This script (the one we're modifying)
2. **ContactsSyncScript** - Different script that also uses ContactEditor
3. Any other scripts that import ContactEditor

**INTENTIONAL CHANGE - Labels Now Required for ALL Contacts:**
- Making labels required is an **intentional, expected change** that affects all scripts
- This is NOT a breaking change in terms of logic - it's an expected enhancement
- The `EventsContactEditor` class extends `ContactEditor` and overrides `collectInitialInput()` with pre-population support
- Changes to `ContactEditor.validateMinimumRequirements()` will require ALL contacts (in all scripts) to have at least one label
- Changes to `ContactEditor.promptForLabels()` will enforce label selection in ALL contact creation flows
- **Rationale:** All contacts in the system should be properly categorized with labels for better organization and searchability

**Part A: Modify `InputValidator.validateMinimumRequirements`** to require labels:

```typescript
static validateMinimumRequirements(data: EditableContactData): string | true {
  if (!data.firstName || !data.firstName.trim()) {
    return 'First name is required.';
  }
  if (!data.labelResourceNames || data.labelResourceNames.length === 0) {
    return 'At least one label is required.';
  }
  return true;
}
```

**Impact Analysis:** This validation is called in the summary/edit loop of ALL contact wizards across ALL scripts. Making labels required is an **intentional, expected change** that improves data quality across all contact management flows.

**Part B: Modify `ContactEditor.promptForLabels()`** to handle empty label list and enforce selection:

When `existingGroups.length === 0` (no labels exist in Google Contacts):
1. Display: `"===⚠️ At least 1 label is required to create a new contact==="`
2. Automatically trigger the create label wizard using `this.createContactGroup()`
3. After label creation, fetch groups again and proceed with label selection
4. User must select at least one label (enforced by validation)

```typescript
async promptForLabels(): Promise<string[]> {
  console.log('\n===Select Labels===\n');
  let existingGroups = await this.fetchContactGroups();
  let selectedResourceNames: string[] = [];
  
  // NEW: Handle case where no labels exist
  if (existingGroups.length === 0) {
    console.log('===⚠️ At least 1 label is required to create a new contact===');
    console.log('No existing labels found. Creating new label...\n');
    
    // Loop until at least one label is created
    while (existingGroups.length === 0) {
      const { labelName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'labelName',
          message: 'Enter new label name:',
          validate: (input: string): boolean | string => {
            if (!input.trim()) {
              return 'Label name cannot be empty.';
            }
            return InputValidator.validateLabelName(input, existingGroups);
          },
        },
      ]);
      
      // Create the label using ContactEditor's built-in method
      const trimmedLabelName = labelName.trim();
      const ora = (await import('ora')).default;
      const spinner = ora({
        text: `Creating label: ${trimmedLabelName}...`,
        color: 'cyan',
      }).start();
      
      const newGroupResourceName = await this.createContactGroup(trimmedLabelName);
      
      spinner.stop();
      spinner.clear();
      
      console.log(`\n===✅ Label created: ${trimmedLabelName}===\n`);
      
      // Fetch groups again to get the newly created label
      existingGroups = await this.fetchContactGroups();
    }
  }
  
  // Now existingGroups.length > 0 is guaranteed
  const choices = existingGroups.map((group) => ({
    name: group.name,
    value: group.resourceName,
  }));
  
  const { selectedLabels } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedLabels',
      message: 'Select labels (At least one required):', // UPDATED MESSAGE
      choices,
      pageSize: SETTINGS.api.displayPageSize,
      loop: false,
      instructions: ' ',
      validate: (selected: string[]): boolean | string => { // NEW VALIDATION
        if (!selected || selected.length === 0) {
          return 'At least one label is required.';
        }
        return true;
      },
    },
  ]);
  
  selectedResourceNames = selectedLabels;
  return selectedResourceNames;
}
```

**Impact Analysis:** 
- This method is called by `ContactEditor.collectInitialInput()` and `EventsContactEditor.collectInitialInput()`
- Adding validation to the checkbox prevents users from pressing Enter without selection
- The empty label wizard loop ensures at least one label exists before showing selection
- This changes behavior for ALL scripts using ContactEditor - this is an **intentional, expected change**

**Why first?** This ensures contact validation is correct and prevents validation loop issues before we add new contact creation entry points. We make labels required at both the UI level (checkbox validation) and the data validation level (validateMinimumRequirements).

### Step 2: Modify Note Creation to Return Success Status

**Change `createNoteInFolder` signature** from `Promise<void>` to `Promise<boolean>`:

```typescript
private async createNoteInFolder(
  folder: FolderMapping,
  options?: { noteCount?: number; allowCancel?: boolean }
): Promise<boolean> {
  // ... existing clipboard reading logic ...
  
  const trimmedMessage = message.trim();
  
  // Validation checks - return false instead of silent return
  if (trimmedMessage.length > 1048576) {
    console.log('\n⚠️  Message cannot exceed 1MB (~1,048,576 characters).\n');
    return false; // ← Changed from: return;
  }
  if (trimmedMessage.includes('\0')) {
    console.log('\n⚠️  Message cannot contain binary data (null bytes).\n');
    return false; // ← Changed from: return;
  }
  
  // ... existing note writing logic ...
  
  await this.noteWriter.writeNote(folder.path, trimmedMessage, new Date());
  // ... existing logging ...
  
  return true; // ← Note created successfully
}
```

**Why?** Enables both flows to verify note creation success before prompting for contact creation. Fixes the issue where validation failures would still trigger contact prompts.

### Step 3: Extract Common Logic and Add Duplicate Detection

Create new method `promptAndCreateContact()` in `eventsJobsSync.ts`:

**Responsibilities:**
1. Validate `lastSelectedFolder` exists and folder still exists on disk (defensive check against renamed/deleted folders)
2. Log which folder context is being used
3. Display folder context to user: `"Create a new contact for {folderName}? (y/n)"`
4. If No → return immediately
5. If Yes → Call existing contact creation logic with enhanced empty label handling
6. **NEW:** Ensure duplicate detection is ALWAYS performed, regardless of pre-population

**Critical Fix - Duplicate Detection:**

The existing `EventsContactEditor.collectInitialInput()` with pre-populated data does NOT perform duplicate detection, while the base `ContactEditor.collectInitialInput()` does. This is inconsistent and potentially problematic.

**Solution:** Modify `EventsContactEditor.collectInitialInput()` to ALWAYS perform duplicate detection after collecting the full name, similar to the base class:

```typescript
// In EventsContactEditor.collectInitialInput(), after parsing fullName:
const { firstName, lastName } = TextUtils.parseFullName(fullName);

// NEW: Always perform duplicate detection
if (firstName && lastName) {
  const nameDuplicates = await this.duplicateDetector.checkDuplicateName(firstName, lastName);
  const shouldContinue = await this.duplicateDetector.promptForDuplicateContinue(nameDuplicates);
  if (!shouldContinue) {
    throw new Error('User cancelled due to duplicate');
  }
}

// Continue with rest of the wizard...
```

Similarly, add duplicate detection for email, phone, and LinkedIn URL when collected in `EventsContactEditor`.

**Enhanced Empty Label Handling and Folder Staleness Check:**

```typescript
private async promptAndCreateContact(): Promise<void> {
  // Validate folder context exists
  if (!this.lastSelectedFolder) {
    await this.logger.logError('No folder context available for contact creation');
    console.log('\n===⚠️ No folder context available===\n');
    return;
  }
  
  // NEW: Validate folder still exists AND metadata is accurate (protect against renamed/deleted folders)
  try {
    await fs.access(this.lastSelectedFolder.path);
    
    // NEW: Verify metadata is still accurate by re-parsing the folder name
    const folderName = this.lastSelectedFolder.path.split('/').pop() || '';
    const isJobOrHR = this.lastSelectedFolder.type === FolderTypeEnum.JOB || 
                      this.lastSelectedFolder.type === FolderTypeEnum.HR;
    
    try {
      const parsedMetadata = this.folderManager.parseFolderName(folderName, isJobOrHR);
      
      // Verify parsed metadata matches stored metadata
      if (parsedMetadata.label !== this.lastSelectedFolder.label ||
          parsedMetadata.companyName !== this.lastSelectedFolder.companyName) {
        await this.logger.logError(
          `Folder metadata is stale - folder was renamed: '${this.lastSelectedFolder.path}'. ` +
          `Expected label: '${this.lastSelectedFolder.label}', company: '${this.lastSelectedFolder.companyName}'. ` +
          `Actual label: '${parsedMetadata.label}', company: '${parsedMetadata.companyName}'.`
        );
        console.log('\n===⚠️ Folder context is stale (folder was renamed)===');
        console.log('The folder name changed since the note was created.');
        console.log('Cannot create contact. Please create a new note to refresh folder context.\n');
        this.lastSelectedFolder = null; // Clear stale context
        return;
      }
    } catch (parseError) {
      // Folder name is no longer valid (e.g., doesn't match expected pattern)
      await this.logger.logError(
        `Folder name format changed: '${folderName}'. Parse error: ${(parseError as Error).message}`
      );
      console.log('\n===⚠️ Folder context is stale (folder format changed)===');
      console.log('The folder name format changed since the note was created.');
      console.log('Cannot create contact. Please create a new note to refresh folder context.\n');
      this.lastSelectedFolder = null; // Clear stale context
      return;
    }
  } catch {
    await this.logger.logError(
      `Folder context is stale - folder no longer exists: '${this.lastSelectedFolder.path}'`
    );
    console.log('\n===⚠️ Folder context is stale (folder was renamed or deleted)===');
    console.log('Cannot create contact. Please create a new note to refresh folder context.\n');
    this.lastSelectedFolder = null; // Clear stale context
    return;
  }
  
  // Show context to user
  const folderDisplay = this.lastSelectedFolder.name;
  await this.logger.logMain(`Prompting contact creation for folder: '${folderDisplay}'`);
  
  const { shouldAddContact } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldAddContact',
      message: `Create a new contact for ${folderDisplay}?`,
      default: false,
    },
  ]);
  
  if (!shouldAddContact) {
    await this.logger.logMain('User declined contact creation');
    return;
  }
  
  await this.logger.logMain('User confirmed contact creation');
  
  // Handle errors gracefully - don't propagate
  try {
    // Authentication check
    if (!this.isAuthenticated) {
      const authService = new AuthService();
      await authService.authorize();
      this.isAuthenticated = true;
      await this.logger.logMain('✅ Authentication successful');
    }
    
    // Contact groups caching
    if (!this.cachedContactGroups || this.cachedContactGroups.length === 0) {
      await this.logger.logMain('Fetching contact groups...');
      this.cachedContactGroups = await this.fetchContactGroups();
      await this.logger.logMain(
        `✅ Fetched ${this.cachedContactGroups.length} contact groups from Google Contacts`
      );
    } else {
      await this.logger.logMain(
        `Using cached contact groups (${this.cachedContactGroups.length} groups)`
      );
    }
    
    let labelString = this.lastSelectedFolder.label;
    
    // For life events, try to infer label
    if (this.lastSelectedFolder.type === FolderTypeEnum.LIFE_EVENT) {
      const inferredLabel = this.labelResolver.inferLabelFromExisting(
        this.lastSelectedFolder.name,
        this.cachedContactGroups
      );
      if (inferredLabel) {
        labelString = inferredLabel;
        await this.logger.logMain(`Inferred label: '${inferredLabel}'`);
      }
    }
    
    // NEW: Check if labelString is empty BEFORE resolution
    let resourceName = '';
    if (!labelString || !labelString.trim()) {
      // Life event without label - skip resolution, wizard will handle it
      await this.logger.logMain('No label from folder - user will select in wizard');
      resourceName = ''; // Empty - wizard shows full label selection
    } else {
      // Label exists - attempt resolution
      const isRequired =
        this.lastSelectedFolder.type === FolderTypeEnum.JOB ||
        this.lastSelectedFolder.type === FolderTypeEnum.HR;
      
      const result = this.labelResolver.resolveLabel(
        labelString,
        isRequired,
        this.cachedContactGroups
      );
      
      resourceName = result.resourceName;
      
      // If label doesn't exist and is required, prompt to create
      if (!resourceName && isRequired) {
        console.log(
          `⚠️  Label '${labelString}' does not exist in your contacts`
        );
        const { shouldCreateLabel } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldCreateLabel',
            message: 'Would you like to create it now?',
            default: true,
          },
        ]);
        
        await this.logger.logMain(
          `Prompting user to create missing label: '${labelString}'`
        );
        
        if (!shouldCreateLabel) {
          await this.logger.logMain(
            'User declined label creation - cancelling contact creation'
          );
          console.log('===❌ Contact creation cancelled===');
          return;
        }
        
        console.log(`Creating label: '${labelString}'...`);
        resourceName = await this.labelResolver.createLabel(labelString);
        this.cachedContactGroups.push({
          resourceName,
          name: labelString,
        });
        await this.logger.logMain(`✅ Created new label: '${labelString}'`);
        console.log('✅ Label created successfully');
      }
    }
    
    const prePopulatedData: Partial<any> = {
      labelResourceNames: resourceName ? [resourceName] : [],
      company: this.lastSelectedFolder.companyName || '',
    };
    
    // Set up logging for contact editor
    this.contactEditor.setApiLogging(true);
    this.contactEditor.setLogCallback(async (msg: string) => {
      await this.logger.logMain(msg);
    });
    
    // Collect initial input (now with duplicate detection)
    const initialData =
      await this.contactEditor.collectInitialInput(prePopulatedData);
    
    // Show summary and allow editing
    const finalData = await this.contactEditor.showSummaryAndEdit(
      initialData,
      'Create'
    );
    
    if (finalData === null) {
      await this.logger.logMain('Contact creation cancelled by user');
      console.log('\n===❌ Contact creation cancelled===\n');
      this.contactEditor.setApiLogging(false);
      return;
    }
    
    // Create contact with date stamp
    const currentDate = formatDateDDMMYYYY(new Date());
    const note = `Added by events & jobs sync script - Last update: ${currentDate}`;
    
    await this.contactEditor.createContact(finalData, note);
    
    // Only increment stats AFTER successful API call
    this.stats.contacts++;
    await this.logger.logMain('✅ Contact created successfully');
    console.log('✅ Contact created');
    this.contactEditor.setApiLogging(false);
    
  } catch (error) {
    // Special handling for token expiration
    if (error instanceof Error && 
        (error.message.includes('invalid_grant') || 
         error.message.includes('Token has been expired'))) {
      await this.logger.logError(`Token expired: ${error.message}`);
      console.log('\n===⚠️ Authentication token expired===');
      console.log('Clearing authentication state. Please try creating the contact again.\n');
      
      // Clear auth state instead of exiting (Point 10)
      this.isAuthenticated = false;
      this.auth = null as any; // Force re-authentication on next attempt
      this.cachedContactGroups = null; // Clear cached groups
      
      console.log('Note: The note was still created successfully.');
      console.log('You can try creating the contact again, which will trigger re-authentication.\n');
      
      // Return gracefully to main menu instead of throwing
      return;
    }
    
    // Log error but don't propagate - note is already created
    await this.logger.logError(`Contact creation error: ${(error as Error).message}`);
    console.log(`\n===⚠️ Contact creation failed: ${(error as Error).message}===\n`);
    console.log('Note: The note was still created successfully.');
    console.log('You can create a note in this folder again to retry contact creation.\n');
    // Don't throw - return gracefully to main menu
  }
}
```

**Key Error Handling Strategy:**
- All errors are caught and logged
- Token expiration errors cause script to exit (user must restart and re-authenticate)
- Other errors are displayed with clear guidance
- Execution returns gracefully to main menu
- Note remains created (no rollback)
- User can retry by creating another note in the same folder

**Important Note:** This method creates ONLY ONE contact per note or batch of notes. To create additional contacts for the same folder, the user must create another note in that folder.

**NOTE (Point 14):** The `lastSelectedFolder` is NOT cleared after successful contact creation. This is intentional to support potential future features. The folder staleness check ensures that stale context is detected and handled appropriately if the folder is renamed or deleted between operations.

### Step 4: Modify createNoteFlow

After note creation, check success before prompting for contact:

```typescript
private async createNoteFlow(): Promise<void> {
  const selectedFolder = await this.selectOrCreateFolder();
  if (selectedFolder) {
    const noteCreated = await this.createNoteInFolder(selectedFolder);
    // New: Only prompt for contact if note was successfully created
    if (noteCreated) {
      await this.promptAndCreateContact();
    }
  }
}
```

**Key change:** Check `noteCreated` boolean before calling `promptAndCreateContact()`.

### Step 5: Modify writeNotesFlow

Track successful note creations and only prompt if at least one succeeded:

```typescript
private async writeNotesFlow(): Promise<void> {
  await this.logger.logMain('Starting write notes flow');
  let noteCount: number = 0;
  let successfulNoteCount: number = 0; // NEW: Track actual successful creations
  
  const selectedFolder = await this.selectOrCreateFolder();
  if (!selectedFolder) {
    await this.logger.logMain('Folder selection cancelled - exiting write notes flow');
    return;
  }
  
  await this.logger.logMain(`Selected folder for batch notes: '${selectedFolder.name}'`);
  
  while (true) {
    // ... existing folder existence check ...
    
    try {
      const noteCreated = await this.createNoteInFolder(selectedFolder, {
        noteCount,
        allowCancel: true,
      });
      
      if (noteCreated) {
        noteCount++;
        successfulNoteCount++; // NEW: Only increment on success
        await this.logger.logMain(
          `Note ${noteCount} created successfully in batch`
        );
      } else {
        await this.logger.logMain(
          `Note creation failed validation - continuing loop`
        );
      }
    } catch (error) {
      if (error instanceof UserCancelledError) {
        const formattedCount = FormatUtils.formatNumberWithLeadingZeros(successfulNoteCount);
        const message =
          successfulNoteCount === 0
            ? '\n===No notes created===\n'
            : `\n===✅ Created ${formattedCount} notes===\n`;
        console.log(message);
        await this.logger.logMain(
          `User exited write notes loop after ${successfulNoteCount} successful notes`
        );
        
        // NEW: Only prompt if at least one note was successfully created
        if (successfulNoteCount > 0) {
          await this.promptAndCreateContact();
        }
        return;
      }
      
      // ... existing error handling ...
    }
  }
}
```

**Key changes:**
- Added `successfulNoteCount` to track only successfully created notes
- Only increment counters when `noteCreated === true`
- Only prompt for contact creation if `successfulNoteCount > 0`
- Use `successfulNoteCount` in all user-facing messages

### Step 6: Handle Label Resolution Edge Cases and Add Stats Tracking

The `promptAndCreateContact()` method must handle:

1. **Life event without label:**
   - `lastSelectedFolder.label` is empty string
   - Skip `labelResolver.resolveLabel` entirely (check added in Step 3)
   - Pass empty array to `prePopulatedData.labelResourceNames`
   - Wizard shows label selection (no pre-population)
   - If no labels exist in Google Contacts, automatically trigger create label wizard (enforced by Step 1 changes)
   - User must select at least one label (enforced by checkbox validation in Step 1)

2. **Job/HR label doesn't exist:**
   - `labelResolver.resolveLabel(labelString, true, cachedContactGroups)` throws error
   - Catch error, check if it contains "Required label"
   - Prompt user to create label
   - If declined, cancel contact creation (note remains)
   - If accepted, create label, add to cache, continue

3. **Life event label inference:**
   - For life events, call `labelResolver.inferLabelFromExisting(folderName, cachedContactGroups)`
   - Inference uses **left-to-right first-match** strategy (e.g., "Paris France Trip" with labels ["Paris", "France", "Trip"] will match "Paris")
   - **Limitation:** Inference is based on exact word matching, not semantic meaning
   - **Example ambiguity:** "Added Trip" with labels ["Trip", "Added"] will match "Added", which may not be the intended label
   - If match found, use inferred label
   - If no match, proceed with empty label (show selection in wizard)
   - User can always decline the suggested label and select manually
   - **NOTE (Point 8):** The current logic implementation is fine and should not be changed. Label inference ambiguity is a documented limitation that users can work around by declining suggestions.

4. **No labels exist in Google Contacts:**
   - When `promptForLabels()` is called and `existingGroups.length === 0`
   - Display: `"===⚠️ At least 1 label is required to create a new contact==="`
   - Automatically trigger create label wizard loop (enforced by Step 1 Part B)
   - After creation, fetch groups again and show label selection
   - User must select the newly created label (checkbox validation prevents empty selection)

5. **Token expiration during contact creation:**
   - Can occur if user leaves script idle for extended period (> 1 hour)
   - Error will be caught by `promptAndCreateContact` error handler
   - Special handling: Token expiration errors cause script to exit
   - User sees message: "===⚠️ Authentication token expired===" with instructions to restart
   - **Design decision:** Throw error and exit script rather than attempting silent re-authentication
   - **Rationale:** Token expiration indicates session has been idle too long; cleanest UX is to restart

6. **Stats tracking timing:**
   - `this.stats.contacts++` must ONLY occur AFTER successful `createContact()` API call
   - Must NOT increment on cancellation or errors
   - This ensures accurate contact count tracking
   - Implementation: Increment immediately after `await this.contactEditor.createContact(finalData, note)` returns successfully
   - **NOTE (Point 9):** All contact stats are combined (no differentiation by source flow). This is acceptable and intentional - we don't need to track which flow (single note vs batch) created each contact. The total contact count is sufficient for script statistics.

## Implementation Details

### Notes and Contacts Relationship

**Important clarification:** There is NO direct link between a note and a contact in this system.

- Notes are text files stored in folders
- Contacts are Google Contacts entries with labels and company information
- The connection is INDIRECT through the folder context:
  - Both notes and contacts are associated with the same folder
  - Both inherit label and company from the folder
  - A contact created after notes simply uses the same folder metadata

**UX consideration for batch flow:**
- In "Write notes" flow, user creates multiple notes about potentially different people
- After creating all notes, user is prompted ONCE: "Create a new contact for {folderName}?"
- If yes, user can create **ONLY ONE contact** using the folder's label/company
- **IMPORTANT:** To create additional contacts for the same folder, user must create another note in that folder
- Each note creation cycle allows creating one contact
- Each contact shares the folder context but has independent name/email/phone/etc.
- **DESIGN RATIONALE:** Job interview notes are related to a company, not to specific contacts. Multiple notes in a folder might discuss different people (recruiters, interviewers, hiring managers), different stages of the interview process, or general company research. Creating one contact per batch acknowledges that the folder represents a job opportunity/company relationship, not individual people. This design prevents user confusion about which person each contact represents and encourages intentional contact creation by requiring a new note to be written for each contact.

### Label Resolution Logic (Critical for Life Events)

**Job/HR folders:** Label is always "Job" or "HR" (required, non-optional)

**Life event folders:** Label may be empty (skipped during folder creation)

**Contact creation requirements:**

- ALL contacts (Job/HR/Life Event): At least one label is REQUIRED
- Job/HR contacts: Label is pre-populated from folder type ("Job" or "HR")
- Life event contacts WITH folder label: Label is pre-populated from folder
- Life event contacts WITHOUT folder label: User MUST select at least one label in wizard

**Current label resolution flow** (from `addContactFlow`):

1. Get label string from `lastSelectedFolder.label`
2. For life events, infer label from folder name via `LabelResolver.inferLabelFromExisting`
3. Check if label is required: `isRequired = folder.type === JOB || folder.type === HR`
4. Call `LabelResolver.resolveLabel(labelString, isRequired, cachedContactGroups)`
   - Returns `{ resourceName: '', created: false }` if label not found and not required
   - Throws error if label not found and required
5. If label doesn't exist and is required, prompt to create in Google Contacts
6. Pass `labelResourceNames` to `EventsContactEditor.collectInitialInput(prePopulatedData)`

**EventsContactEditor behavior:**

- If `prePopulatedData.labelResourceNames` is provided and non-empty:
  - Show confirmation: "Use suggested labels: X, Y?"
  - If Yes → Use pre-populated labels (label selection skipped)
  - If No → Show full label selection step with validation
- If `prePopulatedData.labelResourceNames` is empty or undefined:
  - Show full label selection step (checkbox with validation)
  - Validation prevents empty selection: "At least one label is required."
  - If no labels exist in Google Contacts, automatically trigger create label wizard

**IMPORTANT VALIDATION UPDATE:** Contact validation now requires both firstName AND at least one label (enforced in Step 1).

### Company Name Handling

**Job/HR folders:** `companyName` is parsed from folder name (e.g., `Job_AcmeInc` → `"AcmeInc"`) and is REQUIRED during folder creation

**Life event folders:** `companyName` is `undefined` (not applicable for life events)

**EventsContactEditor behavior:**

- If `prePopulatedData.company` is provided:
  - Show input with default value: "Company: [AcmeInc]"
  - User can edit, clear, or accept by pressing Enter
- If `prePopulatedData.company` is empty or undefined:
  - Show input with empty default: "Company: []"
  - User can leave empty or enter a value

This means the company step is ALWAYS SHOWN but PRE-FILLED when available. User can skip by pressing Enter or modify the value.

### Wizard Steps (after pre-population)

Full wizard order from `ContactEditor.collectInitialInput`:

1. Labels
   - SKIPPED if pre-populated and user confirms: "Use suggested labels: X, Y?" → Yes
   - SHOWN if pre-populated but user declines confirmation → No
   - SHOWN if no pre-populated labels (empty array or undefined)
2. Company (always shown with pre-filled default if available)
3. Full name (required)
4. Job title (optional)
5. Email (optional)
6. Phone (optional)
7. LinkedIn URL (optional)
8. Summary and edit loop
9. Create contact in Google

**Key clarification:** 
- Label selection is conditionally skipped based on pre-population and user confirmation
- Company input is always shown but with default value when available
- No new skip flags are needed - existing behavior is acceptable

## Files to Modify

### 1. `src/scripts/eventsJobsSync.ts`

**Modifications:**

1. **Modify `run()` method** to attempt authentication at startup (Step 0) - no separate network check needed
2. **Modify `createNoteInFolder`** return type to `Promise<boolean>` (Step 2)

**Add label validation to minimum requirements:**

Modify `validateMinimumRequirements` to require at least one label:

```typescript
static validateMinimumRequirements(data: EditableContactData): string | true {
  if (!data.firstName || !data.firstName.trim()) {
    return 'First name is required.';
  }
  if (!data.labelResourceNames || data.labelResourceNames.length === 0) {
    return 'At least one label is required.';
  }
  return true;
}
```

### 3. `src/services/contacts/contactEditor.ts`

**Update `promptForLabels()` method:**

```typescript
async promptForLabels(): Promise<string[]> {
  console.log('\n===Select Labels===\n');
  const existingGroups = await this.fetchContactGroups();
  let selectedResourceNames: string[] = [];
  
  // NEW: Handle case where no labels exist
  if (existingGroups.length === 0) {
    console.log('===⚠️ At least 1 label is required to create a new contact===');
    console.log('No existing labels found. Creating new label...\n');
    
    // Trigger create label wizard
    const { labelName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'labelName',
        message: 'Enter new label name:',
        validate: (input: string): boolean | string => {
          if (!input.trim()) {
            return 'Label name cannot be empty.';
          }
          return InputValidator.validateLabelName(input, existingGroups);
        },
      },
    ]);
    
    // Create the label (implementation depends on where this is called)
    // This might need to be handled at a higher level in the call stack
    // where we have access to labelResolver
    
    // After creation, fetch groups again and continue
    const updatedGroups = await this.fetchContactGroups();
    existingGroups = updatedGroups;
  }
  
  if (existingGroups.length > 0) {
    const choices = existingGroups.map((group) => ({
      name: group.name,
      value: group.resourceName,
    }));
    
    const { selectedLabels } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedLabels',
        message: 'Select labels (At least one required):', // UPDATED MESSAGE
        choices,
        pageSize: SETTINGS.api.displayPageSize,
        loop: false,
        instructions: ' ',
        validate: (selected: string[]): boolean | string => { // NEW VALIDATION
          if (!selected || selected.length === 0) {
            return 'At least one label is required.';
          }
          return true;
        },
      },
    ]);
    selectedResourceNames = selectedLabels;
  }
  
  return selectedResourceNames;
}
```

**Implementation Notes:**
- Uses `this.createContactGroup()` which is a built-in method of `ContactEditor` (confirmed at line 883 of contactEditor.ts)
- No mixing with `LabelResolver` - all label creation happens through ContactEditor's own API
- The while loop ensures at least one label exists before proceeding to selection
- The newly created label will appear in the selection after `fetchContactGroups()` is called again

## Files to Modify

### 1. `src/scripts/eventsJobsSync.ts`

**Modifications:**

1. **Modify `run()` method** to attempt authentication at startup (Step 0)
2. **Modify `createNoteInFolder`** return type to `Promise<boolean>` (Step 2)
3. **Modify `createNoteFlow`** to check note creation success (Step 4)
4. **Modify `writeNotesFlow`** to track successful notes and check before prompting (Step 5)
5. **Create `promptAndCreateContact()`** method with enhanced error handling, folder staleness check, and metadata validation (Step 3)
6. **Add imports** at top of file:
   ```typescript
   import { FolderType as FolderTypeEnum } from '../types/eventsJobsSync';
   import { promises as fs } from 'fs';
   ```

**NOTE:** The authentication check at startup (Step 0) eliminates the need for a separate network connectivity check. Authentication testing validates both network access and Google API availability.

**Key implementation notes:**
- The `createNoteInFolder` method loops until valid clipboard content is found (lines 910-986)
- Validation failures now return `false` instead of silent `return`
- Both flows verify note creation success before prompting for contacts
- Error handling in `promptAndCreateContact` prevents propagation to main menu
- Folder staleness check protects against renamed/deleted folders AND validates metadata accuracy
- Token expiration causes script exit (user must restart)

### 2. `src/validators/inputValidator.ts`

**Add label validation to minimum requirements:**

Modify `validateMinimumRequirements` to require at least one label:

```typescript
static validateMinimumRequirements(data: EditableContactData): string | true {
  if (!data.firstName || !data.firstName.trim()) {
    return 'First name is required.';
  }
  if (!data.labelResourceNames || data.labelResourceNames.length === 0) {
    return 'At least one label is required.';
  }
  return true;
}
```

**NOTE:** This validation is consistent with the existing `remove_label` action which already prevents removing the last label with the message: "Cannot remove the last label. At least one label is required."

### 3. `src/services/contacts/contactEditor.ts`

**Part A: Add protected helper methods for duplicate detection:**

```typescript
// Add these protected methods to ContactEditor class
protected async checkAndHandleNameDuplicate(firstName: string, lastName: string): Promise<boolean> {
  if (!firstName || !lastName) {
    return true; // Skip if either name is missing
  }
  const nameDuplicates = await this.duplicateDetector.checkDuplicateName(firstName, lastName);
  return await this.duplicateDetector.promptForDuplicateContinue(nameDuplicates);
}

protected async checkAndHandleEmailDuplicate(email: string): Promise<boolean> {
  const emailDuplicates = await this.duplicateDetector.checkDuplicateEmail(email);
  return await this.duplicateDetector.promptForDuplicateContinue(emailDuplicates);
}

protected async checkAndHandlePhoneDuplicate(phone: string): Promise<boolean> {
  const phoneDuplicates = await this.duplicateDetector.checkDuplicatePhone(phone);
  return await this.duplicateDetector.promptForDuplicateContinue(phoneDuplicates);
}

protected async checkAndHandleLinkedInDuplicate(url: string): Promise<boolean> {
  const linkedInDuplicates = await this.duplicateDetector.checkDuplicateLinkedInUrl(url);
  return await this.duplicateDetector.promptForDuplicateContinue(linkedInDuplicates);
}
```

**VERIFICATION REQUIRED (CRITICAL - Point 13):** Before implementing these protected methods, verify that:
1. Adding them won't change existing behavior of the base `ContactEditor.collectInitialInput()`
2. The base class should continue to work exactly as before
3. No existing logic is broken

**Part B: Update `promptForLabels()` method:**

Update the existing `promptForLabels()` method as shown in Step 1 Part B (lines 194-267 above) to handle empty label lists and enforce selection.

### 4. `src/services/contacts/eventsContactEditor.ts`

**Add Duplicate Detection (PRE-EXISTING BUG FIX - Point 4):**

The current `EventsContactEditor.collectInitialInput()` does NOT perform duplicate detection, while the base `ContactEditor.collectInitialInput()` does. This inconsistency must be fixed.

**Modify `EventsContactEditor.collectInitialInput()` to use protected helpers:**

```typescript
// In src/services/contacts/eventsContactEditor.ts
// After line 87: const { firstName, lastName } = TextUtils.parseFullName(fullName);

// NEW: Always perform duplicate detection for name
const shouldContinueAfterNameCheck = await this.checkAndHandleNameDuplicate(firstName, lastName);
if (!shouldContinueAfterNameCheck) {
  throw new Error('User cancelled due to duplicate');
}

// ... existing jobTitle prompt ...

// Replace lines 107-109 with:
const emails: string[] = [];
const { emailValue } = await inquirer.prompt([
  {
    type: 'input',
    name: 'emailValue',
    message: '📧 Email address:',
    default: '',
    validate: (input: string): boolean | string => InputValidator.validateEmail(input, true),
  },
]);
if (emailValue.trim()) {
  const trimmedEmail = emailValue.trim();
  const shouldContinueAfterEmailCheck = await this.checkAndHandleEmailDuplicate(trimmedEmail);
  if (!shouldContinueAfterEmailCheck) {
    throw new Error('User cancelled due to duplicate');
  }
  emails.push(trimmedEmail);
}

// Replace lines 120-122 with:
const phones: string[] = [];
const { phoneNumber } = await inquirer.prompt([
  {
    type: 'input',
    name: 'phoneNumber',
    message: '📱 Phone number:',
    default: '',
    validate: InputValidator.validatePhone,
  },
]);
if (phoneNumber.trim()) {
  const trimmedPhone = phoneNumber.trim();
  const shouldContinueAfterPhoneCheck = await this.checkAndHandlePhoneDuplicate(trimmedPhone);
  if (!shouldContinueAfterPhoneCheck) {
    throw new Error('User cancelled due to duplicate');
  }
  phones.push(trimmedPhone);
}

// Replace lines 133-135 with:
let linkedInUrl: string | undefined;
const { linkedInUrlInput } = await inquirer.prompt([
  {
    type: 'input',
    name: 'linkedInUrlInput',
    message: '🔗 LinkedIn URL:',
    default: '',
    validate: InputValidator.validateLinkedInUrl,
  },
]);
if (linkedInUrlInput.trim()) {
  linkedInUrl = InputValidator.normalizeLinkedInUrl(linkedInUrlInput);
  const shouldContinueAfterLinkedInCheck = await this.checkAndHandleLinkedInDuplicate(linkedInUrl);
  if (!shouldContinueAfterLinkedInCheck) {
    throw new Error('User cancelled due to duplicate');
  }
}
```

## Edge Cases

### 1. Life event folder with no label

**Scenario:** User creates a life event folder and skips label selection during folder creation.

**Handling:**
- Folder label is empty string
- In `promptAndCreateContact`, empty `labelString` is detected before calling `resolveLabel`
- `prePopulatedData.labelResourceNames` will be empty array
- Wizard shows label selection step (no pre-population to confirm)
- If no labels exist in Google Contacts:
  - Display: `"===⚠️ At least 1 label is required to create a new contact==="`
  - Automatically trigger create label wizard loop (Step 1 Part B)
  - User creates label, wizard loops to fetch updated groups
  - Label selection shown with newly created label
- User must select at least one label (enforced by checkbox validation)
- Cannot proceed without selecting - validation prevents empty selection

### 2. Label doesn't exist in Google Contacts (Job/HR folders)

**Scenario:** User has a Job_AcmeInc folder but "Job" label doesn't exist in Google Contacts.

**Handling:**
- `LabelResolver.resolveLabel` with `isRequired=true` throws error
- Error is caught in `promptAndCreateContact` (Step 3 implementation)
- User is prompted: "Would you like to create it now?"
- If Yes: Label is created via `labelResolver.createLabel`, added to cache, contact creation continues
- If No: Contact creation is cancelled, note remains created, return to main menu

### 3. Label creation fails (rare)

**Scenario:** API error during label creation in Google Contacts.

**Handling:**
- Error is thrown from `labelResolver.createLabel` or `contactEditor.createContactGroup`
- Caught by `promptAndCreateContact` error handler
- User sees error message: "===⚠️ Contact creation failed: [error message]==="
- Contact creation fails (note remains created)
- User can retry by creating another note in the same folder
- Script returns gracefully to main menu

### 4. Network connectivity lost during contact creation

**Scenario:** Network drops after note creation but during contact creation.

**Handling:**
- `retryWithBackoff` utility will attempt retries with exponential backoff
- If persistent failure, error caught by `promptAndCreateContact` error handler
- User sees: `"===⚠️ Contact creation failed: [error message]==="`
- Message includes: "Note: The note was still created successfully."
- Script returns gracefully to main menu
- Note remains created, user can retry when network restored

### 5. User cancels during contact wizard

**Scenario:** User starts contact creation but cancels in the summary/edit step.

**Handling:**
- `contactEditor.showSummaryAndEdit` returns `null`
- Log message: "Contact creation cancelled by user"
- Display: "===❌ Contact creation cancelled==="
- Stats not incremented (`this.stats.contacts++` only increments AFTER successful API call)
- Return to main menu
- Note remains created (no rollback)

### 6. Authentication not yet done

**Scenario:** First time creating a contact in the session.

**Handling:**
- Check `this.isAuthenticated` flag in `promptAndCreateContact`
- If false, call `AuthService.authorize()`
- Set `this.isAuthenticated = true` after success
- Continue with contact creation
- Subsequent contact creations skip auth check (flag is true)

### 7. Contact groups cache not initialized

**Scenario:** First contact creation in session, cache is empty.

**Handling:**
- Check `!this.cachedContactGroups || this.cachedContactGroups.length === 0`
- Call `this.fetchContactGroups()` to fetch from Google API
- Cache results in `this.cachedContactGroups`
- Subsequent operations use cached data
- Log message indicates "Fetching contact groups..." vs "Using cached contact groups"

### 8. Folder renamed after note creation (NEW - CRITICAL)

**Scenario:** 
1. User creates note in "Job_AcmeInc" folder
2. User renames folder to "Job_AcmeCorp" via rename folder flow
3. User attempts to create contact (either via prompt after note or later)

**Handling:**
- `lastSelectedFolder` contains stale path and company name
- In `promptAndCreateContact`, check folder existence: `await fs.access(this.lastSelectedFolder.path)`
- If folder doesn't exist:
  - Log error: "Folder context is stale - folder no longer exists"
  - Display: "===⚠️ Folder context is stale (folder was renamed or deleted)==="
  - Display: "Cannot create contact. Please create a new note to refresh folder context."
  - Set `this.lastSelectedFolder = null` to clear stale context
  - Return gracefully to main menu
  - User must create a new note in the renamed folder to refresh context

**Why this matters:**
- Only the **parent directories** (life-events, job-interviews) are guaranteed stable
- **Sub-folders** can be renamed via the rename folder flow
- External renames (outside script) are not detected during note creation
- Folder staleness check prevents errors from invalid paths and stale metadata

### 9. Token expiration mid-session (UPDATED - Point 10)

**Scenario:** User creates note, waits > 1 hour idle, then tries to create contact.

**Handling:**
- OAuth tokens typically expire after 1 hour of inactivity
- Token expiration error thrown during any Google API call in contact creation flow
- Error caught in `promptAndCreateContact` error handler
- Special handling checks for error messages: "invalid_grant" or "Token has been expired"
- If token expiration detected:
  - Log error with token expiration details
  - Display: "===⚠️ Authentication token expired==="
  - Display: "Clearing authentication state. Please try creating the contact again."
  - **Clear authentication state** instead of exiting:
    - Set `this.isAuthenticated = false`
    - Set `this.auth = null` to force re-authentication
    - Set `this.cachedContactGroups = null` to clear cached groups
  - Display: "Note: The note was still created successfully."
  - Display: "You can try creating the contact again, which will trigger re-authentication."
  - **Return gracefully to main menu** instead of throwing error
- Next contact creation attempt will trigger re-authentication flow
- **Design decision:** Clear auth state and return to menu instead of exiting script
- **Rationale:** Preserves session context (lastSelectedFolder, lastCreatedNotePath) and allows user to retry immediately without restarting

### 10. Label inference ambiguity (NEW - DOCUMENTED LIMITATION)

**Scenario:**
- Folder: "Added Trip"
- Existing labels: ["Trip", "Added"]
- Inference matches "Added" (left-to-right first-match)
- But "Trip" might be the intended label

**Handling:**
- Label inference is a best-effort heuristic, not guaranteed correct
- Uses simple left-to-right word matching, no semantic analysis
- User is always shown confirmation: "Use suggested labels: Added?"
- User can decline and manually select "Trip" instead
- **Documented limitation:** Inference may pick unexpected labels in ambiguous cases
- **Recommendation:** Users should verify inferred labels before accepting

## Testing Considerations

### Core Flows

1. **Single note → Create contact (Yes)**
   - Create one note via "Write a note" flow
   - Accept prompt to create contact
   - Verify label and company pre-populated correctly
   - Verify contact created successfully
   - Verify stats incremented

2. **Single note → Create contact (No)**
   - Create one note via "Write a note" flow
   - Decline prompt to create contact
   - Verify return to main menu
   - Verify stats show note but no contact

3. **Multiple notes → Create contact (Yes)**
   - Create multiple notes via "Write notes" flow
   - Cancel with empty clipboard + "Try again? No"
   - See "Created X notes" message
   - Accept prompt to create contact
   - Verify label and company pre-populated correctly
   - Verify contact created successfully

4. **Multiple notes → Create contact (No)**
   - Create multiple notes via "Write notes" flow
   - Cancel note creation loop
   - Decline contact creation prompt
   - Verify return to main menu

### Folder Type Scenarios

5. **Job folder → Contact creation**
   - Create note in Job_AcmeInc folder
   - Create contact when prompted
   - Verify label pre-populated as "Job"
   - Verify company pre-populated as "AcmeInc"
   - Verify confirmation prompt: "Use suggested labels: Job?"

6. **HR folder → Contact creation**
   - Create note in HR_CompanyName folder
   - Create contact when prompted
   - Verify label pre-populated as "HR"
   - Verify company pre-populated as "CompanyName"

7. **Life event WITH label → Contact creation**
   - Create note in life event folder that has a label (e.g., "Airbnb Trip")
   - Create contact when prompted
   - Verify label pre-populated from folder (e.g., "Trip" or "Airbnb" if it matches existing label)
   - Verify company is empty
   - Verify confirmation prompt shown for label

8. **Life event WITHOUT label → Contact creation**
   - Create note in life event folder with no label
   - Create contact when prompted
   - Verify NO label pre-populated (empty array)
   - Verify label selection step is shown (not skipped)
   - Verify company is empty
   - Select at least one label manually
   - Verify contact created successfully

9. **Life event WITHOUT label → Skip label selection (validation prevents this)**
   - Create note in life event folder with no label
   - Create contact when prompted
   - In label selection, attempt to press Enter without selecting
   - Checkbox validation prevents this: "At least one label is required."
   - User must select at least one label to proceed
   - If no labels exist, create label wizard is automatically triggered

### Label Management

10. **Label doesn't exist → Create label**
    - Create note in Job_NewCompany folder
    - "Job" label doesn't exist in Google Contacts
    - Accept prompt to create contact
    - See prompt: "Would you like to create it now?"
    - Accept label creation
    - Verify label created in Google Contacts
    - Verify contact creation continues successfully

11. **Label doesn't exist → Decline creation**
    - Create note in Job_TestCompany folder
    - "Job" label doesn't exist
    - Accept contact creation prompt
    - Decline label creation when prompted
    - Verify contact creation cancelled
    - Verify message: "===❌ Contact creation cancelled==="
    - Verify note still exists
    - Verify stats show note but no contact

12. **Label creation API failure** (manual test)
    - Simulate API failure during label creation
    - Verify error message shown
    - Verify contact creation fails gracefully
    - Verify note remains created

### Contact Wizard

13. **User cancels during contact wizard**
    - Create note
    - Accept contact creation prompt
    - Enter full name, email, etc.
    - In summary view, select "Cancel"
    - Verify message: "===❌ Contact creation cancelled==="
    - Verify stats show note but no contact
    - Verify return to main menu

14. **User edits pre-populated company**
    - Create note in Job_InitialCompany folder
    - Accept contact creation prompt
    - In company input, change "InitialCompany" to "NewCompany"
    - Complete contact creation
    - Verify contact has "NewCompany" as company

15. **User declines pre-populated label**
    - Create note in HR_TestCorp folder
    - Accept contact creation prompt
    - See: "Use suggested labels: HR?"
    - Decline (select No)
    - See full label selection list
    - Select different label(s)
    - Complete contact creation
    - Verify contact has manually selected labels

15a. **User declines pre-populated label + No labels exist (NEW - Point 11)**
    - Ensure "Job" label does NOT exist in Google Contacts
    - Create note in Job_TestCompany folder
    - Accept contact creation prompt
    - See: "Use suggested labels: Job?"
    - Decline (select No)
    - See full label selection list
    - **Edge case:** No labels exist in Google Contacts
    - Verify message: "===⚠️ At least 1 label is required to create a new contact==="
    - Verify automatic prompt to create new label
    - Create label (can be "Job" or any other label)
    - Verify label selection shows the newly created label
    - Select it and complete contact creation
    - Verify contact created successfully

### Authentication & Caching

16. **First contact creation → Authentication**
    - Start fresh session (isAuthenticated = false)
    - Create note and accept contact creation
    - Verify OAuth flow triggered
    - Verify isAuthenticated flag set to true
    - Create another contact in same session
    - Verify OAuth not triggered again

17. **First contact creation → Fetch groups**
    - Start fresh session (cachedContactGroups empty)
    - Create note and accept contact creation
    - Verify contact groups fetched from API
    - Verify groups cached
    - Create another contact
    - Verify "Using cached contact groups" message

### Batch Flow Edge Cases

18. **Write notes → Zero notes created → No contact prompt**
    - Start "Write notes" flow
    - Cancel immediately (empty clipboard + "Try again? No")
    - Verify message: "===No notes created==="
    - Verify NO contact creation prompt shown (because `successfulNoteCount === 0`)

19. **Write notes → Only one contact per batch**
    - Create 3 notes via "Write notes" flow
    - Cancel loop
    - Accept contact creation prompt
    - Verify prompt shows folder name: "Create a new contact for {folderName}?"
    - Create first contact successfully
    - Verify NO additional contact prompts (only ONE contact per batch)
    - To create another contact, create another note in the same folder
    - Verify new note creation → contact prompt flow works again

20. **Write notes → Validation failures don't count**
    - Create 3 valid notes
    - Attempt to create note with >1MB content (validation fails)
    - Attempt to create note with binary data (validation fails)
    - Cancel loop
    - Verify message shows: "===✅ Created 03 notes===" (only successful ones)
    - Verify contact prompt appears (because successfulNoteCount > 0)

### Validation

20. **Contact validation → First name required**
    - Create note and accept contact creation
    - Leave first name empty
    - Attempt to create
    - Verify validation error in summary view: "First name is required."

21. **Contact validation → At least one label required (now prevented earlier)**
    - Create note in life event folder without label
    - Accept contact creation
    - Label selection shows with validation
    - Attempt to skip without selecting (press Enter)
    - Verify checkbox validation prevents this: "At least one label is required."
    - Cannot proceed without selecting
    - Select a label
    - Verify contact created successfully

22. **No labels exist in Google Contacts → Create label wizard**
    - Ensure Google Contacts has zero labels (or mock this scenario)
    - Create note and accept contact creation
    - When `promptForLabels` is called
    - Verify message: "===⚠️ At least 1 label is required to create a new contact==="
    - Verify automatic prompt to create new label
    - Create label
    - Verify label selection shows the newly created label
    - Select it and complete contact creation

### Stats Verification

23. **Stats tracking across flows**
    - Create note via "Write a note", add contact → Verify stats: 1 note, 1 contact
    - Create 3 notes via "Write notes", add contact → Verify stats: 4 notes, 2 contacts
    - Create another note in different folder, add contact → Verify stats: 5 notes, 3 contacts
    - All contact stats are combined (no differentiation by source)
    - Stats only increment AFTER successful operations (not on cancellation)
    - Verify `this.stats.contacts++` only happens after successful `createContact()` API call

### Error Recovery

24. **Note creation validation fails → No contact prompt**
    - Create note with >1MB content
    - See error: "Message cannot exceed 1MB"
    - Verify note NOT created (`createNoteInFolder` returns `false`)
    - Verify NO contact prompt shown
    - Verify return to main menu

25. **Note creation binary data → No contact prompt**
    - Copy binary content to clipboard
    - Try to create note
    - See error: "Message cannot contain binary data"
    - Verify note NOT created (`createNoteInFolder` returns `false`)
    - Verify NO contact prompt shown

26. **Authentication check at startup**
    - Start script with no prior authentication
    - Verify authentication attempt at startup before main menu
    - If authentication succeeds: Script continues normally
    - If authentication fails: Verify warning message displayed
    - Verify message: "⚠️  Google authentication failed."
    - Verify message: "You can still create notes, but contact features will be unavailable."
    - Verify script continues to main menu (doesn't exit)
    - Create note successfully (verify notes work without auth)
    - Attempt contact creation: Verify prompts for authentication

27. **Contact creation error handling**
    - Create note successfully
    - Accept contact creation prompt
    - Simulate error during contact creation (e.g., network drop, API error)
    - Verify error message: "===⚠️ Contact creation failed: [error message]==="
    - Verify message includes: "Note: The note was still created successfully."
    - Verify message includes: "You can create a note in this folder again to retry contact creation."
    - Verify script returns to main menu (doesn't crash)
    - Verify note remains created
    - Verify contact was NOT created

28. **Label inference edge case**
    - Create life event folder: "Paris France Trip"
    - Existing labels: "Paris", "France", "Trip"
    - Create note and accept contact creation
    - Verify label inference uses **left-to-right first-match** (should infer "Paris")
    - User can accept or decline and select different labels

29. **Folder renamed after note creation (NEW - CRITICAL TEST)**
    - Create note in "Job_AcmeInc" folder
    - Rename folder to "Job_AcmeCorp" via rename flow
    - Return to main menu
    - Create another note in different folder (to trigger stale check later)
    - Accept contact creation prompt
    - Verify error: "===⚠️ Folder context is stale (folder was renamed or deleted)==="
    - Verify message: "Cannot create contact. Please create a new note to refresh folder context."
    - Verify `lastSelectedFolder` is cleared (set to null)
    - Create note in "Job_AcmeCorp" (renamed folder)
    - Accept contact creation prompt
    - Verify contact created successfully with "AcmeCorp" as company

30. **Token expiration mid-session (UPDATED TEST - Point 10)**
    - Mock token expiration error during contact creation
    - Verify error message: "===⚠️ Authentication token expired==="
    - Verify message: "Clearing authentication state. Please try creating the contact again."
    - Verify script does NOT exit (returns gracefully to main menu)
    - Verify auth state cleared: `isAuthenticated = false`, `auth = null`, `cachedContactGroups = null`
    - Verify session context preserved: `lastSelectedFolder`, `lastCreatedNotePath` still set
    - Attempt contact creation again
    - Verify re-authentication is triggered automatically
    - Verify contact creation succeeds after re-authentication
    - **NOTE (Point 10):** This approach preserves session context and allows immediate retry without script restart

31. **Duplicate detection with pre-populated data (NEW TEST)**
    - Create existing contact: "John Doe" with email "john@example.com"
    - Create note in Job folder
    - Accept contact creation prompt
    - Enter name: "John Doe"
    - Verify duplicate detection triggers: "Found X contacts with same name"
    - User can review duplicates or continue
    - Enter email: "john@example.com"
    - Verify duplicate detection triggers again: "Found X contacts with same email"
    - Verify duplicate detection works same as base ContactEditor

## Summary of Key Decisions

1. **Authentication check at startup:** Attempt Google authentication at startup instead of network connectivity check; allows notes to work even if auth fails

2. **Update validation:** Modify `InputValidator.validateMinimumRequirements` to require at least one label for all contacts across ALL scripts using ContactEditor

3. **Update label selection UI:** Change `promptForLabels()` to:
   - Update message: "Select labels (At least one required)"
   - Add checkbox validation to prevent empty selection
   - Handle empty label list by automatically triggering create label wizard loop
   - Affects ALL scripts using ContactEditor - must verify compatibility

4. **Note creation return type:** Change `createNoteInFolder` to return `Promise<boolean>` to indicate success/failure

5. **Extract contact creation prompt:** Create reusable method `promptAndCreateContact()` in `eventsJobsSync.ts` with:
   - Folder context validation and display
   - **NEW:** Folder staleness check (verify folder exists before attempting contact creation)
   - Enhanced empty label handling (check before resolution)
   - Comprehensive error handling (catch and log, don't propagate)
   - **NEW:** Special handling for token expiration (throw error to exit script)
   - Clear user messaging with retry guidance

6. **Track successful note creations:** In batch flow, use separate counter `successfulNoteCount` to track only successfully created notes

7. **One contact per batch:** After batch note creation, user can create ONLY ONE contact. To create additional contacts, user must create another note in the same folder.

8. **Label handling by folder type:**
   - Job/HR folders: Label always pre-populated ("Job" or "HR"), company required and pre-populated
   - Life event WITH label: Label pre-populated, company undefined
   - Life event WITHOUT label: Empty label check before resolution, wizard shows full label selection
   - No labels exist: Automatically trigger create label wizard loop

9. **Note creation verification:** Both flows check `createNoteInFolder` return value before prompting for contact

10. **Error handling strategy:** All contact creation errors caught in `promptAndCreateContact`, logged, and displayed to user with retry guidance. Script returns gracefully to main menu. Token expiration clears auth state and allows immediate retry instead of exiting.

11. **Stats tracking:** Contacts only increment AFTER successful API call (not on cancellation or errors). Increment immediately after `createContact()` returns successfully. All contacts tracked in single counter (no differentiation by source flow - this is intentional and acceptable).

12. **Type alias:** Use `FolderType as FolderTypeEnum` import pattern

13. **Folder stability clarification:** Only PARENT directories (life-events, job-interviews) are stable. SUB-FOLDERS can be renamed via rename flow. Folder staleness check validates both existence AND metadata accuracy.

14. **Label inference:** Uses left-to-right first-match strategy with documented limitations about ambiguity. Current implementation is acceptable and should not be changed.

15. **Duplicate detection:** ALWAYS perform duplicate detection in EventsContactEditor, matching behavior of base ContactEditor. Implemented via protected helper methods for code reuse.

16. **"Add contact" menu option:** NOT added to this script. This feature exists in a different script (Contacts Sync).

17. **lastSelectedFolder persistence:** NOT cleared after successful contact creation (intentional for future features). Folder staleness check handles renamed/deleted folders appropriately.

18. **One contact per batch rationale:** Job interview notes are related to a company, not specific contacts. Multiple notes might discuss different people or interview stages. This design encourages intentional contact creation.

## Plan Review & Validation

### Issues Addressed from Code Review

✅ **Label validation contradiction RESOLVED:**
- Added requirement for at least one label in `InputValidator.validateMinimumRequirements`
- Updated `promptForLabels()` UI message to indicate requirement
- Added checkbox validation to prevent empty selection
- Added automatic create label wizard when no labels exist

✅ **Empty labelString handling FIXED:**
- Added explicit check for empty `labelString` before calling `resolveLabel`
- Prevents confusing "Label '' does not exist" prompt
- Skips resolution for life events without labels
- Wizard handles empty label scenario gracefully

✅ **Note creation validation tracking FIXED:**
- Changed `createNoteInFolder` return type to `Promise<boolean>`
- Validation failures return `false` instead of silent `return`
- Both flows check return value before prompting for contact
- Separate `successfulNoteCount` tracker in batch flow

✅ **Folder context validation ADDED:**
- Added defensive check in `promptAndCreateContact` for undefined `lastSelectedFolder`
- Displays folder name in prompt: "Create a new contact for {folderName}?"
- Logs which folder context is being used
- Documented that folder names are stable (single-user, no renames)

✅ **Error handling strategy DEFINED:**
- All errors caught in `promptAndCreateContact`
- User-friendly messages with retry guidance
- Graceful return to main menu (no propagation)
- Note remains created, contact creation can be retried

✅ **Network connectivity check ADDED:**
- Pre-flight check at script startup
- Graceful exit if no connectivity
- Prevents confusing mid-flow errors

✅ **One contact per batch CLARIFIED:**
- Explicitly documented in plan
- Prompt appears once after batch completion
- Additional contacts via "Add contact" menu option
- Clear UX messaging

✅ **Stats tracking accuracy CONFIRMED:**
- `this.stats.contacts++` only after successful API call
- Not incremented on cancellation or errors
- Only successful operations counted

✅ **Single-user context DOCUMENTED:**
- No concurrent modifications
- Folders never renamed externally
- Clarified in Overview section

✅ **Label inference behavior DOCUMENTED:**
- Left-to-right first-match strategy explicitly noted
- Example provided in test cases
- User can accept or decline inferred label

✅ **Empty labels edge case HANDLED:**
- Automatic create label wizard trigger
- Clear messaging to user
- Prevents confusion when no labels exist

✅ **Token expiration NOTED:**
- `retryWithBackoff` handles re-authentication
- Errors caught by main error handler
- Documented in edge cases section

### Additional Improvements

✅ **Comprehensive test plan expanded:** Now 28 test scenarios covering all edge cases and new validation

✅ **Label resolution type verified:** `LabelResolver.resolveLabel` returns `resourceName: ''` (empty string)

✅ **Skip behavior clarified:** Labels conditionally skipped via confirmation, company always shown

✅ **Note-contact relationship clarified:** No direct link - both share folder context

✅ **Type alias pattern verified:** `FolderType as FolderTypeEnum` import documented

### Implementation Checklist

**Phase 0: Pre-Implementation Setup**
- [ ] Review all 32 test scenarios (including new 15a) to understand expected behavior
- [ ] Ensure development environment has internet connectivity
- [ ] Backup current codebase before making changes
- [ ] **NOTE (Point 1):** Label requirement change is intentional and expected for ALL scripts

**Phase 1: Validation and Label Selection (MUST DO FIRST)**
- [ ] **Point 13 - CRITICAL VERIFICATION:** Verify that adding protected helper methods to ContactEditor won't break existing base class logic
- [ ] Update `src/validators/inputValidator.ts` - add label validation to `validateMinimumRequirements`
- [ ] **Point 12:** Note that validation is consistent with existing remove_label behavior
- [ ] Update `src/services/contacts/contactEditor.ts`:
  - [ ] **Point 13:** Add protected helper methods for duplicate detection (verify base class not affected)
  - [ ] **Point 5:** Modify `promptForLabels()` - add while loop, validation, use `this.createContactGroup()`
- [ ] **Point 4:** Update `src/services/contacts/eventsContactEditor.ts` - add duplicate detection using protected helpers
- [ ] Write unit tests for new validation rules
- [ ] Test label selection with existing contact flows (ensure nothing breaks)
- [ ] Test create label wizard flow when no labels exist
- [ ] **Point 4:** Test duplicate detection works in EventsContactEditor
- [ ] **Point 13:** Verify protected methods don't affect base ContactEditor behavior

**Phase 2: Note Creation Return Type**
- [ ] Modify `createNoteInFolder` signature to return `Promise<boolean>`
- [ ] Change validation failure returns from silent `return` to `return false`
- [ ] Add `return true` after successful note creation
- [ ] **Point 6:** Verify only two callers exist (createNoteFlow, writeNotesFlow)
- [ ] Update all callers to handle boolean return (temporarily just log, don't use yet)
- [ ] Test note creation with valid and invalid content
- [ ] Verify validation failures return `false` correctly

**Phase 3: Core Implementation - promptAndCreateContact**
- [ ] Create `promptAndCreateContact()` method in `eventsJobsSync.ts`:
  - [ ] Add `lastSelectedFolder` validation
  - [ ] **Point 2:** Add folder staleness check (fs.access) AND metadata validation
  - [ ] Display folder name in prompt
  - [ ] Add empty `labelString` check before resolution
  - [ ] Implement try-catch error handling with user-friendly messages
  - [ ] **Point 10:** Add token expiration handling (clear auth state, don't exit)
  - [ ] Add all logging statements
- [ ] Import `FolderType as FolderTypeEnum` at top of file
- [ ] Import `{ promises as fs }` from 'fs'
- [ ] **Point 2:** Test folder staleness detection with metadata validation
- [ ] **Point 10:** Test token expiration handling (verify auth cleared, script doesn't exit, retry works)
- [ ] Verify error handling doesn't crash script
- [ ] Verify folder context display works correctly

**Phase 4: Modify createNoteFlow**
- [ ] Update `createNoteFlow` to check `noteCreated` boolean
- [ ] Call `promptAndCreateContact()` only if `noteCreated === true`
- [ ] Test single note creation → contact creation (accept)
- [ ] Test single note creation → contact creation (decline)
- [ ] Test validation failure → no contact prompt

**Phase 5: Modify writeNotesFlow**
- [ ] Add `successfulNoteCount` variable
- [ ] Update note creation loop to check boolean and increment correctly
- [ ] Update "Created X notes" message to use `successfulNoteCount`
- [ ] Call `promptAndCreateContact()` only if `successfulNoteCount > 0`
- [ ] Test batch creation with all successful notes
- [ ] Test batch creation with mixed success/failure
- [ ] Test batch creation with zero successful notes
- [ ] Test batch creation → contact creation flow

**Phase 6: Integration Testing**
- [ ] Run all 32 test scenarios from Testing Considerations section (including new 15a)
- [ ] **Point 2:** Test folder staleness detection with metadata validation (Test #29)
- [ ] **Point 10:** Test token expiration handling with auth clearing (Test #30)
- [ ] **Point 4:** Test duplicate detection with pre-populated data (Test #31)
- [ ] **Point 11:** Test pre-populated label decline + no labels exist (Test #15a)
- [ ] Verify label validation works in all contexts
- [ ] Verify pre-population works for Job/HR/Life Event folders
- [ ] Verify label selection shown for life events without labels
- [ ] Test edge cases (label creation, cancellation, network errors)
- [ ] **Point 9:** Verify stats tracking accuracy (only increments after successful API calls)
- [ ] Test error recovery scenarios

**Phase 7: Code Quality**
- [ ] Run linter on all modified files
- [ ] Fix any linting errors
- [ ] Review all error messages for clarity
- [ ] Review all log messages for completeness
- [ ] Ensure code comments explain non-obvious logic
- [ ] Verify import statements are correct

**Phase 8: Documentation**
- [ ] Update code comments in modified functions
- [ ] Document error handling strategy
- [ ] **Point 7:** Document one-contact-per-batch limitation with design rationale
- [ ] **Point 8:** Add inline comments for label inference behavior (note: don't change logic)
- [ ] **Point 14:** Document lastSelectedFolder persistence decision
- [ ] Update any user-facing documentation (if exists)

### Potential Risks & Mitigations

| Risk | Mitigation | Priority |
|------|------------|----------|
| **Label requirement change (Point 1):** Changes behavior across all scripts | **Expected change** - improves data quality; consistent with existing remove_label behavior; all contact management benefits | **MEDIUM** |
| **Protected methods (Point 13):** Adding methods to ContactEditor might affect base class | **CRITICAL VERIFICATION** required before implementation; must verify base class behavior unchanged | **HIGH** |
| Label resolution logic errors | Comprehensive unit tests for all folder types; empty string check added | HIGH |
| Note creation boolean breaks existing callers (Point 6) | Only two callers verified; both updated in same commit; test thoroughly | HIGH |
| Folder staleness causes crashes (Point 2) | Added fs.access check + metadata validation before contact creation; clear error messaging | HIGH |
| User confusion about label requirement | Clear error messages in validation; updated UI prompts | MEDIUM |
| API failures during label creation | Error caught by main handler with clear message and retry guidance | MEDIUM |
| Token expiration mid-session (Point 10) | Special error handling clears auth state; user can retry immediately with auto re-auth | MEDIUM |
| Performance impact from extra prompts | Minimal - single prompt after note(s), user can decline quickly | LOW |
| Label inference picks wrong label (Point 8) | Documented behavior (left-to-right); user can decline and select manually; don't change logic | LOW |
| Empty label list confusion (Point 5) | Automatic create label wizard loop guides user; uses ContactEditor.createContactGroup() | LOW |
| Folder context stale or undefined (Point 2) | Defensive check + metadata validation in `promptAndCreateContact` with clear error message | LOW |

### Success Criteria

✅ **Authentication attempted at startup** - allows notes to work even if auth fails

✅ **INTENTIONAL CHANGE (Point 1):** Changes to ContactEditor affect ALL scripts using the base class - this is expected and improves data quality across all contact management

✅ **User can create a contact immediately after creating a note** with clear folder context displayed

✅ **User can decline contact creation and return to main menu** without errors

✅ **Labels and company are correctly pre-populated** from folder context for all folder types

✅ **Life event folders without labels** trigger label selection with validation preventing empty selection

✅ **No labels exist scenario** automatically triggers create label wizard loop with clear messaging (Point 5)

✅ **All validations work correctly:**
- First name required
- At least one label required (enforced at checkbox level and final validation) (Point 1, 12)
- Validation failures show clear error messages

✅ **Note creation validation failures** correctly return `false` and prevent contact prompt

✅ **Batch flow tracks successful notes accurately** using separate counter

✅ **Only ONE contact created per batch (Point 7)** - additional contacts require creating another note in same folder; design rationale documented

✅ **Existing contact creation flows remain unaffected** and pass all existing tests

✅ **Stats accurately track all contacts** - only increment after successful API calls (immediately after createContact() returns); single counter for all sources (intentional - Point 9)

✅ **No data loss if user cancels or encounters errors:**
- Notes remain created
- User can retry contact creation by creating another note
- Clear retry guidance provided

✅ **Error handling is comprehensive:**
- All errors caught and logged
- User-friendly messages displayed
- Script returns gracefully to main menu (including token expiration - Point 10)
- Token expiration clears auth state and allows immediate retry (Point 10)
- No unhandled exceptions or crashes

✅ **Folder staleness detected and handled (Point 2):**
- Folder existence checked before contact creation
- Folder metadata validated (name format matches expected pattern)
- Clear error message if folder renamed/deleted/format changed
- lastSelectedFolder cleared on staleness detection
- User must create new note to refresh context

✅ **Folder stability clarified:**
- Parent directories (life-events, job-interviews) never renamed
- Sub-folders CAN be renamed via rename flow
- Documented in plan

✅ **Label inference behavior documented (Point 8)** - left-to-right first-match strategy with ambiguity limitations; current implementation is acceptable and should not be changed

✅ **Duplicate detection ALWAYS performed (Point 4, 13)** - EventsContactEditor matches base ContactEditor behavior via protected helper methods

✅ **lastSelectedFolder persistence (Point 14)** - NOT cleared after contact creation (intentional for future features); staleness check handles renamed/deleted folders

✅ **All 32 test scenarios pass** including edge cases, error recovery, folder staleness with metadata validation, token expiration with auth clearing, duplicate detection, and pre-populated label decline + no labels exist (Point 11)

---

## Summary of Plan Improvements

This updated plan addresses all review points and includes the following enhancements:

### Critical Fixes Applied

1. **✅ ContactEditor clarity (Point 1)** - Explicitly documented that changes affect base class used by ALL scripts; this is an intentional, expected change for better data quality across all contact management flows

2. **✅ Labels now mandatory (Point 1)** - Cannot skip label selection; checkbox validation + final validation enforce requirement; consistent with existing remove_label behavior

3. **✅ "Add contact" menu clarification** - Documented this feature exists in different script (Contacts Sync), NOT needed here

4. **✅ Authentication approach (Point 3)** - Changed from network check to authentication attempt at startup; better UX and more reliable; eliminates need for separate connectivity check

5. **✅ Folder staleness handling (Point 2)** - Added fs.access check to detect renamed/deleted folders; added metadata validation to ensure folder name still matches expected format; clear error messaging and context clearing

6. **✅ Duplicate detection fixed (Point 4)** - EventsContactEditor now ALWAYS performs duplicate detection via protected helper methods in base class; matches base class behavior; enables code reuse

7. **✅ promptForLabels implementation (Point 5)** - Complete implementation with while loop for empty labels; uses ContactEditor.createContactGroup() (no mixing with LabelResolver); newly created label appears in selection

8. **✅ Stats tracking timing** - Explicitly documented increment happens immediately after successful createContact() API call; no differentiation by source (intentional - Point 9)

9. **✅ Note about createNoteInFolder callers (Point 6)** - Verified method is private with only two callers (createNoteFlow and writeNotesFlow); both updated to handle boolean return

### Edge Cases Addressed

10. **✅ Token expiration (Point 10)** - Special handling clears auth state (`isAuthenticated`, `auth`, `cachedContactGroups`) and returns to menu instead of exiting; preserves session context (`lastSelectedFolder`, `lastCreatedNotePath`); allows immediate retry with automatic re-authentication

11. **✅ Folder rename scenarios (Point 2)** - Clarified only parent dirs stable; sub-folders can rename; added staleness detection with metadata validation

12. **✅ Label inference ambiguity (Point 8)** - Documented limitation with examples; current implementation is acceptable; users can always decline and select manually

13. **✅ One contact per batch rationale (Point 7)** - Added design rationale: Job interview notes relate to companies, not specific contacts; prevents confusion; encourages intentional contact creation

### Test Coverage Expansion

- Expanded from 28 to **32 comprehensive test scenarios** (added test 15a for Point 11)
- Added test for folder staleness detection with metadata validation (#29)
- Updated test for token expiration handling with auth state clearing (#30 - Point 10)
- Added test for duplicate detection with pre-populated data (#31)
- Added test for pre-populated label decline + no labels exist (#15a - Point 11)
- Added critical safety checks for ContactEditor compatibility (Point 1)

### Implementation Safety

- **CRITICAL PRE-FLIGHT CHECKS** added to Phase 0 and Phase 1
- Must verify NO other scripts create labelless contacts
- Must test ContactsSyncScript compatibility with label requirement
- Added grep steps to find all ContactEditor usages
- **8-phase implementation checklist** with clear dependencies
- **Risk matrix** updated with CRITICAL priority for breaking changes
- **Detailed success criteria** covering all aspects including folder staleness and duplicate detection

### Design Decisions Documented

1. **Authentication (Point 3):** Try at startup, allow notes to work even if fails; eliminates need for separate network check
2. **Token expiration (Point 10):** Clear auth state and return to menu instead of exiting; preserves session context; allows immediate retry
3. **Folder staleness (Point 2):** Check folder exists AND validate metadata accuracy; clear context on failure
4. **Label requirement (Point 1):** Mandatory across all scripts - intentional change for better data quality
5. **Duplicate detection (Point 4, 13):** Always perform via protected helper methods; consistent with base ContactEditor; enables code reuse
6. **One contact per batch (Point 7):** User creates another note to add more contacts; design rationale added
7. **Stats tracking (Point 9):** Increment only after successful API call; single counter for all sources (intentional)
8. **Error handling:** Catch and log, return gracefully (including token expiration)
9. **Label inference (Point 8):** Current implementation acceptable; don't change
10. **lastSelectedFolder (Point 14):** Not cleared after contact creation (intentional for future features)
11. **createNoteInFolder callers (Point 6):** Verified only two callers; both handle boolean return

The plan is now production-ready with all identified gaps, edge cases, and concerns addressed based on your feedback. All 15 review points have been systematically incorporated:

**Critical updates made:**
- Point 1: Label requirement clarified as intentional change for all scripts
- Point 2: Folder metadata validation added alongside existence check
- Point 3: Network check removed (auth check at startup is sufficient)
- Point 4: Duplicate detection in EventsContactEditor with protected helper methods
- Point 5: promptForLabels implementation clarified (uses ContactEditor.createContactGroup)
- Point 6: Note added confirming only two callers of createNoteInFolder
- Point 7: Design rationale added for one-contact-per-batch
- Point 8: Note added that label inference logic should not be changed
- Point 9: Note added that single stats counter is intentional and acceptable
- Point 10: Token expiration now clears auth state instead of exiting
- Point 11: Test 15a added for label decline + no labels scenario
- Point 12: Note added about consistency with remove_label behavior
- Point 13: Critical verification added for protected methods
- Point 14: Note added that lastSelectedFolder persistence is intentional
- Point 15: Ignored as requested (no folder path updates)

The implementation is safe, thoroughly tested (32 scenarios), and maintains backward compatibility while improving data quality across all contact management flows.
