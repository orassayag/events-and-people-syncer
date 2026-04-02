# Test Coverage Gaps Analysis

**Date:** March 19, 2026  
**Purpose:** Identify files being refactored without test coverage

## Summary

- **Total Test Files:** 22
- **Total Source Files:** 122
- **Test Coverage:** ~18% (22 test files / 122 source files)

## Test Files Found

```
src/cache/__tests__/folderCache.test.ts
src/cache/__tests__/companyCache.test.ts
src/utils/__tests__/dateFormatter.test.ts
src/utils/__tests__/promptWithEnquirer.test.ts
src/scripts/__tests__/eventsJobsSync.test.ts
src/validators/__tests__/pathValidator.test.ts
src/logging/__tests__/logger.test.ts
src/services/contacts/__tests__/contactEditor.test.ts
src/services/contacts/__tests__/eventsContactEditor.test.ts
src/services/contacts/__tests__/contactSyncer.test.ts
src/services/contacts/__tests__/hebrewWorkflow.test.ts
src/services/labels/__tests__/labelResolver.test.ts
src/services/notes/__tests__/noteWriter.test.ts
src/services/folders/__tests__/folderManager.test.ts
src/services/folders/__tests__/folderMatcher.test.ts
src/services/linkedin/__tests__/companyMatcher.test.ts
src/services/linkedin/__tests__/urlNormalizer.test.ts
src/services/linkedin/__tests__/noteParser.test.ts
src/services/linkedin/__tests__/contactSyncer.test.ts
src/services/linkedin/__tests__/linkedinExtractor.test.ts
src/services/linkedin/__tests__/noteParserSync.test.ts
src/services/linkedin/__tests__/connectionMatcher.test.ts
```

## Critical Files Being Refactored - Test Coverage Status

### Phase 1 Files

| File | Test Status | Risk Level | Notes |
|------|-------------|------------|-------|
| `src/parsers/textParser.ts` | ❌ NO TESTS | HIGH | Will be deleted (duplicate of textUtils) |
| `src/utils/textUtils.ts` | ❌ NO TESTS | MEDIUM | Used by textParser, needs tests |
| `src/cache/contactCache.ts` | ❌ NO TESTS | HIGH | Will be refactored to use BaseCache |
| `src/cache/companyCache.ts` | ✅ HAS TESTS | LOW | Already has tests |
| `src/cache/folderCache.ts` | ✅ HAS TESTS | LOW | Already has tests |

### Phase 2 Files (Will be created)

| File | Test Status | Risk Level | Notes |
|------|-------------|------------|-------|
| `src/utils/errorUtils.ts` | ❌ NO TESTS | MEDIUM | Will be created - needs tests after |
| `src/utils/summaryFormatter.ts` | ❌ NO TESTS | MEDIUM | Will be created - needs tests after |
| `src/utils/contactMapper.ts` | ❌ NO TESTS | MEDIUM | Will be created - needs tests after |

### Phase 3 Files (Will be created)

| File | Test Status | Risk Level | Notes |
|------|-------------|------------|-------|
| `src/cache/baseCache.ts` | ❌ NO TESTS | HIGH | Will be created - critical, needs tests |

## Existing Cache Tests

✅ **companyCache.test.ts** exists (4 tests passing)  
✅ **folderCache.test.ts** exists (10 tests passing)  
❌ **contactCache.test.ts** MISSING

## Action Items

### Immediate (Before Refactoring)

- [ ] ⚠️ **HIGH PRIORITY**: Add tests for `contactCache.ts` (no coverage currently)
- [ ] Add tests for `textUtils.ts` (used by textParser which will be deleted)

### During Refactoring

- [ ] Ensure `companyCache.test.ts` still passes after BaseCache refactor
- [ ] Ensure `folderCache.test.ts` still passes after BaseCache refactor
- [ ] Run test suite after each phase

### After Refactoring (Phase-by-Phase)

#### After Phase 1.4 (Error Utils Created)
- [ ] Add tests for `errorUtils.ts`
- [ ] Verify error extraction works correctly
- [ ] Test edge cases (null, undefined, Error objects, strings)

#### After Phase 2.1 (Summary Formatter Created)
- [ ] Add tests for `summaryFormatter.ts`
- [ ] Test different box widths
- [ ] Test multiline content
- [ ] Test empty content

#### After Phase 2.5 (Contact Mapper Created)
- [ ] Add tests for `contactMapper.ts`
- [ ] Test Person → ContactData mapping
- [ ] Test edge cases (missing fields, null values)

#### After Phase 3.2 (BaseCache Created)
- [ ] **CRITICAL**: Add comprehensive tests for `baseCache.ts`
- [ ] Test TTL expiration
- [ ] Test schema validation
- [ ] Test file I/O operations
- [ ] Test error handling
- [ ] Verify all cache implementations work with BaseCache

## Risk Mitigation

### HIGH RISK: contactCache.ts

**Problem:** Used extensively but has no tests  
**Mitigation:**
1. Review all usage of contactCache before refactoring
2. Add tests before modifying
3. Test thoroughly after moving to BaseCache pattern

### MEDIUM RISK: New Utility Files

**Problem:** New files (errorUtils, summaryFormatter, contactMapper) will have no tests initially  
**Mitigation:**
1. Keep implementations simple and focused
2. Add tests immediately after creation
3. Review with existing code that uses similar patterns

### HIGH RISK: baseCache.ts

**Problem:** Foundation for all caches, but will be new code  
**Mitigation:**
1. Design carefully based on existing cache patterns
2. Add comprehensive test suite before migration
3. Migrate one cache at a time
4. Keep existing cache implementations until new one is verified

## Testing Strategy

### For Refactoring Safety

1. **Run full test suite before each phase**
2. **Run affected tests after each file change**
3. **Add new tests for new utility functions**
4. **Verify no test regressions**

### Test Commands

```bash
# Run all tests
pnpm test

# Run specific test file
NODE_OPTIONS='--no-warnings' vitest run src/cache/__tests__/companyCache.test.ts

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

## Current Test Pass Rate

**Before Refactoring:**
- Total: 934 tests
- Passing: 900 (96.4%)
- Failing: 32 (3.4%) - pre-existing failures
- Skipped: 2

**Goal After Refactoring:**
- Maintain 96.4%+ pass rate
- Add 30-50 new tests for new utilities
- Fix pre-existing failures (optional)

---

**Status:** ✅ Phase 0.2 Complete  
**Next Step:** Phase 0.3 - Check for Test Mock File Paths
