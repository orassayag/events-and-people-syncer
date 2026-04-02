# LinkedIn-Sync Script Implementation Plan

## Overview

This script fetches LinkedIn connections from an exported CSV file and syncs them into Google Contacts via the People API. It will run via `pnpm run linkedin-sync` and support intelligent matching, updates, and detailed progress tracking.

## Architecture & Structure

### Core Components

1. **Script Entry Point**: `src/scripts/linkedinSync.ts`
   - Registers as batch script in `src/scripts/index.ts`
   - Uses existing runner infrastructure (`src/runner.ts`)

2. **Services Layer**:
   - `src/services/linkedin/linkedinExtractor.ts` - ZIP extraction and CSV parsing
   - `src/services/linkedin/companyMatcher.ts` - Company to label mapping with caching
   - `src/services/linkedin/connectionMatcher.ts` - Match LinkedIn connections to Google contacts
   - `src/services/linkedin/contactSyncer.ts` - Add/update contacts via People API

3. **Types & Schemas**:
   - `src/types/linkedin.ts` - LinkedIn connection types
   - `src/entities/linkedinConnection.schema.ts` - Zod validation schemas
   - Extended `ContactData` with `resourceName` and `score` fields

4. **Supporting Infrastructure**:
   - `src/cache/companyCache.ts` - File-based cache for company mappings
   - `src/flow/syncStatusBar.ts` - Enhanced status bar for sync operations
   - `src/logging/syncLogger.ts` - Dedicated logger with history tracking

### File Structure

```
src/
├── scripts/
│   ├── index.ts (register linkedin-sync)
│   └── linkedinSync.ts (main script)
├── services/
│   └── linkedin/
│       ├── index.ts
│       ├── linkedinExtractor.ts
│       ├── companyMatcher.ts
│       ├── connectionMatcher.ts
│       └── contactSyncer.ts
├── types/
│   └── linkedin.ts
├── entities/
│   └── linkedinConnection.schema.ts
├── cache/
│   └── companyCache.ts
├── flow/
│   └── syncStatusBar.ts
└── logging/
    └── syncLogger.ts
```

## Detailed Implementation

### Phase 1: ZIP Extraction & CSV Parsing

**Service**: `linkedinExtractor.ts`

**Logic Flow**:

1. Search for ZIP file in `/sources` folder:
   - Exact name match from settings
   - Fallback: filename contains "linkedin", "data", or "export" (case-insensitive)
   - Throw error if not found
2. Check for cached `connections.csv`:
   - Cache location: `/sources/.cache/connections.csv`
   - Timestamp check: use if < 1 day old
   - If cache valid, skip extraction
3. Extract ZIP using `adm-zip`:
   - Search for `connections.csv` (case-insensitive)
   - Extract only this file to cache location
   - Delete other extracted content
   - Throw error if CSV not found or empty
4. Parse CSV:
   - Extract columns: First Name, Last Name, URL, Email Address, Company, Position, Connected On
   - Generate unique ID from URL postfix (e.g., "gevit-azulay-hrdirector")
   - Validate using Zod schema
   - Return array of `LinkedInConnection` objects

**Required vs Optional Fields**:

**Required** (missing = skip row with "Skipped" status):
- First Name
- Last Name  
- LinkedIn URL

**Optional** (missing = empty string):
- Email Address
- Company
- Position
- Connected On

**Special Characters**: No restrictions - Hebrew, emojis, non-Latin scripts all allowed.

**Error Handling**:

- ZIP not found → Throw error with clear message
- Extraction failed → Throw error with adm-zip details
- CSV not found in ZIP → Throw error
- Empty CSV → Throw error
- Invalid row format (missing required fields) → Skip row, mark as "Skipped", log details
- File system errors (permissions, disk full) → Throw error

### Phase 2: Company Label Mapping

**Service**: `companyMatcher.ts`

**Cache**: `companyCache.ts`

**Logic Flow**:

1. Scan `/dummy/job-interviews` directory (configurable via `settings.ts`)
2. Extract company entities from folder names:
   - **Required Pattern**: `{Label}_{CompanyName}` (split on FIRST underscore only)
   - Example: `Job_ElbitSystems` → Label: "Job", Company: "ElbitSystems"
   - Example: `HR_AddedValue` → Label: "HR", Company: "AddedValue"
   - Example: `Job_Coca_Cola` → Label: "Job", Company: "Coca_Cola" (allows underscores in company name)
   - **Invalid patterns** (throw error immediately, fail fast):
     - Missing underscore: `JobElbitSystems`
     - Wrong separator: `Job-ElbitSystems`
     - Empty label: `_CompanyName`
     - Empty company: `Job_`
     - Multiple underscores in folder name: Throw error (folder structure issue)
3. Cache structure:
   ```typescript
   interface CompanyMapping {
     label: string;
     companyName: string;
   }
   
   interface CompanyCacheData {
     timestamp: number;
     mappings: CompanyMapping[];
   }
   ```
4. Cache validation:
   - Check if cache file exists: `/sources/.cache/company-mappings.json`
   - If exists and timestamp < 1 day, use cached data
   - Otherwise, re-scan and re-cache
5. Matching algorithm (both strategies):
   - **Step 1: Clean company name** - Remove common suffixes:
     - Remove: Inc, Ltd, LLC, GmbH, Corp, Corporation, Co, Company, Limited
     - Case-insensitive removal
     - Trim whitespace after removal
     - "Planview, Inc." → "Planview"
     - "Microsoft Corporation" → "Microsoft"
   - **Step 2: Extract primary name** - Split on separators:
     - Split on: comma, pipe (|), dash (-), or multiple spaces
     - Take first segment
     - "Planview – International" → "Planview"
   - **Step 3: Match using "contains" strategy**:
     - Normalize both names (lowercase, trim)
     - Check if cleaned LinkedIn company name contains folder company name
     - OR if folder company name contains LinkedIn company name
     - "planview" contains "planview" ✓
     - "planviewinternational" contains "planview" ✓
   - **Step 4: CamelCase splitting** (if needed):
     - Split camelCase: "ElbitSystems" → ["Elbit", "Systems"]
     - Check if any segment matches (contains logic)
   - If match found, return label
   - If no match, default to "Job"

**Cache Implementation**:

- File location: `sources/.cache/company-mappings.json` (gitignored)
- TTL: 24 hours
- Structure: `CompanyCacheData` interface (see above)

### Phase 3: Connection Matching

**Service**: `connectionMatcher.ts`

**Leverages**: Existing `DuplicateDetector` from `src/services/contacts/duplicateDetector.ts`

**Matching Strategy (Priority Order)**:

1. **LinkedIn URL** (Exact match, case-insensitive):
   - **Validate URL** first:
     - Must contain `/in/` pattern (personal profile)
     - If missing, company URL, or invalid → Skip with "Skipped" status
     - Example valid: `https://www.linkedin.com/in/john-doe`
     - Example invalid: `https://www.linkedin.com/company/microsoft`
   - Normalize URL (remove protocol, trailing slash, query params, handle mobile URLs)
   - Extract profile slug (e.g., "gevit-azulay-hrdirector")
   - Compare with website URLs in Google contacts
   - Use enhanced `DuplicateDetector.checkDuplicateLinkedInUrl()`
   - **Multiple matches** (2+) → Mark as "Need Clarification"
2. **Email** (Exact match, **case-sensitive**):
   - Use `DuplicateDetector.checkDuplicateEmail()`
   - **Multiple matches** (2+) → Mark as "Need Clarification"
3. **Name Fuzzy Match**:
   - Use enhanced `DuplicateDetector.checkDuplicateName()` (returns score)
   - Threshold: 0.2 (same as POC)
   - Uses Fuse.js already implemented
   - **Multiple matches** (2+) → Mark as "Need Clarification"

**Fuzzy Matching Score Ranges**:

Fuse.js uses distance-based scoring where **lower score = better match**:

| Score Range | Quality | Action | Example |
|------------|---------|---------|---------|
| **0.0 - 0.2** | Excellent-Good | ✅ **Accept Match** | "John Smith" → "Jon Smith" (minor typo) |
| **0.2 - 0.4** | Borderline | ⚠️ **Need Clarification** | "John Smith" → "John S" (abbreviated) |
| **> 0.4** | Poor | ❌ **No Match** | "John Smith" → "Jane Doe" (different person) |

**Implementation Logic**:
```typescript
if (score <= 0.2) {
  // Good match - accept and process
  return { matchType: 'FUZZY', action: 'ACCEPT' };
} else if (score <= 0.4) {
  // Borderline - skip and log for manual review
  return { matchType: 'UNCERTAIN', action: 'CLARIFICATION' };
} else {
  // Poor match - treat as no match found
  return { matchType: 'NONE', action: 'CREATE_NEW' };
}
```

**Score Explanation**:
- **0.0**: Perfect match (identical strings)
- **0.1-0.2**: Good match (minor typos, spacing issues, missing characters)
- **0.2-0.4**: Uncertain (could be same person with variations, needs human verification)
- **0.4+**: Different person (completely different names)

**Enhanced DuplicateMatch Interface**:

```typescript
interface DuplicateMatch {
  contact: ContactData;
  similarityType: SimilarityType;
  score?: number; // Fuzzy match score from Fuse.js (0-1, lower = better)
}
```

**Enhanced ContactData Interface** (add to existing):

```typescript
interface ContactData {
  // ... existing fields ...
  resourceName?: string; // Google contact resource ID (e.g., "people/c1234567890")
}
```

**Match Result Types**:

```typescript
enum MatchType {
  EXACT = "exact", // URL or Email match (1 match only)
  FUZZY = "fuzzy", // Name fuzzy match within threshold (1 match only)
  UNCERTAIN = "uncertain", // Multiple matches OR fuzzy score 0.2-0.4
  NONE = "none", // No match, create new
}
```

**"Need Clarification" Criteria**:

- Multiple matches found (2+ contacts with same LinkedIn URL/email/name)
- Fuzzy score between 0.2-0.4 (borderline match) - see Fuzzy Matching section below
- Only email or only name matches, but not both
- Company name similar but label doesn't match
- Any ambiguity in primary identifiers
- Duplicate LinkedIn URLs within the CSV (second occurrence onwards)

**"Need Clarification" Action**: 
- **Skip the contact** - do not add or update
- Log to separate file for manual review
- User will add rules or fix manually later

**Need Clarification Logging**:
- Separate log file: `logs/linkedin-sync/need-clarification-{timestamp}.log`
- Contains: LinkedIn connection details, matched contact(s), similarity scores, reasons

### Phase 4: Contact Add/Update

**Service**: `contactSyncer.ts`

**ADD Flow** (No match found):

Transform LinkedIn connection to Google Contact:

```typescript
First Name: Elena
Last Name: Ohayon HR Planview  // Format: "{LastName} {Label} {Company}"
Company: Planview               // Extract first word before comma
Job Title: Senior HR Manager, HRBP IL and International
Label: HR Planview              // From company matcher
Email: eeisenstorg@gmail.com | Label: HR Planview
Website: https://www.linkedin.com/in/elena-ohayon-b22b583 | Label: HR Planview
```

**Field Mapping Rules**:

- **First Name**: Direct from CSV (trim whitespace)
- **Last Name**: `{CSV Last Name} {Label} {Company First Word}`
  - **Edge case**: If CSV Last Name is empty, use `{Label} {Company First Word}` (no leading space)
  - Example: Last Name is "" → "HR Planview" (not " HR Planview")
  - **Critical**: Trim all whitespace - no leading/trailing spaces ever
- **Company**: Clean and extract from CSV company
  - Remove suffixes: Inc, Ltd, LLC, GmbH, Corp, Corporation, Co, Company, Limited
  - Split on separators: comma, pipe, dash
  - Take first segment and **trim whitespace**
  - If result is empty after cleaning, use original company name (trimmed)
  - Example: "Planview, Inc." → "Planview"
  - Example: "Inc." → "Inc." (keep original if cleaning results in empty)
- **Job Title**: Direct from CSV Position (trim whitespace)
- **Contact Group (Label)**: Manage groups carefully to avoid duplicates
  - Fetch all existing groups at script start using `contactGroups.list()`
  - Build in-memory map: name → resourceName
  - When adding contact to group:
    - Check if group exists in map
    - If exists, use resourceName
    - If NOT exists (rare):
      - Create new group using `contactGroups.create()`
      - **Re-fetch all groups** to get new resourceName
      - Update in-memory map
      - Use new resourceName for contact
  - This prevents race conditions and ensures consistency
- **Email**: Validate email format before adding
  - Use Zod schema validation (create email validation schema)
  - Invalid emails → skip adding, log warning
  - Valid emails → check if already exists (case-sensitive)
  - Trim whitespace from email value
- **Email Label**: `{Label} {Company}` (e.g., "HR Planview")
  - This is the email's `type` field, NOT a contact group
  - Custom type strings are accepted by People API (verified in POC)
  - Trim whitespace from label
  - Check case-sensitive exact match before adding
  - If email already exists (exact match), skip adding
- **Website Label**: Always hardcoded to "LinkedIn"
  - Check existing website URLs during UPDATE
  - If LinkedIn URL exists but label is NOT "LinkedIn", update label to "LinkedIn"
  - Always use "LinkedIn" for new LinkedIn URLs
- **Phone**: Not added (LinkedIn doesn't export phones)

**Critical Whitespace Rule**: 
- **ALL fields must be trimmed** - no leading or trailing spaces, ever
- Apply `.trim()` to every string field before use
- This applies to: firstName, lastName, company, jobTitle, email values, labels, URLs

**Note**: Hebrew characters, emojis, and all special characters are allowed.

**UPDATE Flow** (Match found):

**Fields to UPDATE** (if different):

- Last Name (append label+company if needed, handle empty last name)
- Job Title
- Website URL label (change to "LinkedIn" if currently not "LinkedIn")

**Fields to ADD** (if new):

- Email (never delete existing, only add if not exact match - case-sensitive)
- Website URL (if LinkedIn URL doesn't exist)

**Fields to NEVER change**:

- First Name
- Company name
- Existing contact group memberships
- Phone numbers
- Website URL values (only update labels)

**Update Strategy**:

- Use `resourceName` from match result to identify contact
- Fetch current contact via People API using resourceName
- Compare fields (trim all values before comparison)
- Build update request with only changed/added fields
- **Use People API exactly as in POC**:
  - Method: `service.people.createContact()` for new contacts
  - Method: Contact updates handled per POC patterns
  - Follow POC implementation exactly (verified working)
- **500ms delay** after each write operation (create or update)
  - Prevents rate limiting
  - Applies only to write operations, not reads

### Phase 5: Status Tracking & Logging

**Enhanced Status Bar**: `syncStatusBar.ts`

Extends existing `StatusBar` class to show:

```
⠋ Fetching Google Contacts: 8,234 / ~10,000
⠋ Processing: 9,464 | New: 1,233 | Up-To-Date: 8,934 | Updated: 6,999 | Error: 34 | Need clarification: 56 | Skipped: 3
```

**Progress Indicator**:
- Animated spinner (like POC): ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
- **Phase 1**: Initial contact fetch: `⠋ Fetching Google Contacts: 8,234 contacts fetched...`
  - No total count shown (API doesn't provide it)
  - Show running count during fetch
  - Final count shown when complete: `✓ Fetched 10,234 contacts`
- **Phase 2**: Processing sync: `⠋ Processing: 9,464 | New: 1,233 | ...`
- Updates in real-time during sync

**Status Categories**:

- **New**: Successfully created new contacts
- **Up-To-Date**: Contact exists, no changes needed
- **Updated**: Contact updated with new information
- **Need clarification**: Uncertain match, flagged for review
- **Error**: Failed to add/update (API error, validation error)
- **Skipped**: Invalid data, couldn't process
  - Reasons: missing required fields, invalid URL, invalid email, duplicate URL in CSV
  - Log partial data for debugging:
    - Which required field was missing
    - What values were present
    - Reason for skipping
  - For duplicate URLs in CSV: first occurrence processed, subsequent marked as skipped

**Logging**: `syncLogger.ts`

Create dedicated logger with history tracking:

- **Log Directory**: `logs/linkedin-sync/`
- **Main Log File**: `sync-{timestamp}.log`
  - Summary stats (counts per category)
  - Detailed entries for each connection processed
  - Errors with stack traces
  - API call counts
- **Need Clarification Log**: `need-clarification-{timestamp}.log` (separate file)
  - LinkedIn connection details (name, email, company, URL)
  - All matched Google contact(s) with details
  - Similarity scores and types
  - Reason for clarification (multiple matches, low score, etc.)
  - Human-readable format for manual review

**Final Summary Output**:

```
LinkedIn Sync Complete
======================
Total Connections: 11,259
New: 1,233
Up-To-Date: 8,934
Updated: 6,999
Need Clarification: 56
Errors: 34
Skipped: 3

API Calls:
  Read: 15
  Write: 8,232

Duration: 5m 23s
Log Files:
  - Main: logs/linkedin-sync/sync-2026-03-11T14-30-00.log
  - Need Clarification: logs/linkedin-sync/need-clarification-2026-03-11T14-30-00.log (56 entries)
```

### Phase 6: Cleanup

After sync completion:

1. Delete extracted `connections.csv` from cache (optional, based on settings)
2. Clear in-memory contact cache (`ContactCache.getInstance().invalidate()`)
3. Update API stats

## Settings Configuration

Add to `src/settings/settings.ts`:

```typescript
linkedin: {
  zipFileName: 'Basic_LinkedInDataExport_03-11-2026.zip',
  sourcesPath: join(__dirname, '..', '..', 'sources'),
  cachePath: join(__dirname, '..', '..', 'sources', '.cache'),
  companyFoldersPath: join(__dirname, '..', '..', 'dummy', 'job-interviews'),
  cacheExpirationDays: 1,
  defaultLabel: 'Job',
  deleteAfterSync: false,
  bypassContactCache: false, // Set to true to re-fetch contacts, ignoring cache
  companySuffixesToRemove: ['Inc', 'Ltd', 'LLC', 'GmbH', 'Corp', 'Corporation', 'Co', 'Company', 'Limited'],
  writeDelayMs: 500, // Delay after each write operation
},
```

**Note on bypassContactCache**: When enabled, show warning:
```
⚠️  Contact cache bypassed - fetching fresh data from Google Contacts
```

## Package Dependencies

Add required packages to `package.json`:

```bash
pnpm add adm-zip csv-parse
pnpm add -D @types/adm-zip
```

**Package Purposes**:
- `adm-zip`: ZIP file extraction
- `csv-parse`: Robust CSV parsing with support for quoted fields, escaped commas, etc.

## Error Codes

Add to `src/errors/errorCodes.ts`:

```typescript
LINKEDIN_ZIP_NOT_FOUND = 2004001,
LINKEDIN_CSV_NOT_FOUND = 2004002,
LINKEDIN_CSV_EMPTY = 2004003,
LINKEDIN_EXTRACTION_FAILED = 2004004,
LINKEDIN_INVALID_CONNECTION = 2004005,
LINKEDIN_INVALID_FOLDER_PATTERN = 2004006,
LINKEDIN_FILE_SYSTEM_ERROR = 2004007,
LINKEDIN_CSV_VALIDATION_FAILED = 2004008,
LINKEDIN_MULTIPLE_CSV_FILES = 2004009,
LINKEDIN_INVALID_PROFILE_URL = 2004010,
LINKEDIN_ZIP_PASSWORD_PROTECTED = 2004011,
LINKEDIN_CSV_ENCODING_ERROR = 2004012,
```

## Testing Strategy

1. **Unit Tests**:
   - `linkedinExtractor.test.ts` - ZIP extraction, CSV parsing
   - `companyMatcher.test.ts` - Company matching logic
   - `connectionMatcher.test.ts` - Match algorithm
   - `contactSyncer.test.ts` - Add/update logic

2. **Integration Test**:
   - Mock LinkedIn CSV with known data
   - Mock Google Contacts API responses
   - Verify status counts
   - Verify log output

3. **Manual Test**:
   - Real LinkedIn export ZIP
   - Verify against live Google Contacts (test account)

## Key Implementation Notes

1. **Existing Infrastructure Reuse**:
   - **Enhance** `DuplicateDetector` to return scores with matches
   - Use `ContactCache` for Google contacts caching (fetch once at start)
     - Add `bypassContactCache` setting for re-fetching contacts
     - If enabled, show warning: "⚠️  Contact cache bypassed - fetching fresh data"
   - Use `ApiTracker` for API call tracking
   - Extend `StatusBar` for enhanced sync status with progress indicator (fetch + sync phases)
   - Use `Logger` as base for sync logging infrastructure
   - Use `RetryHandler` for API retry logic (already has exponential backoff)

2. **Dependency Injection**:
   - Add LinkedIn services to DI container (`src/di/identifiers.ts`, `src/di/container.ts`)
   - Register: LinkedInExtractor, CompanyMatcher, ConnectionMatcher, ContactSyncer
   - Inject OAuth2Client and other dependencies

3. **Company Name Cleaning & Matching**:
   - Remove common suffixes (configurable list in settings)
   - Split on multiple separators (comma, pipe, dash, spaces)
   - Use "contains" matching strategy (both directions)
   - Fallback to camelCase splitting
   - All comparisons normalized (lowercase, trimmed)

4. **CSV Parsing & Validation**:
   - **CSV Encoding**: Use UTF-8 encoding with `csv-parse`
     - Specify encoding: `{ encoding: 'utf-8' }`
     - If encoding error occurs, throw error with message
   - **Expected columns** (exact names from LinkedIn export):
     - "First Name"
     - "Last Name"
     - "URL"
     - "Email Address"
     - "Company"
     - "Position"
     - "Connected On" (parsed but not used)
   - Normalize header names (trim, lowercase) for comparison
   - Validate headers on parse
   - Throw error if columns don't match expected format
   - **Multiple CSV files** in ZIP: Throw error (manual intervention required)
   - **Duplicate LinkedIn URLs within CSV**:
     - Track processed URLs in Set
     - First occurrence: process normally
     - Subsequent occurrences: skip with "Skipped" status, log as duplicate
   - **Email validation**: Create Zod schema for email validation

5. **LinkedIn URL Validation & Normalization**:
   - **Validation** (before normalization):
     - Must contain `/in/` pattern for personal profiles
     - Reject company URLs (`/company/`), empty URLs, malformed URLs
     - Invalid URLs → Skip with "Skipped" status
   - **Normalization**:
     - Remove protocol: `https://` or `http://`
     - Handle `www.linkedin.com` and `linkedin.com`
     - Handle mobile: `m.linkedin.com`
     - Remove trailing slashes
     - Remove query parameters: `?trk=...`
     - Extract profile slug for comparison
     - Example: `https://www.linkedin.com/in/name?trk=123` → `name`

6. **Idempotency**:
   - Re-running script should be safe
   - Existing contacts updated only if data changed
   - "Up-To-Date" status for unchanged contacts

7. **Security & Privacy**:
   - No secrets in code
   - ZIP file in gitignored `sources/` folder
   - Cache in gitignored location: `sources/.cache/`
   - Logs in gitignored location: `logs/linkedin-sync/`
   - Need-clarification logs contain PII - ensure gitignored
   - Hebrew/special characters allowed (no PHI rejection)

8. **Rate Limiting Strategy**:
   - Configurable delay (default 500ms) after each write operation
   - No delay between reads (only fetch contacts once at start)
   - Existing `RetryHandler` handles API errors with exponential backoff
   - **429 (Rate Limit) specific handling**:
     - Log clear message: "⚠️  Rate limited by Google API, retrying in X seconds..."
     - Exponential backoff via RetryHandler
     - Don't count as "Error" if retry succeeds
     - Only mark as "Error" if all retries exhausted
   - Track write count to estimate completion time

9. **Contact Group Management**:
   - Fetch all groups once at script start
   - Build in-memory map for O(1) lookups
   - When creating new group (rare):
     - Create group via API
     - Re-fetch all groups immediately
     - Update in-memory map
     - Continue with updated map
   - Prevents race conditions and duplicate groups

10. **Error Recovery & Interruption Handling**:
   - Individual connection failures don't stop entire sync
   - Failed connections logged and counted
   - Partial success supported - no rollback mechanism
   - Re-running script is safe (idempotent)
   - Skipped connections logged with partial data for debugging
   - **Graceful shutdown** on Ctrl+C (SIGINT):
     ```typescript
     process.on('SIGINT', async () => {
       console.log('\n\n⚠️  Sync interrupted by user');
       console.log('Progress: New: X, Updated: Y, Errors: Z');
       console.log('Re-run script to continue (idempotent)');
       process.exit(0);
     });
     ```
   - **ZIP password protection**: Throw error with helpful message
   - If script crashes mid-sync: User should re-run (safe, idempotent)

11. **Duplicate URL Handling & Re-Sync Behavior**:
   - **Within Same CSV Session**:
     - Track all processed LinkedIn URLs in a Set during current sync
     - First occurrence of URL: process normally (add or update contact)
     - Second+ occurrence of same URL: mark as "Need Clarification" and skip
     - Log to need-clarification file with reason: "Duplicate URL found in CSV file"
     - This prevents processing the same person multiple times in one session
   - **Across Different Sessions** (Re-running Script):
     - If LinkedIn URL matches existing Google contact from previous sync:
       - First occurrence in current CSV: treat as normal match (not duplicate)
       - Process as "Up-To-Date" (no changes) or "Updated" (if data changed)
       - This is expected behavior - allows updating contacts from LinkedIn over time
   - **Implementation**: URL deduplication happens BEFORE matching logic runs

## Files to Create/Modify

### New Files (20):

- `src/scripts/linkedinSync.ts`
- `src/services/linkedin/index.ts`
- `src/services/linkedin/linkedinExtractor.ts`
- `src/services/linkedin/companyMatcher.ts`
- `src/services/linkedin/connectionMatcher.ts`
- `src/services/linkedin/contactSyncer.ts`
- `src/services/linkedin/urlNormalizer.ts` (LinkedIn URL normalization utility)
- `src/types/linkedin.ts`
- `src/entities/linkedinConnection.schema.ts`
- `src/cache/companyCache.ts`
- `src/flow/syncStatusBar.ts`
- `src/logging/syncLogger.ts`
- `src/services/linkedin/__tests__/linkedinExtractor.test.ts`
- `src/services/linkedin/__tests__/companyMatcher.test.ts`
- `src/services/linkedin/__tests__/connectionMatcher.test.ts`
- `src/services/linkedin/__tests__/contactSyncer.test.ts`
- `src/services/linkedin/__tests__/urlNormalizer.test.ts`
- `src/services/linkedin/__mocks__/connections.mock.ts`
- `src/services/linkedin/__mocks__/companies.mock.ts`
- `src/cache/__tests__/companyCache.test.ts`
- `logs/linkedin-sync/.gitkeep`

### Modified Files (7):

- `src/scripts/index.ts` (register new script)
- `src/settings/settings.ts` (add LinkedIn config)
- `src/errors/errorCodes.ts` (add error codes)
- `src/types/contact.ts` (add resourceName field)
- `src/services/contacts/duplicateDetector.ts` (enhance to return scores, store resourceName)
- `src/di/identifiers.ts` (add LinkedIn service identifiers)
- `src/di/container.ts` (register LinkedIn services)
- `package.json` (add pnpm script, update deps: csv-parse, adm-zip)
- `.gitignore` (ensure sources/.cache and logs/linkedin-sync are ignored)

## Execution Order

1. Install dependencies (`adm-zip`)
2. Create type definitions and schemas
3. Implement cache layer (`companyCache.ts`)
4. Implement core services (extractor, matcher, syncer)
5. Implement status bar and logger
6. Create main script (`linkedinSync.ts`)
7. Register script in runner
8. Write unit tests
9. Manual testing with real data
10. Documentation

## Success Criteria

- Script runs via `pnpm run linkedin-sync`
- Successfully extracts and parses LinkedIn CSV with UTF-8 encoding
- Correctly maps companies to labels using "contains" matching
- Matches existing contacts with 3-tier fallback (URL → Email → Name)
- Adds new contacts with proper formatting (all fields trimmed, no leading/trailing spaces)
- Updates existing contacts without overwriting key fields
- Skips "Need Clarification" contacts (logs for manual review)
- Handles duplicate URLs in CSV (first processed, rest skipped)
- Validates emails using Zod schema
- Shows real-time progress bar (fetch phase + processing phase)
- Generates detailed log files (main + need-clarification)
- Handles rate limiting with exponential backoff
- Handles Ctrl+C gracefully with progress summary
- Supports re-running (idempotent, partial success preserved)
- All tests pass
- No leading/trailing whitespace in any field
