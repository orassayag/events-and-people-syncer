# Google Contacts Excluder — CLI Implementation Plan

## Overview

A CLI menu option called **"Google Contacts Excluder"** that manages `exclusions.json` (located in the backup folder defined in `MAINTAINER_ISSUE_EXCLUSIONS.md`).

The user exits any loop at any time using the **Esc key** (existing project-wide behavior).

---

## Menu Placement

This option appears **directly below** `🔍 Google Contacts Maintainer` in the main script selection menu:

```
🔍 Google Contacts Maintainer - Scan and report issues in Google Contacts
🚫 Google Contacts Excluder   - Manage validation exclusions for the Google Contacts Maintainer
```

---

## Important Notes on the Data Format

> ⚠️ The `reason` field is **NOT used** in `contactExclusions` entries.
> It is only used in `skippedContacts` entries (and is optional there — can be left empty).
> Do not add, prompt for, or validate a `reason` field when writing `contactExclusions`.

The `exclusions.json` structure:

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
      "excludeIssues": [1, 6, 8]
    }
  ]
}
```

---

## Menu Structure

When selecting **"Google Contacts Excluder"**, display a dropdown with 3 options:

1. Add Rule
2. Delete a Rule
3. Skip Contact

---

## 1. Add Rule

### Flow (Add Rule)

1. Display all validation rules from `src/types/maintainer.ts` (`MaintainerIssueDefinitions`) as a dropdown. The user selects **exactly one** rule.

2. Enter a contact ID loop (exits via Esc):
   - Prompt: `Enter contact ID:`
   - **Validate the contact ID** (see [Contact ID Validation](#contact-id-validation)).
   - On invalid input → display inline error, keep prompt open (do not exit the loop).
   - On valid ID:
     - Check if this contact already has the selected rule in `contactExclusions`.
     - If it **already exists** → silently skip (no write, no error), prompt for the next ID.
     - If it **does not exist**:
       - If the contact already has a `contactExclusions` entry → append the rule ID to its `excludeIssues` array.
       - If the contact has no entry yet → create a new entry: `{ "id": "...", "excludeIssues": [ruleId] }`.
       - Save to `exclusions.json`.
     - Prompt for the next ID (loop continues).

---

## 2. Delete a Rule

### Flow (Delete a Rule)

1. Prompt: `Enter contact ID:`
   - **Validate the contact ID** (see [Contact ID Validation](#contact-id-validation)).
   - On invalid format → display error **"Invalid contact ID format"**, keep prompt open.
   - On valid format → check if the contact exists in `contactExclusions`.
   - If contact **not found in `contactExclusions`** → display error **"Contact not found in exclusions"**, keep prompt open.
   - On valid ID that exists → proceed to step 2.

2. Prompt: `Enter rule ID to remove:`
   - Validate that the entered rule ID is a number that exists in `MaintainerIssueDefinitions`.
   - If rule ID is **not a valid/known issue ID** → display error **"Unknown rule ID"**, keep prompt open.
   - If the contact **does not have this rule ID** in its `excludeIssues` → display error **"Rule not assigned to this contact"**, keep prompt open.
   - On valid rule ID that exists on the contact:
     - Remove the rule ID from the contact's `excludeIssues` array.
     - If `excludeIssues` is now empty → **remove the entire contact entry** from `contactExclusions` (clean up).
     - Save to `exclusions.json`.
     - Return to step 1 (prompt for the next contact ID).

---

## 3. Skip Contact

### Flow (Skip Contact)

1. Prompt: `Enter contact ID:`
   - **Validate the contact ID** (see [Contact ID Validation](#contact-id-validation)).
   - On invalid format → display error **"Invalid contact ID format"**, keep prompt open.
   - On valid format → check if the contact already exists in `skippedContacts`.
   - If it **already exists in `skippedContacts`** → display error **"Contact is already fully skipped"**, keep prompt open.
   - On valid, non-duplicate ID → proceed to step 2.

2. If the contact exists in `contactExclusions`:
   - Automatically remove it from `contactExclusions` (no prompt needed).

3. Prompt: `Enter reason (optional, press Enter to skip):`
   - Accept any string input, including empty.

4. Add entry to `skippedContacts`:

   ```json
   {
     "id": "c3558846282243878481",
     "reason": "<entered reason or empty string>"
   }
   ```

5. Save to `exclusions.json`.

6. Return to step 1 (prompt for the next contact ID, loop continues).

---

## Contact ID Validation

A contact ID is valid if it matches the pattern from a Google Contacts URL:

```
https://contacts.google.com/person/c3558846282243878481
```

**Rules:**

- Must start with `c` followed by digits only.
- Must be non-empty.
- Regex: `/^c\d+$/`

**Error message on invalid format:** `"Invalid contact ID format. Expected format: c followed by digits (e.g. c3558846282243878481)"`

---

## Error Summary

| Situation                                              | Error Message                                                                                    | Behavior         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------- |
| Invalid contact ID format                              | `"Invalid contact ID format. Expected format: c followed by digits (e.g. c3558846282243878481)"` | Keep prompt open |
| Contact not found in `contactExclusions` (Delete Rule) | `"Contact not found in exclusions"`                                                              | Keep prompt open |
| Unknown rule ID (Delete Rule)                          | `"Unknown rule ID"`                                                                              | Keep prompt open |
| Rule not assigned to this contact (Delete Rule)        | `"Rule not assigned to this contact"`                                                            | Keep prompt open |
| Contact already in `skippedContacts` (Skip Contact)    | `"Contact is already fully skipped"`                                                             | Keep prompt open |

---

## Silent / Non-Error Behaviors

| Situation                                                              | Behavior                                      |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| Rule already exists for contact (Add Rule)                             | Silently skip, prompt for next ID             |
| Contact exists in `contactExclusions` when adding to `skippedContacts` | Automatically move it (no prompt, no error)   |
| `excludeIssues` array becomes empty after Delete Rule                  | Automatically remove the entire contact entry |
