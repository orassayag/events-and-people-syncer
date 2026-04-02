# Refactoring Decisions Needed

**Date:** March 19, 2026  
**Purpose:** Document inconsistencies and questions that need decisions before/during refactoring

## Overview

During Phase 0 investigation, several inconsistencies were found across the codebase that need architectural decisions before standardizing in BaseCache and other consolidation efforts.

---

## 1. Cache TTL Inconsistency

### Issue

Three different cache classes use different TTL (Time-To-Live) configurations:

**ContactCache:**
```typescript
private readonly TTL: number = VALIDATION_CONSTANTS.CACHE.TTL_MS;
```

**FolderCache:**
```typescript
private readonly TTL: number = VALIDATION_CONSTANTS.CACHE.TTL_MS;
```

**CompanyCache:**
```typescript
this.expirationMs = SETTINGS.linkedin.cacheExpirationDays * 24 * 60 * 60 * 1000;
```

### Questions

1. Are these intentionally different?
2. What is the value of `VALIDATION_CONSTANTS.CACHE.TTL_MS`?
3. What is the value of `SETTINGS.linkedin.cacheExpirationDays`?
4. Should company cache use the same TTL as others?

### Investigation Needed

```bash
# Check constants
grep -rn "TTL_MS" src/constants/validationConstants.ts
grep -rn "cacheExpirationDays" src/settings/settings.ts
```

### Decision Options

**Option A:** Standardize all caches to use `VALIDATION_CONSTANTS.CACHE.TTL_MS`
- ✅ Pro: Consistent behavior
- ✅ Pro: Single source of truth
- ❌ Con: May break existing company cache behavior

**Option B:** Keep different TTLs but make it configurable
- ✅ Pro: Flexibility for different cache types
- ✅ Pro: Won't break existing behavior
- ❌ Con: More complexity

**Option C:** Make TTL a BaseCache constructor parameter
- ✅ Pro: Most flexible
- ✅ Pro: Each cache can decide its TTL
- ❌ Con: Requires passing TTL everywhere

### Decision

- [ ] Investigate both constant values
- [ ] Decide on standardization approach
- [ ] Implement in BaseCache during Phase 3.2
- [ ] Document final decision here

**Chosen Option:** ________________  
**Rationale:** ________________  
**Date Decided:** ________________

---

## 2. Cache Singleton Pattern Inconsistency

### Issue

Different cache implementations use different patterns:

**ContactCache:**
```typescript
export class ContactCache {
  private static instance: ContactCache;
  
  private constructor() { ... }
  
  static getInstance(): ContactCache {
    if (!ContactCache.instance) {
      ContactCache.instance = new ContactCache();
    }
    return ContactCache.instance;
  }
}
```
**Usage:** `ContactCache.getInstance().get()`

**CompanyCache:**
```typescript
export class CompanyCache {
  private readonly cacheFilePath: string;
  
  constructor() { ... }  // PUBLIC constructor
}
```
**Usage:** `new CompanyCache().get()`

**FolderCache:**
```typescript
export class FolderCache {
  private static instance: FolderCache;
  
  static getInstance(): FolderCache { ... }
}
```
**Usage:** `FolderCache.getInstance().get()`

### Questions

1. Should all caches be singletons?
2. Why is CompanyCache not a singleton?
3. Does singleton pattern make sense for caches?

### Analysis

**Pros of Singleton:**
- ✅ Single instance per application
- ✅ Prevents multiple reads/writes to same file
- ✅ Can cache in-memory after reading

**Cons of Singleton:**
- ❌ Harder to test (mocking getInstance)
- ❌ Global state
- ❌ Not necessary if stateless

**Current CompanyCache is stateless** - creates new instance each time, no in-memory caching.

### Decision Options

**Option A:** Make all caches singletons
- ✅ Pro: Consistent pattern
- ✅ Pro: Single file access point
- ❌ Con: Harder to test

**Option B:** Remove singleton, make all caches normal classes
- ✅ Pro: Easier to test
- ✅ Pro: Simpler code
- ❌ Con: May break existing code (6 places use FolderCache.getInstance())

**Option C:** Make BaseCache support both patterns
- ✅ Pro: Flexibility
- ❌ Con: Complexity

### Decision

- [ ] Decide on singleton vs regular class
- [ ] If removing singleton, update 6 mock locations
- [ ] Implement in BaseCache during Phase 3.2

**Chosen Option:** ________________  
**Rationale:** ________________  
**Date Decided:** ________________

---

## 3. Cache Schema Validation Pattern

### Issue

Different caches handle schema validation differently:

**FolderCache (Strict):**
```typescript
const result = folderCacheDataSchema.safeParse(data);
if (!result.success) {
  await this.invalidate();
  return null;
}
```
Uses `safeParse()` and explicitly checks success.

**ContactCache (Permissive):**
```typescript
const data: ContactCacheData = JSON.parse(fileContent);
// No schema validation at all!
```
No validation, just type assertion.

**CompanyCache (Throws):**
```typescript
const data: CompanyCacheData = companyCacheDataSchema.parse(
  JSON.parse(fileContent)
);
```
Uses `parse()` which throws on error, caught by outer catch.

### Questions

1. Which pattern is safest?
2. Should invalid cache data cause an error or just invalidate?
3. Do all caches need schema validation?

### Analysis

**FolderCache approach (safeParse):**
- ✅ Most defensive
- ✅ Explicitly handles validation failure
- ✅ Invalidates bad cache

**ContactCache approach (no validation):**
- ❌ Least safe
- ❌ Could pass invalid data to consumers
- ✅ Fastest (no validation overhead)

**CompanyCache approach (parse):**
- ✅ Safe (throws on error)
- ❌ Relies on catch-all error handler
- ❌ Less explicit

### Decision Options

**Option A:** Use safeParse + invalidate (like FolderCache)
- ✅ Pro: Safest, most explicit
- ✅ Pro: Graceful degradation
- ❌ Con: More code

**Option B:** Use parse + catch (like CompanyCache)
- ✅ Pro: Simpler code
- ✅ Pro: Still safe
- ❌ Con: Less explicit

**Option C:** No validation (like ContactCache)
- ✅ Pro: Fastest
- ❌ Con: Unsafe
- ❌ Con: Not recommended

### Decision

- [ ] Decide on validation pattern
- [ ] Implement in BaseCache during Phase 3.2
- [ ] Add schema parameter to BaseCache constructor

**Chosen Option:** ________________  
**Rationale:** ________________  
**Date Decided:** ________________

---

## 4. FolderCache Path Configuration

### Issue

FolderCache stores data in an unexpected location:

```typescript
this.cacheFilePath = join(
  SETTINGS.linkedin.cachePath,  // ← LinkedIn path!
  'folder-mappings.json'
);
```

But folder mappings are for **events and jobs**, not LinkedIn.

### Questions

1. Should FolderCache use `SETTINGS.linkedin.cachePath`?
2. Should there be a separate `SETTINGS.eventsJobs.cachePath`?
3. Is this intentional or a bug?

### Analysis

Current structure:
```
sources/.cache/
├── company-mappings.json    (CompanyCache - LinkedIn ✓)
├── contact-cache.json        (ContactCache - LinkedIn ✓)
└── folder-mappings.json      (FolderCache - Events/Jobs ✗)
```

All in same directory even though folder-mappings is not LinkedIn-related.

### Decision Options

**Option A:** Keep in linkedin.cachePath (current)
- ✅ Pro: All caches in one place
- ✅ Pro: No breaking changes
- ❌ Con: Semantically incorrect

**Option B:** Create eventsJobs.cachePath
- ✅ Pro: Semantically correct
- ❌ Con: Breaking change
- ❌ Con: More config

**Option C:** Create generic cachePath for all
- ✅ Pro: Most flexible
- ✅ Pro: Semantically correct
- ❌ Con: Requires settings refactor

### Decision

- [ ] Review during Phase 3.2
- [ ] Decide if path should change
- [ ] If changing, migrate existing cache files

**Chosen Option:** ________________  
**Rationale:** ________________  
**Date Decided:** ________________

---

## 5. Summary Box Width (55 vs 56)

### Issue

Summary box formatting has inconsistent width:

**Most places (56):**
```typescript
// In multiple files
const boxWidth = 56;
```

**linkedinSync script (55):**
```typescript
const BOX_WIDTH = 55;
```

### Questions

1. Is width 55 intentional for linkedinSync?
2. Does it need to be narrower for some reason?
3. Is this a typo?

### Analysis

Possible reasons for 55:
- Different terminal width?
- Specific formatting need?
- Just a typo?

### Decision Options

**Option A:** Standardize to 56 everywhere
- ✅ Pro: Consistent
- ❌ Con: May break LinkedIn sync display if intentional

**Option B:** Keep 55 if there's a reason
- ✅ Pro: Don't break working code
- ❌ Con: Inconsistent

### Decision

- [ ] Check if there's a reason for 55
- [ ] Test LinkedIn sync with 56
- [ ] Standardize to 56 in Phase 2.1 unless good reason exists

**Chosen Option:** ________________  
**Rationale:** ________________  
**Date Decided:** ________________

---

## 6. Error Logging Pattern

### Issue

Different error handling patterns found:

**Some files:**
```typescript
catch (error: unknown) {
  console.warn('Failed:', error instanceof Error ? error.message : 'Unknown error');
}
```

**Other files:**
```typescript
catch (error) {
  logger.error('Failed', { noPHI: true });
}
```

**Yet others:**
```typescript
catch {
  return null;  // Silent failure
}
```

### Questions

1. When should we use console.warn vs logger.error?
2. When is silent failure appropriate?
3. Should all errors be logged?

### Decision

- [ ] Define error logging standards
- [ ] Document in security-checklist.md
- [ ] Apply consistently during refactoring

**Standard:** ________________  
**Date Decided:** ________________

---

## 7. Pre-existing Build Errors

### Issue

Phase 0.1 found 5 TypeScript compilation errors:

1. `src/index.ts(12,60)`: Property 'code' does not exist on type 'Error'
2. `src/logging/logger.ts(10,11)`: 'isDisplayMethod' is declared but never read
3. `src/services/auth/authService.ts(211,42)`: Cannot find name 'handleSignal'
4. `src/services/auth/authService.ts(212,43)`: Cannot find name 'handleSignal'
5. `src/utils/promptWithEnquirer.ts(154,7)`: 'limit' property doesn't exist

### Questions

1. Should these be fixed before refactoring?
2. Or can refactoring proceed with broken build?

### Decision Options

**Option A (RECOMMENDED):** Fix build errors first
- ✅ Pro: Clean baseline
- ✅ Pro: Easier to detect refactoring issues
- ✅ Pro: Professional practice
- ❌ Con: Delays refactoring start

**Option B:** Proceed with broken build
- ✅ Pro: Faster start
- ❌ Con: Can't verify refactoring doesn't break more
- ❌ Con: Harder to test
- ❌ Con: Unprofessional

### Decision

- [ ] **STRONGLY RECOMMEND: Fix build errors before Phase 1**
- [ ] Run `pnpm build` to verify errors
- [ ] Fix each error
- [ ] Verify build succeeds
- [ ] Then proceed to Phase 1

**Chosen Option:** ________________  
**Date Decided:** ________________

---

## Decision Summary Checklist

Before proceeding to Phase 1:

- [ ] **Decision 1:** Cache TTL standardization approach
- [ ] **Decision 2:** Singleton vs regular class pattern
- [ ] **Decision 3:** Schema validation pattern
- [ ] **Decision 4:** FolderCache path configuration
- [ ] **Decision 5:** Summary box width (55 vs 56)
- [ ] **Decision 6:** Error logging standards
- [ ] **Decision 7:** Fix build errors first (CRITICAL)

## Notes Section

Use this space to document any additional findings or decisions:

```
[Add notes here as you investigate each issue]
```

---

**Status:** ✅ Phase 0.10 Complete  
**Next Step:** Review and make decisions, then proceed to Phase 1

**CRITICAL:** Decision 7 (build errors) should be made before ANY refactoring begins.
