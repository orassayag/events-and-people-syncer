# Create / Update Contact Flow — Implementation Plan

## Overview

Currently in `eventsJobsSync.ts`, after writing a note, the user is asked:

> `Create a new contact for HR_ProRecruiting?` (Yes/No)

If "Yes" is chosen and duplicates are found at **any point** during the create flow (name, email, phone, or LinkedIn) in `duplicateDetector.ts`, the user sees the duplicate list and then:

> `Continue anyway?` (Yes/No)

### Goal
Replace these two behaviours with a richer flow:

1. Rename the initial prompt to **"Create / Update contact for HR_ProRecruiting?"**
2. After confirmation, ask **Full Name first** (before Company) so the duplicate check runs early.
3. When a duplicate is found **at any check point** (name, email, phone, LinkedIn), replace the plain `Continue anyway? (Y/N)` with a **`selectWithEscape` dropdown** whose choices are:
   - `➕ Create a new contact` — always at the top
   - One entry per matching contact, e.g. `🔍 Anat Cohen Matkal (anat_911@walla.com)`
4. If the user picks **"Create a new contact"**, the flow continues exactly as today.
5. If the user picks an **existing contact**, their full details are displayed, the folder's label is auto-added if missing, and the **same `showSummaryAndEdit` edit menu** appears with `'Save'` verb → calls the new `updateExistingContact()` API method.

---

## Resolved Design Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Should all duplicate checks (email, phone, LinkedIn) also use the new dropdown? | **Yes — all checks get the dropdown** |
| 2 | Should biography be updated with a timestamp? | **Yes — date + time** using existing `formatDateTimeDDMMYYYY_HHMMSS` |
| 3 | Should the folder's label be auto-added to the existing contact? | **Yes — auto-add if not already present** |

---

## Scope of Changes

### Files to Modify / Create

| File | Action | Change Summary |
|---|---|---|
| `src/scripts/eventsJobsSync.ts` | Modify | Rename prompt; add `handleExistingContactSelected()`, `displayContactDetails()` |
| `src/services/contacts/duplicateDetector.ts` | Modify | Add `promptDuplicateSelectOrCreate()` alongside existing method |
| `src/services/contacts/eventsContactEditor.ts` | Modify | Reorder fields (name first); use new dropdown for all duplicate checks |
| `src/services/contacts/contactEditor.ts` | Modify | Update all `checkAndHandle*` methods + inline calls to use new dropdown; add `updateExistingContact()` |
| `src/types/services.ts` | Modify | Add `DuplicatePromptResult` type |
| `src/errors/existingContactSelected.ts` | **New** | New error class for signaling an existing contact was selected |
| `src/errors/index.ts` | Modify / New | Export the new error class |
| `src/utils/index.ts` | Modify | Ensure `formatDateTimeDDMMYYYY_HHMMSS` is exported |

---

## Detailed Changes

---

### 1. `src/scripts/eventsJobsSync.ts` — Rename Initial Prompt

**Location:** `promptAndCreateContact()` method, line ~1560–1562

#### Current code
```typescript
const shouldAddContactResult = await confirmWithEscape({
  message: `Create a new contact for ${folderDisplay}?`,
  default: false,
});
```

#### Change to
```typescript
const shouldAddContactResult = await confirmWithEscape({
  message: `Create / Update contact for ${folderDisplay}?`,
  default: false,
});
```

---

### 2. `src/types/services.ts` — New `DuplicatePromptResult` type

Add to the file:

```typescript
import type { ContactData } from './contact';

export type DuplicatePromptResult =
  | { action: 'create_new' }
  | { action: 'use_existing'; contact: ContactData };
```

---

### 3. `src/errors/existingContactSelected.ts` — New Error Class

Create new file:

```typescript
import type { ContactData } from '../types';

export class ExistingContactSelected extends Error {
  constructor(public readonly contact: ContactData) {
    super('User selected existing contact');
    this.name = 'ExistingContactSelected';
  }
}
```

Export from `src/errors/index.ts` (check if file exists; create if not):

```typescript
export { ExistingContactSelected } from './existingContactSelected';
```

---

### 4. `src/services/contacts/duplicateDetector.ts` — New `promptDuplicateSelectOrCreate()`

Add a **new method** alongside the existing `promptForDuplicateContinue` (which is kept unchanged for test-mock compatibility):

Add `selectWithEscape` to the imports from `../../utils`.

```typescript
async promptDuplicateSelectOrCreate(
  duplicates: DuplicateMatch[],
  uiLogger: Logger
): Promise<DuplicatePromptResult | null> {
  // DuplicatePromptResult imported from '../../types'
  if (duplicates.length === 0) {
    return { action: 'create_new' };
  }

  // --- Display block (identical to existing promptForDuplicateContinue) ---
  const paddedCount = duplicates.length.toString().padStart(3, '0');
  uiLogger.displayWarning(`Found ${paddedCount} similar contacts:`);
  for (let i = 0; i < duplicates.length; i++) {
    const { contact, similarityType } = duplicates[i];
    const matchNumber = (i + 1).toString().padStart(3, '0');
    console.log(`===Match ${matchNumber}:===`);
    console.log(`-Similarity Type: ${similarityType}`);
    const firstName = formatMixedHebrewEnglish(contact.firstName);
    const lastName = formatMixedHebrewEnglish(contact.lastName);
    console.log(`-Full Name: ${`${firstName} ${lastName}`.trim()}`);
    if (contact.label) console.log(`-Labels: ${formatMixedHebrewEnglish(contact.label)}`);
    if (contact.company) console.log(`-Company Name: ${formatMixedHebrewEnglish(contact.company)}`);
    if (contact.emails.length === 1) console.log(`-Email: ${contact.emails[0].value}`);
    else if (contact.emails.length > 1) console.log(`-Emails: ${contact.emails.map(e => e.value).join(', ')}`);
    if (contact.phones.length === 1) console.log(`-Phone: ${contact.phones[0].number}`);
    else if (contact.phones.length > 1) console.log(`-Phones: ${contact.phones.map(p => p.number).join(', ')}`);
    const linkedin = contact.websites.find(w => w.label.toLowerCase().includes('linkedin'));
    if (linkedin) console.log(`-LinkedIn URL: ${linkedin.url} LinkedIn`);
    if (contact.etag) console.log(`-ETag: ${contact.etag}`);
    console.log('');
  }

  // --- Build dropdown choices ---
  const choices = [
    { name: '➕ Create a new contact', value: 'create_new' },
    ...duplicates.map((match, i) => {
      const first = formatMixedHebrewEnglish(match.contact.firstName);
      const last = formatMixedHebrewEnglish(match.contact.lastName);
      const email = match.contact.emails[0]?.value ? ` (${match.contact.emails[0].value})` : '';
      return {
        name: `🔍 ${`${first} ${last}`.trim()}${email}`,
        value: `existing_${i}`,
      };
    }),
  ];

  await this.log('? Select an action:');
  const result = await selectWithEscape<string>({
    message: 'Select an action:',
    loop: false,
    choices,
  });

  if (result.escaped) {
    await this.log('User pressed ESC');
    return null;
  }

  if (result.value === 'create_new') {
    await this.log('User selected: Create a new contact');
    return { action: 'create_new' };
  }

  const index = parseInt(result.value.replace('existing_', ''), 10);
  const selected = duplicates[index].contact;
  await this.log(`User selected existing contact: ${selected.firstName} ${selected.lastName}`);
  return { action: 'use_existing', contact: selected };
}
```

> **Note:** The **old** `promptForDuplicateContinue` method remains in the class unchanged. It is still referenced in the test mock at `src/services/contacts/__tests__/contactEditor.dryMode.test.ts:52`. No test changes are needed.

---

### 5. `src/services/contacts/contactEditor.ts` — Update All `checkAndHandle*` Methods

There are **four** protected helper methods that must be updated to use the new dropdown and throw `ExistingContactSelected` when an existing contact is selected:

- `checkAndHandleNameDuplicate` (line ~63)
- `checkAndHandleEmailDuplicate` (line ~80)
- `checkAndHandlePhoneDuplicate` (line ~91)
- `checkAndHandleLinkedInDuplicate` (line ~102)

Add import at the top:
```typescript
import { ExistingContactSelected } from '../../errors';
```

#### New pattern for each method (example: name)

```typescript
protected async checkAndHandleNameDuplicate(
  firstName: string,
  lastName: string
): Promise<boolean> {
  if (!firstName || !lastName) return true;
  const nameDuplicates = await this.duplicateDetector.checkDuplicateName(firstName, lastName);
  const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(nameDuplicates, this.uiLogger);
  if (result === null) return false;                          // user escaped
  if (result.action === 'use_existing') throw new ExistingContactSelected(result.contact);
  return true;                                               // 'create_new'
}
```

Apply the same pattern to `checkAndHandleEmailDuplicate`, `checkAndHandlePhoneDuplicate`, and `checkAndHandleLinkedInDuplicate`.

#### Inline calls inside `collectInitialInput` (base `contactEditor.ts`)

There are also **inline** `promptForDuplicateContinue` calls inside `collectInitialInput` (around lines 150–162, 188–198, 215–225, 241–250). Each must be replaced with the same `promptDuplicateSelectOrCreate` pattern and throw `ExistingContactSelected` when applicable.

#### New `updateExistingContact()` method

Add this new public method (follows the pattern of `addPhoneToExistingContact`):

```typescript
async updateExistingContact(
  resourceName: string,
  data: EditableContactData,
  note: string
): Promise<void> {
  const service = google.people({ version: 'v1', auth: this.auth });
  const apiTracker = ApiTracker.getInstance();

  // 1. Fetch current etag
  const current = await retryWithBackoff(async () =>
    service.people.get({
      resourceName,
      personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies,etag',
    })
  );
  await apiTracker.trackRead();

  // 2. Build requestBody using same field-mapping logic as createContact()
  //    Extract shared logic into a private buildContactRequestBody() helper to avoid duplication
  const requestBody = this.buildContactRequestBody(data, note);

  // 3. Dry mode
  if (SETTINGS.dryMode) {
    DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}`, this.uiLogger);
    await apiTracker.trackWrite();
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
    this.uiLogger.displaySuccess('[DRY MODE] Contact updated successfully');
    return;
  }

  // 4. Real API update
  const spinner = ora('Updating contact...').start();
  await retryWithBackoff(async () =>
    service.people.updateContact({
      resourceName,
      updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies',
      requestBody: { etag: current.data.etag, ...requestBody },
    })
  );
  await apiTracker.trackWrite();
  spinner.stop();
  this.uiLogger.resetState('spinner');
  if (this.logApiStats) await apiTracker.logStats(this.uiLogger);
  await this.delay(SETTINGS.contactsSync.writeDelayMs);
  await ContactCache.getInstance().invalidate();
  this.uiLogger.displaySuccess('Contact updated successfully');
}
```

> **Important:** Extract the request body building logic from `createContact()` into a private `buildContactRequestBody(data: EditableContactData, note: string): CreateContactRequest` helper shared by both `createContact()` and `updateExistingContact()`. This avoids ~50 lines of duplication.

---

### 6. `src/services/contacts/eventsContactEditor.ts` — Reorder Fields + All Duplicate Checks Use Dropdown

Reorder `collectInitialInput` to ask **Full Name first**, then Company. All duplicate checks use the new `promptDuplicateSelectOrCreate` and throw `ExistingContactSelected` on selection.

Add imports:
```typescript
import { ExistingContactSelected } from '../../errors';
import type { DuplicatePromptResult } from '../../types';
```

#### New field order

```typescript
async collectInitialInput(prePopulated?: PrePopulatedData): Promise<EditableContactData> {
  if (!prePopulated || Object.keys(prePopulated).length === 0) {
    return super.collectInitialInput();
  }

  // 1. Labels (unchanged logic)
  let labelResourceNames: string[] = [];
  // ... (existing label resolution code, unchanged)

  // 2. Full Name ← MOVED HERE (was step 3)
  const fullNameResult = await inputWithEscape({
    message: `${EMOJIS.FIELDS.PERSON} Full name:`,
    default: '',
    validate: (input) => !input.trim() ? 'Full name is required.' : InputValidator.validateText(input, false),
  });
  if (fullNameResult.escaped) throw new Error('User cancelled');
  const { firstName, lastName } = TextUtils.parseFullName(fullNameResult.value);

  // 3. Name duplicate check → dropdown
  const nameDuplicates = await this.duplicateDetector.checkDuplicateName(firstName, lastName);
  const nameResult = await this.duplicateDetector.promptDuplicateSelectOrCreate(nameDuplicates, this.uiLogger);
  if (nameResult === null) throw new Error('User cancelled');
  if (nameResult.action === 'use_existing') throw new ExistingContactSelected(nameResult.contact);

  // 4. Company ← MOVED HERE (was step 2)
  // ... (existing company input code, unchanged)

  // 5. Job Title (unchanged)

  // 6. Email + email duplicate check → dropdown
  const emailResult = await inputWithEscape({ ... });
  if (emailValue.trim()) {
    const emailDups = await this.duplicateDetector.checkDuplicateEmail(emailValue.trim());
    const emailResult2 = await this.duplicateDetector.promptDuplicateSelectOrCreate(emailDups, this.uiLogger);
    if (emailResult2 === null) throw new Error('User cancelled');
    if (emailResult2.action === 'use_existing') throw new ExistingContactSelected(emailResult2.contact);
    emails.push(emailValue.trim());
  }

  // 7. Phone + phone duplicate check → dropdown (same pattern as email above)

  // 8. LinkedIn + LinkedIn duplicate check → dropdown (same pattern as email above)

  return { firstName, lastName, company: trimmedCompany, jobTitle, emails, phones, linkedInUrl, labelResourceNames };
}
```

---

### 7. `src/scripts/eventsJobsSync.ts` — Handle `ExistingContactSelected`

Add import:
```typescript
import { ExistingContactSelected } from '../errors';
import { formatMixedHebrewEnglish, formatDateTimeDDMMYYYY_HHMMSS } from '../utils';
```

In `promptAndCreateContact()`, update the catch block (currently around line 1676):

```typescript
} catch (error) {
  if (error instanceof ExistingContactSelected) {
    await this.handleExistingContactSelected(error.contact);
    return;
  }
  // ... existing error handling unchanged
}
```

#### New private method `handleExistingContactSelected`

```typescript
private async handleExistingContactSelected(contact: ContactData): Promise<void> {
  await this.logger.logMain(
    `User selected existing contact: '${contact.firstName} ${contact.lastName}'`
  );

  // 1. Display contact details
  this.displayContactDetails(contact);

  // 2. Convert ContactData → EditableContactData
  const editableData = this.contactEditor.convertContactDataToEditable(contact);

  // 3. Auto-add folder's label if not already in the contact's labels
  if (this.lastSelectedFolder && this.cachedContactGroups) {
    const folderLabel = this.lastSelectedFolder.label;
    const labelGroup = this.cachedContactGroups.find(
      g => g.name.toLowerCase() === folderLabel.toLowerCase()
    );
    if (labelGroup && !editableData.labelResourceNames.includes(labelGroup.resourceName)) {
      editableData.labelResourceNames.push(labelGroup.resourceName);
      await this.logger.logMain(`Auto-added folder label '${folderLabel}' to contact`);
    }
  }

  // 4. Show edit menu with 'Save' verb
  const finalData = await this.contactEditor.showSummaryAndEdit(editableData, 'Save');

  if (finalData === null) {
    await this.logger.logMain('Contact update cancelled by user');
    this.uiLogger.displayError('Contact update cancelled');
    return;
  }

  // 5. Build note with date + time
  const currentDateTime = formatDateTimeDDMMYYYY_HHMMSS(new Date());
  const note = `Updated by events & jobs sync script - Last update: ${currentDateTime}`;

  // 6. Call the new update API
  await this.contactEditor.updateExistingContact(contact.resourceName!, finalData, note);
  this.stats.contacts++;
  await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Contact updated successfully`);
  this.uiLogger.displaySuccess('Contact updated');
}
```

> **Note:** `formatDateTimeDDMMYYYY_HHMMSS` already exists in `src/utils/dateFormatter.ts` (line 15). It produces format `DD/MM/YYYY HH:MM:SS`.

#### New private method `displayContactDetails`

```typescript
private displayContactDetails(contact: ContactData): void {
  const firstName = formatMixedHebrewEnglish(contact.firstName);
  const lastName = formatMixedHebrewEnglish(contact.lastName);
  console.log(`-Similarity Type: (selected)`);
  console.log(`-Full Name: ${`${firstName} ${lastName}`.trim()}`);
  if (contact.label) console.log(`-Labels: ${formatMixedHebrewEnglish(contact.label)}`);
  if (contact.company) console.log(`-Company Name: ${formatMixedHebrewEnglish(contact.company)}`);
  if (contact.emails.length > 0) console.log(`-Email: ${contact.emails[0].value}`);
  if (contact.phones.length > 0) console.log(`-Phone: ${contact.phones[0].number}`);
  const linkedin = contact.websites.find(w => w.label.toLowerCase().includes('linkedin'));
  if (linkedin) console.log(`-LinkedIn URL: ${linkedin.url} LinkedIn`);
  if (contact.etag) console.log(`-ETag: ${contact.etag}`);
  console.log('');
}
```

---

### 8. `src/utils/index.ts` — Ensure `formatDateTimeDDMMYYYY_HHMMSS` Is Exported

The function already exists in `src/utils/dateFormatter.ts` (line 15, produces `DD/MM/YYYY HH:MM:SS`). Verify it is listed in `src/utils/index.ts`. If not, add it:

```typescript
export { formatDateDDMMYYYY, formatDateDDMMYYYYCompact, formatDateTimeDDMMYYYY_HHMMSS } from './dateFormatter';
```

---

## Full User-Facing Flow (After Change)

```
[After note is written to HR_ProRecruiting]

? Create / Update contact for HR_ProRecruiting? (y/N) › Yes

👤 Full name: Anat Cohen

    ===Match 001:===
    -Similarity Type: Full Name
    -Full Name: Anat Cohen Matkal
    -Labels: Imported Yahoo Mail 8 7 17 Imported on 7 20
    -Company Name: Matkal
    -Email: anat_911@walla.com
    -ETag: %Eg0B...

? Select an action:
  ❯ ➕ Create a new contact
    🔍 Anat Cohen Matkal (anat_911@walla.com)

─────────────────────────────────────────
PATH A: "Create a new contact" selected
─────────────────────────────────────────
  🏢 Company: ...
  💼 Job Title: ...
  📧 Email address: ...     ← same dropdown appears if email duplicate found
  📞 Phone number: ...      ← same dropdown appears if phone duplicate found
  🔗 LinkedIn URL: ...      ← same dropdown appears if LinkedIn duplicate found
  → [Summary/Edit menu → Create contact]

─────────────────────────────────────────
PATH B: "🔍 Anat Cohen Matkal" selected
─────────────────────────────────────────
  -Similarity Type: (selected)
  -Full Name: Anat Cohen Matkal
  -Labels: Imported Yahoo Mail 8 7 17 Imported on 7 20
  -Company Name: Matkal
  -Email: anat_911@walla.com
  -ETag: %Eg0B...

  [Folder label 'HR' auto-added to labelResourceNames if not present]

  → Summary/Edit menu with 'Save' verb
  → ✅ Save contact | 🏷 Edit labels | 🏢 Edit company | 👤 Edit full name | …
  → on Save → updateExistingContact() called
            → biography = "Updated by events & jobs sync script - Last update: 05/04/2026 11:56:42"
```

---

## Verification Plan

### Automated Tests
- Run `npx vitest run` — existing tests must pass (old `promptForDuplicateContinue` mock in `contactEditor.dryMode.test.ts` is kept).
- The test mock at line 52 of `contactEditor.dryMode.test.ts` does **NOT** need to change.

### Manual Verification
1. Run `npm run start` (dry mode).
2. Create a note in an HR folder.
3. Confirm prompt reads **"Create / Update contact for HR_ProRecruiting?"**.
4. Enter a name with a known duplicate → verify dropdown shows `➕ Create a new contact` + the duplicate entry.
5. Select "Create a new contact" → verify the create flow continues as before (Company first, then the rest).
6. Repeat; when prompted for email, enter a duplicate email → verify dropdown appears there too.
7. Run again; select an existing contact at the name step:
   - Confirm contact details are displayed.
   - Confirm the folder's label (e.g. `HR`) is auto-added to labels in the edit menu.
   - Confirm edit menu shows **"Save contact"** not "Create contact".
   - Confirm saving calls `[DRY MODE] Contact updated successfully`.
   - Confirm biography contains date + time format `DD/MM/YYYY HH:MM:SS`.
