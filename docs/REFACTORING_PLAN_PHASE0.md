# Phase 0: Pre-Flight Checks (MANDATORY - Do First)

**Estimated Time:** 2-3 hours  
**Files Affected:** 0 (analysis only)  
**Purpose:** Establish baseline, identify risks, and prepare for safe refactoring

## Overview

Phase 0 is a critical preparation phase that must be completed before any code changes. It captures the current state, identifies potential issues, and sets up safety mechanisms for the refactoring process.

**⚠️ DO NOT skip this phase. It's your safety net.**

---

## 0.1 Capture Current State Baseline

### Problem
Before refactoring, we need to know what "working" looks like so we can detect regressions.

### Actions

#### Run Full Test Suite
```bash
cd /Users/orassayag/Repos/events-and-people-syncer/code

# Capture test results
pnpm test > test-results-before.txt 2>&1

# Review the results
cat test-results-before.txt
```

**Document:**
- Total tests: ___
- Passing: ___
- Failing: ___ (if any, document which ones)
- Test coverage: ___%

#### Verify Build Works
```bash
# Capture build output
pnpm build > build-output-before.txt 2>&1

# Check exit code
echo "Build exit code: $?"
```

**Expected:** Exit code 0 (success)

#### Run Linter
```bash
# Capture lint output
pnpm lint > lint-output-before.txt 2>&1

# Check for errors
grep -i "error" lint-output-before.txt | wc -l
```

**Document:** Number of pre-existing lint errors: ___

#### Count Files and Lines of Code
```bash
# Count TypeScript files
find src -name "*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*" | wc -l > file-count-before.txt

# Count lines of code (requires cloc: brew install cloc)
cloc src > loc-count-before.txt 2>&1 || echo "cloc not available"

# Alternative if cloc not available:
find src -name "*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*" -exec wc -l {} + | tail -1 >> loc-count-before.txt
```

### Success Criteria
- ✅ All baseline files created
- ✅ Current test pass/fail state documented
- ✅ Build succeeds
- ✅ Lint errors (if any) documented

---

## 0.2 Identify Test Coverage Gaps

### Problem
Files without tests are risky to refactor. We need to know which files lack coverage.

### Actions

#### Find Test Files
```bash
# Count test files
find src -name "*.test.ts" | wc -l

# List all test files
find src -name "*.test.ts" > test-files-list.txt
```

#### Identify Files Being Refactored Without Tests
```bash
# Check if these critical files have tests:
test -f src/parsers/__tests__/textParser.test.ts && echo "textParser: HAS TESTS" || echo "textParser: NO TESTS"
test -f src/cache/__tests__/companyCache.test.ts && echo "companyCache: HAS TESTS" || echo "companyCache: NO TESTS"
test -f src/cache/__tests__/contactCache.test.ts && echo "contactCache: HAS TESTS" || echo "contactCache: NO TESTS"
test -f src/cache/__tests__/folderCache.test.ts && echo "folderCache: HAS TESTS" || echo "folderCache: NO TESTS"
test -f src/utils/__tests__/errorUtils.test.ts && echo "errorUtils: HAS TESTS" || echo "errorUtils: NO TESTS"
```

#### Document Coverage Gaps
Create `test-coverage-gaps.md`:
```markdown
# Test Coverage Gaps

Files being refactored without test coverage:
- [ ] textParser.ts - NO TESTS (will be deleted)
- [ ] errorUtils.ts - NO TESTS (will be created)
- [ ] summaryFormatter.ts - NO TESTS (will be created)
- [ ] contactMapper.ts - NO TESTS (will be created)
- [ ] baseCache.ts - NO TESTS (will be created)

Action items:
1. Add tests for errorUtils after Phase 1.4
2. Add tests for summaryFormatter after Phase 2.1
3. Add tests for contactMapper after Phase 2.5
4. Add tests for baseCache after Phase 3.2
```

### Success Criteria
- ✅ Test file count documented
- ✅ Coverage gaps identified
- ✅ Plan to add tests for new utilities created

---

## 0.3 Check for Test Mock File Paths

### Problem
Mocks that reference specific file paths will break when files are moved or imports change.

### Actions

#### Search for Mock Patterns
```bash
# Find all mock declarations
grep -r "vi\.mock\|jest\.mock" src/ > mock-patterns.txt 2>&1 || echo "No mocks found"

# Find mock file imports
grep -r "from.*__mocks__" src/ >> mock-patterns.txt 2>&1 || echo "No mock imports found"

# Review the results
cat mock-patterns.txt
```

#### Document Mock Files
Create `mock-files-to-update.md`:
```markdown
# Mock Files That May Need Updates

## Mock declarations found:
(paste results from grep above)

## Action items:
- [ ] Review each mock after import changes
- [ ] Update mock paths in Phase 1.2 if needed
- [ ] Test each affected test file after changes
```

### Success Criteria
- ✅ All mock patterns identified
- ✅ Mock file list created
- ✅ Plan to update mocks documented

---

## 0.4 Search for Dynamic Imports

### Problem
Dynamic imports (`import()`) break differently than static imports and need special attention.

### Actions

#### Find Dynamic Imports
```bash
# Search for dynamic import patterns
grep -r "import(" src/ > dynamic-imports.txt 2>&1 || echo "No dynamic imports found"

# Also check for require patterns (shouldn't exist in ESM but check anyway)
grep -r "require(" src/ >> dynamic-imports.txt 2>&1 || echo "No require found"

# Review results
cat dynamic-imports.txt
```

#### Document Findings
If any dynamic imports found:
```markdown
# Dynamic Imports Found

(list them here)

⚠️ WARNING: These will NOT be updated by simple find/replace
Action: Manually update after import changes in Phase 1.2
```

### Success Criteria
- ✅ Dynamic import search completed
- ✅ If found, documented for manual review

---

## 0.5 Analyze Type Dependencies

### Problem
Moving types can create circular dependencies if not done carefully.

### Actions

#### Map Current Type Imports
```bash
# Create a dependency map
echo "# Type Import Dependencies" > type-dependencies.md
echo "" >> type-dependencies.md

# For each type file, show what it imports
for file in src/types/*.ts; do
  echo "## $(basename $file)" >> type-dependencies.md
  echo "" >> type-dependencies.md
  grep "^import.*from.*types" "$file" | head -20 >> type-dependencies.md 2>&1 || echo "  No type imports" >> type-dependencies.md
  echo "" >> type-dependencies.md
done

# Review the map
cat type-dependencies.md
```

#### Check for Potential Circular Dependencies
Document in `type-dependencies.md`:
```markdown
## Potential Circular Dependency Risks

After analyzing imports, these types import from each other:
- contact.ts → api.ts
- api.ts → contact.ts
(example - fill in actual findings)

⚠️ Action: Move these types in dependency order during Phase 3.1
- First: Move leaf types (no dependencies)
- Last: Move types that depend on others
```

### Success Criteria
- ✅ Type dependency map created
- ✅ No circular dependencies identified (or documented if found)
- ✅ Move order planned for Phase 3.1

---

## 0.6 Check EditableContactData Usage

### Problem
Phase 1.1 makes `company` and `jobTitle` optional in EditableContactData. Need to verify no code assumes they're required.

### Actions

#### Find All Usage
```bash
# Find where EditableContactData is used
grep -rn "EditableContactData" src/ --include="*.ts" > editable-contact-data-usage.txt

# Find direct property access that might break
grep -rn "\.company\." src/ --include="*.ts" | grep -v "company\?" >> editable-contact-data-usage.txt
grep -rn "\.jobTitle\." src/ --include="*.ts" | grep -v "jobTitle\?" >> editable-contact-data-usage.txt

# Review results
cat editable-contact-data-usage.txt
```

#### Document Findings
Create `editable-contact-data-review.md`:
```markdown
# EditableContactData Property Access Review

## Files that access .company or .jobTitle:
(paste results here)

## Action items for Phase 1.1:
- [ ] Review each usage
- [ ] Add optional chaining (?.) or null checks where needed
- [ ] Test each file after making fields optional
```

### Success Criteria
- ✅ All usage of EditableContactData.company found
- ✅ All usage of EditableContactData.jobTitle found
- ✅ Plan to add safety checks documented

---

## 0.7 Create Git Safety Net

### Problem
Need ability to rollback if refactoring goes wrong.

### Actions

#### Commit Current State
```bash
# Ensure working directory is clean
git status

# If there are uncommitted changes, commit them first
git add -A
git commit -m "Pre-refactoring snapshot - $(date +%Y-%m-%d)"

# Create a tag for easy rollback
git tag "before-refactoring-$(date +%Y-%m-%d)" -m "Snapshot before major refactoring effort"

# Push tag to remote (optional but recommended)
git push origin "before-refactoring-$(date +%Y-%m-%d)"

# Document the tag
echo "Rollback tag: before-refactoring-$(date +%Y-%m-%d)" > refactoring-rollback-tag.txt
```

#### Create Rollback Instructions
Create `ROLLBACK.md`:
```markdown
# Emergency Rollback Instructions

If refactoring causes critical issues:

## Quick Rollback
\`\`\`bash
# Stop all work
git status

# Discard all changes (⚠️ DESTRUCTIVE)
git reset --hard before-refactoring-YYYY-MM-DD

# Or rollback to specific tag
git checkout before-refactoring-YYYY-MM-DD
\`\`\`

## Partial Rollback
\`\`\`bash
# Rollback specific file
git checkout before-refactoring-YYYY-MM-DD -- path/to/file.ts

# Rollback entire phase
git checkout before-refactoring-YYYY-MM-DD -- src/types/
\`\`\`

## Rollback Tag
\`before-refactoring-YYYY-MM-DD\`

Created: $(date)
\`\`\`

### Success Criteria
- ✅ Git working directory clean
- ✅ Rollback tag created
- ✅ Tag pushed to remote
- ✅ Rollback instructions documented

---

## 0.8 Verify PHI and Security Patterns

### Problem
Refactoring must preserve PHI safety and security patterns.

### Actions

#### Check for PHI Logging Patterns
```bash
# Find logs that explicitly mark noPHI
grep -rn "noPHI: true" src/ > phi-safe-logs.txt

# Find logs that might contain PHI (no noPHI marker)
grep -rn "logger\.\(info\|warn\|error\)" src/ | grep -v "noPHI" > potential-phi-logs.txt

# Count findings
echo "PHI-safe logs: $(wc -l < phi-safe-logs.txt)"
echo "Logs to review: $(wc -l < potential-phi-logs.txt)"
```

#### Document Security Checklist
Create `security-checklist.md`:
```markdown
# Security and PHI Review Checklist

## Pre-existing patterns to preserve:
- ✅ All error logs use \`{ noPHI: true }\` where applicable
- ✅ No secrets in error messages
- ✅ No user data in console.log statements

## Watch for during refactoring:
- [ ] ErrorUtils.getErrorMessage() doesn't leak PHI
- [ ] SummaryFormatter doesn't log PHI
- [ ] ContactMapper doesn't log raw contact data
- [ ] Cache error messages don't expose file paths with user data

## Review after each phase:
\`\`\`bash
# Check for PHI leaks
grep -rn "console\.\(log\|warn\|error\)" src/utils/errorUtils.ts
grep -rn "console\.\(log\|warn\|error\)" src/utils/summaryFormatter.ts
\`\`\`
\`\`\`

### Success Criteria
- ✅ PHI-safe logging patterns identified
- ✅ Security checklist created
- ✅ Plan to review new utilities for PHI safety

---

## 0.9 Set Up Automated Validation

### Problem
Manual testing after 100+ file changes is error-prone. Need automation.

### Actions

#### Create Validation Script
Create `scripts/validate-refactoring.sh`:
```bash
#!/bin/bash
set -e

echo "🔍 Running refactoring validation..."
echo ""

echo "📝 Step 1: Running linter..."
pnpm lint || { echo "❌ Lint failed"; exit 1; }

echo "✅ Lint passed"
echo ""

echo "🏗️  Step 2: Running build..."
pnpm build || { echo "❌ Build failed"; exit 1; }

echo "✅ Build passed"
echo ""

echo "🧪 Step 3: Running tests..."
pnpm test || { echo "❌ Tests failed"; exit 1; }

echo "✅ Tests passed"
echo ""

echo "✨ All validation checks passed!"
```

```bash
# Make it executable
chmod +x scripts/validate-refactoring.sh

# Test it
./scripts/validate-refactoring.sh
```

#### Create Import Validation Script
Create `scripts/check-imports.sh`:
```bash
#!/bin/bash
set -e

echo "🔍 Checking for broken imports..."

# Build will catch most import issues
pnpm build > /dev/null 2>&1 || {
  echo "❌ Build failed - likely broken imports"
  pnpm build
  exit 1
}

echo "✅ All imports resolve correctly"
```

```bash
# Make it executable
chmod +x scripts/check-imports.sh
```

### Success Criteria
- ✅ Validation script created and tested
- ✅ Import check script created
- ✅ Scripts work with current codebase

---

## 0.10 Document Suspicious Patterns Found

### Problem
During investigation, several inconsistencies were found that need decisions before refactoring.

### Actions

#### Create Decisions Document
Create `refactoring-decisions.md`:
```markdown
# Refactoring Decisions Needed

## 1. Cache TTL Inconsistency
**Issue:** 
- ContactCache and FolderCache use `VALIDATION_CONSTANTS.CACHE.TTL_MS`
- CompanyCache uses `SETTINGS.linkedin.cacheExpirationDays * 24 * 60 * 60 * 1000`

**Question:** Are these the same value? If not, which is correct?

**Decision:** 
- [ ] Investigate both values
- [ ] Standardize in BaseCache implementation
- [ ] Document in Phase 3.2

## 2. Cache Singleton Pattern Inconsistency
**Issue:**
- ContactCache: uses `static getInstance()` (singleton)
- CompanyCache: regular constructor (not singleton)
- FolderCache: uses `static getInstance()` (singleton)

**Question:** Should all caches be singletons or none?

**Decision:**
- [ ] Decide on pattern during Phase 3.2
- [ ] Standardize in BaseCache

## 3. FolderCache Schema Validation
**Issue:**
- FolderCache uses `safeParse()` and invalidates on schema failure
- CompanyCache/ContactCache use `parse()` and catch all errors

**Question:** Which pattern is correct?

**Decision:**
- [ ] Decide which is safer
- [ ] Implement in BaseCache during Phase 3.2

## 4. FolderCache Path
**Issue:**
- FolderCache stores "folder-mappings.json" in `SETTINGS.linkedin.cachePath`
- But folder mappings are for events/jobs, not LinkedIn

**Question:** Should folder cache use a different path?

**Decision:**
- [ ] Review during Phase 3.2
- [ ] Update if needed

## 5. Summary Box Width (55 vs 56)
**Issue:**
- Most places use width 56
- linkedinSync uses width 55

**Question:** Is this intentional or a typo?

**Decision:**
- [ ] Check if there's a reason for 55
- [ ] Standardize to 56 in Phase 2.1 unless good reason exists
```

### Success Criteria
- ✅ All suspicious patterns documented
- ✅ Questions listed for each
- ✅ Decision checkboxes added

---

## Phase 0 Checklist

- [ ] **0.1 Capture Current State Baseline**
  - [ ] Run tests, save results
  - [ ] Run build, verify success
  - [ ] Run lint, document errors
  - [ ] Count files and lines

- [ ] **0.2 Identify Test Coverage Gaps**
  - [ ] List test files
  - [ ] Check critical files for tests
  - [ ] Document coverage gaps

- [ ] **0.3 Check for Test Mock File Paths**
  - [ ] Search for vi.mock/jest.mock
  - [ ] Document mock files
  - [ ] Plan mock updates

- [ ] **0.4 Search for Dynamic Imports**
  - [ ] Search for import() patterns
  - [ ] Document if found

- [ ] **0.5 Analyze Type Dependencies**
  - [ ] Map type imports
  - [ ] Check for circular dependencies
  - [ ] Plan move order

- [ ] **0.6 Check EditableContactData Usage**
  - [ ] Find all .company accesses
  - [ ] Find all .jobTitle accesses
  - [ ] Plan safety checks

- [ ] **0.7 Create Git Safety Net**
  - [ ] Commit current state
  - [ ] Create rollback tag
  - [ ] Document rollback instructions

- [ ] **0.8 Verify PHI and Security Patterns**
  - [ ] Check noPHI logs
  - [ ] Create security checklist
  - [ ] Plan PHI review

- [ ] **0.9 Set Up Automated Validation**
  - [ ] Create validation script
  - [ ] Create import check script
  - [ ] Test scripts

- [ ] **0.10 Document Suspicious Patterns**
  - [ ] Document cache inconsistencies
  - [ ] Document other issues found
  - [ ] Create decision checklist

- [ ] **Final Phase 0 Validation**
  - [ ] All baseline files created
  - [ ] All scripts working
  - [ ] All documentation complete
  - [ ] Ready to start Phase 1

---

## Outputs from Phase 0

After completing Phase 0, you should have:

### Files Created:
- `test-results-before.txt` - Baseline test results
- `build-output-before.txt` - Baseline build output
- `lint-output-before.txt` - Baseline lint output
- `file-count-before.txt` - Baseline file count
- `loc-count-before.txt` - Baseline lines of code
- `test-files-list.txt` - List of all test files
- `test-coverage-gaps.md` - Coverage analysis
- `mock-patterns.txt` - Mock declarations found
- `mock-files-to-update.md` - Mock update plan
- `dynamic-imports.txt` - Dynamic import search results
- `type-dependencies.md` - Type dependency map
- `editable-contact-data-usage.txt` - Property access audit
- `editable-contact-data-review.md` - Review plan
- `refactoring-rollback-tag.txt` - Git rollback tag
- `ROLLBACK.md` - Rollback instructions
- `phi-safe-logs.txt` - PHI-safe logging patterns
- `potential-phi-logs.txt` - Logs to review
- `security-checklist.md` - Security review checklist
- `refactoring-decisions.md` - Decisions needed
- `scripts/validate-refactoring.sh` - Validation script
- `scripts/check-imports.sh` - Import check script

### Git Tag Created:
- `before-refactoring-YYYY-MM-DD`

### Knowledge Gained:
- Current test pass rate
- Files without test coverage
- Potential breaking changes
- Type dependencies
- Security patterns
- Rollback procedure

---

**Estimated Time:** 2-3 hours for thorough completion

**Next Step:** Review all Phase 0 outputs, make decisions in `refactoring-decisions.md`, then proceed to [Phase 1: Critical Foundation](./REFACTORING_PLAN_PHASE1.md)
