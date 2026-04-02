# Phase 3: Structural Improvements (Medium Impact)

**Estimated Time:** 3-4 days (revised from 2-3 days)  
**Files Affected:** ~50 files  
**Lines Removed:** ~300 lines

## Overview

Phase 3 focuses on architectural improvements: moving scattered types to the types/ folder, consolidating cache implementations, and creating shared utilities for common API and file operations.

**⚠️ PREREQUISITES:** Complete Phase 1 and Phase 2 first!

**⚠️ NOTE:** This phase involves moving types. Follow dependency order to avoid circular imports (see Phase 0 type-dependencies.md).

---

## 3.1 Move Types to types/ Folder

### Problem
Type definitions scattered across the codebase instead of centralized in the types/ folder.

**⚠️ CRITICAL NOTES:**
1. **DO NOT move Settings type** - Keep it in `settings/settings.ts` co-located with SETTINGS constant
2. Follow dependency order from Phase 0 `type-dependencies.md`
3. Move leaf types first (no dependencies), then types that depend on them
4. Watch for circular dependencies

### Actions

#### Types to NOT Move

**Keep these types in their current locations:**
- `Settings` interface in `src/settings/settings.ts` (co-located with implementation)
- Any types tightly coupled to their implementation

#### Create New Type Files

**⚠️ REMOVED:** ~~Create `src/types/settings.ts`~~ (Settings stays in settings/settings.ts)

**1. Create `src/types/prompt.ts`**

Move from `promptWithEnquirer.ts`:
```typescript
export interface PromptResult<T> {
  escaped: boolean;
  value?: T;
}

export interface SelectChoice {
  name: string;
  value: string;
  hint?: string;
}

export interface SelectConfig {
  message: string;
  choices: SelectChoice[];
  initial?: number;
}

export interface InputConfig {
  message: string;
  initial?: string;
  validate?: (value: string) => boolean | string;
}

export interface ConfirmConfig {
  message: string;
  initial?: boolean;
}

export interface CheckboxChoice {
  name: string;
  value: string;
  enabled?: boolean;
}

export interface CheckboxConfig {
  message: string;
  choices: CheckboxChoice[];
}
```

**3. Create `src/types/monitoring.ts`**

Move from `healthCheck.ts`:
```typescript
export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: string;
}
```

**4. Create `src/types/labels.ts`**

Move from `labelResolver.ts`:
```typescript
export interface LabelResolutionResult {
  resolved: boolean;
  labelName?: string;
  resourceName?: string;
}
```

**5. Create `src/types/cache.ts`**

**⚠️ NOTE:** Review cache inconsistencies in `refactoring-decisions.md` from Phase 0 before creating this!

Move from cache files:
```typescript
// Base interface that all cache data must extend
export interface BaseCacheData {
  timestamp: number;
}

export interface ContactCacheData extends BaseCacheData {
  contacts: any[]; // TODO: Type this properly
}

export interface CompanyCacheData extends BaseCacheData {
  companies: Record<string, string>;
}

export interface FolderCacheData extends BaseCacheData {
  jobFolders: FolderMapping[];
  lifeEventFolders: FolderMapping[];
}
```

**Why `BaseCacheData`?** This ensures all cache types have `timestamp` for type-safe BaseCache implementation.

#### Move Inline Types to Existing Type Files

**Add to `src/types/validation.ts`:**
```typescript
export interface PathValidationResult {
  valid: boolean;
  error?: string;
}
```

**Add to `src/types/linkedin.ts`:**
```typescript
export interface NoteUpdateResult {
  updated: boolean;
  contactId: string;
  note?: string;
}

export interface ConnectionWithDetails {
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  url: string;
}

export type ContactGroupMap = Record<string, string>;
```

**Add to `src/types/contact.ts`:**
```typescript
export interface SyncableContact {
  resourceName: string;
  firstName: string;
  lastName: string;
  company?: string;
  // ... other fields
}

export type SimilarityType = 'exact' | 'fuzzy' | 'partial';

export interface DuplicateMatch {
  contact: ContactData;
  similarityType: SimilarityType;
  score: number;
}
```

**Create `src/types/syncStats.ts` or add to `src/types/script.ts`:**
```typescript
export interface Stats {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}
```

**Add to `src/types/logger.ts`:**
```typescript
export interface WarningEntry {
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}
```

**Add to `src/types/statistics.ts`:**
```typescript
export interface FileMetadata {
  path: string;
  size: number;
  modified: Date;
}

export interface FolderData {
  name: string;
  files: FileMetadata[];
  totalSize: number;
}
```

#### Update Imports Across Codebase

Update all files that use these types to import from the types/ folder.

#### Export from types/index.ts

**⚠️ NOTE:** DO NOT export Settings from here (it stays in settings/)

```typescript
export * from './prompt';
export * from './monitoring';
export * from './labels';
export * from './cache';
export * from './syncStats';
// DO NOT ADD: export * from './settings'; - Settings stays in settings/
```

### Success Criteria
- ✅ All new type files created (EXCEPT settings.ts)
- ✅ Settings type remains in settings/settings.ts
- ✅ All inline types moved
- ✅ All imports updated
- ✅ types/index.ts exports all NEW types (not Settings)
- ✅ No circular dependencies created (verify with `pnpm build`)
- ✅ All tests pass

---

## 3.2 Consolidate Cache Implementation

### Problem
`companyCache.ts`, `contactCache.ts`, and `folderCache.ts` have nearly identical read/write/invalidate patterns with only schema and TTL differences.

**⚠️ CRITICAL NOTES:**
1. Review decisions in `refactoring-decisions.md` from Phase 0 first!
2. Decide on singleton pattern (getInstance vs constructor)
3. Decide on error handling (safeParse vs parse)
4. Standardize TTL approach
5. ContactCache has extra methods (getByEmail, etc.) - keep these!

### Actions

#### Resolve Pre-Flight Decisions

Before implementing, decide:
- [ ] Singleton or not? (Recommend: all singletons for consistency)
- [ ] safeParse or parse? (Recommend: safeParse + invalidate for safety)
- [ ] TTL source? (Recommend: standardize to one constant)

#### Create Generic Base Cache

**Create `src/cache/baseCache.ts`:**
```typescript
import { promises as fs } from 'fs';
import { z } from 'zod';
import { ErrorUtils } from '../utils';

// FIXED: Enforce that T must have timestamp field for type safety
export abstract class BaseCache<T extends { timestamp: number }> {
  constructor(
    protected cacheFilePath: string,
    protected expirationMs: number,
    protected schema: z.ZodSchema<T>
  ) {}

  async get(): Promise<T | null> {
    try {
      const fileContent = await fs.readFile(this.cacheFilePath, 'utf-8');
      
      // Use safeParse for better error handling (standardized approach)
      const result = this.schema.safeParse(JSON.parse(fileContent));
      
      if (!result.success) {
        // Invalid schema - invalidate cache
        await this.invalidate();
        return null;
      }
      
      const data = result.data;
      const now = Date.now();
      
      // Type-safe now that T extends { timestamp: number }
      if (now - data.timestamp < this.expirationMs) {
        return data;
      }
      
      // Expired - invalidate
      await this.invalidate();
      return null;
    } catch {
      return null;
    }
  }

  async set(data: T): Promise<void> {
    try {
      const dir = this.cacheFilePath.substring(0, this.cacheFilePath.lastIndexOf('/'));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: unknown) {
      console.warn(
        'Failed to write cache:',
        ErrorUtils.getErrorMessage(error)
      );
    }
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {}
  }
}
```

**Key improvements from original plan:**
1. ✅ `T extends { timestamp: number }` for type safety
2. ✅ Uses `safeParse()` and invalidates on schema failure (standardized)
3. ✅ Uses `ErrorUtils.getErrorMessage()` from Phase 1
4. ✅ Invalidates expired cache automatically

#### Update Cache Implementations

**⚠️ Decision Point:** Choose singleton or not. Example below uses getInstance() for consistency.

**1. Update `src/cache/companyCache.ts`:**

**Before (57 lines):**
```typescript
export class CompanyCache {
  private readonly cacheFilePath: string;
  private readonly expirationMs: number;
  
  constructor() { /* ... */ }
  async get(): Promise<CompanyCacheData | null> { /* 15 lines */ }
  async set(data: CompanyCacheData): Promise<void> { /* 15 lines */ }
  async invalidate(): Promise<void> { /* 5 lines */ }
}
```

**After (~15 lines):**
```typescript
import { BaseCache } from './baseCache';
import { CompanyCacheData } from '../types/cache';
import { companyCacheDataSchema } from '../entities/linkedinConnection.schema';
import { SETTINGS } from '../settings';
import { join } from 'path';

export class CompanyCache extends BaseCache<CompanyCacheData> {
  private static instance: CompanyCache;
  
  private constructor() {
    super(
      join(SETTINGS.linkedin.cachePath, 'company-mappings.json'),
      SETTINGS.linkedin.cacheExpirationDays * 24 * 60 * 60 * 1000,
      companyCacheDataSchema
    );
  }
  
  static getInstance(): CompanyCache {
    if (!CompanyCache.instance) {
      CompanyCache.instance = new CompanyCache();
    }
    return CompanyCache.instance;
  }
}
```

**2. Update `src/cache/contactCache.ts`:**

**⚠️ CRITICAL:** ContactCache has cache-specific methods - keep them!

**After (~40 lines - still reduced from 125):**
```typescript
import { BaseCache } from './baseCache';
import { ContactCacheData } from '../types/cache';
import type { ContactData } from '../types/contact';
import { VALIDATION_CONSTANTS } from '../constants';
import { UrlNormalizer } from '../services/linkedin/urlNormalizer';
import { SETTINGS } from '../settings';
import { join } from 'path';

export class ContactCache extends BaseCache<ContactCacheData> {
  private static instance: ContactCache;

  private constructor() {
    super(
      join(SETTINGS.linkedin.cachePath, 'contact-cache.json'),
      VALIDATION_CONSTANTS.CACHE.TTL_MS,
      contactCacheDataSchema // You'll need to create this schema
    );
  }

  static getInstance(): ContactCache {
    if (!ContactCache.instance) {
      ContactCache.instance = new ContactCache();
    }
    return ContactCache.instance;
  }

  // KEEP THESE CACHE-SPECIFIC METHODS:
  
  async getByLinkedInSlug(url: string): Promise<ContactData | null> {
    const data = await this.get();
    if (!data) return null;
    
    const slug = UrlNormalizer.extractProfileSlug(url);
    for (const contact of data.contacts) {
      for (const website of contact.websites) {
        if (website.url.toLowerCase().includes('linkedin')) {
          const contactSlug = UrlNormalizer.extractProfileSlug(website.url);
          if (contactSlug === slug) {
            return contact;
          }
        }
      }
    }
    return null;
  }

  async getByEmail(email: string): Promise<ContactData[]> {
    const data = await this.get();
    if (!data) return [];
    
    const emailLower = email.toLowerCase();
    const matches: ContactData[] = [];
    
    for (const contact of data.contacts) {
      for (const contactEmail of contact.emails) {
        if (contactEmail.value.toLowerCase() === emailLower) {
          matches.push(contact);
          break;
        }
      }
    }
    return matches;
  }

  async getByResourceName(resourceName: string): Promise<ContactData | null> {
    const data = await this.get();
    if (!data) return null;
    
    for (const contact of data.contacts) {
      if (contact.resourceName === resourceName) {
        return contact;
      }
    }
    return null;
  }
}
```

**3. Update `src/cache/folderCache.ts`:**

Similar to CompanyCache - extend BaseCache, add getInstance(). Reduce to ~15 lines.

### Success Criteria
- ✅ BaseCache created with type-safe `T extends { timestamp: number }`
- ✅ Cache inconsistencies resolved (review `refactoring-decisions.md`)
- ✅ CompanyCache extends BaseCache with getInstance() (~15 lines)
- ✅ ContactCache extends BaseCache with getInstance() (~40 lines, keeps cache-specific methods)
- ✅ FolderCache extends BaseCache with getInstance() (~15 lines)
- ✅ All three caches use same pattern (singleton, safeParse, etc.)
- ✅ ~100-120 lines of code removed (accounting for cache-specific methods)
- ✅ Add unit tests for BaseCache (address `test-coverage-gaps.md`)
- ✅ All cache tests pass
- ✅ Build succeeds: `pnpm build`

---

## 3.3 Consolidate API Call Patterns

### Problem
Repeated "load groups, then paginate connections" pattern across 5+ files.

### Actions

#### Create API Helpers

**Create `src/services/api/apiHelpers.ts`:**
```typescript
import { people_v1 } from 'googleapis';
import { ApiTracker } from './apiTracker';
import { ContactGroup } from '../../types/api';

export class ApiHelpers {
  static async fetchContactGroups(
    service: people_v1.People,
    apiTracker: ApiTracker
  ): Promise<ContactGroup[]> {
    const response = await service.contactGroups.list();
    apiTracker.trackRead();
    
    return (response.data.contactGroups || [])
      .filter((group) => group.resourceName && group.name)
      .map((group) => ({
        resourceName: group.resourceName!,
        name: group.name!,
      }));
  }

  static async fetchAllConnections(
    service: people_v1.People,
    apiTracker: ApiTracker,
    pageSize: number = 1000
  ): Promise<people_v1.Schema$Person[]> {
    const connections: people_v1.Schema$Person[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize,
        pageToken,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships',
      });
      apiTracker.trackRead();

      if (response.data.connections) {
        connections.push(...response.data.connections);
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return connections;
  }
}
```

**Add to `src/services/api/index.ts`:**
```typescript
export { ApiHelpers } from './apiHelpers';
```

#### Update Call Sites

**Files to update:**

1. **contactSyncer.ts (lines 46-72, 305-333)**

**Before:**
```typescript
const groupsResponse = await service.contactGroups.list();
this.apiTracker.trackRead();
const groups = groupsResponse.data.contactGroups || [];
// ... pagination logic
```

**After:**
```typescript
import { ApiHelpers } from '../api';

const groups = await ApiHelpers.fetchContactGroups(service, this.apiTracker);
const connections = await ApiHelpers.fetchAllConnections(service, this.apiTracker);
```

2. **duplicateDetector.ts (lines 285-318)**
3. **linkedin/contactSyncer.ts (lines 329-332)**
4. **contactEditor.ts (lines 1130-1133, 1162-1165)**
5. **eventsJobsSync.ts (lines 1784-1787)**

### Success Criteria
- ✅ ApiHelpers utility created
- ✅ All 5+ call sites updated
- ✅ Consistent API call patterns
- ✅ ~100 lines of code removed
- ✅ All tests pass

---

## 3.4 Consolidate Folder Scanning Logic

### Problem
Similar folder scanning logic in:
1. `src/scripts/eventsJobsSync.ts` (lines 249-276)
2. `src/services/statistics/statisticsCollector.ts` (lines 151-173)

### Actions

#### Create Shared Folder Scanner

**Create `src/services/folders/folderScanner.ts`:**
```typescript
import { promises as fs } from 'fs';
import { join } from 'path';

export interface ScanOptions {
  recursive?: boolean;
  includeHidden?: boolean;
  filePattern?: RegExp;
}

export interface FolderScanResult {
  path: string;
  name: string;
  isDirectory: boolean;
  files?: string[];
  size?: number;
}

export class FolderScanner {
  static async scanJobLifeEventFolders(
    basePath: string,
    options: ScanOptions = {}
  ): Promise<FolderScanResult[]> {
    const results: FolderScanResult[] = [];
    
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          const folderPath = join(basePath, entry.name);
          const files = await fs.readdir(folderPath);
          
          results.push({
            path: folderPath,
            name: entry.name,
            isDirectory: true,
            files: files.filter((f) => !f.startsWith('.')),
          });
        }
      }
    } catch (error) {
      console.error('Error scanning folders:', error);
    }
    
    return results;
  }
}
```

**Add to `src/services/folders/index.ts`:**
```typescript
export { FolderScanner } from './folderScanner';
```

#### Update Call Sites

**1. Update `src/scripts/eventsJobsSync.ts` (lines 249-276)**

**Before:**
```typescript
const entries = await fs.readdir(basePath, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) {
    // ... 20+ lines
  }
}
```

**After:**
```typescript
import { FolderScanner } from '../services/folders';

const folders = await FolderScanner.scanJobLifeEventFolders(basePath);
// Map to specific DTO if needed
```

**2. Update `src/services/statistics/statisticsCollector.ts` (lines 151-173)**

Similar pattern - replace with FolderScanner call.

### Success Criteria
- ✅ FolderScanner utility created
- ✅ Both call sites updated
- ✅ Consistent folder scanning
- ✅ ~50 lines of code removed
- ✅ All tests pass

---

## 3.5 Consolidate ENOENT/EEXIST Error Handling

### Problem
Repeated ENOENT/EEXIST handling patterns in:
- `eventsJobsSync.ts` (6 locations)
- `statisticsCollector.ts` (3 locations)

### Actions

#### Enhance ErrorUtils

**Update `src/utils/errorUtils.ts`:**
```typescript
export class ErrorUtils {
  static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  static isFileNotFound(error: unknown): boolean {
    return (error as any).code === 'ENOENT';
  }

  static isFileExists(error: unknown): boolean {
    return (error as any).code === 'EEXIST';
  }

  static async ignoreFileNotFound<T>(
    operation: () => Promise<T>
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (this.isFileNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  static async ignoreFileExists<T>(
    operation: () => Promise<T>,
    defaultValue: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isFileExists(error)) {
        return defaultValue;
      }
      throw error;
    }
  }
}
```

#### Replace Repeated try/catch Blocks

**Update `src/scripts/eventsJobsSync.ts`:**

**Before (repeated pattern):**
```typescript
try {
  await fs.readFile(path, 'utf-8');
} catch (error) {
  if ((error as any).code === 'ENOENT') {
    // handle not found
  }
  throw error;
}
```

**After:**
```typescript
import { ErrorUtils } from '../utils';

const content = await ErrorUtils.ignoreFileNotFound(
  () => fs.readFile(path, 'utf-8')
);
if (!content) {
  // handle not found
}
```

**Locations in eventsJobsSync.ts:**
- Line ~406
- Line ~485
- Line ~530
- Line ~1569
- And 2 more locations

**Update `src/services/statistics/statisticsCollector.ts`:**

Similar pattern in 3 locations.

### Success Criteria
- ✅ ErrorUtils enhanced with file error helpers
- ✅ All 6 locations in eventsJobsSync updated
- ✅ All 3 locations in statisticsCollector updated
- ✅ ~50 lines of code removed
- ✅ All tests pass

---

## Phase 3 Checklist

- [ ] **3.1 Move Types to types/ Folder**
  - [ ] ⚠️ DO NOT create src/types/settings.ts (keep Settings in settings/)
  - [ ] Review type-dependencies.md from Phase 0
  - [ ] Create src/types/prompt.ts
  - [ ] Create src/types/monitoring.ts
  - [ ] Create src/types/labels.ts
  - [ ] Create src/types/cache.ts (with BaseCacheData)
  - [ ] Add PathValidationResult to validation.ts
  - [ ] Add LinkedIn types to linkedin.ts
  - [ ] Add contact types to contact.ts
  - [ ] Create src/types/syncStats.ts or update script.ts
  - [ ] Add WarningEntry to logger.ts
  - [ ] Add file types to statistics.ts
  - [ ] Update all imports (20+ files)
  - [ ] Update types/index.ts exports (NOT including settings)
  - [ ] Verify no circular dependencies: `pnpm build`
  - [ ] Run tests

- [ ] **3.2 Consolidate Cache Implementation**
  - [ ] Review and resolve decisions in refactoring-decisions.md
  - [ ] Decide: singleton pattern for all caches
  - [ ] Decide: safeParse vs parse (recommend safeParse)
  - [ ] Decide: standardize TTL approach
  - [ ] Create src/cache/baseCache.ts (type-safe with extends)
  - [ ] Create schema for ContactCacheData if needed
  - [ ] Update CompanyCache to extend BaseCache + getInstance()
  - [ ] Update ContactCache to extend BaseCache + getInstance() + keep cache-specific methods
  - [ ] Update FolderCache to extend BaseCache + getInstance()
  - [ ] Add unit tests for BaseCache
  - [ ] Verify ~100-120 lines removed
  - [ ] Run cache tests
  - [ ] Run full test suite

- [ ] **3.3 Consolidate API Call Patterns**
  - [ ] Create src/services/api/apiHelpers.ts
  - [ ] Add to services/api/index.ts
  - [ ] Update contactSyncer (2 locations)
  - [ ] Update duplicateDetector (1 location)
  - [ ] Update linkedin/contactSyncer (1 location)
  - [ ] Update contactEditor (2 locations)
  - [ ] Update eventsJobsSync (1 location)
  - [ ] Verify ~100 lines removed
  - [ ] Run tests

- [ ] **3.4 Consolidate Folder Scanning**
  - [ ] Create src/services/folders/folderScanner.ts
  - [ ] Add to services/folders/index.ts
  - [ ] Update eventsJobsSync (1 location)
  - [ ] Update statisticsCollector (1 location)
  - [ ] Verify ~50 lines removed
  - [ ] Run tests

- [ ] **3.5 Consolidate Error Handling**
  - [ ] Enhance src/utils/errorUtils.ts
  - [ ] Update eventsJobsSync (6 locations)
  - [ ] Update statisticsCollector (3 locations)
  - [ ] Verify ~50 lines removed
  - [ ] Run tests

- [ ] **Final Phase 3 Validation**
  - [ ] Run validation script: `./scripts/validate-refactoring.sh`
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run linter: `pnpm lint`
  - [ ] Check build: `pnpm build`
  - [ ] Verify no circular dependencies created
  - [ ] Verify ~300 lines removed
  - [ ] Verify types/ folder is comprehensive (except Settings)
  - [ ] Verify cache patterns are consistent
  - [ ] Compare with baseline: `diff test-results-before.txt <(pnpm test 2>&1)`
  - [ ] Commit changes with clear message
  - [ ] Create PR or merge to main

---

**Next Step:** Proceed to [Phase 4: Documentation and Polish](./REFACTORING_PLAN_PHASE4.md)
