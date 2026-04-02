# Mock Files Review - Phase 0.3

**Date:** March 19, 2026  
**Purpose:** Identify mocks that may break during refactoring

## Summary

- **Mock Declarations:** 73 instances of `vi.mock()` found
- **Mock Directories:** 1 directory (`src/services/linkedin/__mocks__/`)
- **Mock File Imports:** 1 instance
- **Risk Level:** MEDIUM - Some mocks reference specific file paths

## Mock Directories Found

```
src/services/linkedin/__mocks__/
├── companies.mock.ts
└── connections.mock.ts
```

## Mock Declarations by File

### High-Risk Mocks (Reference Specific Paths)

These mocks import specific files and may break if those files are moved or refactored:

#### 1. `src/scripts/__tests__/eventsJobsSync.test.ts`
```typescript
vi.mock('../../cache/folderCache');
vi.mock('../../utils/promptWithEnquirer', async () => { ... });
```
**Risk:** Phase 3.2 will refactor cache files. May need to update import paths.

#### 2. `src/cache/__tests__/companyCache.test.ts`
```typescript
vi.mock('../../settings', () => ({ ... }));
```
**Risk:** If settings structure changes in Phase 3, may need update.

#### 3. `src/services/linkedin/__tests__/companyMatcher.test.ts`
```typescript
vi.mock('../../../settings', () => ({ ... }));
vi.mock('../../../cache/companyCache', () => ({ ... }));
```
**Risk:** Phase 3.2 BaseCache refactor will affect companyCache.

#### 4. `src/services/linkedin/__tests__/contactSyncer.test.ts`
```typescript
vi.mock('../../../utils/retryWithBackoff', () => ({ ... }));
vi.mock('../../../settings', () => ({ ... }));
vi.mock('../../api/apiTracker', () => ({ ... }));
```
**Risk:** If retryWithBackoff is refactored, mock may need update.

#### 5. `src/services/linkedin/__tests__/linkedinExtractor.test.ts`
```typescript
vi.mock('../../../settings', () => ({ ... }));
```
**Risk:** Settings import may change.

### Medium-Risk Mocks (Mock External Dependencies)

These mock external libraries - generally safe:

- `vi.mock('fs/promises')` - 5 occurrences
- `vi.mock('googleapis')` - 1 occurrence
- `vi.mock('enquirer')` - 1 occurrence
- `vi.mock('child_process')` - 1 occurrence
- `vi.mock('ora')` - 1 occurrence
- `vi.mock('adm-zip')` - 1 occurrence
- `vi.mock('fs')` - 1 occurrence

### Low-Risk Mocks (Runtime Mocking)

These use `vi.mocked()` at runtime - will break if function signatures change:

- `vi.mocked(FolderCache.getInstance)` - 6 occurrences
- `vi.mocked(google.people)` - 6 occurrences
- `vi.mocked(fs.stat)` - 2 occurrences
- `vi.mocked(fs.readFile)` - 1 occurrence
- Various duplicate detector mocks - ~15 occurrences

## Mock File Imports

### `src/services/linkedin/__tests__/linkedinExtractor.test.ts`
```typescript
import { ... } from '../__mocks__/connections.mock';
```

**Action:** Verify this import still works after Phase 1 import refactoring.

## Action Items by Phase

### Phase 1 (Import Changes)

- [ ] Verify `__mocks__/connections.mock` import still resolves
- [ ] No direct action needed for Phase 1 (no cache changes yet)

### Phase 2 (Utility Consolidation)

- [ ] Check if `retryWithBackoff` mock in `contactSyncer.test.ts` still works
- [ ] Update if utility functions are moved or renamed

### Phase 3 (Cache Refactoring - HIGH PRIORITY)

- [ ] **Update `eventsJobsSync.test.ts`:**
  - Mock for `folderCache` may need adjustment for BaseCache
  - Verify `FolderCache.getInstance()` mock still works

- [ ] **Update `companyMatcher.test.ts`:**
  - Mock for `companyCache` will need adjustment
  - May need to mock BaseCache instead

- [ ] **Review all `FolderCache.getInstance` mocks** (6 places):
  - Verify singleton pattern still exists after BaseCache refactor
  - Update mock return values if cache interface changes

### Phase 4 (Documentation)

- [ ] No mock updates needed

## Testing Strategy After Mock-Affected Changes

### After Phase 1.2 (Import Refactoring)
```bash
# Run tests that import from __mocks__
NODE_OPTIONS='--no-warnings' vitest run src/services/linkedin/__tests__/linkedinExtractor.test.ts
```

### After Phase 3.2 (BaseCache Creation)
```bash
# Run all cache-related tests
NODE_OPTIONS='--no-warnings' vitest run src/cache/__tests__/
NODE_OPTIONS='--no-warnings' vitest run src/scripts/__tests__/eventsJobsSync.test.ts
NODE_OPTIONS='--no-warnings' vitest run src/services/linkedin/__tests__/companyMatcher.test.ts
```

## Files Requiring Mock Updates

### Immediate Review (Phase 3)

1. `src/scripts/__tests__/eventsJobsSync.test.ts` (6 FolderCache.getInstance mocks)
2. `src/services/linkedin/__tests__/companyMatcher.test.ts` (companyCache mock)
3. `src/cache/__tests__/companyCache.test.ts` (settings mock)

### Optional Review (If Issues Arise)

1. All files mocking `fs/promises` - verify fs operations still work
2. `contactSyncer.test.ts` - verify googleapis mock still works

## Mock Patterns Summary

| Pattern | Count | Risk | Phase Affected |
|---------|-------|------|----------------|
| Path-based mocks | ~15 | HIGH | Phase 3 |
| External lib mocks | ~10 | LOW | None |
| Runtime vi.mocked() | ~48 | MEDIUM | All phases |

## Safety Checklist

- [ ] Run full test suite after Phase 1.2 (imports)
- [ ] Review FolderCache mocks before Phase 3.2
- [ ] Update companyCache mock during Phase 3.2
- [ ] Verify all 6 FolderCache.getInstance mocks after BaseCache
- [ ] Run affected tests after each mock-related change

---

**Status:** ✅ Phase 0.3 Complete  
**Next Step:** Phase 0.4 - Search for Dynamic Imports

**Critical Finding:** 6 places mock `FolderCache.getInstance()` - must be carefully reviewed during Phase 3.2 BaseCache refactoring.
