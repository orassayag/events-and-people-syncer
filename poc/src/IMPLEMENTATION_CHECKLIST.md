# Implementation Checklist

Use this checklist when implementing the Label Selection UX Enhancement.

## Pre-Implementation (MUST DO FIRST)

- [ ] **Fix DI Container Scope**
  - File: `src/di/container.ts` line 56
  - Change: `container.bind(ContactEditor).toSelf()` 
  - To: `container.bind(ContactEditor).toSelf().inSingletonScope()`

- [ ] **Add Race Condition Protection**
  - File: `src/services/contacts/contactEditor.ts`
  - Add: `private fetchInProgress: Promise<ContactGroup[]> | null = null;`
  - Wrap fetch logic with promise tracking

## Step-by-Step Implementation

### Step 0: SearchableMultiSelect
- [ ] Create `src/utils/searchableMultiselect.ts`
- [ ] Copy implementation from `poc-searchable-multiselect.ts` (lines 5-80)
- [ ] Create `src/types/enquirer.d.ts` with type definitions
- [ ] Verify TypeScript compilation passes

### Step 1: Update Types
- [ ] Edit `src/types/api.ts`
- [ ] Add `memberCount?: number` to ContactGroup interface

### Step 2: Add Caching
- [ ] Edit `src/services/contacts/contactEditor.ts`
- [ ] Add `private cachedContactGroups: ContactGroup[] | null = null;`
- [ ] Add `forceRefresh: boolean = false` parameter to fetchContactGroups()
- [ ] Add cache check at start of fetchContactGroups()

### Step 3: Enhance fetchContactGroups()
- [ ] Add batchGet() call after list() completes
- [ ] Handle dry mode with mock memberCount
- [ ] Merge memberCount into contactGroups array
- [ ] Update sorting logic (memberCount desc, then alphabetical)
- [ ] Add try-catch for batchGet with fallback
- [ ] Cache the result before returning

### Step 4: Cache Invalidation
- [ ] Update `createContactGroup()` to set `this.cachedContactGroups = null`
- [ ] Update line 1320 call: `this.fetchContactGroups(true)`

### Step 5: Update ContactSyncer
- [ ] Edit `src/services/contacts/contactSyncer.ts`
- [ ] Add same batchGet() logic (no sorting needed)

### Step 6: Update checkboxWithEscape
- [ ] Edit `src/utils/promptWithEnquirer.ts`
- [ ] Import SearchableMultiSelect
- [ ] Replace MultiSelect with SearchableMultiSelect
- [ ] Update prompt instantiation

## Testing Checklist

### Manual Testing
- [ ] Basic label selection (existing flow)
- [ ] Labels appear in popularity order
- [ ] Type to search - filters update in real-time
- [ ] Match counter shows correct numbers
- [ ] Selected items preserved when filtering
- [ ] Backspace clears search
- [ ] Arrow keys navigate filtered results
- [ ] Space toggles selection
- [ ] Enter confirms selection
- [ ] ESC cancels without changes

### Edge Cases
- [ ] API failure for memberCount (falls back to alphabetical)
- [ ] Labels with 0 members (appear at bottom)
- [ ] Empty label list (triggers create wizard)
- [ ] Very long label names (UI doesn't break)
- [ ] Identical member counts (alphabetical tiebreaker works)
- [ ] Empty search results (no matches)

### Caching
- [ ] Multiple edits use cache (check api-stats.json)
- [ ] Only 2 API calls per session (not 14+)
- [ ] Cache invalidated after label creation
- [ ] Concurrent calls don't bypass cache

### Dry Mode
- [ ] Run with `DRY_MODE=true`
- [ ] Mock member counts generated
- [ ] API calls logged correctly
- [ ] Sorting works with mock data

## Verification

### Before Committing
- [ ] Run linter: `pnpm run lint`
- [ ] Check TypeScript: `pnpm run build`
- [ ] Test POC still works: `pnpm run poc:searchable`
- [ ] Test main app: `pnpm run interactive`

### Post-Implementation
- [ ] Test with real Google Contacts account
- [ ] Verify 20+ labels scenario
- [ ] Check API quota usage in Google Console
- [ ] Confirm performance is acceptable

## Success Criteria

All must pass:
- ✅ Labels sorted by popularity (most members first)
- ✅ Real-time search filtering works
- ✅ Selections preserved during filtering
- ✅ Match counter displays correctly
- ✅ All keyboard shortcuts work
- ✅ ESC cancellation works
- ✅ API calls reduced from 14+ to 2 per session
- ✅ Dry mode works correctly
- ✅ No TypeScript errors
- ✅ No linter errors

## Time Tracking

- Pre-Implementation: _____ / 20 min
- Step 0: _____ / 20 min
- Step 1: _____ / 10 min
- Step 2: _____ / 15 min
- Step 3: _____ / 30 min
- Step 4: _____ / 10 min
- Step 5: _____ / 15 min
- Step 6: _____ / 15 min
- Testing: _____ / 75 min

**Total: _____ / 210 min (3.5 hours)**

## Rollback Plan

If implementation fails:
1. Revert DI container change
2. Revert fetchContactGroups() changes
3. Revert checkboxWithEscape() changes
4. POC remains as reference for future attempt

## Notes

- POC reference: `poc-searchable-multiselect.ts`
- Full plan: `docs/LABEL_SELECTION_UX_ENHANCEMENT.md` (v3.0)
- Analysis: `POC_RESULTS_SUMMARY.md`
