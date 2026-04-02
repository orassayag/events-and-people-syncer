# Unified Contact Display Function Plan

## Overview

Consolidate all contact display logic into a single, reusable function in ContactDisplay class that handles all scenarios with configurable display modes.

## Current State

The codebase has **duplicated contact display logic** across multiple files:

1. **[src/services/contacts/contactDisplay.ts](../src/services/contacts/contactDisplay.ts)** (lines 6-83)
   - Shows: Reason, Contact Index, Contact ID, Full name, Labels, Company, Job Title, Email, Phone, LinkedIn URL
   - Used for syncing contacts

2. **[src/services/contacts/contactEditor.ts](../src/services/contacts/contactEditor.ts)** - Two locations:
   - **Contact Summary** (lines 191-235): Shows during edit/create flow
   - **Creation Success** (lines 721-757): Shows after successful contact creation
   - Both handle multiple emails/phones differently with indented formatting

3. **[src/services/contacts/duplicateDetector.ts](../src/services/contacts/duplicateDetector.ts)** (lines 147-164)
   - Shows: Match index, Similarity Type, Name, Email, Phone, Labels, LinkedIn URL
   - Custom format for duplicate detection

## Proposed Solution

### 1. Enhanced ContactDisplay Class

Extend the existing `ContactDisplay` class with a new unified display method that supports multiple display modes:

```typescript
interface ContactDisplayOptions {
  mode: 'sync' | 'summary' | 'success' | 'duplicate';
  
  // Extended fields (sync/warning scenarios)
  showReason?: boolean;
  showContactIndex?: boolean;
  showContactId?: boolean;
  reason?: string[];
  currentIndex?: number;
  totalCount?: number;
  
  // Duplicate-specific fields
  showSimilarityType?: boolean;
  similarityType?: string;
  matchNumber?: number;
  
  // Success message
  showResourceName?: boolean;
  
  // Header customization
  header?: string;
}

interface UnifiedContactData {
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
  label?: string;
  labels?: string[];
  resourceName?: string;
}
```

**Key method signature:**
```typescript
static displayContactUnified(
  contactData: UnifiedContactData,
  options: ContactDisplayOptions
): void
```

### 2. Display Mode Behaviors

#### `mode: 'sync'`
- Shows: Reason, Contact Index, Contact ID + all contact fields
- Hebrew text reversal applied
- First email/phone only (as currently implemented)
- Uses `TextUtils.reverseHebrewText()` internally

#### `mode: 'summary'`
- Shows: Header "===Contact Summary===" + all contact fields
- **All emails/phones** displayed with indentation if multiple
- Hebrew text reversal applied
- No Reason/Index/ID

#### `mode: 'success'`
- Shows: Header "===✅ Contact created successfully!===" + Resource Name + all contact fields
- **All emails/phones** displayed with indentation if multiple
- NO Hebrew text reversal (raw data displayed)
- Includes Resource Name field

#### `mode: 'duplicate'`
- Shows: Match number, Similarity Type + subset of contact fields
- Format: `===Match X:===` followed by indented fields
- Hebrew text reversal applied

### 3. Hebrew Text Handling

The unified function will:
- Accept **raw contact data** from callers
- Apply `TextUtils.reverseHebrewText()` internally based on display mode
- `mode: 'success'` → NO reversal (shows raw data)
- All other modes → Apply reversal to all text fields

### 4. Multiple Emails/Phones Logic

- If 1 email/phone: Display on single line with label and company
- If >1 email/phone: Display header (`-Emails:` / `-Phones:`), then indent each with 2 spaces
- If 0 email/phone: Display empty field (`-Email: ` / `-Phone: `)

### 5. Implementation Steps

#### Step 1: Create New Types File
Create `src/services/contacts/contactDisplayTypes.ts` with:
- `ContactDisplayOptions` interface
- `UnifiedContactData` interface
- `DisplayMode` type

#### Step 2: Extend ContactDisplay Class
Add to `src/services/contacts/contactDisplay.ts`:
- New `displayContactUnified()` static method
- Private helper methods:
  - `formatFullName()` - combines first/last/label/company
  - `formatEmails()` - handles single/multiple/empty cases
  - `formatPhones()` - handles single/multiple/empty cases
  - `formatLinkedInUrl()` - extracts and formats LinkedIn URL
  - `applyHebrewReversal()` - conditionally applies Hebrew text reversal
  - `buildDisplayHeader()` - generates header based on mode

#### Step 3: Refactor ContactDisplay Usage
Update `src/scripts/contactsSync.ts`:
- Replace existing `ContactDisplay.displayContact()` calls
- Convert `SyncableContact` to `UnifiedContactData`
- Pass options with `mode: 'sync'`, reason, index, totalCount

#### Step 4: Refactor ContactEditor Summary Display
Update `src/services/contacts/contactEditor.ts` (lines 191-235):
- Replace inline display code with `ContactDisplay.displayContactUnified()`
- Convert `editableData` to `UnifiedContactData`
- Pass options with `mode: 'summary'`
- Map `currentSelectedLabelNames` to `labels` array

#### Step 5: Refactor ContactEditor Success Display
Update `src/services/contacts/contactEditor.ts` (lines 721-757):
- Replace inline display code with `ContactDisplay.displayContactUnified()`
- Convert `data` + `finalSelectedLabelNames` to `UnifiedContactData`
- Pass options with `mode: 'success'`, `showResourceName: true`

#### Step 6: Refactor Duplicate Display
Update `src/services/contacts/duplicateDetector.ts` (lines 147-164):
- Replace inline display code with `ContactDisplay.displayContactUnified()`
- Convert `ContactData` to `UnifiedContactData`
- Pass options with `mode: 'duplicate'`, `similarityType`, `matchNumber`

#### Step 7: Deprecate Old Method
- Mark `ContactDisplay.displayContact()` as deprecated
- Keep it temporarily for backward compatibility (can remove after all usages replaced)

#### Step 8: Testing & Validation
- Run contact sync script to verify sync display
- Test contact editor flow (create/edit) to verify summary and success displays
- Test duplicate detection to verify duplicate display format
- Verify Hebrew text displays correctly in all modes
- Verify multiple emails/phones display with proper indentation

### 6. Data Structure Mapping

| Source Type | Field Mapping | Target Field |
|------------|--------------|--------------|
| `ContactData` | `firstName`, `lastName` | Direct mapping |
| `ContactData` | `label` (single) | `label` |
| `ContactData` | `emails[]` → `emails[].value` | `emails[]` |
| `ContactData` | `phones[]` → `phones[].number` | `phones[]` |
| `ContactData` | `websites[]` → find LinkedIn | `linkedInUrl` |
| `EditableContactData` | `labelResourceNames[]` | Resolve to names → `labels[]` |
| `EditableContactData` | `emails[]`, `phones[]` | Direct (already strings) |
| `EditableContactData` | `linkedInUrl` | Direct |

### 7. File Changes Summary

**New Files:**
- `src/services/contacts/contactDisplayTypes.ts` - Type definitions

**Modified Files:**
- `src/services/contacts/contactDisplay.ts` - Add unified display method
- `src/scripts/contactsSync.ts` - Replace display calls
- `src/services/contacts/contactEditor.ts` - Replace 2 display locations
- `src/services/contacts/duplicateDetector.ts` - Replace display logic

**Expected Code Reduction:**
- Remove ~150 lines of duplicated display logic
- Centralize formatting rules in one place
- Improve maintainability for future display changes

## Benefits

1. **Single Source of Truth**: All display logic in one place
2. **Consistency**: Guaranteed consistent formatting across all contexts
3. **Maintainability**: Future changes only need to be made once
4. **Flexibility**: Easy to add new display modes or fields
5. **Testability**: Can unit test display logic independently

## Implementation Checklist

- [ ] Create contactDisplayTypes.ts with ContactDisplayOptions and UnifiedContactData interfaces
- [ ] Implement displayContactUnified() method with helper functions in ContactDisplay class
- [ ] Replace ContactDisplay.displayContact() usage in contactsSync.ts
- [ ] Replace summary display logic in contactEditor.ts (lines 191-235)
- [ ] Replace success display logic in contactEditor.ts (lines 721-757)
- [ ] Replace duplicate display logic in duplicateDetector.ts (lines 147-164)
- [ ] Mark old displayContact() method as deprecated
- [ ] Test all display scenarios: sync, summary, success, and duplicate detection
