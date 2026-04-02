# Contacts Sync Script - Behavior Documentation

## Skipped Counter Logic

The `skipped` counter tracks contacts that were displayed to the user but not successfully updated. This provides transparency in the final summary about how many contacts were viewed but not fixed.

### When Skipped Counter Increments:

1. **User Declines to Edit (Line 109 in contactsSync.ts)**
   - Contact is displayed with reasons
   - User answers "No" to "Would you like to edit this contact?"
   - Counter increments: `this.stats.skipped++`
   - Behavior: Moves to next contact in queue

2. **User Cancels During Edit (Line 129 in contactsSync.ts)**
   - User starts editing
   - User selects "Cancel" from edit menu
   - Error thrown: `Error('User cancelled')`
   - Counter increments: `this.stats.skipped++`
   - Behavior: Returns to main menu, changes discarded

3. **Update Fails with Error (Line 134 in contactsSync.ts)**
   - User completes editing
   - API call fails or other error occurs
   - Counter increments: `this.stats.skipped++`
   - Behavior: Error logged, user notified, returns to main menu

### When Skipped Counter Does NOT Increment:

1. **Contact Successfully Updated (Line 126)**
   - User completes editing
   - Changes saved successfully
   - Counter increments: `this.stats.updated++`
   - Note: Skipped counter unchanged

2. **Contact Added (Line 147)**
   - User successfully creates new contact
   - Counter increments: `this.stats.added++`
   - Note: Skipped counter unchanged

### Rationale:

The skipped counter provides users with insight into:
- How many contacts they reviewed but chose not to fix
- How many contacts they started editing but abandoned
- How many contacts failed to update due to errors

This helps users understand:
- Total work completed vs. remaining
- Whether they need to re-run the script
- If there are systemic issues causing failures

### Example Summary Output:

```
=================Contacts Sync Summary=================
========Added: 00,001 | Updated: 09,042 | Skipped: 00,023========
=======================================================
```

In this example:
- 1 contact was created via "Add Contact" flow
- 9,042 contacts were successfully fixed
- 23 contacts were viewed but not updated (declined, cancelled, or failed)

---

## Hebrew-to-English Conversion Workflow

The contacts sync allows iterative Hebrew-to-English conversion across multiple sessions.

### Why Hebrew Is Allowed During Editing:

The `allowHebrew: true` parameter in validation is critical because:

1. **Contacts contain existing Hebrew** - Users need to see the current state
2. **Incremental fixing** - Users may fix one field at a time
3. **Partial sessions** - Users may not complete all fields in one sitting
4. **Multi-session workflow** - Same contact may be fixed across multiple sessions

### Workflow Example:

#### Session 1 (13/03/2026):
- **Before**: 
  - firstName: "יוסי"
  - lastName: "כהן"
  - company: "אלביט מערכות"
  - note: ""
- **User fixes**: firstName only
- **After**:
  - firstName: "Yossi"
  - lastName: "כהן" (still Hebrew)
  - company: "אלביט מערכות" (still Hebrew)
  - note: "Updated by the contacts sync script - Last update: 13/03/2026"

#### Session 2 (14/03/2026):
- **Before**: (State from Session 1)
- **User fixes**: lastName and company
- **After**:
  - firstName: "Yossi"
  - lastName: "Cohen"
  - company: "Elbit Systems"
  - note: "Updated by the contacts sync script - Last update: 14/03/2026"

#### Result:
- Contact is detected as needing fixing in both sessions (Hebrew present)
- "Updated by..." note allows contact to be included in fix list again
- User gradually converts all Hebrew to English

### Validation Behavior:

```typescript
// In contactEditor.ts - all text validations allow Hebrew:
validate: (input: string) => InputValidator.validateText(input, true)
//                                                             ^^^^
//                                                        allowHebrew = true
```

This means:
- ✅ Hebrew input accepted during editing
- ✅ English input accepted during editing
- ✅ Mixed Hebrew/English accepted during editing
- ✅ User can convert field-by-field

---

## Missing Field Detection Consistency

The `isMissingField()` helper method provides consistent null/undefined/empty detection across all field checks.

### Helper Method (contactSyncer.ts, lines 247-249):

```typescript
private isMissingField(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
```

### Usage Patterns:

#### Single Text Fields (Consistent):
```typescript
if (this.isMissingField(contact.jobTitle)) {
  missing.push('Missing job title');
}
```

#### Array Fields (Also Consistent):
```typescript
// Checks if array is empty OR all values are missing
if (!contact.emails || contact.emails.length === 0 || 
    contact.emails.every((e) => this.isMissingField(e.value))) {
  missing.push('Missing email');
}
```

### What is Checked:

1. **null** - Field explicitly set to null
2. **undefined** - Field not set or optional field missing
3. **Empty string** - Field set to ""
4. **Whitespace only** - Field set to "   " (trimmed to "")

### Why This Matters:

Google Contacts API can return fields in various states:
- Some fields may be `undefined` (not present in API response)
- Some fields may be `null` (explicitly cleared)
- Some fields may be `""` (empty string)
- Some fields may be `"   "` (whitespace only)

The `isMissingField()` method handles all these cases consistently, ensuring:
- Contacts with any form of "missing" data are detected
- Priority categorization works correctly
- No false positives (e.g., whitespace-only fields treated as present)

---

## LinkedIn URL Hebrew Exclusion

LinkedIn URLs are explicitly excluded from Hebrew detection because LinkedIn normalizes all URLs to ASCII format.

### Implementation (contactSyncer.ts, lines 209-221):

```typescript
private checkHebrewInAllFields(contact: ContactData): boolean {
  const fieldsToCheck = [
    contact.firstName,
    contact.lastName,
    contact.company,
    contact.jobTitle,
    contact.label,
    contact.note || '',
    ...contact.emails.map((e) => e.value),
    ...contact.phones.map((p) => p.number),
    // Note: websites array is NOT checked
  ];
  return fieldsToCheck.some((field) => field && RegexPatterns.HEBREW.test(field));
}
```

### Rationale:

LinkedIn automatically converts all profile URLs to ASCII format:
- "יוסי כהן" → `linkedin.com/in/yossi-cohen`
- "محمد علي" → `linkedin.com/in/mohammed-ali`
- "北京" → `linkedin.com/in/beijing`

Therefore:
- ✅ LinkedIn URLs will NEVER contain Hebrew characters
- ✅ Including websites in Hebrew check would be wasteful
- ✅ Focus Hebrew detection on user-editable fields

### Test Coverage:

See `hebrewWorkflow.test.ts` for comprehensive test coverage of:
- Hebrew detection in all relevant fields
- Hebrew exclusion from LinkedIn URLs
- Hebrew-to-English conversion workflows
- Iterative fixing across multiple sessions
