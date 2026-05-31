# Maintainer Issue Exclusions

We need to refactor a logic to the "SCAN_CONTACTS_REPORT.txt" contacts scan maintainer.

## 1. Overview

The exclusion mechanism allows specific contacts to skip validation checks for certain issue types.

Each issue is assigned a **permanent numeric ID** that is completely decoupled from its key name and display message. This means renaming a key or rewording a message **never breaks** existing exclusion files or backups — the numeric ID is the only stable reference.

The exclusion configuration lives in `exclusions.json` and is validated at startup against the live issue registry.

---

## 2. The Golden Rules

> ⚠️ Violating any of these rules may silently break exclusions in existing backups.

- **Never reuse or reassign an ID** — once an ID is assigned, it belongs to that issue forever.
- **Never delete an existing issue definition** — only add new ones. If an issue is no longer relevant, mark it as deprecated (prefix the key with `DEPRECATED__`).
- **Never reference keys or message strings in exclusion files** — only numeric IDs.
- **Always add a `reason` field** to every exclusion entry — you will forget why you added it.
- **Always increment the ID** — the next ID is always `max(existing IDs) + 1`.

---

## 3. Issue ID Registry

> ⚠️ This table reflects the issues at the time this document was written. New issues may have been added to the code since then — **always cross-reference with `MaintainerIssueDefinitions` in the source code** as the true source of truth. When adding a new issue, update both the code and this table.

| ID  | Key                                     | Message                                      |
| --- | --------------------------------------- | -------------------------------------------- |
| 1   | `CONTAINS_HEBREW`                       | `CONTAINS HEBREW`                            |
| 2   | `EMPTY_NAME`                            | `EMPTY NAME`                                 |
| 3   | `EMPTY_CONTACT`                         | `EMPTY CONTACT`                              |
| 4   | `DUPLICATE_CONTACTS`                    | `DUPLICATE CONTACTS`                         |
| 5   | `POSSIBLE_DUPLICATE_CONTACT`            | `POSSIBLE DUPLICATE CONTACT`                 |
| 6   | `MISSING_LABEL`                         | `MISSING LABEL`                              |
| 7   | `WRONG_LABEL`                           | `WRONG LABEL`                                |
| 8   | `MISSING_PHONE_EMAIL_LABEL`             | `MISSING PHONE/EMAIL LABEL`                  |
| 9   | `INVALID_PHONE_EMAIL_LABEL`             | `INVALID PHONE/EMAIL LABEL`                  |
| 10  | `PHONE_LABEL_NOT_MATCH_TO_COMPANY_NAME` | `PHONE LABEL NOT MATCH TO COMPANY NAME`      |
| 11  | `EMAIL_LABEL_NOT_MATCH_TO_COMPANY_NAME` | `EMAIL LABEL NOT MATCH TO COMPANY NAME`      |
| 12  | `PHONE_CONTAINS_SEPARATORS`             | `PHONE CONTAINS SEPARATORS`                  |
| 13  | `MISSING_URL_LABEL`                     | `MISSING URL LABEL`                          |
| 14  | `INVALID_URL_LABEL`                     | `INVALID URL LABEL`                          |
| 15  | `DUPLICATE_PHONE_GLOBAL`                | `DUPLICATE PHONE - GLOBAL`                   |
| 16  | `DUPLICATE_PHONE_SINGLE`                | `DUPLICATE PHONE - SINGLE`                   |
| 17  | `DUPLICATE_EMAIL_GLOBAL`                | `DUPLICATE EMAIL - GLOBAL`                   |
| 18  | `DUPLICATE_EMAIL_SINGLE`                | `DUPLICATE EMAIL - SINGLE`                   |
| 19  | `DUPLICATE_URL_GLOBAL`                  | `DUPLICATE URL - GLOBAL`                     |
| 20  | `DUPLICATE_URL_SINGLE`                  | `DUPLICATE URL - SINGLE`                     |
| 21  | `MISSING_REQUIRED_URL_FOR_LABEL`        | `MISSING REQUIRED URL FOR #LABEL#`           |
| 22  | `INVALID_URL`                           | `INVALID URL`                                |
| 23  | `PHONE_GLOBAL_PREFIX`                   | `PHONE GLOBAL PREFIX`                        |
| 24  | `PHONE_CONTAIN_SPACES`                  | `PHONE_CONTAIN_SPACES: #VALUE#`              |
| 25  | `OUTDATED_COMPANY_NAME`                 | `OUTDATED COMPANY NAME - SHOULD BE: #FIXED#` |
| 26  | `INVALID_NAME`                          | `INVALID NAME - SHOULD BE: #FIXED#`          |
| 27  | `INVALID_CONTACT_NAME`                  | `INVALID CONTACT - Name: #FIXED#`            |
| 28  | `INVALID_CONTACT_COMPANY`               | `INVALID CONTACT - Company: #FIXED#`         |
| 29  | `NOTES_CONTAINS_BREAK_LINES`            | `NOTES CONTAINS BREAK LINES`                 |
| 30  | `CONTAINS_WHITE_SPACES`                 | `CONTAINS WHITE SPACES IN FIELDS: #FIELDS#`  |
| 31  | `OTHER_CONTACT`                         | `OTHER CONTACT`                              |
| 32  | `POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES`  | `POSSIBLE DUPLICATE CONTACTS BY NOTES`       |
| 33  | `LOWER_CASE_NAME`                       | `LOWER CASE NAME`                            |
| 34  | `UPPER_CASE_NAME`                       | `UPPER CASE NAME`                            |
| 35  | `CONTAINS_HIDDEN_UNICODE_CHARACTER`     | `CONTAINS_HIDDEN_UNICODE_CHARACTER`          |
| 36  | `MISSING_SUB_LABEL`                     | `MISSING SUB-LABEL FOR: #LABEL#`             |
| 37  | `INVALID_ORDER_FOR_SUB_LABEL`           | `INVALID ORDER FOR SUB-LABEL`                |
| 38  | `INVALID_MIXED_LABELED`                 | `INVALID MIXED LABELED`                      |
| 39  | `INVALID_LABEL`                         | `INVALID LABEL`                              |
| 40  | `INVALID_LABEL_NAME`                    | `INVALID LABEL NAME - SHOULD BE: #FIXED#`    |
| 41  | `CONTAINS_MULTIPLE_SPACES`              | `CONTAINS MULTIPLE SPACES IN FIELD: #FIELD#` |
| 42  | `INVALID_EMAIL`                         | `INVALID EMAIL`                              |

---

## 4. Exclusion File Format

The file is located at `exclusions.json` in the backup folder.

```json
{
  "skippedContacts": [
    {
      "id": "c3558846282243878481",
      "reason": "My own contact — skip entirely"
    }
  ],
  "contactExclusions": [
    {
      "id": "c1234567890123456789",
      "excludeIssues": [1, 33, 34]
    }
  ]
}
```

### Field Reference

| Field                               | Type     | Required | Description                                                  |
| ----------------------------------- | -------- | -------- | ------------------------------------------------------------ |
| `skippedContacts`                   | array    | ✅       | Contacts to skip entirely — no checks run at all             |
| `skippedContacts[].id`              | string   | ✅       | Google Contact ID from the URL (e.g. `c3558846282243878481`) |
| `skippedContacts[].reason`          | string   | ✅       | Human-readable explanation — always fill this in             |
| `contactExclusions`                 | array    | ✅       | Contacts to skip only for specific issue types               |
| `contactExclusions[].id`            | string   | ✅       | Google Contact ID from the URL                               |
| `contactExclusions[].excludeIssues` | number[] | ✅       | Numeric issue IDs to skip for this contact                   |
| `contactExclusions[].reason`        | string   | ✅       | Human-readable explanation — always fill this in             |

### Finding the Contact ID

The contact ID is the numeric part of the Google Contacts URL:

```
https://contacts.google.com/person/c3558846282243878481
                                    ^^^^^^^^^^^^^^^^^^^^^^^
                                    this is the ID
```

---

## 5. How to Add a New Exclusion (step-by-step)

**To skip a contact entirely:**

1. Open the Google Contact and copy the ID from the URL.
2. Add an entry to `skippedContacts` in `exclusions.json`:
   ```json
   {
     "id": "c3558846282243878481",
     "reason": "My own contact — skip entirely"
   }
   ```

**To skip specific issues for a contact:**

1. Open the Google Contact and copy the ID from the URL.
2. Find the issue(s) you want to exclude in the [Issue ID Registry](#3-issue-id-registry) above — and verify against `MaintainerIssueDefinitions` in code.
3. Add an entry to `contactExclusions` in `exclusions.json`:
   ```json
   {
     "id": "c9876543210987654321",
     "excludeIssues": [6, 8]
   }
   ```
4. Run the validator (see Section 7) to confirm no unknown IDs were introduced.

---

## 6. How to Add a New Issue Type (step-by-step)

1. Take `max(existing IDs) + 1` as the new ID — **never reuse an old one**.
2. Add the definition to `MaintainerIssueDefinitions` in code:
   ```typescript
   // ⚠️ NEVER reuse or reassign an ID — only add new entries with the next incremented ID.
   // IDs are permanent and referenced in exclusion JSON files and backups.
   NEW_ISSUE_KEY: { id: 42, message: 'NEW ISSUE DISPLAY MESSAGE' },
   ```
3. Add a new row to the [Issue ID Registry](#3-issue-id-registry) table in this file.
4. Deploy — existing exclusion files are unaffected.

---

## 7. Startup Validation

On startup, the app validates `exclusions.json` against the live registry and throws immediately if any unknown ID is found. This prevents silent failures where an exclusion stops applying after a refactor.

```typescript
// ⚠️ NEVER reuse or reassign an ID — only add new entries with the next incremented ID.
// IDs are permanent and referenced in exclusion JSON files and backups.
export const MaintainerIssueDefinitions = {
  CONTAINS_HEBREW: { id: 1, message: 'CONTAINS HEBREW' },
  EMPTY_NAME: { id: 2, message: 'EMPTY NAME' },
  // ... etc
} as const;

export type MaintainerIssueType = keyof typeof MaintainerIssueDefinitions;

// Build a lookup map: numeric ID → issue key
export const issueIdMap = new Map(
  Object.entries(MaintainerIssueDefinitions).map(([key, def]) => [def.id, key])
);

function validateExclusionFile(exclusions: ExclusionFile): void {
  const validIds = new Set(
    Object.values(MaintainerIssueDefinitions).map((d) => d.id)
  );

  for (const contact of exclusions.contactExclusions) {
    for (const issueId of contact.excludeIssues) {
      if (!validIds.has(issueId)) {
        throw new Error(
          `❌ Exclusion file references unknown issue ID "${issueId}" ` +
            `for contact "${contact.id}". ` +
            `Valid IDs: ${[...validIds].sort((a, b) => a - b).join(', ')}`
        );
      }
    }
  }

  console.log('✅ Exclusion file validated successfully.');
}
```

---

## 8. Applying Exclusions

```typescript
function filterExcludedIssues(
  reportItem: MaintainerReportItem,
  exclusions: ExclusionFile
): MaintainerReportItem | null {
  const contactId = reportItem.contact.resourceName?.split('/').pop();

  // Skip contact entirely
  const isSkipped = exclusions.skippedContacts.some((e) => e.id === contactId);
  if (isSkipped) return null;

  // Skip specific issues
  const contactExclusion = exclusions.contactExclusions.find(
    (e) => e.id === contactId
  );
  if (!contactExclusion) return reportItem;

  const excludeIds = new Set(contactExclusion.excludeIssues);
  const filteredIssues = reportItem.issues.filter((issueKey) => {
    const id = MaintainerIssueDefinitions[issueKey].id;
    return !excludeIds.has(id);
  });

  return { ...reportItem, issues: filteredIssues };
}
```

---

## 9. Backup

The backup folder is located at:

```
C:\Users\Or Assayag\Dropbox\contacts
```

`exclusions.json` lives **directly in this folder** and is the single source of truth for all exclusions. The script reads it from here on every run.

### Rules

- **Create it here** — on first run, if `exclusions.json` does not exist in the backup folder, create it there with an empty structure:
  ```json
  {
    "skippedContacts": [],
    "contactExclusions": []
  }
  ```
- **Edit it here** — all manual exclusion changes are made directly to this file in the Dropbox folder.
- **Never delete it** — the backup script must explicitly skip `exclusions.json` when clearing or overwriting the backup folder. Even if the folder is wiped and re-populated, this file must survive.
- **Never overwrite it** — the script must never write to `exclusions.json` itself. It is a human-managed file. The script only **reads** it.

### Backup folder structure

```
C:\Users\Or Assayag\Dropbox\contacts\
├── contacts.json         ← overwritten on each backup run
├── report.json           ← overwritten on each backup run
└── exclusions.json       ← ⚠️ NEVER deleted or overwritten by the script
```
