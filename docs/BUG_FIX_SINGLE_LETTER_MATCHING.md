# Bug Fix: Single Letter CamelCase Matching

## Issue Summary

**Date**: March 13, 2026
**Severity**: High
**Component**: Company Label Matcher (`src/services/linkedin/companyMatcher.ts`)

### Problem

The contact "Gevit Azulay" from company "Gevit Azulay" was incorrectly assigned the label "HR" instead of the default label "Job". 

### Root Cause

The CamelCase segment matching logic in `matchesCompany()` was splitting folder names like "ADAM+" into single-character segments ["A", "D", "A", "M"]. It then checked if any of these segments appeared in the LinkedIn company name. Since "Gevit Azulay" contains the letter "a" (in "Azulay"), it incorrectly matched against the "HR_ADAM+" folder.

### Example of the Bug

```
LinkedIn Company: "Gevit Azulay"
Folder: "HR_ADAM+"
CamelCase Split: ["A", "D", "A", "M", "+"]
Matching Check: Does "gevit azulay" contain "a"? YES ✗ (False Positive!)
Result: Incorrectly assigned label "HR"
```

## The Fix

### Code Changes

**File**: `src/services/linkedin/companyMatcher.ts`  
**Lines**: 146-155

Added a check to skip single-character segments in CamelCase matching:

```typescript
const folderSegments: string[] = this.splitCamelCase(folderCompany);
for (const segment of folderSegments) {
  if (segment.length <= 1) {  // ← NEW: Skip single characters
    continue;
  }
  const normalizedSegment: string = segment.toLowerCase().trim();
  if (
    normalizedLinkedIn.includes(normalizedSegment) ||
    normalizedSegment.includes(normalizedLinkedIn)
  ) {
    return true;
  }
}
```

### Rationale

Single-character matches are too broad and lead to false positives. Most legitimate company name matches require at least 2 characters to be meaningful. Examples:
- "IBM" splitting to ["I", "B", "M"] would match almost any company with these common letters
- "ADAM+" splitting to ["A", "D", "A", "M"] would match any company with "a", "d", or "m"
- Multi-character segments like "Elbit" or "Systems" are much more specific

## Testing

### New Tests Added

**File**: `src/services/linkedin/__tests__/companyMatcher.test.ts`

```typescript
describe('bug fixes', () => {
  it('should not match single letter CamelCase segments', () => {
    const matcher = new CompanyMatcher();
    const result = (matcher as any).matchesCompany('Gevit Azulay', 'ADAM+');
    expect(result).toBe(false);
  });
  
  it('should not match unrelated companies with coincidental single letters', () => {
    const matcher = new CompanyMatcher();
    const result = (matcher as any).matchesCompany(
      'Apple Inc',
      'AmazonWebServices'
    );
    expect(result).toBe(false);
  });
});
```

### Test Results

✅ All 21 tests in `companyMatcher.test.ts` pass  
✅ No linter errors introduced  
✅ Build successful

## Verification

### Before Fix
```
Company: "Gevit Azulay"
Matched: HR_ADAM+ (via single letter "A")
Label: "HR" ✗ INCORRECT
```

### After Fix
```
Company: "Gevit Azulay"
Matched: None (single letter segments skipped)
Label: "Job" ✓ CORRECT (default)
```

## Impact

### Affected Scenarios

This fix prevents false positive matches in scenarios where:
1. Folder names contain acronyms (IBM, ADAM, HP, etc.)
2. Folder names use CamelCase with single letters (ACompany, TechA, etc.)
3. LinkedIn company names happen to contain common single letters

### Backward Compatibility

This change is backward compatible. It only restricts overly broad matches that were causing false positives. Legitimate multi-character matches continue to work as expected:
- ✅ "Elbit Systems" still matches "ElbitSystems"
- ✅ "Microsoft" still matches "MicrosoftCorporation"
- ✅ "Google" still matches "GoogleInc"

## Related Files

- `src/services/linkedin/companyMatcher.ts` - Main fix
- `src/services/linkedin/__tests__/companyMatcher.test.ts` - Test coverage
- `src/regex/patterns.ts` - CamelCase split pattern (no changes)
- `sources/.cache/company-mappings.json` - Cache (will be regenerated on next run)

## Recommendations

1. **Cache Invalidation**: Delete `sources/.cache/company-mappings.json` after deploying this fix to ensure the new logic is used immediately
2. **Review Existing Contacts**: Consider re-running the sync to correct any contacts that were mislabeled due to this bug
3. **Monitoring**: Watch for any edge cases where legitimate single-letter matches might be needed (though this is unlikely)

## Next Steps

- [x] Fix implemented
- [x] Tests added and passing
- [x] Code compiled successfully
- [x] Documentation created
- [ ] Deploy to production
- [ ] Invalidate company mappings cache
- [ ] Re-sync affected contacts (optional)
