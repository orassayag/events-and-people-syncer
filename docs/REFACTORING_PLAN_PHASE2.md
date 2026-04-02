# Phase 2: Important Consolidations (Medium-High Impact)

**Estimated Time:** 2-3 days  
**Files Affected:** ~30 files  
**Lines Removed:** ~500 lines

## Overview

Phase 2 consolidates major duplicate logic patterns across the codebase, particularly summary formatting, validation, and data transformation code that is repeated in multiple places.

---

## 2.1 Consolidate Summary Box Formatting

### Problem
Nearly identical summary box formatting logic duplicated in 4 places with hard-coded widths (55, 56).

**Duplicate locations:**
1. `ContactDisplay.displaySummary` (contactDisplay.ts lines 85-94)
2. `linkedinSync.displaySummary` (linkedinSync.ts lines 345-427)
3. `eventsJobsSync.displayFinalSummary` (eventsJobsSync.ts lines 1810-1819)
4. `statistics.displayStatistics` (statistics.ts lines 160-182)

### Actions

#### Create Shared Formatter

**Create `src/utils/summaryFormatter.ts`:**
```typescript
import { FormatUtils } from '../constants';

export class SummaryFormatter {
  static displaySummary(
    title: string,
    lines: string[],
    width: number = 56,
    logger?: { info: (msg: string, meta: any, display: boolean) => void }
  ): void {
    const output = logger
      ? (msg: string) => logger.info(msg, {}, false)
      : console.log;

    output('\n' + FormatUtils.padLineWithEquals(title, width));
    lines.forEach((line) => output(FormatUtils.padLineWithEquals(line, width)));
    output('='.repeat(width));
  }
}
```

**Add to `src/utils/index.ts`:**
```typescript
export { SummaryFormatter } from './summaryFormatter';
```

#### Add Constant

**Add to `src/constants/uiConstants.ts`:**
```typescript
export const SUMMARY_BOX_WIDTH = 56;
```

#### Update Call Sites

**1. ContactDisplay (src/services/contacts/contactDisplay.ts lines 85-94)**

**Before:**
```typescript
this.logger.info('\n' + FormatUtils.padLineWithEquals('Contact Summary', 56), {}, false);
lines.forEach((line) => this.logger.info(FormatUtils.padLineWithEquals(line, 56), {}, false));
this.logger.info('='.repeat(56), {}, false);
```

**After:**
```typescript
import { SummaryFormatter } from '../../utils';
import { SUMMARY_BOX_WIDTH } from '../../constants';

SummaryFormatter.displaySummary('Contact Summary', lines, SUMMARY_BOX_WIDTH, this.logger);
```

**2. LinkedIn Sync (src/scripts/linkedinSync.ts lines 345-427)**

**Before:**
```typescript
console.log('\n' + FormatUtils.padLineWithEquals('Summary', 55));
summaryLines.forEach((line) => console.log(FormatUtils.padLineWithEquals(line, 55)));
console.log('='.repeat(55));
```

**After:**
```typescript
import { SummaryFormatter } from '../utils';
import { SUMMARY_BOX_WIDTH } from '../constants';

SummaryFormatter.displaySummary('Summary', summaryLines, SUMMARY_BOX_WIDTH);
```

**3. Events/Jobs Sync (src/scripts/eventsJobsSync.ts lines 1810-1819)**

Similar pattern - replace with SummaryFormatter call.

**4. Statistics (src/scripts/statistics.ts lines 160-182)**

Similar pattern - replace with SummaryFormatter call.

### Success Criteria
- ✅ SummaryFormatter utility created
- ✅ SUMMARY_BOX_WIDTH constant defined
- ✅ All 4 call sites updated
- ✅ Consistent width used everywhere
- ✅ All tests pass

---

## 2.2 Consolidate Validation Logic

### Problem
Folder name validation, label validation, and path validation duplicated across multiple files with subtle differences.

### Actions

#### Centralize Folder Name Validation in FolderManager

**Remove inline validation from `src/scripts/eventsJobsSync.ts`:**

**Locations:**
- Lines 381-389 (event/folder name validation)
- Lines 1419-1434 (company name validation with duplicate regex)
- Lines 1449-1466 (folder rename validation with duplicate regex)

**Replace with:**
```typescript
this.folderManager.validateFolderName(folderName);
```

**Ensure FolderManager has:**
```typescript
validateFolderName(name: string): void {
  if (!name || !name.trim()) {
    throw new Error('Folder name cannot be empty');
  }
  if (name.length > 255) {
    throw new Error('Folder name too long (max 255 characters)');
  }
  // Add any other validation rules
}
```

#### Centralize Label Validation

**Remove inline validation from `src/scripts/eventsJobsSync.ts` (lines 788-799)**

**Replace with:**
```typescript
import { InputValidator } from '../validators';

InputValidator.validateLabelName(labelName);
```

**Ensure InputValidator has:**
```typescript
static validateLabelName(label: string): void {
  if (!label || !label.trim()) {
    throw new Error('Label name cannot be empty');
  }
  if (!RegexPatterns.LABEL_NAME.test(label)) {
    throw new Error('Label name contains invalid characters');
  }
}
```

#### Consolidate Path Existence Checks

**Update `src/services/statistics/statisticsCollector.ts` (lines 67-86)**

**Replace direct fs.access calls:**
```typescript
try {
  await fs.access(path);
} catch {
  // handle error
}
```

**With PathValidator:**
```typescript
import { PathValidator } from '../../validators';

const exists = await PathValidator.validatePathExists(path);
if (!exists) {
  // handle error
}
```

**Add to PathValidator:**
```typescript
static async validatePathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
```

**Update `src/scripts/eventsJobsSync.ts`:**

Replace direct fs.access calls at:
- Line 406
- Line 485
- Line 530
- Line 1569

#### Remove Unused ValidationHelpers

**Delete or integrate `src/regex/validationHelpers.ts` if not used anywhere.**

Verify with:
```bash
grep -r "ValidationHelpers" src/
```

### Success Criteria
- ✅ Folder validation centralized in FolderManager
- ✅ Label validation uses InputValidator
- ✅ Path checks use PathValidator
- ✅ All inline validation removed
- ✅ All tests pass

---

## 2.3 Consolidate Formatting Utilities

### Problem
- `formatCompanyToPascalCase` duplicated in 3 places
- `formatNumberWithLeadingZeros` duplicated in 3 places with different defaults

### Actions

#### formatCompanyToPascalCase Consolidation

**Keep implementation in `src/utils/textUtils.ts` (lines 37-47):**
```typescript
static formatCompanyToPascalCase(company: string): string {
  if (!company || !company.trim()) {
    return '';
  }
  const words = company.trim().split(/\s+/);
  const pascalCaseWords = words.map((word: string) => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return pascalCaseWords.join('');
}
```

**Remove from:**
1. `src/services/contacts/contactSyncer.ts` (lines 522-532)
2. `src/services/linkedin/contactSyncer.ts` (lines 388-398)

**Update imports:**
```typescript
import { TextUtils } from '../../utils';

// Usage:
const formatted = TextUtils.formatCompanyToPascalCase(company);
```

#### formatNumberWithLeadingZeros Consolidation

**Keep implementation in `src/constants/formatUtils.ts` (lines 3-9):**

Ensure it has configurable digits parameter:
```typescript
static formatNumberWithLeadingZeros(num: number, digits: number = 5): string {
  return num
    .toString()
    .padStart(digits, '0')
    .replace(RegexPatterns.NUMBER_GROUPING, ',');
}
```

**Remove from:**
1. `src/utils/textUtils.ts` (lines 31-33)
2. Already removed from TextParser in Phase 1

**Update all callers:**
```typescript
import { FormatUtils } from '../constants';

// Usage:
const formatted = FormatUtils.formatNumberWithLeadingZeros(count, 5);
```

### Success Criteria
- ✅ Only one formatCompanyToPascalCase implementation exists
- ✅ Only one formatNumberWithLeadingZeros implementation exists
- ✅ All callers updated
- ✅ All tests pass

---

## 2.4 Consolidate Retry Logic

### Problem
Two retry implementations:
- `retryWithBackoff` (used widely)
- `RetryHandler` (not used anywhere)

### Actions

#### Search for RetryHandler Usage

```bash
grep -r "RetryHandler" src/
```

Expected: Only in the file definition and barrel export.

#### Remove Unused RetryHandler

**Delete:**
```bash
rm src/services/api/retryHandler.ts
```

**Remove from `src/services/api/index.ts`:**
```typescript
// REMOVE THIS LINE:
export { RetryHandler } from './retryHandler';
```

#### Keep retryWithBackoff

Keep `src/utils/retryWithBackoff.ts` as the single retry mechanism.

Ensure it's exported from `src/utils/index.ts`:
```typescript
export { retryWithBackoff } from './retryWithBackoff';
```

### Success Criteria
- ✅ RetryHandler deleted
- ✅ No imports of RetryHandler remain
- ✅ retryWithBackoff is the only retry utility
- ✅ All tests pass

---

## 2.5 Consolidate Person → ContactData Mapping

### Problem
Large mapping block duplicated in:
1. `src/services/contacts/contactSyncer.ts` (lines 93-135)
2. `src/services/contacts/duplicateDetector.ts` (lines 329-361)

### Actions

#### Create Shared Mapping Function

**Create `src/services/contacts/contactMapper.ts`:**
```typescript
import { people_v1 } from 'googleapis';
import { ContactData } from '../../types';

export class ContactMapper {
  static mapPersonToContactData(
    person: people_v1.Schema$Person,
    groupIdToName: Record<string, string>
  ): ContactData {
    const resourceName = person.resourceName || '';
    const names = person.names?.[0];
    const firstName = names?.givenName || '';
    const lastName = names?.familyName || '';
    
    const organizations = person.organizations?.[0];
    const company = organizations?.name || '';
    const jobTitle = organizations?.title || '';
    
    const emails = person.emailAddresses?.map((email) => ({
      value: email.value || '',
      type: email.type || 'other',
    })) || [];
    
    const phoneNumbers = person.phoneNumbers?.map((phone) => ({
      value: phone.value || '',
      type: phone.type || 'other',
    })) || [];
    
    const urls = person.urls?.map((url) => ({
      value: url.value || '',
      type: url.type || 'other',
    })) || [];
    
    const labels = person.memberships
      ?.filter((m) => m.contactGroupMembership?.contactGroupResourceName)
      .map((m) => {
        const groupId = m.contactGroupMembership!.contactGroupResourceName!;
        return groupIdToName[groupId] || groupId;
      })
      .filter((label) => label !== 'myContacts' && label !== 'starred') || [];
    
    return {
      resourceName,
      firstName,
      lastName,
      company,
      jobTitle,
      emails,
      phoneNumbers,
      websites: urls,
      labels,
    };
  }
}
```

**Add to `src/services/contacts/index.ts`:**
```typescript
export { ContactMapper } from './contactMapper';
```

#### Update Both Files

**1. Update `src/services/contacts/contactSyncer.ts` (lines 93-135)**

**Before:**
```typescript
const resourceName = person.resourceName || '';
const names = person.names?.[0];
// ... 40+ lines of mapping
```

**After:**
```typescript
import { ContactMapper } from './contactMapper';

const contact = ContactMapper.mapPersonToContactData(person, groupIdToName);
```

**2. Update `src/services/contacts/duplicateDetector.ts` (lines 329-361)**

Same pattern - replace with ContactMapper call.

### Success Criteria
- ✅ ContactMapper utility created
- ✅ Both call sites updated
- ✅ Consistent mapping logic
- ✅ All tests pass

---

## Phase 2 Checklist

- [ ] **2.1 Consolidate Summary Formatting**
  - [ ] Create src/utils/summaryFormatter.ts
  - [ ] Add SUMMARY_BOX_WIDTH constant
  - [ ] Update ContactDisplay (1 file)
  - [ ] Update linkedinSync (1 file)
  - [ ] Update eventsJobsSync (1 file)
  - [ ] Update statistics (1 file)
  - [ ] Run tests

- [ ] **2.2 Consolidate Validation Logic**
  - [ ] Centralize folder validation in FolderManager
  - [ ] Remove inline folder validation (3 locations in eventsJobsSync)
  - [ ] Centralize label validation in InputValidator
  - [ ] Remove inline label validation (1 location)
  - [ ] Add PathValidator.validatePathExists()
  - [ ] Update statisticsCollector (1 file)
  - [ ] Update eventsJobsSync path checks (4 locations)
  - [ ] Remove unused ValidationHelpers if applicable
  - [ ] Run tests

- [ ] **2.3 Consolidate Formatting Utilities**
  - [ ] Keep formatCompanyToPascalCase in TextUtils
  - [ ] Remove from contactSyncer (1 file)
  - [ ] Remove from linkedin/contactSyncer (1 file)
  - [ ] Update formatNumberWithLeadingZeros in FormatUtils
  - [ ] Remove from textUtils (1 file)
  - [ ] Update all callers
  - [ ] Run tests

- [ ] **2.4 Consolidate Retry Logic**
  - [ ] Verify RetryHandler is unused
  - [ ] Delete src/services/api/retryHandler.ts
  - [ ] Remove from services/api/index.ts
  - [ ] Verify retryWithBackoff is exported
  - [ ] Run tests

- [ ] **2.5 Consolidate Person → ContactData Mapping**
  - [ ] Create src/services/contacts/contactMapper.ts
  - [ ] Add to services/contacts/index.ts
  - [ ] Update contactSyncer (1 file)
  - [ ] Update duplicateDetector (1 file)
  - [ ] Run tests

- [ ] **Final Phase 2 Validation**
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run linter: `pnpm lint`
  - [ ] Check build: `pnpm build`
  - [ ] Verify ~500 lines removed
  - [ ] Commit changes with clear message
  - [ ] Create PR or merge to main

---

**Next Step:** Proceed to [Phase 3: Structural Improvements](./REFACTORING_PLAN_PHASE3.md)
