# Company Matcher Segment Matching Fix - March 22, 2026

## Problem

Contacts were incorrectly changing labels from "Job" to "HR" (or vice versa) due to overly permissive CamelCase segment matching in the company matcher.

### Example
- **Contact**: Rotem Cohen from "Microsoft"
- **Expected**: Label = "Job" (matches `Job_Microsoft` folder)
- **Actual**: Label = "HR" (incorrectly matched `HR_ITSOFT.co.il` folder)

### Root Cause

The `CompanyMatcher` uses CamelCase segment matching to find company matches. When processing "Microsoft":

1. Company name is split into CamelCase segments: `["Micro", "soft"]`
2. Each segment is matched against folder company names
3. The segment **"soft"** (4 characters) matched `HR_ITSOFT.co.il` because "soft" is contained in "ITSOFT"
4. Since HR folders appear first in the cache (alphabetically by label), `HR_ITSOFT.co.il` was found before `Job_Microsoft`
5. **First match wins** → Contact gets "HR" label instead of "Job"

### Impact

This bug caused mass label changes affecting multiple contacts:
- Microsoft → matched ITSOFT
- InteliATE → matched various HR folders via short segments
- Wolfson Medical Center → matched other HR folders
- And many more false matches

## Solution

**Implemented two complementary fixes:**

1. **Increased minimum segment length from 1 to 5 characters** in the CamelCase matching logic
2. **Added exact match priority** - exact matches are checked before fuzzy matching

### Code Changes

**File**: `src/services/linkedin/companyMatcher.ts`

#### Change 1: Exact Match Priority (Lines 21-38)

```typescript
async getLabel(linkedinCompany: string): Promise<string> {
  if (!linkedinCompany.trim()) {
    return this.defaultLabel;
  }
  const mappings: CompanyMapping[] = await this.getMappings();
  const cleanedLinkedInCompany: string = this.cleanCompanyName(linkedinCompany);
  const normalizedLinkedIn: string = cleanedLinkedInCompany.toLowerCase().trim();
  
  // FIRST PASS: Look for exact matches
  for (const mapping of mappings) {
    const normalizedFolder: string = mapping.companyName.toLowerCase().trim();
    if (normalizedLinkedIn === normalizedFolder) {
      return mapping.label;
    }
  }
  
  // SECOND PASS: Fuzzy matching (contains, segments)
  for (const mapping of mappings) {
    if (this.matchesCompany(cleanedLinkedInCompany, mapping.companyName)) {
      return mapping.label;
    }
  }
  
  return this.defaultLabel;
}
```

#### Change 2: Minimum Segment Length (Line 148)

```typescript
// Before:
if (segment.length <= 1) {
  continue;
}

// After:
if (segment.length <= 5) {
  continue;
}
```

### Why These Work Together

1. **Exact Match Priority (Defense Layer 1)**:
   - "Microsoft" matches `Job_Microsoft` immediately
   - No need to check fuzzy matching at all
   - Fastest and most accurate

2. **Minimum Segment Length (Defense Layer 2)**:
   - If no exact match exists, fuzzy matching runs
   - Short segments like "soft" are now ignored
   - Prevents false positives from generic segments

3. **Combined Protection**:
   - Even if cache ordering changes, exact matches always win
   - Even if exact match doesn't exist, segment matching is now safer
   - Double protection against false positives

### Examples After Fix

| LinkedIn Company | Exact Match? | Fuzzy Match Needed? | Result | Label |
|-----------------|--------------|---------------------|--------|-------|
| Microsoft | ✅ Yes (`Job_Microsoft`) | ❌ No | Exact match wins | Job ✅ |
| Microsoft Corp | ❌ No | ✅ Yes (contains "Microsoft") | Contains match | Job ✅ |
| GoogleCloud | ❌ No | ✅ Yes (segment "Google"=6 chars) | Segment match | Job ✅ |
| ITSOFT | ✅ Yes (`HR_ITSOFT.co.il`) | ❌ No | Exact match wins | HR ✅ |
| NewCompany | ❌ No | ❌ No match | Default | Job ✅ |

### Matching Priority Order

The new logic follows this priority:

1. **Exact match** (e.g., "Microsoft" === "Microsoft")
2. **Contains match** (e.g., "Microsoft Corp" contains "Microsoft")
3. **Space-normalized contains** (e.g., handles spaces differently)
4. **CamelCase segment match** (e.g., "GoogleCloud" → ["Google", "Cloud"] → only segments >5 chars)
5. **Default label** ("Job") if nothing matches

### Alternative Considered

We chose **both fixes together** over single approaches:
- ~~Word boundary matching~~: More complex, requires regex
- ~~Exact match priority alone~~: Doesn't prevent segment false positives
- ~~Segment length alone~~: Doesn't guarantee exact matches win first
- ~~Disabling segment matching~~: Loses legitimate fuzzy matching

The combination provides **defense in depth**.

## Testing

- ✅ All 21 company matcher tests pass
- ✅ No linter errors
- ✅ Existing functionality preserved

## Expected Behavior After Fix

1. **Exact matches work**: "Microsoft" → `Job_Microsoft` (exact match, no segment matching needed)
2. **Contains matches work**: "Microsoft Corporation" → `Job_Microsoft` (contains match)
3. **Short segments ignored**: "soft", "Micro" from "Microsoft" won't cause false matches
4. **Long segments work**: "Microsoft" as a segment (if from compound name) would still match
5. **No more label flipping**: Contacts will maintain correct labels between runs

## Impact on Future Syncs

After this fix and cache invalidation:
- Contacts previously mislabeled as "HR" (but should be "Job") will update back to "Job"
- Contacts correctly labeled will remain unchanged
- New contacts will be labeled correctly on first sync

## Recommendation

After deploying this fix:
1. **Invalidate company cache**: Delete `sources/.cache/company-mappings.json`
2. **Run LinkedIn sync**: Labels will be recalculated with the fixed logic
3. **Monitor logs**: Verify contacts get correct labels

## Files Modified

- `src/services/linkedin/companyMatcher.ts`
  - Lines 21-38: Added exact match priority (two-pass matching)
  - Line 148: Minimum segment length increased from 1 to 5
