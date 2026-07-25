# Company Contact Validation — Implementation Plan

**Source request:** `docs/company-contact.txt`
**Scope:** `src/scripts/googleContactsMaintainer.ts` (the `SCAN_CONTACTS_REPORT.txt` generator) only. No other script, sync flow, or writer is touched.
**Size:** M — one new contact category, 8 new issue types, one new private validation method, and a dedicated test file. Isolated behind a detection gate so existing rules are untouched.

---

## 1. Concept

A **company contact** is a new kind of Google contact that represents a company's office rather than a person. Its canonical shape:

| Field | Rule | Example |
|---|---|---|
| First name | The company name, one word, formatted as a company name | `AnyClip` |
| Last name | `Office ` + the **standard combination** | `Office HR AnyClip` |
| Company field | Exactly the **standard combination** | `HR AnyClip` |
| Each phone label | Exactly the **standard combination** | `HR AnyClip` |
| Each email label | Exactly the **standard combination** | `HR AnyClip` |
| Website URL | `linkedin.com/company/<FirstName>` (case-sensitive) | `linkedin.com/company/AnyClip` |
| Website label | Hardcoded `LinkedIn` | `LinkedIn` |
| Label | Must include `Office` | — |

### Standard combination (decided)

The standard combination is **one** of these three shapes, where `<Company>` is the first name:

- `HR <Company>` — e.g. `HR AnyClip`
- `Job <Company>` — e.g. `Job AnyClip`
- `<Company>` — e.g. `AnyClip`

The combination is **the same string** in three places: the last-name text after `Office `, the Company field, and every phone/email label. Formally the expected combination is:

```
^(HR |Job )?<FirstName>$
```

The last-name text after `Office ` is the reference the other two places (company field, each label) must match byte-for-byte.

---

## 2. Detection gate (decided)

**Decision:** the `Office` label marks a company contact; for those contacts the script runs **only** the 8 company-contact rules below and **skips the entire existing per-contact validation pipeline** (name casing, `INVALID_NAME`, company-match, `linkedin.com/in` URL check, phone/email-label-vs-company, etc.), so a company contact never trips person-oriented rules.

**Detection is a union of the label and the last-name signal** — this is settled, not optional. Pure label detection would make Rule #1 ("contact *must have* the `Office` label") dead code: a contact lacking the label would never enter the company-contact branch, so "missing Office label" could never fire. The union is the only shape under which all 8 rules — Rule #1 included — are reachable:

```
isCompanyContact = hasOfficeLabel  OR  lastNameTrimmed startsWith "Office" (whole word)
```

- `hasOfficeLabel` → `activeLabels` includes `Office` (same `activeLabels` derivation already used in `scanContacts`, i.e. `contact.label.split(' | ')` filtered).
- The last-name signal catches a contact that is clearly meant to be a company contact (`Office …` last name) but forgot the `Office` label → **Rule #1 fires**.
- "Whole word" = last name is exactly `Office` or starts with `Office` followed by a space, so a surname like `Officer` is **not** misdetected.

The two failure modes the union cleanly separates:

| Contact state | Enters branch? | Caught by |
|---|---|---|
| Has `Office` label, wrong/no `Office` last name | yes (via label) | Rules #3–#8 (shape problems) |
| Has `Office …` last name, missing `Office` label | yes (via last name) | **Rule #1** (missing Office label) |

Accepted edge: a real person whose surname legitimately begins with the standalone word "Office" would be pulled in. The whole-word guard makes this near-impossible in practice; accepted as-is.

When `isCompanyContact` is true, the per-contact loop body runs `scanCompanyContact(...)` and then `continue`s — none of the existing per-contact checks execute for that contact. Global duplicate-detection maps (`phoneMap`, `emailMap`, `urlMap`, `nameMap`) are still built for all contacts in the first pass (unchanged), so company contacts remain visible to *other* contacts' duplicate checks; they simply don't run the person rules on themselves.

---

## 3. New issue types — `src/types/maintainer.ts`

Append 8 entries to `MaintainerIssueDefinitions`, IDs **53–60**, following the file's hard rule (never reuse/reassign IDs; only add with the next incremented ID). Placeholders (`#FIXED#`, `#VALUE#`) follow the existing message convention.

```ts
COMPANY_CONTACT_MISSING_OFFICE_LABEL: {
  id: 53, message: 'COMPANY CONTACT MISSING OFFICE LABEL',
},
COMPANY_CONTACT_INVALID_FIRST_NAME: {
  id: 54, message: 'COMPANY CONTACT INVALID FIRST NAME - SHOULD BE: #FIXED#',
},
COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE: {
  id: 55, message: 'COMPANY CONTACT LAST NAME MUST START WITH OFFICE',
},
COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE: {
  id: 56, message: 'COMPANY CONTACT INVALID COMBINATION AFTER OFFICE - SHOULD BE: #FIXED#',
},
COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION: {
  id: 57, message: 'COMPANY CONTACT COMPANY FIELD DOES NOT MATCH COMBINATION - SHOULD BE: #FIXED#',
},
COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION: {
  id: 58, message: 'COMPANY CONTACT PHONE/EMAIL LABEL DOES NOT MATCH COMBINATION: #VALUE#',
},
COMPANY_CONTACT_INVALID_URL: {
  id: 59, message: 'COMPANY CONTACT INVALID URL - SHOULD BE: #FIXED#',
},
COMPANY_CONTACT_INVALID_URL_LABEL: {
  id: 60, message: 'COMPANY CONTACT INVALID URL LABEL - SHOULD BE: LinkedIn',
},
```

No other change is needed in `maintainer.ts`: `MaintainerIssueType`, `issueIdMap`, and `issueOrder` (report sort key) all derive from `MaintainerIssueDefinitions` automatically.

---

## 4. The 8 validation rules → issue mapping

Each rule maps to exactly one new issue type. `combination` below is the reference string = `lastName` with a leading `Office` word stripped (trimmed).

| # | Rule | Fires issue | Condition to flag |
|---|---|---|---|
| 1 | Must have `Office` label | `COMPANY_CONTACT_MISSING_OFFICE_LABEL` (53) | `activeLabels` does **not** include `Office` |
| 2 | First name = company name, one word, formatted as company name | `COMPANY_CONTACT_INVALID_FIRST_NAME` (54) | first name empty, OR contains whitespace (not one word), OR `firstName !== formatCompanyToPascalCase(firstName)` (i.e. not already company-formatted). Custom message: `SHOULD BE: <formatted>` |
| 3 | Last name must start with `Office` | `COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE` (55) | `lastNameTrimmed` is not `Office` and does not start with `Office ` |
| 4 | After `Office`, must be the standard combination | `COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE` (56) | `combination` does not match `^(HR |Job )?<FirstName>$`. Custom message: `SHOULD BE: <FirstName>` (or the intended `HR <FirstName>` / `Job <FirstName>` — see §5 note) |
| 5 | Company field = combination | `COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION` (57) | `contact.company !== combination`. Custom message: `SHOULD BE: <combination>` |
| 6 | Each phone/email label = combination | `COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION` (58) | any phone label or email label `!== combination`. One issue instance; accumulate offending labels in the custom message (`#VALUE#` = the mismatching label(s), one per line, matching the existing multi-line accumulation pattern) |
| 7 | URL = `linkedin.com/company/<FirstName>` | `COMPANY_CONTACT_INVALID_URL` (59) | any website URL (normalized: strip scheme/`www.`/trailing slash) `!== linkedin.com/company/<FirstName>` (case-sensitive). Custom message: `SHOULD BE: linkedin.com/company/<FirstName>`. Also fire if the contact has **no** website at all (company contact must have the LinkedIn URL) |
| 8 | URL label = `LinkedIn` | `COMPANY_CONTACT_INVALID_URL_LABEL` (60) | any website label `!== 'LinkedIn'` |

### Ordering / short-circuit within `scanCompanyContact`

Run rules in the order above and **collect all** applicable issues (do not short-circuit) so one contact can report several company-contact problems at once — consistent with how the existing `scanContacts` accumulates `issues[]`. The only internal dependency: Rule 3 must have established that the last name starts with `Office` before Rule 4 evaluates `combination`; if Rule 3 fails, still compute `combination` as "last name with a leading `Office` word stripped if present, else the whole last name" so Rule 4/5/6 remain meaningful, but this is acceptable secondary noise on a malformed contact. Keep it simple: compute `combination` once, evaluate every rule independently.

---

## 5. Implementation — `src/scripts/googleContactsMaintainer.ts`

### 5.1 Import the formatter

`formatCompanyToPascalCase` is already re-exported from `src/utils/companyFormatter.ts`. Add it to the existing import from `../utils/companyFormatter` (line ~28), alongside `calculateFormattedCompany`.

### 5.2 New private method

Add a private method near `scanContacts`:

```ts
private scanCompanyContact(
  contact: ContactData,
  activeLabels: string[]
): { issues: MaintainerIssueType[]; customMessages: Partial<Record<MaintainerIssueType, string>> }
```

It builds and returns the company-contact issues for a single contact. Pseudocode:

```
firstName = contact.firstName.trim()
lastName  = contact.lastName.trim()

// Rule 1
if !activeLabels.includes('Office') -> push 53

// Rule 2
formattedFirst = formatCompanyToPascalCase(firstName)
if !firstName || /\s/.test(firstName) || firstName !== formattedFirst
  -> push 54, msg SHOULD BE: formattedFirst

// Rule 3
startsWithOffice = lastName === 'Office' || lastName.startsWith('Office ')
if !startsWithOffice -> push 55

// combination = lastName minus a leading 'Office' word
combination = startsWithOffice ? lastName.slice('Office'.length).trim() : lastName

// Rule 4
// suggestedCombination: borrow an HR/Job prefix from the company field as a hint
// (the company field is *supposed* to equal the combination, per Rule 5), else minimal <FirstName>.
prefixMatch = contact.company.trim().match(/^(HR|Job)\s+/)
intendedPrefix = prefixMatch ? prefixMatch[1] + ' ' : ''
suggestedCombination = `${intendedPrefix}${firstName}`
expectedComboRegex = new RegExp('^(HR |Job )?' + escapeRegex(firstName) + '$')
if !expectedComboRegex.test(combination) -> push 56, msg SHOULD BE: suggestedCombination

// Rule 5
if contact.company !== combination -> push 57, msg SHOULD BE: combination

// Rule 6
mismatchedLabels = [...phones, ...emails].map(label).filter(l => l !== combination)
if mismatchedLabels.length -> push 58, msg = mismatchedLabels joined per existing multiline pattern

// Rule 7
expectedUrl = `linkedin.com/company/${firstName}`
if websites.length === 0 -> push 59, msg SHOULD BE: expectedUrl
else for each website: normalize(url) !== expectedUrl -> push 59 (once), msg SHOULD BE: expectedUrl

// Rule 8
for each website: label !== 'LinkedIn' -> push 60 (once)
```

Use a local `Set`/`includes` guard before each `issues.push` (as the existing code does) so an issue type is added at most once. Reuse the existing custom-message accumulation idiom (`if (!customMessages[x]) customMessages[x] = msg; else customMessages[x] += '\n-' + msg;`).

> **§5 note on Rule 4 "SHOULD BE" (decided):** the true intended combination isn't recoverable from a malformed last name, so the suggestion **borrows an `HR `/`Job ` prefix from the Company field** — which Rule #5 says *should* equal the combination — and falls back to the minimal `<FirstName>` when the company field has no valid prefix. Examples: company `HR AnyClip`, last name `Office Sales AnyClip` → `SHOULD BE: HR AnyClip`; company empty/junk → `SHOULD BE: AnyClip`. This borrows the company field only as a **hint for the suggestion text** — it is not validation input, so it creates no Rule #4↔#5 dependency: Rule #5 still independently flags the company field if that field is itself wrong.

### 5.3 Wire into `scanContacts`

Inside the per-contact `for` loop in `scanContacts`, immediately after `activeLabels` is computed (around line 693–701) and **before** the `isHrOrJob` / issue-collection block, insert the gate:

```ts
const lastNameTrimmed = (contact.lastName || '').trim();
const isCompanyContact =
  activeLabels.includes('Office') ||
  lastNameTrimmed === 'Office' ||
  lastNameTrimmed.startsWith('Office ');

if (isCompanyContact) {
  const { issues: ccIssues, customMessages: ccMsgs } =
    this.scanCompanyContact(contact, activeLabels);
  if (ccIssues.length > 0) {
    reportItems.push({
      contact: { ...contact, fullName, biography: contact.biography || '' },
      issues: [...new Set(ccIssues)],
      customIssueMessages: ccMsgs,
    });
  }
  continue; // skip the entire person-oriented pipeline
}
```

`fullName` is already computed just above in the loop; keep the push shape identical to the existing final `reportItems.push` (§ end of `scanContacts`) so `generateReport` renders it unchanged. No `duplicateDetails` for company contacts.

### 5.4 No change to `generateReport`

Report rendering, sorting (`issueOrder`), the `#FOR-BOT#` block, and backup are all order/registry-driven and pick up the new issues automatically. Verify only that the new IDs render (covered by tests).

---

## 6. Exclusions compatibility

`validateExclusionFile` validates that every `excludeIssues` ID is a known ID. IDs 53–60 become valid automatically via `MaintainerIssueDefinitions`. Existing `exclusions.json` files remain valid. No migration needed.

---

## 7. Tests — new file `src/scripts/__tests__/googleContactsMaintainer.companyContact.test.ts`

Follow the existing harness: `TestMaintainerScript` subclass exposing `testScanContacts`, `fs` mocked as in `googleContactsMaintainer.test.ts`. Build company-contact fixtures and assert `issues` contents.

Cover, at minimum:

1. **Fully valid company contact** (label `Office`; first `AnyClip`; last `Office HR AnyClip`; company `HR AnyClip`; phone+email labels `HR AnyClip`; website `linkedin.com/company/AnyClip` label `LinkedIn`) → **no** company-contact issues, and specifically **not** flagged by person rules (`INVALID_NAME`, `PHONE_LABEL_NOT_MATCH_TO_COMPANY_NAME`, `INVALID_URL`, etc.).
2. Valid with the **no-prefix** combination (`Office AnyClip` / company `AnyClip`) → clean.
3. Valid with **Job** prefix → clean.
4. **Missing Office label** but last name `Office AnyClip` → `COMPANY_CONTACT_MISSING_OFFICE_LABEL` (proves the detection union + Rule 1).
5. First name multi-word / lowercase (`any clip`, `anyclip`) → `COMPANY_CONTACT_INVALID_FIRST_NAME` with correct `SHOULD BE`.
6. Last name not starting with `Office` but `Office` label present → `COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE`.
7. `Office <garbage>` after Office (e.g. `Office Sales AnyClip`) → `COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE`.
8. Company field ≠ combination → `COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION`.
9. A phone label and an email label ≠ combination → single `COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION`, message lists both.
10. Wrong URL (`linkedin.com/in/...`, wrong slug, wrong case `anyclip`) and **no** website at all → `COMPANY_CONTACT_INVALID_URL`.
11. URL label not `LinkedIn` → `COMPANY_CONTACT_INVALID_URL_LABEL`.
12. **Regression:** a normal HR/Job/LinkedIn person contact (no `Office` label, last name not `Office …`) is unaffected — none of IDs 53–60 appear, and existing behavior is unchanged.

---

## 8. Verification checklist (run before "done")

```
pnpm tsc --noEmit
pnpm eslint src/scripts/googleContactsMaintainer.ts src/types/maintainer.ts
pnpm vitest run src/scripts/__tests__/googleContactsMaintainer.companyContact.test.ts
pnpm vitest run src/scripts/__tests__/googleContactsMaintainer.test.ts
```

Full-suite `/test` should stay green (the change is additive and gated).

---

## 9. Files touched

| File | Change |
|---|---|
| `src/types/maintainer.ts` | +8 issue definitions (IDs 53–60) |
| `src/scripts/googleContactsMaintainer.ts` | import `formatCompanyToPascalCase`; new `scanCompanyContact` method; detection gate + `continue` in `scanContacts` |
| `src/scripts/__tests__/googleContactsMaintainer.companyContact.test.ts` | new test file (§7) |

## 10. Notes for the executing agent

- **Detection union (§2) — settled.** Implement the label-OR-`Office …`-last-name union exactly as written; it is required for Rule #1 to be reachable, not an option to revisit.
- **Rule 4 `SHOULD BE` (§5) — settled.** Borrow the `HR `/`Job ` prefix from the Company field for the suggestion text, falling back to minimal `<FirstName>`; do not treat the company field as validation input.
- `formatCompanyToPascalCase` idempotency was **verified**: `AnyClip`→`AnyClip` (internal caps preserved, `companyUtils.ts:76`), `anyclip`/`ANYCLIP`→`Anyclip`, `Google`→`Google`. Rule 2's strict-equality check is therefore sound. One residual edge: `preprocessIsraeliCityCompanyWords` can rewrite specific city tokens (e.g. `telaviv`→`TelAviv`); if a real company's first name is a single such token, Rule 2's `SHOULD BE` will suggest the rewritten form — acceptable, but note it if a false positive surfaces.
