# Contacts Sync Script Implementation Plan

## Overview

Build an interactive CLI script that allows users to manually fix and complete Google contacts data. The script provides two modes: **Add Contacts** (using full POC flow) and **Fix Contacts** (prioritized random selection of incomplete contacts).

## Core Architecture

### Script Structure

Following the existing pattern from `src/scripts/linkedinSync.ts`:

- **Entry Point**: `src/scripts/contactsSync.ts`
- **Service**: `src/services/contacts/contactSyncer.ts` (main logic)
- **Support**: Reuse existing POC components from `/poc/src/services/contactWriter.ts`

### Key Components to Build

1. **ContactSyncer Service** (`src/services/contacts/contactSyncer.ts`)
   - Fetch all Google contacts
   - Filter contacts without syncer notes
   - Prioritize contacts by criteria
   - Display contact for editing
   - Update contact via People API
   - Track stats (added/updated counts)

2. **Interactive CLI Flow**
   - Main menu: Add contacts / Fix contacts / Exit
   - Add flow: Full POC contactWriter flow
   - Fix flow: Display contact, prompt for edits, save/cancel loop

3. **Priority Detection Logic**
   - Level 1: Contains Hebrew (any field including notes/labels)
   - Level 2: Missing label (contact groups)
   - Level 3: Missing company
   - Level 4: Missing other data (email, phone, LinkedIn, job title, first/last name)

## Detailed Implementation

### Phase 1: Contact Fetching & Filtering

**Fetch Logic**:
- Use `DuplicateDetector` or `ContactCache` to fetch all contacts
- Fetch contact fields: `names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies,metadata`
- Include `metadata.sources` to get `resourceName` for updates
- Store in memory for processing

**Filter Logic**:
- Exclude contacts with notes containing:
  - "Added by the people syncer script" (from POC manual adds)
  - "Updated by the people syncer script" (from POC manual updates)
  - "Added by the contacts sync script" (from this script adds)
  - "Updated by the contacts sync script" (from this script updates)
- Use regex patterns from `src/regex/patterns.ts`:
  - `SYNCER_ADDED_NOTE`
  - `SYNCER_UPDATED_NOTE`
- Add new patterns for sync script:
  - `SYNC_ADDED_NOTE = /Added by the contacts sync script/`
  - `SYNC_UPDATED_NOTE = /Updated by the contacts sync script/`

**Implementation Note**:
- Reuse existing `ContactCache` or create dedicated fetch method
- Parse Google People API response to `ContactData` interface from `src/types/contact.ts`
- Track resourceName for each contact (required for updates)

### Phase 2: Priority Detection & Categorization

**Hebrew Detection** (Priority 1):

Check ALL fields for Hebrew characters using `RegexPatterns.HEBREW` **EXCEPT LinkedIn URLs**:
- First name, last name
- Company, job title
- Email values (not email labels)
- Phone numbers
- **NOT LinkedIn URL values** (LinkedIn normalizes to ASCII)
- Notes
- Contact group names (labels)

**Rationale**: LinkedIn URLs are always ASCII (linkedin.com/in/name), Hebrew in URLs should not trigger fixing.

**Missing Label Detection** (Priority 2):
- Check if `memberships` array is empty or undefined
- Contact must have at least one contact group membership

**Missing Company Detection** (Priority 3):
- Check if `organizations[0].name` is empty, undefined, or only whitespace

**Missing Other Data Detection** (Priority 4):
- Missing email: `emailAddresses` empty or undefined
- Missing phone: `phoneNumbers` empty or undefined
- Missing LinkedIn URL: no URL with type "LinkedIn" in `urls` array
- Missing job title: `organizations[0].title` empty or undefined
- Missing first name: `names[0].givenName` empty or undefined
- Missing last name: `names[0].familyName` empty or undefined

**Categorization Logic**:

```typescript
interface FixableContact {
  contact: ContactData;
  priorityLevel: 1 | 2 | 3 | 4;
  reasons: string[];
  resourceName: string;
}
```

- Build array of `FixableContact` objects
- Sort by `priorityLevel` ascending (1 first, 4 last)
- Within same priority, maintain original fetch order
- Track multiple reasons per contact

### Phase 3: Display Contact for Fixing

**Display Format**:
```
===Contacts Sync===  (shown once at script start)

Reason: Contains Hebrew
Contact Index: 00,234/03,455
Contact ID: people/c1234567890

-Labels: Job | Customer Service
-Company: אלביט מערכות
-Full name: יוסי כהן Job אלביט מערכות
-Job Title: Senior Engineer
-Email: yossi@example.com Job אלביט מערכות
-Phone: +972-50-1234567 Job אלביט מערכות
-LinkedIn URL: https://linkedin.com/in/yossi-cohen LinkedIn
```

**Note**: 
- "===Contacts Sync===" header shown once at script start
- Don't display existing note content to user
- Script manages notes automatically

**Display Rules**:
- Use `FormatUtils` from `src/constants/formatUtils.ts` for number formatting
- Show contact index as `current/total` (e.g., 00,234/03,455)
- Display **primary reason first**, then list all applicable reasons
- Apply Hebrew text reversal using `TextUtils.reverseHebrewText()` from POC
- Show empty fields as blank (not "(none)")

### Phase 4: Interactive Edit Flow

**Implementation Approach**:

Reuse POC's `contactWriter.ts` methods:
- `handleEditAction()` - field editing logic (EXCLUDE note editing)
- `promptForLabels()` - label selection/creation
- `fetchContactGroups()` - get all contact groups
- Validation from `InputValidator` class
- All edit logic already exists in POC

**New Logic Required**:
- Pre-populate edit form with current contact data
- Highlight fields that are missing/incorrect (based on reasons)
- Loop until user selects "Save changes" or "Cancel"
- Track if ANY field was changed for update mask
- **NO "Edit note" option** - script manages notes automatically

**Edit Options Available**:
```
✏️  Edit labels
🏷️  Create new label
🏷️  Remove label
🏢 Edit company
🏢 Remove company
👤 Edit first name
👤 Edit last name
💼 Edit job title
💼 Remove job title
📧 Edit email
📧 Add email
📧 Remove email
📱 Edit phone
📱 Add phone
📱 Remove phone
🔗 Edit LinkedIn URL
🔗 Remove LinkedIn URL
✅ Save changes
❌ Cancel
```

**Note**: NO "Edit note" or "Add note" options - notes managed by script only.

### Phase 5: Save & Update Contact

**Update Strategy**:

Use Google People API `updateContact` method (different from createContact):

```typescript
// First: Get contact for etag and current memberships
const existingContact = await service.people.get({
  resourceName: 'people/c1234567890',
  personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies'
});

// Build update request
const updateMask: string[] = [];
const requestBody: any = { etag: existingContact.data.etag };

// Track which fields changed
if (namesChanged) {
  requestBody.names = [...];
  updateMask.push('names');
}

if (emailsChanged) {
  requestBody.emailAddresses = [...];
  updateMask.push('emailAddresses');
}

if (membershipsChanged) {
  // CRITICAL: Merge system + user groups
  const systemMemberships = (existingContact.data.memberships || []).filter(
    m => {
      const rn = m.contactGroupMembership?.contactGroupResourceName;
      return !rn || !rn.startsWith('contactGroups/');
    }
  );
  const newUserMemberships = selectedLabels.map(rn => ({
    contactGroupMembership: { contactGroupResourceName: rn }
  }));
  requestBody.memberships = [...systemMemberships, ...newUserMemberships];
  updateMask.push('memberships');
}

// Update note using determineSyncNoteUpdate()
const currentDate = formatDateDDMMYYYY(new Date());
const existingNote = existingContact.data.biographies?.[0]?.value || '';
const noteUpdate = determineSyncNoteUpdate(existingNote, currentDate);

if (noteUpdate.shouldUpdate) {
  requestBody.biographies = [{
    value: noteUpdate.newNoteValue,
    contentType: 'TEXT_PLAIN'
  }];
  updateMask.push('biographies');
}

// Execute update
await service.people.updateContact({
  resourceName: 'people/c1234567890',
  updatePersonFields: updateMask.join(','),
  requestBody
});
```

**Note Management** (using NEW function):

Use `determineSyncNoteUpdate()` (NOT `determineNoteUpdate()`):
- For fix flow: "Updated by the contacts sync script - Last update: DD/MM/YYYY"
- Same date: don't update (matches LinkedIn sync behavior)
- Preserves existing notes by appending

**Critical Points**:
1. **Memberships**: Always merge system + user groups (never replace)
2. **Update mask**: Only include fields that actually changed
3. **Note function**: Use `determineSyncNoteUpdate()` for sync, NOT `determineNoteUpdate()`
4. **etag**: Required from existing contact fetch

**Field Mapping**:
- Follow exact POC format for last name: `{lastName} {Label} {Company}`
- Extract first label from contact groups
- Use composite suffix for email/phone labels: `{Label} {Company}`
- Trim all fields (no leading/trailing whitespace)

### Phase 6: Add Contact Flow (Full POC)

**Flow Overview**:

Copy entire POC add contact flow from `poc/src/services/contactWriter.ts`:
1. `collectInitialInput()` - prompt for all fields **EXCEPT note** (script manages notes)
2. Duplicate detection using `DuplicateDetector`
3. `showSummaryAndEdit()` - display summary and allow edits
4. `createContact()` - save to Google Contacts

**Integration Points**:
- Use existing `DuplicateDetector` service
- Use existing validation from POC `InputValidator`
- Track added count for final summary
- Script automatically adds note: "Added by the contacts sync script - Last update: DD/MM/YYYY"
- **Remove** any note prompts from POC flow

**Reuse Strategy**:

Option 1: Extract shared logic into reusable service
Option 2: Duplicate POC logic into contactSyncer service  
Option 3: Import and adapt POC methods directly

Recommendation: Option 2 - Duplicate and adapt (simpler than extracting shared service).

### Phase 7: Statistics & Summary Display

**Track Counts During Execution**:
- `addedCount` - contacts created via add flow
- `updatedCount` - contacts updated via fix flow  
- `skippedCount` - contacts user viewed but didn't save (chose Cancel)

**Skipped Logic**: Increment when user views contact display and cancels (even without making edits).

**Final Summary** (aligned format matching LinkedIn sync):

```
=================Contacts Sync Summary=================
============Added: 00,001 | Updated: 09,042============
=======================================================
```

Use `FormatUtils.padLineWithEquals()` to align:
- Total width: 56 characters (matching LinkedIn sync)
- Center text between equals signs
- Format numbers with leading zeros and thousands separators

**Display Timing**:
- Show when user exits the script
- Show when user chooses "Exit" from main menu
- Show when script completes (no more contacts to fix)

### Phase 8: API Credentials Validation

**Validation Flow**:

At script start, before main menu:
1. Check if token file exists and is valid
2. If expired or missing, trigger `AuthService.authorize()`
3. Show message: "✓ People API credentials validated"
4. If auth fails, show error and exit

**Implementation**:
- Use existing `src/services/auth/authService.ts`
- Reuse OAuth2Client setup from LinkedIn sync script
- No changes to auth logic needed

## File Changes

### New Files

1. **src/scripts/contactsSync.ts**
   - Main script entry point
   - Menu loop (Add/Fix/Exit)
   - Summary display
   - Stats tracking

2. **src/services/contacts/contactSyncer.ts**
   - Contact fetching & filtering
   - Priority detection & categorization
   - Contact display logic
   - Update contact logic
   - Random selection within priority

3. **src/services/contacts/contactEditor.ts** (optional - shared logic)
   - Extract POC contactWriter logic
   - Reuse in both POC and sync script
   - Handles add/edit/validate operations

### Modified Files

1. **src/scripts/index.ts**
   - Register `contactsSyncScript`

2. **src/regex/patterns.ts**
   - Add `SYNC_ADDED_NOTE` pattern
   - Add `SYNC_FIXED_NOTE` pattern (for detection, not filtering)

3. **src/services/linkedin/noteParser.ts**
   - Add `determineSyncNoteUpdate()` function (NEW)
   - Keep existing functions unchanged

## Settings Configuration

Add to `src/settings/settings.ts`:

```typescript
contactsSync: {
  maintainFetchOrder: true,  // Maintain fetch order within each priority (no randomization)
  writeDelayMs: 500,         // Delay after each update (prevents rate limiting)
}
```

## Priority Logic Details

### Strict Priority Order

Contacts are displayed in this exact order:

1. **Priority 1 (Hebrew)**: All contacts with Hebrew characters in any field
   - Within this group, maintain fetch order
   - Process ALL Priority 1 contacts before moving to Priority 2

2. **Priority 2 (No Label)**: Contacts without any contact group membership
   - Only shown after ALL Priority 1 contacts are processed
   - Within this group, maintain fetch order

3. **Priority 3 (No Company)**: Contacts without company name
   - Only shown after ALL Priority 1 and 2 contacts are processed
   - Within this group, maintain fetch order

4. **Priority 4 (Other Missing Data)**: Contacts missing other fields
   - Only shown after ALL Priority 1, 2, and 3 contacts are processed
   - Within this group, maintain fetch order

**Implementation**:
- Sort all fixable contacts by `priorityLevel`
- Use stable sort to maintain order within each priority
- Display contacts sequentially from sorted array
- Track current index and total count

## Testing Strategy

### Manual Testing

1. Test with contacts containing:
   - Hebrew text in various fields (first name, company, notes, labels)
   - Missing labels/company/data
   - Multiple priority levels
   - Valid and complete contacts (should be filtered out)

2. Test add flow:
   - Add new contact with all fields
   - Verify duplicate detection works
   - Verify note is added correctly with "contacts sync script"

3. Test fix flow:
   - Edit Hebrew text to English
   - Add missing labels/company
   - Cancel without saving
   - Save and verify update with proper note

4. Test priority ordering:
   - Create contacts at each priority level
   - Verify they appear in correct order (1, 2, 3, 4)
   - Verify all Priority 1 contacts shown before any Priority 2

5. Test note filtering:
   - Verify contacts with "Added by the people syncer script" are excluded
   - Verify contacts with "Updated by the people syncer script" are excluded
   - Verify contacts with "Added by the contacts sync script" are excluded
   - Verify contacts with "Updated by the contacts sync script" are INCLUDED (can be re-fixed)
   - Verify contacts without notes are included

### Integration Points

- Reuse existing POC tests for add flow
- Reuse existing validation tests
- Test Google People API update calls

## Implementation Order

1. Add regex patterns for sync notes to `patterns.ts`
2. Update `noteParser.ts` to support "contacts sync script" name
3. Build `ContactSyncer` service (fetch, filter, categorize)
4. Build contact display logic
5. Build interactive edit flow (reuse POC)
6. Build update contact logic
7. Build add contact flow (reuse POC)
8. Create main script with menu loop
9. Add summary display
10. Register script in index
11. Manual testing

## Success Criteria

- Script runs via interactive menu: `pnpm run start` → Select "Contacts Sync"
- Validates Google API credentials at start
- Main menu offers Add/Fix/Exit options
- Add flow matches POC exactly (all fields, duplicate detection, validation)
- Fix flow displays contacts in strict priority order (Hebrew > No Label > No Company > Other)
- Displays contact with index (XX,XXX/YY,YYY) and reasons
- Interactive edit supports all fields from requirements
- Save updates contact with proper note tracking ("contacts sync script")
- Cancel returns to edit without saving
- Summary displays aligned counts (added/updated)
- Hebrew text reversal works in display
- All fields trimmed (no whitespace issues)
- No duplicate notes added
- Contacts with syncer notes (people/sync) are excluded from fix flow

## Key Differences from LinkedIn Sync

1. **Interactive vs Batch**: Contacts sync is interactive (one at a time), LinkedIn sync is batch (all at once)
2. **User-Driven**: User selects fields to edit; LinkedIn sync auto-updates based on CSV data
3. **Two Modes**: Add contacts + Fix contacts; LinkedIn sync only has sync mode
4. **Priority System**: Fixed priority ordering; LinkedIn sync processes all connections equally
5. **Note Filtering**: Excludes contacts already processed by any syncer script
6. **Manual Validation**: User validates changes before saving; LinkedIn sync auto-saves

## Error Handling

- Invalid API credentials: Show error, re-prompt for auth
- Network errors during fetch/update: Retry with exponential backoff (use existing `RetryHandler`)
- User cancels mid-edit: Discard changes, return to menu
- No contacts to fix: Show message "No contacts need fixing", return to menu
- API rate limiting: Handle gracefully with existing rate limit monitoring

## Security & Privacy

- No secrets in code
- Use existing OAuth2 flow
- No logging of contact PII to console (except display for user)
- All contact data in memory only (no file persistence)
- Hebrew/special characters fully supported (no restrictions)

---

## Edge Cases & Action Items

### 1. Missing `etag` Field [ACTION: IMPLEMENT]

**What is `etag`?**

The `etag` (entity tag) is a version identifier returned by Google People API for each contact. It's like a fingerprint that changes every time the contact is modified. Google uses it for optimistic concurrency control.

**Why do we need it?**

When updating a contact, Google requires the `etag` to prevent conflicts:
- User A fetches contact (etag: "abc123")
- User B fetches same contact (etag: "abc123")  
- User A updates contact → Google changes etag to "xyz789"
- User B tries to update with old etag "abc123" → Google returns 412 error (Precondition Failed)

This prevents User B from overwriting User A's changes.

**The Problem**:

Our initial fetch via `DuplicateDetector.fetchContactsFromAPI()` uses:
```typescript
personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships'
```

Notice `etag` is NOT included in the response. When we try to update a contact, we don't have the required `etag` value.

**The Solution**:

Before updating any contact in fix flow:
1. Fetch the contact again using `people.get()` with all fields
2. This fetch includes `etag` in the response automatically
3. Use that `etag` in the update request

**Example from LinkedIn sync** (`contactSyncer.ts` lines 130-136):
```typescript
const existingContact = await service.people.get({
  resourceName,
  personFields: 'names,emailAddresses,urls,organizations,biographies'
});
// existingContact.data.etag is now available
```

**Implementation**:
- For fix flow: Always fetch contact individually before updating
- Extract `etag` from `existingContact.data.etag`
- Include in update: `requestBody.etag = existingData.etag`
- This adds 1 extra API call per updated contact (acceptable for interactive flow)

### 2. Missing `biographies` Field in Initial Fetch [ACTION: ADD TO FETCH]

**Issue**: Current fetch doesn't include `biographies` (notes) field.

**Impact**: Cannot filter out contacts with syncer notes during initial load.

**ACTION**: 
- Add `biographies` to `personFields` in fetch
- Add optional `note?: string` field to `ContactData` interface
- Filter contacts with syncer notes during categorization phase

**Implementation**:
```typescript
personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies'
```

### 3. Contact Updated Externally During Session [DECISION: SKIP - WON'T HAPPEN]

**Context**: Single user running one script at a time locally.

**DECISION**: No need to implement 412 error handling.

**Rationale**:
- Only you use the script
- You run one script at a time
- No concurrent modifications possible
- Reduces complexity

**ACTION**: 
- ❌ No 412 error handling needed
- ✅ Keep basic try-catch for other errors
- ✅ If 412 somehow occurs, show generic error (unlikely edge case)

### 4. Hebrew Validation Rules [ACTION: ALLOW HEBREW IN FIXER]

**Current Behavior**: POC's `InputValidator` blocks Hebrew text with error message.

**Desired Behavior**: Sync script must ALLOW Hebrew input because:
- User is fixing Hebrew text → English
- Some fields might remain Hebrew temporarily
- On next iteration, user will fix remaining Hebrew

**ACTION**:
- When using POC validation in sync, SKIP Hebrew validation
- Only validate format (email format, phone format, length limits)
- Allow Hebrew characters in all text fields
- User manually converts Hebrew → English field by field

**Implementation Options**:
1. Add `allowHebrew: boolean` parameter to `InputValidator` methods
2. Create `SyncInputValidator` that extends POC validator with Hebrew allowed
3. Conditionally skip Hebrew checks based on context

**Recommendation**: Option 1 - cleanest approach.

### 5. Duplicate Detection During Edits [ACTION: IMPLEMENT]

**Issue**: User might create duplicates while editing.

**Example**:
- Contact A: John Smith, john@example.com
- Contact B: John Doe, different@example.com
- User edits Contact B's email to john@example.com → Creates duplicate!

**ACTION**:
- Before saving, run duplicate detection (like POC add flow)
- Check: name, email, phone, LinkedIn URL
- If duplicates found, show warning with matched contacts
- Ask user: "Continue anyway?" (Yes/No)
- If No, return to edit screen

**Implementation**: Reuse existing `DuplicateDetector` service.

### 6. Contact Has Multiple Priorities [DECISION: OPTION A - HIGHEST PRIORITY WINS]

**Decision**: Use **Highest Priority Wins** approach.

**Implementation**:

```typescript
function categorizContact(contact: ContactData): FixableContact {
  const reasons: string[] = [];
  let priorityLevel: 1 | 2 | 3 | 4;
  
  // Check all criteria and collect reasons
  const hasHebrew = checkHebrewInAllFields(contact);
  const noLabel = !contact.label || contact.label.trim() === '';
  const noCompany = !contact.company || contact.company.trim() === '';
  const missingOther = checkMissingFields(contact);
  
  // Build reasons array
  if (hasHebrew) reasons.push(`Contains Hebrew (${hebrewFieldsList})`);
  if (noLabel) reasons.push('Missing label');
  if (noCompany) reasons.push('Missing company');
  if (missingOther.length > 0) reasons.push(...missingOther);
  
  // Assign to HIGHEST priority that applies
  if (hasHebrew) {
    priorityLevel = 1;
  } else if (noLabel) {
    priorityLevel = 2;
  } else if (noCompany) {
    priorityLevel = 3;
  } else {
    priorityLevel = 4;
  }
  
  return { contact, priorityLevel, reasons, resourceName: contact.resourceName };
}
```

**Display Format**:
```
Reason: Contains Hebrew (first name, company), Missing company
Contact Index: 00,123/10,000
Contact ID: people/c1234567890
...
```

**Behavior**:
- Contact appears ONCE in the queue
- Assigned to highest priority level (1 = highest)
- All applicable reasons displayed
- User can fix all issues in one edit session

### 7. Hebrew Detection in Contact Group Names [ACTION: INCLUDE IN DETECTION]

**Issue**: Contact group names (labels) are fetched separately and mapped by resourceName. We need to check these for Hebrew characters too.

**ACTION**:
- Store contact group names in the contact data during fetch
- Check `label` field (which contains joined group names) for Hebrew
- Include in detection: `RegexPatterns.HEBREW.test(contact.label)`

### 8. Contact Has No Data At All [ACTION: INCLUDE IN PRIORITY 4]

**ACTION**:
- Include it in Priority 4 (missing other data)
- Reasons: "Missing first name, Missing last name, Missing email, Missing phone, Missing label, Missing company, Missing job title, Missing LinkedIn URL"
- User can decide to delete or populate

### 9. Multiple Contacts Need Same Edit [ACTION: NOT FOR V1]

**Issue**: If many contacts have Hebrew in company name "אלביט", user has to type English translation repeatedly.

**ACTION**: 
- **V1**: User must edit each contact individually
- **Future Enhancement**: Cache translations (Hebrew → English mapping)

### 10. Rate Limiting [ACTION: HANDLED BY EXISTING RETRY LOGIC]

**Issue**: Manual editing takes time. Will we hit rate limits?

**ACTION**: 
- Use existing `retryWithBackoff` utility for all API calls
- Add write delay after each update: 500ms (configurable)
- Track API stats throughout session
- Interactive nature means natural delays between API calls
- No additional rate limit handling needed beyond existing infrastructure

### 11. Memory Usage with Large Contact Lists [ACTION: ADD 50K LIMIT]

**Issue**: If user has 50,000+ contacts, loading all into memory might be problematic.

**ACTION**:
- Add hard limit: 50,000 contacts maximum
- If user has more, show error: "Too many contacts (X found, 50,000 max). Please archive older contacts."
- Exit script gracefully
- For most users (< 10,000 contacts), no issue

**Implementation**:
```typescript
if (contacts.length > 50000) {
  throw new Error(`Too many contacts: ${contacts.length}. Maximum supported: 50,000`);
}
```

### 12. Cancel vs Exit Behavior [ACTION: CLARIFY IN UI]

**ACTION**:
- **Cancel** (during edit): Discard changes to current contact, return to main menu (don't increment updated count)
- **Exit** (main menu): Show summary and terminate script
- **Ctrl+C** (anywhere): Show partial summary, terminate script gracefully

### 13. Updating Label Membership [ACTION: FOLLOW POC PATTERN]

**ACTION**:
- Fetch existing memberships from contact
- Build new memberships array based on user selection
- Include in `updatePersonFields`: `memberships`
- Follow POC pattern for label management (create if not exists)
- Use existing `ensureGroupExists()` pattern from `contactSyncer.ts`

### 14. Empty Last Name After Composite Suffix [ACTION: EXPECTED BEHAVIOR]

**Issue**: If contact originally has empty lastName, last name becomes only "Job Planview".

**ACTION**: This is EXPECTED behavior (matching POC and LinkedIn sync). No changes needed.

### 15. Phone Number Country Code [ACTION: KEEP SIMPLE]

**ACTION**: 
- Store phone as-is (matching POC)
- No country code detection
- No phone number formatting
- User enters phone exactly as they want it stored

### 16. Session State Persistence [ACTION: NO PERSISTENCE FOR V1]

**ACTION**:
- NO persistence
- Script always starts fresh
- Contacts with sync notes are excluded, so re-running is safe
- User can Ctrl+C anytime and re-run later

### 17. POC TextUtils.reverseHebrewText() Handling [ACTION: COPY TO SRC]

**ACTION**:
- Copy POC's `TextUtils` and `NameParser` classes to `src/utils/` or `src/parsers/`
- Avoid POC dependency
- Ensure Hebrew reversal logic is available

### 18. Note Parser Generic Script Name [ACTION: REFACTOR WITH PARAMETER]

**ACTION**:
- Refactor `buildNewContactNote()` to accept `scriptName: string` parameter
- Refactor `buildUpdatedContactNote()` similarly
- Update all callers:
  - LinkedIn sync: pass "people syncer script"
  - Contacts sync: pass "contacts sync script"

### 19. Display Format Alignment [ACTION: NO TRUNCATION]

**ACTION**:
- Don't truncate - show full data (user needs to see everything to fix it)
- Accept that long text might break visual alignment
- Use consistent format matching LinkedIn sync output

## Final Edge Cases & Implementation Details

### 1. Note Parser Logic for Fixer [ACTION: CREATE NEW FUNCTION]

**CRITICAL**: Current `determineNoteUpdate()` only handles "people syncer" notes, won't work for sync!

**Solution**: Create new function `determineSyncNoteUpdate()` in noteParser.ts:

```typescript
export function determineSyncNoteUpdate(existingNote: string, currentDate: string): NoteUpdateResult {
  if (!existingNote) {
    return {
      shouldUpdate: true,
      newNoteValue: `Updated by the contacts sync script - Last update: ${currentDate}`,
    };
  }
  
  const hasFixedMessage: boolean = RegexPatterns.SYNC_FIXED_NOTE.test(existingNote);
  
  if (hasFixedMessage) {
    const existingDate: string | null = extractDateFromNote(existingNote);
    if (existingDate === currentDate) {
      // Same date, don't update
      return {
        shouldUpdate: false,
        newNoteValue: existingNote,
      };
    }
    // Different date, update date only
    return {
      shouldUpdate: true,
      newNoteValue: updateNoteDateOnly(existingNote, currentDate),
    };
  }
  
  // No sync note, append it
  return {
    shouldUpdate: true,
    newNoteValue: `${existingNote}\nUpdated by the contacts sync script - Last update: ${currentDate}`,
  };
}
```

**ACTION**: 
1. Add `determineSyncNoteUpdate()` to noteParser.ts
2. Use it in fix flow (NOT `determineNoteUpdate()`)
3. Same date behavior: don't update (matches LinkedIn sync)

### 2. Contact Groups Update - Preserve System Memberships [ACTION: MERGE NOT REPLACE]

**CRITICAL**: Google's `updatePersonFields: 'memberships'` REPLACES entire array, not merges!

**Problem**: If you only send user groups, system groups get deleted!

**Solution**: Merge system + user memberships:

```typescript
// Get current contact with memberships
const existingContact = await service.people.get({
  resourceName,
  personFields: 'memberships'
});

// Separate system groups from user groups
const systemMemberships = (existingContact.data.memberships || []).filter(
  m => {
    const resourceName = m.contactGroupMembership?.contactGroupResourceName;
    // System groups don't have 'contactGroups/' prefix, or are null
    return !resourceName || !resourceName.startsWith('contactGroups/');
  }
);

// Build new user memberships from selected labels
const newUserMemberships = selectedLabels.map(resourceName => ({
  contactGroupMembership: { contactGroupResourceName: resourceName }
}));

// MERGE: combine system + new user groups
requestBody.memberships = [...systemMemberships, ...newUserMemberships];
updateMask.push('memberships');
```

**ACTION**: 
1. Always fetch existing memberships before update
2. Preserve system memberships
3. Replace ONLY user contact groups
4. Send merged array in update

### 3. Empty/Null/Undefined Field Detection [ACTION: HANDLE ALL CASES]

**Detection must handle**: empty string, null, undefined

**Implementation**:
```typescript
function isMissingField(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

// Usage
const isMissingCompany = isMissingField(contact.company);
const isMissingEmail = !contact.emails?.length || contact.emails.every(e => isMissingField(e.value));
```

**ACTION**: Use consistent null/undefined/empty detection across all missing field checks.

### 4. Display Format - Simplified Hebrew Reason [ACTION: SIMPLIFY]

**DECISION**: Don't specify which fields contain Hebrew.

**Display**:
```
Reason: Contains Hebrew, Missing company
```

NOT:
```
Reason: Contains Hebrew (first name, last name, company), Missing company
```

**ACTION**: 
- Primary reason: "Contains Hebrew" (no field list)
- Other reasons: comma-separated on same line
- If line too long (>100 chars), acceptable to wrap

### 5. Skipped Counter Logic [ACTION: OPTION B]

**DECISION**: Increment skipped anytime user views contact and doesn't save.

**When skipped increments**:
- User views contact
- User chooses "Cancel" (even without making changes)
- Skipped +1

**When skipped does NOT increment**:
- User views contact
- User makes changes
- User saves successfully → Updated +1 (not skipped)

**ACTION**: Track skipped for any contact displayed but not saved.

### 6. Same Date Update Behavior [ACTION: SKIP IF SAME DATE]

**DECISION**: Match LinkedIn sync - don't update note if same date.

**Implementation**: Already in `determineSyncNoteUpdate()` above (point #1).

```typescript
if (existingDate === currentDate) {
  return { shouldUpdate: false, newNoteValue: existingNote };
}
```

**ACTION**: Skip note update if date hasn't changed.

### 7. Update vs Create API Clarification [ACTION: DOCUMENT DIFFERENCE]

**Add flow**: Uses `people.createContact()` (POC pattern)

**Fix flow**: Uses `people.updateContact()` (LinkedIn sync pattern)

**Key differences**:
```typescript
// CREATE (add flow)
await service.people.createContact({
  requestBody: { names: [...], emails: [...] }
});

// UPDATE (fix flow)  
await service.people.updateContact({
  resourceName: 'people/c123',           // ← Required
  updatePersonFields: 'names,emails',    // ← Required - only changed fields
  requestBody: { 
    etag: existingContact.etag,          // ← Required
    names: [...], 
    emails: [...] 
  }
});
```

**ACTION**: 
1. Add flow: reuse POC's createContact() as-is
2. Fix flow: implement updateContact() following LinkedIn sync pattern
3. Document that these are different APIs

### 8. Notes Field Handling [ACTION: NEVER EXPOSE TO USER]

**CLARIFICATION**: Users NEVER see or edit notes.

**Add flow**: 
- No "note" prompt in input collection
- Script automatically adds: "Added by the contacts sync script..."

**Fix flow**:
- Don't display existing note to user
- Don't offer "Edit note" option
- Script automatically manages note on save

**Existing note preservation**:
- If contact has personal notes (not syncer notes), preserve them
- Append sync note: `{existing note}\nUpdated by the contacts sync script...`

**ACTION**: 
1. Remove any "note" prompts from user flows
2. Never display note content
3. Script manages notes automatically
4. Preserve existing notes when appending

### 9. Name Validation [ACTION: REQUIRE BOTH NAMES]

**DECISION**: Require both first name AND last name (match POC).

**Behavior**: Contact missing either name → Priority 4 (needs fixing).

**Validation**: Use POC's validation (already requires both).

**ACTION**: Follow POC validation - both names required.

### 10. Memberships Update Emphasize Merge [ACTION: ALREADY COVERED IN #2]

**Covered in point #2 above** - merge system + user groups, never replace.

### 11. Script Command [ACTION: NOT NEEDED]

**DECISION**: No script command in package.json.

**Reason**: Script added to interactive menu via scripts/index.ts, runs via `pnpm run start`.

**ACTION**: Don't add package.json script - use interactive menu only.

### 12. Ctrl+C Graceful Handler [ACTION: IMPLEMENT]

**Add to main script**:
```typescript
let stats = { added: 0, updated: 0, skipped: 0 };

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Script interrupted by user');
  console.log('Progress so far:');
  console.log(`  Added: ${FormatUtils.formatNumberWithLeadingZeros(stats.added)}`);
  console.log(`  Updated: ${FormatUtils.formatNumberWithLeadingZeros(stats.updated)}`);
  console.log(`  Skipped: ${FormatUtils.formatNumberWithLeadingZeros(stats.skipped)}`);
  console.log('\nYou can re-run the script to continue fixing contacts.');
  process.exit(0);
});
```

**ACTION**: Add SIGINT handler at script start, show partial summary on interrupt.

---

## Additional Edge Cases & Refinements

### 1. Update Mask Management [ACTION: BUILD DYNAMICALLY]

**Strategy**: Build update payload with all original contact fields, change only user-edited fields, track which fields changed for update mask.

**Implementation**:
```typescript
const updateMask: string[] = [];
const requestBody: any = { ...existingContact };

// User edited first name
if (editedData.firstName !== originalData.firstName) {
  requestBody.names = [{ givenName: editedData.firstName, familyName: editedData.lastName }];
  updateMask.push('names');
}

// User edited email
if (emailsChanged) {
  requestBody.emailAddresses = editedData.emails;
  updateMask.push('emailAddresses');
}

// Final update
await service.people.updateContact({
  resourceName,
  updatePersonFields: updateMask.join(','),
  requestBody
});
```

**ACTION**: Track field changes during edit flow, build update mask from changed fields only.

### 2. Note Filtering & "Updated by" Pattern [ACTION: NEW NOTE FORMAT - ALLOWS RE-FIXING]

**DECISION CLARIFIED**: Use "Updated by the contacts sync script" to ALLOW re-fixing in future iterations.

**Key Insight**: "Updated by" means the contact CAN be fetched and fixed again if new issues appear!

**Filter Logic**:
- ✅ **EXCLUDE**: "Added by the people syncer script" (LinkedIn sync - complete contact)
- ✅ **EXCLUDE**: "Updated by the people syncer script" (LinkedIn sync - already processed)
- ✅ **EXCLUDE**: "Added by the contacts sync script" (added via this script's add flow)
- ✅ **INCLUDE**: "Updated by the contacts sync script" (CAN be fixed again if needed!)
- ✅ **INCLUDE**: Contacts WITHOUT any notes (need fixing)

**Why "Updated by" is different**:
```
Iteration 1: Contact has Hebrew name
           → User fixes Hebrew → Note: "Updated by contacts sync - 13/03/2026"
           
Iteration 2 (later): Same contact now missing email
           → Script sees "Updated by..." note → INCLUDES IT ✓
           → User can fix the missing email!
           → Note becomes: "Updated by contacts sync - 15/03/2026" (updated date)
```

**Comparison**:
- "Added by" = Complete contact, don't touch
- "Updated by" = LinkedIn sync processed, don't touch  
- "Updated by" = Previously fixed, but CAN fix again if needed

**New Regex Patterns**:
```typescript
// Exclude these (complete contacts)
SYNCER_ADDED_NOTE = /Added by the people syncer script/
SYNCER_UPDATED_NOTE = /Updated by the people syncer script/
SYNC_ADDED_NOTE = /Added by the contacts sync script/

// Include these (can be fixed again)
SYNC_FIXED_NOTE = /Updated by the contacts sync script/
```

**Filter Implementation**:
```typescript
function shouldExcludeContact(note: string): boolean {
  // Exclude if has "Added by" or "Updated by" from any script
  return (
    SYNCER_ADDED_NOTE.test(note) ||
    SYNCER_UPDATED_NOTE.test(note) ||
    SYNC_ADDED_NOTE.test(note)
  );
  // Note: "Updated by" is NOT excluded - allows re-fixing!
}
```

**Note Building**:
- Add flow: "Added by the contacts sync script - Last update: DD/MM/YYYY"
- Fix flow: "Updated by the contacts sync script - Last update: DD/MM/YYYY"
  - If note already has "Updated by", update the date
  - If note is empty or other text, append "Updated by..."

**ACTION**: 
1. Add `SYNC_FIXED_NOTE` regex pattern (for detection, not filtering)
2. Use "Updated by..." in fix flow, "Added by..." in add flow
3. Filter ONLY excludes: SYNCER_ADDED_NOTE, SYNCER_UPDATED_NOTE, SYNC_ADDED_NOTE
4. "Updated by" notes are INCLUDED in fixable contacts

### 3. Composite Last Name Rebuilding [ACTION: OPTION B - REBUILD ON CHANGE]

**DECISION**: Rebuild last name composite suffix when company changes.

**Example**:
- Original: "Smith Job Microsoft"
- User changes company to "Google"
- New last name: "Smith Job Google"

**Implementation**: Follow LinkedIn sync pattern - always rebuild composite suffix based on current label + company.

**ACTION**: When company or label changes, rebuild last name with new composite suffix.

### 4. Email/Phone Label Updates [ACTION: UPDATE LABELS]

**DECISION**: Update email/phone labels when company changes.

**Example**:
- Email: "john@example.com" with label "Job Microsoft"
- User changes company to "Google"  
- Updated email label: "Job Google"

**Implementation**: Update labels for ALL existing emails/phones to match new composite suffix.

**ACTION**: When company or label changes, update all email/phone labels to new composite suffix.

### 5. resourceName Verification [ACTION: SKIP CONTACTS WITHOUT RESOURCENAME]

**What is resourceName?**

`resourceName` is the unique identifier Google assigns to each contact. Format: `people/c1234567890`. It's like a database primary key - you need it to fetch, update, or delete a specific contact.

**The Issue**:

When you fetch contacts via `people.connections.list()`, Google automatically includes `resourceName` in each person object. However, in rare cases it might be missing.

**Why this matters**:
- Without resourceName, you CAN'T update contacts (API requires it)
- Script would fail at update time with cryptic error

**DECISION**: Skip contacts without resourceName (don't display them in sync).

**Implementation**: 
```typescript
// After fetching all contacts
const validContacts = allContacts.filter(c => {
  if (!c.resourceName) {
    logger.warn(`Skipping contact without resourceName: ${c.firstName} ${c.lastName}`, { noPHI: true });
    return false;
  }
  return true;
});

logger.info(`Fetched ${allContacts.length} contacts, ${validContacts.length} valid`, { noPHI: true });
```

**ACTION**: 
1. After fetch, filter out contacts without resourceName
2. Log warning for each skipped contact (no PHI)
3. Continue with valid contacts only
4. Don't fail script - just skip invalid contacts
5. Count and report: "X contacts skipped (missing ID)"

### 6. System Contact Groups [ACTION: IGNORE - NO CHANGES NEEDED]

**DECISION**: Don't care about Google built-in labels, ignore.

**Current behavior**: Already correctly filtered (groupType === 'USER_CONTACT_GROUP').

**ACTION**: No changes needed.

### 7. Single Contact Edge Case [ACTION: HANDLE GRACEFULLY]

**Scenario**: User has exactly 1 fixable contact.

**Display**: "Contact Index: 00,001/00,001"

**After fixing**: Show success message immediately.

**ACTION**: 
- Show summary when no more contacts to fix
- Message: "✓ All contacts fixed! No more contacts need fixing."

### 8. All Contacts Already Fixed [ACTION: SHOW DETAILED BREAKDOWN]

**Scenario**: No contacts need fixing (all have syncer notes).

**Display**:
```
No contacts need fixing!

Breakdown:
  - LinkedIn sync (people syncer): 1,234 contacts
  - Previously fixed (contacts sync): 567 contacts
  - Total processed: 1,801 contacts

Contacts without syncer notes: 0
```

**ACTION**: Show detailed breakdown when no fixable contacts found.

### 9. Skipped Contacts Counter [ACTION: ADD TO SUMMARY]

**When to increment skipped**:
- User chooses "Cancel" during edit (discards changes)
- User doesn't complete editing a contact

**Summary Display**:
```
=================Contacts Sync Summary=================
========Added: 00,001 | Updated: 09,042 | Skipped: 00,023========
=======================================================
```

**ACTION**: Track skipped counter, add to summary on separate line or same line with proper alignment.

### 11. Note Contains Multiple Syncer Types [ACTION: EXCLUDE IF ANY SYNCER NOTE]

**Edge case**: Contact has both "people syncer" and "contacts sync" notes.

**DECISION**: Exclude from fix flow (though shouldn't happen in practice).

**Logic**: If note matches ANY syncer pattern, exclude.

**ACTION**: Filter checks all patterns with OR logic:
```typescript
const hasSyncerNote = 
  SYNCER_ADDED_NOTE.test(note) ||
  SYNCER_UPDATED_NOTE.test(note) ||
  SYNC_ADDED_NOTE.test(note) ||
  SYNC_FIXED_NOTE.test(note);
```

### 12. Partial Hebrew in Composite Fields [ACTION: DETECT AS PRIORITY 1]

**Edge case**: Last name is "Cohen Job אלביט" (Hebrew company embedded).

**DECISION**: Detect as Priority 1 (highest - Hebrew present).

**Behavior**: 
- Hebrew detection scans ALL text in field
- Triggers duplicate detection when fixed (name changed)
- This is desired behavior

**ACTION**: No special handling needed - regex will catch it.

### 13. POC Validators Import [ACTION: COPY TO SRC/VALIDATORS]

**DECISION**: Copy POC validators to `src/validators/` folder in root.

**Files to copy**:
- `poc/src/validators/inputValidator.ts` → `src/validators/inputValidator.ts`
- `poc/src/validators/validationSchemas.ts` → `src/validators/validationSchemas.ts`

**Modifications needed**:
- Add `allowHebrew: boolean` parameter to validation methods
- Skip Hebrew checks when `allowHebrew = true`

**ACTION**: Copy validators, modify to support Hebrew allowance in sync script.

### 14. Inquirer Dependency [ACTION: ENSURE INSTALLED]

**Library**: `inquirer` - interactive CLI prompts

**Usage**: User input for menu choices, field editing, confirmations

**ACTION**: 
1. Verify `inquirer` is in main package.json dependencies (not just POC)
2. If missing, add: `pnpm add inquirer @types/inquirer`
3. Import: `import inquirer from 'inquirer';`

### 15. DI Container Registration [ACTION: REGISTER SYNC SERVICE]

**Services to register**:
- `ContactSyncer` - main service
- Dependencies: OAuth2Client, DuplicateDetector

**Files to modify**:
1. `src/di/identifiers.ts` - add identifier:
```typescript
export const TYPES = {
  // ... existing
  ContactSyncer: Symbol.for('ContactSyncer'),
};
```

2. `src/di/container.ts` - register service:
```typescript
container.bind(ContactSyncer).toSelf().inSingletonScope();
```

**ACTION**: Add DI registration step to implementation order.

### 16. Error Codes for Fixer [ACTION: ADD TO ERROR_CODES.TS]

**New error codes**:
```typescript
// Contacts Sync errors (3001xxx)
CONTACTS_SYNC_NO_CONTACTS = 3001001,
CONTACTS_SYNC_TOO_MANY_CONTACTS = 3001002,
CONTACTS_SYNC_INVALID_CONTACT_DATA = 3001003,
CONTACTS_SYNC_MISSING_RESOURCE_NAME = 3001004,
CONTACTS_SYNC_VALIDATION_FAILED = 3001005,
```

**ACTION**: Add error codes to `src/errors/errorCodes.ts` with `CONTACTS_SYNC_*` prefix (consistent with `LINKEDIN_*`).

### 17. Testing Gaps - Complete Checklist [ACTION: ADD TO TESTING]

**Additional test scenarios**:
- [ ] Contact with empty string vs undefined fields (both should work)
- [ ] Contact with very long note (>1024 chars) - should handle gracefully
- [ ] Contact with special characters in name (emojis: 😀, accents: José, Müller)
- [ ] Contact with multiple emails - display first in summary, all in detail
- [ ] Contact with multiple phones - same as emails
- [ ] Edit flow: Change label then cancel - original label restored (no save)
- [ ] Add flow: Create contact, immediately run sync - should be excluded (has sync note)
- [ ] Hebrew in email value (not label) - detected as Priority 1
- [ ] Hebrew in phone number - detected as Priority 1
- [ ] Hebrew in note field - detected as Priority 1
- [ ] **Hebrew in LinkedIn URL - NOT detected** (LinkedIn URLs are ASCII)
- [ ] Contact with Hebrew + missing company + missing email - all reasons shown
- [ ] Composite suffix with empty company - handle gracefully
- [ ] Update only email - only emailAddresses in update mask
- [ ] Update only label - only memberships in update mask
- [ ] resourceName missing - error logged and script exits
- [ ] 50,001 contacts - error message shown
- [ ] Zero fixable contacts - breakdown shown
- [ ] One fixable contact - handles gracefully
- [ ] Skipped counter increments on cancel
- [ ] Summary alignment with large numbers (99,999+)

### 18. Fetch Progress Indicator [ACTION: CRITICAL FOR UX - IMPLEMENT]

**⚠️ CRITICAL FOR UX** - User must see progress during long fetch

**Scenario**: 40,000 contacts = 40 API calls = 2-3 minutes wait time

**Without indicator**: User thinks script is frozen/crashed ❌

**With indicator**: User sees real-time progress ✅
```
⠋ Fetching contacts: 1,000 contacts fetched...
⠙ Fetching contacts: 2,000 contacts fetched...
⠹ Fetching contacts: 8,234 contacts fetched...
⠸ Fetching contacts: 16,891 contacts fetched...
⠼ Fetching contacts: 24,002 contacts fetched...
⠴ Fetching contacts: 32,145 contacts fetched...
✓ Fetched 40,000 contacts (123 skipped: missing ID)
```

**Implementation**:
- Use ora spinner (already used in POC and LinkedIn sync)
- Update count in real-time during pagination
- Show final count when complete
- Include skipped count (contacts without resourceName)

**Code Example**:
```typescript
const spinner = ora('Fetching contacts...').start();

// Inside pagination loop
spinner.text = `Fetching contacts: ${contacts.length} contacts fetched...`;

// When done
const validCount = contacts.filter(c => c.resourceName).length;
const skippedCount = contacts.length - validCount;
spinner.succeed(`Fetched ${validCount} contacts${skippedCount > 0 ? ` (${skippedCount} skipped: missing ID)` : ''}`);
```

**ACTION**: 
1. Add ora spinner during fetch
2. Update text in real-time with running count
3. Show final count with skipped breakdown
4. **PRIORITY: HIGH** - Essential for good UX with large contact lists

---

## Refactoring Opportunities

### 1. Shared Contact Editor Service [ACTION: REFACTOR FIRST]

**Refactor**: Extract shared logic into `src/services/contacts/contactEditor.ts`:
- `promptForLabels()`
- `handleEditAction()`
- `fetchContactGroups()`
- `createContactGroup()`
- Input validation logic

**Benefit**: DRY principle, easier maintenance, consistent behavior

**Recommendation**: Do this refactor FIRST before building sync.

### 2. Note Parser Generalization [ACTION: IMPLEMENT]

**Refactor**: Make it accept script name as parameter:
```typescript
export function buildNewContactNote(date: Date, scriptName: string): string {
  return `Added by the ${scriptName} - Last update: ${formatDateDDMMYYYY(date)}`;
}
```

### 3. Dedicated Sync Fetch Method [ACTION: CREATE]

**Refactor**: Create `fetchContactsWithNotes()` in `ContactSyncer` service:
- Include `biographies` in personFields
- Return contacts with notes populated
- Don't modify existing `DuplicateDetector` behavior

### 4. ContactData Interface Extension [ACTION: ADD OPTIONAL FIELDS]

**Refactor**: Add optional fields:
```typescript
interface ContactData {
  // ... existing fields
  note?: string;
  etag?: string;
  resourceName?: string; // already exists
}
```

## Action Items Summary - UPDATED

### Must Implement (Critical)
1. ✅ Add `biographies` to personFields in fetch
2. ✅ Add `note?: string` and `etag?: string` fields to ContactData interface  
3. ✅ Allow Hebrew characters in sync validation
4. ✅ Run duplicate detection before saving edits
5. ✅ Implement highest-priority-wins logic (Option A)
6. ✅ Fetch individual contact before update to get etag
7. ✅ **NEW**: Use "Updated by..." note format - ALLOWS re-fixing in future iterations
8. ✅ **NEW**: Filter excludes ONLY "Added by" and "Updated by" notes (NOT "Updated by")
9. ✅ **NEW**: Update email/phone labels when company changes
10. ✅ **NEW**: Rebuild composite last name when company/label changes
11. ✅ **NEW**: Build update mask dynamically from changed fields
12. ✅ **NEW**: Skip contacts without resourceName (don't display, log warning)
13. ⚠️ **CRITICAL**: Add fetch progress indicator with skipped count (essential UX)

### Should Implement (Important)
13. ✅ Refactor note parser to accept script name parameter
14. ✅ Add 50,000 contact limit with error message
15. ✅ Copy POC TextUtils, NameParser, validators to src/
16. ✅ Add inquirer dependency to main package.json
17. ✅ Register ContactSyncer in DI container
18. ✅ Add sync error codes to errorCodes.ts
19. ✅ Add skipped counter to summary display
20. ✅ Show detailed breakdown when no contacts need fixing
21. ✅ Handle single contact edge case gracefully

### New Regex Patterns Required
- `SYNC_ADDED_NOTE = /Added by the contacts sync script/` (EXCLUDE from fix flow)
- `SYNC_FIXED_NOTE = /Updated by the contacts sync script/` (INCLUDE in fix flow - can re-fix!)
- Note: Keep existing SYNCER patterns for filtering (EXCLUDE both)

### Explicitly Skipped (By Decision)
22. ❌ 412 error handling - single user, one script at a time
23. ❌ Session state persistence - not needed for v1
24. ❌ Translation caching - future enhancement
25. ❌ System contact groups - ignore Google built-in labels

### Implementation Priority Order - UPDATED

1. **Add regex patterns** (10 min)
   - `SYNC_ADDED_NOTE`
   - `SYNC_FIXED_NOTE` (for detection, not filtering)
   - Update filter logic to check patterns

2. **Add `determineSyncNoteUpdate()` function** (20 min)
   - Add to noteParser.ts
   - Handles "Updated by contacts sync script" notes
   - Same date behavior: skip update (match LinkedIn sync)
   - Test with existing note variations

3. **Add error codes** (5 min)
   - CONTACTS_SYNC_NO_CONTACTS
   - CONTACTS_SYNC_TOO_MANY_CONTACTS  
   - CONTACTS_SYNC_INVALID_CONTACT_DATA
   - CONTACTS_SYNC_MISSING_RESOURCE_NAME
   - CONTACTS_SYNC_VALIDATION_FAILED

4. **Refactor note parser** (5 min - ALREADY DONE IN STEP 2)
   - determineSyncNoteUpdate() added
   - No need to modify existing functions

5. **Copy POC code to src** (30 min)
   - Add `note?: string`
   - Add `etag?: string`

5. **Copy POC code to src** (30 min)
   - Copy `TextUtils` class to `src/utils/`
   - Copy `NameParser` class to `src/parsers/`
   - Copy `InputValidator` to `src/validators/`
   - Copy `ValidationSchemas` to `src/validators/`
   - Modify validators: add `allowHebrew: boolean` parameter
   - **Remove note-related prompts from copied code**

7. **Verify inquirer dependency** (5 min)
   - Check package.json
   - Install if missing: `pnpm add inquirer @types/inquirer`

7. **Add 50K limit check** (5 min)
   - Check contact count after fetch
   - Show error and exit if exceeded

8. **Register in DI container** (10 min)
   - Add identifier to `identifiers.ts`
   - Bind ContactSyncer in `container.ts`

9. **Add Ctrl+C handler** (10 min)
   - Add SIGINT handler at script start
   - Show partial summary on interrupt
   - Format numbers with leading zeros

10. **Create ContactSyncer service** (3-4 hours)
   - Fetch with biographies + **progress indicator** ⚠️ CRITICAL UX
   - Filter contacts without resourceName (log warning, don't fail)
   - Filter logic: exclude ONLY "Added by" and "Updated by" notes (3 patterns)
     - EXCLUDE: SYNCER_ADDED_NOTE
     - EXCLUDE: SYNCER_UPDATED_NOTE  
     - EXCLUDE: SYNC_ADDED_NOTE
     - INCLUDE: SYNC_FIXED_NOTE (allows re-fixing!)
     - INCLUDE: No notes
   - Priority categorization: highest-priority-wins (Option A)
   - Hebrew detection: simplified - "Contains Hebrew" (no field list)
   - **EXCLUDE LinkedIn URLs from Hebrew detection** (LinkedIn normalizes to ASCII)
   - Null/undefined/empty detection: handle all three cases
   - Build reasons array for each contact (comma-separated)
   - Track: added, updated, skipped counters

11. **Build display logic** (1-2 hours)
    - Format contact display
    - Show simplified reasons: "Contains Hebrew, Missing company"
    - Apply Hebrew text reversal
    - Number formatting
    - Handle multiple emails/phones display
    - **Don't display note content**
    - Handle edge cases (very long text, special chars)

12. **Integrate POC edit flow** (3-4 hours)
    - Import/adapt POC contactWriter methods
    - Allow Hebrew in validation (allowHebrew = true)
    - Duplicate detection before save
    - Pre-populate with current contact data
    - Track changed fields for update mask building
    - Rebuild composite last name on company/label change
    - Update email/phone labels on company/label change
    - **Remove any note editing options**
    - Skipped counter: increment when user cancels (even without edits)

13. **Implement update contact logic** (2-3 hours)
    - Fetch individual contact for etag AND memberships
    - Build update request with only changed fields
    - Build update mask dynamically
    - **CRITICAL**: Merge system + user memberships (never replace)
    - Update note using `determineSyncNoteUpdate()` (NOT `determineNoteUpdate()`)
    - Same date: skip note update (match LinkedIn sync)
    - Basic try-catch (no special 412 handling needed)
    - 500ms delay after update

14. **Build add contact flow** (1 hour)
    - Duplicate POC flow (simpler than shared service)
    - **Remove note prompt from flow**
    - Use "Added by the contacts sync script..." in notes
    - Script manages note automatically

15. **Build main script** (2 hours)
    - Menu loop (Add/Fix/Exit)
    - Stats tracking (added, updated, skipped)
    - Summary display with skipped count
    - Handle "no contacts to fix" - show breakdown
    - Handle single contact edge case
    - Ctrl+C graceful exit (already added in step 9)

16. **Register script** (5 min)
    - Add to scripts/index.ts
    - Interactive menu only (no package.json command)

17. **Complete testing** (3-4 hours)
   - All 25+ testing checklist items
   - Edge cases
   - Special characters
   - Large numbers
   - Error scenarios
   - Same-date note update (should skip)
   - Memberships merge (verify system groups preserved)
   - Skipped counter logic
   - Hebrew in LinkedIn URL (should NOT trigger Priority 1)

### Total Estimate: 15-22 hours (increased due to additional requirements)

### Key Changes from Previous Version

✅ **ADDED**: `determineSyncNoteUpdate()` function (critical fix)
✅ **CLARIFIED**: "Updated by..." notes are INCLUDED (allows re-fixing!)
✅ **CLARIFIED**: Filter excludes ONLY "Added by" and "Updated by" (not "Updated by")
✅ **CLARIFIED**: Skip contacts without resourceName (don't fail, just log)
✅ **ADDED**: Merge system + user memberships (never replace) - CRITICAL
✅ **ADDED**: Update vs Create API distinction
✅ **CLARIFIED**: Notes NEVER exposed to user - script manages automatically
✅ **ADDED**: Null/undefined/empty detection for all fields
✅ **SIMPLIFIED**: Hebrew reason display - "Contains Hebrew" (no field list)
✅ **EXCLUDED**: LinkedIn URLs from Hebrew detection (normalized to ASCII)
✅ **CLARIFIED**: Skipped counter logic - increment on any cancel
✅ **CLARIFIED**: Same date note update - skip (match LinkedIn sync)
✅ **ADDED**: Ctrl+C handler with partial summary
✅ **REMOVED**: Package.json script command (use interactive menu)
✅ **UPDATED**: Settings - `maintainFetchOrder: true` + `writeDelayMs: 500`
✅ **UPDATED**: Error codes - `CONTACTS_SYNC_*` prefix (consistent naming)
✅ **CLARIFIED**: Name validation uses POC logic (validates before suffix)
✅ **ADDED**: Update email/phone labels dynamically
✅ **ADDED**: Rebuild composite last name on changes
✅ **ADDED**: Dynamic update mask building
✅ **ADDED**: Skipped counter
✅ **ADDED**: Detailed "no contacts" breakdown
✅ **ADDED**: Comprehensive testing scenarios (including memberships merge, LinkedIn URL exclusion)
✅ **EMPHASIZED**: Fetch progress indicator with skipped count (CRITICAL UX)
✅ **ADDED**: Copy validators to src (not just utils)
