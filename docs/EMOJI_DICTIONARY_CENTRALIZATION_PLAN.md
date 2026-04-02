# Emoji Dictionary Centralization Plan

## Overview

Create a centralized emoji dictionary to ensure consistent emoji usage across the project, replacing scattered hardcoded emojis with references to a single source of truth.

## Current State Analysis

The project uses emojis extensively across multiple files. Based on my investigation, I found **100+ emoji usages** across approximately **30 files** in `src/`, `scripts/`, and shell scripts.

## Categories of Emojis Found

### 1. Logger/Display Emojis (in `src/logging/logger.ts`)

- `❌` - Error
- `⚠️` - Warning
- `✅` - Success
- `📋` - Clipboard
- `♻️` - Cleanup
- `⬅️` - Go back (update from `←` to `⬅️`)
- `🚪` - Exit

> **Note:** The `displayGoBack` method currently uses ASCII `←`. This should be updated to use `⬅️` for consistency with the emoji dictionary.

### 2. UI Field Prompts (in `src/constants/uiConstants.ts` and multiple editors)

- `🏢` - Company
- `👤` - Full name
- `💼` - Job title
- `📧` - Email
- `📞` - Phone (use `📞` everywhere, replace any `📱` occurrences)
- `🔗` - LinkedIn URL
- `🏷️` - Labels

> **Note:** All phone-related emojis should use `📞` consistently. The `📱` emoji should be replaced with `📞` in all files.

### 3. Script Metadata Icons (in script files)

- `🔄` - Contacts sync
- `📝` - Events & Jobs sync
- `🔗` - LinkedIn sync
- `🗄️` - Other contacts sync
- `💬` - SMS/WhatsApp sync
- `📊` - Statistics
- `📄` - Default script icon

### 4. Menu Action Emojis

- `➕` - Add/Create new
- `➡️` - Skip
- `⏭️` - Skip (forward)
- `🔍` - Search
- `🗑️` - Delete/Clear cache
- `✏️` - Edit/Rename
- `📁` - Folder operations
- `📓` - Write notes
- `🔙` - Back to menu
- `▶️` - Process/Start

### 5. Status Indicators

- `✅` / `❌` - Match status (selector status in smsWhatsappSync)
- `🚨` - Important notice
- `🔐` - Auth/Security
- `⁉️` - Reason indicator
- `🔢` - Index/Count
- `🆔` - ID indicator
- `👥` - Group/Multiple contacts

### 6. Shell Script Emojis

- `🔒` - Security check
- `🔍` - Searching
- `📝` - Step indicator
- `🏗️` - Build
- `🧪` - Test
- `✨` - Success/Complete

### 7. API/Stats Emojis

- `📖` - Read operations
- `✏️` - Write operations

---

## Files Requiring Changes

### High Impact (multiple emojis, core files)

1. `src/logging/logger.ts` - Lines 39-76, 126, 130
2. `src/constants/uiConstants.ts` - Lines 13-18
3. `src/services/contacts/contactEditor.ts` - ~50 emoji usages across prompts and menus
4. `src/services/contacts/contactDisplay.ts` - Lines 12-81
5. `src/scripts/eventsJobsSync.ts` - Lines 86-1732, extensive emoji usage
6. `src/scripts/otherContactsSync.ts` - Lines 142-598
7. `src/scripts/smsWhatsappSync.ts` - Lines 100-578
8. `src/scripts/linkedinSync.ts` - Lines 58-601
9. `src/scripts/contactsSync.ts` - Lines 46-266
10. `src/scripts/statistics.ts` - Line 232 (script metadata emoji)

### Medium Impact

1. `src/index.ts` - Lines 19, 32, 71, 79, 102-112
2. `src/services/auth/initAuth.ts` - Lines 11, 26, 35
3. `src/services/contacts/eventsContactEditor.ts` - Lines 39-148
4. `src/utils/retryWithBackoff.ts` - Line 52
5. `src/services/notes/noteWriter.ts` - Line 33 (warning emoji)

### Test Files

1. `src/logging/__tests__/logger.test.ts` - Emoji assertions in test cases
2. `src/scripts/__tests__/eventsJobsSync.test.ts` - Emoji test cases
3. `src/services/folders/__tests__/folderManager.test.ts` - Emoji validation tests

### Shell Scripts

1. `scripts/check-phi-safety.sh` - Lines 4-40
2. `scripts/check-imports.sh` - Lines 4-12
3. `scripts/validate-refactoring.sh` - Lines 4-25

---

## Proposed Solution

### New File: `src/constants/emojis.ts`

```typescript
export const EMOJIS = {
  // Status indicators
  STATUS: {
    SUCCESS: "✅",
    ERROR: "❌",
    WARNING: "⚠️",
    INFO: "ℹ️",
    IMPORTANT: "🚨",
  },
  // Navigation
  NAVIGATION: {
    EXIT: "🚪",
    BACK: "🔙",
    GO_BACK: "⬅️",
    SKIP: "⏭️",
    SKIP_ARROW: "➡️",
  },
  // Actions
  ACTIONS: {
    ADD: "➕",
    EDIT: "✏️",
    DELETE: "🗑️",
    SEARCH: "🔍",
    PROCESS: "▶️",
    SYNC: "🔄",
    CLEANUP: "♻️",
  },
  // Contact fields
  FIELDS: {
    COMPANY: "🏢",
    PERSON: "👤",
    JOB_TITLE: "💼",
    EMAIL: "📧",
    PHONE: "📞",
    LINKEDIN: "🔗",
    LABEL: "🏷️",
    GROUP: "👥",
  },
  // Data indicators
  DATA: {
    INDEX: "🔢",
    ID: "🆔",
    REASON: "⁉️",
    CLIPBOARD: "📋",
  },
  // Script icons
  SCRIPTS: {
    DEFAULT: "📄",
    CONTACTS_SYNC: "🔄",
    EVENTS_JOBS: "📝",
    LINKEDIN: "🔗",
    OTHER_CONTACTS: "🗄️",
    SMS_WHATSAPP: "💬",
    STATISTICS: "📊",
  },
  // Menu items (for events/jobs sync)
  MENU: {
    WRITE_NOTES: "📓",
    CREATE_NOTE: "📝",
    REWRITE_NOTE: "📋",
    FOLDER: "📁",
    CREATE_LABEL: "🏷️",
  },
  // Auth & Security
  AUTH: {
    LOCK: "🔐",
    SECURITY: "🔒",
  },
  // API operations
  API: {
    READ: "📖",
    WRITE: "✏️",
  },
  // Shell script specific
  SHELL: {
    BUILD: "🏗️",
    TEST: "🧪",
    COMPLETE: "✨",
    STEP: "📝",
  },
} as const;

``` 

> **Note:** Type definitions (`EmojiKey`, `EmojiValue`) are optional. Evaluate during implementation whether they provide practical value. If not needed, omit them to keep the code simple.

---

## Suggested New Emoji Additions

Places where emojis could be added for consistency:

1. **Statistics display** - Add emojis to stat labels (e.g., `📊 Contacts`, `📝 Notes`, `📁 Folders`)
2. **Summary displays** - Add emojis to summary headers
3. **Error messages** - Some error messages lack emoji prefixes
4. **Test results** - Consider adding emojis to test output

---

## Implementation Steps

1. Create `src/constants/emojis.ts` with the centralized dictionary
2. Export from `src/constants/index.ts`
3. Update `src/logging/logger.ts` to use dictionary
4. Update `src/constants/uiConstants.ts` to use dictionary
5. Update all script files to use dictionary for menu choices and metadata
6. Update contact display and editor files
7. Update auth-related files
8. Update shell scripts to use exported constants (or document them)
9. Add tests to verify emoji consistency

---

## Implementation Checklist

- [ ] Create `src/constants/emojis.ts` with centralized emoji dictionary
- [ ] Export emojis from `src/constants/index.ts`
- [ ] Update `src/logging/logger.ts` to use EMOJIS constant (including changing `←` to `⬅️`)
- [ ] Update `src/constants/uiConstants.ts` to use EMOJIS constant
- [ ] Update all script files (6 scripts) to use EMOJIS for metadata and menus
- [ ] Update `contactEditor.ts`, `contactDisplay.ts`, `eventsContactEditor.ts` to use EMOJIS
- [ ] Replace all `📱` with `📞` for phone fields
- [ ] Update `initAuth.ts` and related auth files to use EMOJIS
- [ ] Update `index.ts`, `retryWithBackoff.ts`, `noteWriter.ts`, and other misc files
- [ ] Update test files to import from EMOJIS constant:
  - [ ] `src/logging/__tests__/logger.test.ts`
  - [ ] `src/scripts/__tests__/eventsJobsSync.test.ts`
  - [ ] `src/services/folders/__tests__/folderManager.test.ts`
- [ ] Document shell script emojis (cannot import TS, keep inline with comment)
- [ ] Run verification command to ensure no hardcoded emojis remain (see below)

---

## Verification

After migration, run the following command to verify no hardcoded emojis remain outside of `emojis.ts` and shell scripts:

```bash
rg '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]|✅|❌|⚠️|📱|📞|🏢|👤|💼|📧|🔗|🏷️|➕|➡️|🔍|🗑️|✏️|📁|🔙|▶️|🚪|♻️|⬅️|📋|🚨|🔐|🔒|🆔|👥|🏗️|🧪|✨|📖|⏭️|📝|📓|🔄|💬|📊|🗄️|📄|⁉️|🔢' src/ --type ts -l | grep -v 'emojis.ts'
```

This command should return empty (or only test files if they intentionally duplicate for assertions).
