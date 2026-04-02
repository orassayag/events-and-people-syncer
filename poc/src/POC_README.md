# POC: Searchable MultiSelect with Popularity Sorting

## Overview

This POC demonstrates the two key enhancements planned for label selection:

1. **Popularity-based Sorting**: Labels sorted by member count (descending) with alphabetical tiebreaker
2. **Real-time Search/Filter**: Type to filter labels instantly while preserving selections

## Files

- `poc-searchable-multiselect.ts` - Interactive POC with user input
- `poc-searchable-multiselect-demo.ts` - Automated demo showing all features

## Running the POC

### Interactive Version (requires terminal interaction)

```bash
pnpm run poc:searchable
```

**Features to test:**
1. Labels appear sorted by popularity (highest member count first)
2. Type any letter to filter labels in real-time
3. Use arrow keys to navigate filtered results
4. Press SPACE to select/deselect items
5. Press BACKSPACE to clear search
6. Selected items remain selected even when filtered out
7. Press ENTER to confirm or ESC to cancel

### Automated Demo (non-interactive)

```bash
pnpm run poc:searchable:demo
```

This version automatically demonstrates:
- Sorting before/after
- Filtering scenarios
- Selection preservation logic

## Key Implementation Details

### SearchableMultiSelect Class

Extends enquirer's `MultiSelect` with:

```typescript
class SearchableMultiSelect extends Enquirer.MultiSelect {
  private searchTerm: string = '';
  private _allChoices: Choice[] | null = null;

  // Intercepts keystrokes for search
  async dispatch(s: string | undefined, key: KeypressEvent): Promise<void>

  // Syncs selections between filtered view and master list
  private _syncSelections(): void

  // Applies filter to visible choices
  private _applyFilter(): void

  // Returns selected items from full list
  result(): string[]

  // Shows search term and match count
  async header(): Promise<string>
}
```

### Sorting Algorithm

```typescript
function sortContactGroups(groups: ContactGroup[]): ContactGroup[] {
  return groups.sort((a, b) => {
    const countA = a.memberCount ?? 0;
    const countB = b.memberCount ?? 0;
    // Primary sort: descending by member count
    if (countB !== countA) {
      return countB - countA;
    }
    // Secondary sort: alphabetical
    return a.name.localeCompare(b.name, 'en-US');
  });
}
```

## Test Scenarios

### Scenario 1: Popularity Sorting

**Before:**
- Work: 42 members
- Family: 15 members
- Friends: 87 members
- Job Interviews: 23 members
- Clients: 56 members

**After:**
- Tech Meetup: 103 members
- Startup Network: 91 members
- Friends: 87 members
- Church: 65 members
- Clients: 56 members

### Scenario 2: Real-time Search

Type "work" → Shows:
- Work (42 contacts)
- Volunteer Work (22 contacts)

Type "tech" → Shows:
- Tech Meetup (103 contacts)

### Scenario 3: Selection Preservation

1. Select "Work" (42 contacts)
2. Type "tech" to filter (Work disappears from view)
3. Select "Tech Meetup" (103 contacts)
4. Clear search (backspace)
5. Both "Work" and "Tech Meetup" are still selected ✅

## Known Issues (from analysis)

### Critical
1. ❌ Match count shows "20/0" instead of "20/20" - header logic issue
2. ⚠️ Single-letter shortcuts ('a', 'i', 'g') need modifier key check
3. ⚠️ No race condition handling for concurrent cache access

### Should Fix
- Visual feedback when no results match filter
- Cache invalidation on label deletion
- TypeScript type definitions for enquirer internals

### Nice to Have
- Debounce search input for performance
- Highlight matching characters in filtered results
- Show member count in label display (already in POC)

## Next Steps

1. Test the interactive POC manually
2. Fix the header match count display bug
3. Add proper TypeScript type definitions
4. Implement in main codebase with fixes from analysis
5. Add unit tests for SearchableMultiSelect
6. Update DI container to use singleton scope for ContactEditor

## Success Criteria

- ✅ Labels sorted by popularity (most used first)
- ✅ Real-time search working
- ✅ Selections preserved during filtering
- ✅ All enquirer shortcuts still work
- ✅ ESC to cancel works
- ⚠️ Header shows correct match counts (needs fix)
- ⚠️ No single-letter shortcuts captured during typing (needs verification)

## Estimated Implementation Time

- POC development: ✅ Complete
- Bug fixes: 30 minutes
- Integration into main codebase: 2 hours
- Testing and refinement: 1.5 hours
- **Total: ~4 hours** (revised from original 3 hour estimate)
