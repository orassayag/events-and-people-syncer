# LinkedIn Sync Mixed Hebrew-English Display Fix

## Problem Analysis

From the attached image, the current output shows:

- **Current display**: `Israel National Cyber Directorate - מערך הסייבר הלאומי`
- **Expected display**: `מערך הסייבר הלאומי - Israel National Cyber Directorate`
- **Current calculated label**: `IsraelNationalCyberDirectorate` (includes spaces removed, correct)
- **Issue**: The calculated label uses the full company name which includes Hebrew characters

## Changes Required

### 1. Display Format Fix (All Text Fields)

Create a new utility function `formatMixedHebrewEnglish` in [`src/utils/hebrewFormatter.ts`](../src/utils/hebrewFormatter.ts) that:

- Detects Hebrew and English portions in text
- Returns format: `<Hebrew> - <English>` when both exist
- Returns just the text when only one language is present
- **IMPORTANT**: Replace ALL calls to `formatHebrewText()` with `formatMixedHebrewEnglish()` to avoid double processing of Hebrew text
- Apply to ALL text fields (firstName, lastName, company, label, position) in:
  - Status bar display ([`src/flow/syncStatusBar.ts`](../src/flow/syncStatusBar.ts) lines 182-192, 196-203)
  - Alert display ([`src/scripts/linkedinSync.ts`](../src/scripts/linkedinSync.ts) lines 638, 643, 773, 779)

### 2. Calculated Label Extraction

Modify [`src/services/linkedin/contactSyncer.ts`](../src/services/linkedin/contactSyncer.ts):

- Extract **English-only** portion from company name before `formatCompanyToPascalCase`
- Create new helper function `extractEnglishFromMixed(company: string): string` in `hebrewFormatter.ts`
- **Order of operations** (critical):
  1. `cleanCompany()` - removes suffixes and splits on separators
  2. `extractEnglishFromMixed()` - extracts only English characters
  3. `formatCompanyToPascalCase()` - converts to PascalCase for labels
- **Reasoning**: Clean first to remove "Inc.", "Ltd.", etc., then extract English from the cleaned result. If we extract English first, the separator logic in `cleanCompany()` might split on the dash between Hebrew and English, leaving only Hebrew.
- Apply this to lines 41-44 (addContact) and lines 183-185 (updateContact)
- If company has ONLY Hebrew text → return empty string (no company label appended)
- The formatted label will be used in:
  - Email labels (line 44, 185): `${label} ${formattedCompany}`.trim()
  - Last name composition (lines 45-52, 186-193): filtered array joins, empty strings automatically removed

### 3. Helper Functions

**New function: `extractEnglishFromMixed` (in hebrewFormatter.ts)**

- Use regex pattern `ENGLISH_EXTRACTION` from RegexPatterns to identify English characters
- Pattern: `/[A-Za-z0-9\s\-'&.]+/g` (includes numbers, hyphens, apostrophes, ampersands, periods)
- Ignore Hebrew characters (range 0x0590-0x05FF) completely
- Trim and clean extracted English text
- Return empty string if no English found
- Edge cases handled:
  - "O'Brien Technologies" → "O'Brien Technologies"
  - "AT&T Inc." → "AT&T Inc."
  - "3M Company" → "3M Company"
  - "Hewlett-Packard" → "Hewlett-Packard"
  - "מערך הסייבר הלאומי" → ""

**Enhanced function: `formatMixedHebrewEnglish` (in hebrewFormatter.ts)**

- Split text into Hebrew and English segments
- Reverse Hebrew characters for proper RTL display (reuse existing logic from `formatHebrewText`)
- Return `<Hebrew> - <English>` format when both exist
- Return just Hebrew when only Hebrew exists
- Return just English when only English exists
- Handle empty strings gracefully (return empty string, not " - ")
- Edge cases handled:
  - "מערך הסייבר הלאומי - Israel National Cyber Directorate" → "מערך הסייבר הלאומי - Israel National Cyber Directorate"
  - "Israel National Cyber Directorate - מערך הסייבר הלאומי" → "מערך הסייבר הלאומי - Israel National Cyber Directorate"
  - "Microsoft ישראל" → "ישראל - Microsoft"
  - "Microsoft" → "Microsoft"
  - "מיקרוסופט" → "מיקרוסופט"
  - "" → ""

## Implementation Details

**Files to modify:**

1. [`src/regex/patterns.ts`](../src/regex/patterns.ts) - Add new regex patterns:
   - `ENGLISH_EXTRACTION = /[A-Za-z0-9\s\-'&.]+/g`
   - `HEBREW_SEGMENT = /[\u0590-\u05FF\uFB1D-\uFB4F]+/g` (includes Hebrew presentation forms)
2. [`src/utils/hebrewFormatter.ts`](../src/utils/hebrewFormatter.ts) - Add new formatting functions
3. [`src/services/linkedin/contactSyncer.ts`](../src/services/linkedin/contactSyncer.ts) - Use English extraction in correct order
4. [`src/flow/syncStatusBar.ts`](../src/flow/syncStatusBar.ts) - Replace formatHebrewText with formatMixedHebrewEnglish for ALL fields
5. [`src/scripts/linkedinSync.ts`](../src/scripts/linkedinSync.ts) - Apply mixed format to alert display

**Key Logic:**

- English extraction: Match `[A-Za-z0-9\s\-'&.]+` and ignore Hebrew chars (0x0590-0x05FF range)
- Display format: Always Hebrew first (if exists), then `-`, then English (if exists)
- Label calculation: Clean → Extract English → Convert to PascalCase
- Display spacing: Use `.trim()` on email labels to avoid trailing spaces when formattedCompany is empty

**Original company value preservation:**

- The original company name stored in the connection object is NOT modified
- Only the calculated label (for email type and last name suffix) changes
- Display formatting is applied at presentation layer only

## Implementation Checklist

- [ ] Add regex patterns `ENGLISH_EXTRACTION` and `HEBREW_SEGMENT` to RegexPatterns class
- [ ] Add `extractEnglishFromMixed` and `formatMixedHebrewEnglish` functions to hebrewFormatter.ts
- [ ] Modify contactSyncer.ts to extract English-only text in correct order: clean → extract → format
- [ ] Update email label line to use `.trim()`: `const emailLabel: string = \`\${label} \${formattedCompany}\`.trim();`
- [ ] Replace ALL formatHebrewText calls with formatMixedHebrewEnglish in syncStatusBar.ts (lines 182-192, 196-203)
- [ ] Apply formatMixedHebrewEnglish to alert display in linkedinSync.ts (lines 638, 643, 773, 779)
- [ ] Add comprehensive unit tests for hebrewFormatter.ts functions
- [ ] Add integration test for full flow: mixed company → correct display + correct label

## Expected Results

**Before:**

```
-Full name: kaldidan Asmara HR מערך הסייבר הלאומי Israel National Cyber Directorate -
-Company: מערך הסייבר הלאומי Israel National Cyber Directorate -
-Email: (none) HR IsraelNationalCyberDirectorateמערךהסייברהלאומי
```

**After:**

```
-Full name: kaldidan Asmara HR IsraelNationalCyberDirectorate
-Company: מערך הסייבר הלאומי - Israel National Cyber Directorate
-Email: (none) HR IsraelNationalCyberDirectorate
```

## Test Coverage Required

### Unit Tests (hebrewFormatter.test.ts)

**`extractEnglishFromMixed` tests:**

1. Mixed Hebrew-English with dash: "מערך הסייבר הלאומי - Israel National Cyber Directorate" → "Israel National Cyber Directorate"
2. English first with dash: "Israel National Cyber Directorate - מערך הסייבר הלאומי" → "Israel National Cyber Directorate"
3. Mixed without separator: "Microsoft ישראל" → "Microsoft"
4. Hebrew only: "מערך הסייבר הלאומי" → ""
5. English only: "Microsoft Corporation" → "Microsoft Corporation"
6. Empty string: "" → ""
7. Company with numbers: "3M Company - חברה" → "3M Company"
8. Company with apostrophe: "O'Brien Technologies - חברת" → "O'Brien Technologies"
9. Company with ampersand: "AT&T - חברת תקשורת" → "AT&T"
10. Company with hyphen: "Hewlett-Packard - חברה" → "Hewlett-Packard"
11. Multiple English segments: "Microsoft - מיקרוסופט - Israel" → "Microsoft Israel"
12. Whitespace only: " " → ""

**`formatMixedHebrewEnglish` tests:**

1. Mixed Hebrew-English with dash: "מערך הסייבר הלאומי - Israel National Cyber Directorate" → "מערך הסייבר הלאומי - Israel National Cyber Directorate" (Hebrew properly reversed)
2. English first with dash: "Israel National Cyber Directorate - מערך הסייבר הלאומי" → "מערך הסייבר הלאומי - Israel National Cyber Directorate" (reordered)
3. Mixed without separator: "Microsoft ישראל" → "ישראל - Microsoft"
4. Hebrew only: "מערך הסייבר הלאומי" → "מערך הסייבר הלאומי" (Hebrew properly reversed)
5. English only: "Microsoft Corporation" → "Microsoft Corporation"
6. Empty string: "" → ""
7. Multiple segments: "Microsoft - מיקרוסופט - Israel" → "מיקרוסופט - Microsoft Israel"
8. Whitespace only: " " → ""
9. Hebrew with English number: "מערך 8200" → "מערך 8200" (preserve together)
10. Mixed name: "John יוחנן" → "יוחנן - John"

**Integration test:**

- Full flow: "Microsoft Corporation - מיקרוסופט" → Display: "מיקרוסופט - Microsoft" → Label: "Microsoft" → PascalCase: "Microsoft"

### Edge Case Tests

1. Hebrew-only company produces empty formattedCompany → emailLabel trims correctly
2. Display lines handle empty formattedCompany without trailing spaces
3. Existing logic (filter empty strings) works correctly for lastName composition

## Date

March 22, 2026
