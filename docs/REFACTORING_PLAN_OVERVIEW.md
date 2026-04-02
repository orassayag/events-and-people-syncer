# Events and People Syncer - Comprehensive Refactoring Plan

## Executive Summary

This refactoring plan addresses critical code duplication (DRY violations), import patterns, type organization, validation consolidation, and documentation updates identified through deep codebase analysis.

**Goal:** Eliminate 1000+ lines of duplicate code, consolidate scattered types, establish consistent patterns, and improve maintainability.

**⚠️ IMPORTANT:** This plan has been reviewed and revised. Start with Phase 0 (Pre-Flight Checks) - do not skip it!

## Overview of Issues

### Critical Problems
- **ContactGroup** defined in 6 places
- **EditableContactData** defined in 3 places  
- **OAuth2Client** type alias in 10+ files
- **TextParser** duplicates 100% of TextUtils functionality
- Error message extraction pattern repeated 15+ times
- Import patterns inconsistent (direct file imports vs barrel exports)

### Impact
- 1000+ lines of duplicate code
- 100+ files with incorrect import patterns
- 20+ types scattered in implementation files instead of types/ folder
- 12+ documentation files with outdated information

## Plan Structure

This refactoring plan is split into 5 phases:

### [Phase 0: Pre-Flight Checks](./REFACTORING_PLAN_PHASE0.md) (MANDATORY - Do First)
- Capture current state baseline
- Identify test coverage gaps
- Check for test mocks and dynamic imports
- Analyze type dependencies
- Create git safety net
- Set up automated validation

**Impact:** Establishes safety net, prevents mistakes, enables rollback

### [Phase 1: Critical Foundation](./REFACTORING_PLAN_PHASE1.md) (High Impact, High Priority)
- Consolidate duplicate type definitions
- Fix import patterns to use barrel exports
- Remove TextParser duplicate
- Consolidate error message extraction

**Impact:** Fixes 100+ files, eliminates major type duplication

### [Phase 2: Important Consolidations](./REFACTORING_PLAN_PHASE2.md) (Medium-High Impact)
- Consolidate summary box formatting
- Consolidate validation logic
- Consolidate formatting utilities
- Remove unused RetryHandler
- Consolidate Person → ContactData mapping

**Impact:** Eliminates 500+ lines of duplicate code

### [Phase 3: Structural Improvements](./REFACTORING_PLAN_PHASE3.md) (Medium Impact)
- Move types to types/ folder
- Consolidate cache implementation
- Consolidate API call patterns
- Consolidate folder scanning logic
- Consolidate error handling

**Impact:** Improves architecture, reduces code by ~300 lines

### [Phase 4: Documentation and Polish](./REFACTORING_PLAN_PHASE4.md) (Lower Priority, High Value)
- Update critical documentation
- Update implementation documentation
- Consolidate console usage (optional)
- Test infrastructure improvements (optional)

**Impact:** Ensures documentation matches reality

## Success Metrics

- ✅ Eliminate 1000+ lines of duplicate code
- ✅ Reduce from 6 → 1 ContactGroup definitions
- ✅ Fix 100+ incorrect imports to use barrel exports
- ✅ Move 20+ types from implementation files to types/ folder
- ✅ Update 12 outdated documentation files
- ✅ Improve test maintainability with shared mock factories

## Implementation Order

1. **Phase 0 First** (2-3 hours) - Pre-flight checks (MANDATORY)
2. **Phase 1 Second** (2-3 days) - Critical foundations
3. **Phase 2 Third** (2-3 days) - Important consolidations
4. **Phase 3 Fourth** (3-4 days) - Structural improvements
5. **Phase 4 Last** (2-3 days) - Documentation updates

**Total Estimated Time:** 11-16 days (includes 20% buffer)

**Original Estimate:** 6-10 days (revised after deep analysis)

## Risk Mitigation

- ✅ **Phase 0 creates baseline** - can compare before/after
- ✅ **Git tag for rollback** - can revert all changes instantly
- ✅ **Automated validation scripts** - catch issues immediately
- ✅ Run full test suite after each phase
- ✅ Test in isolation before committing
- ✅ Update one file pattern at a time
- ✅ Keep backups of modified files (via git)
- ✅ Use git branches for each phase
- ✅ **Import validation** - verify all imports resolve
- ✅ **PHI safety review** - ensure no PHI leaks in new code
- ✅ **Security checklist** - review new utilities

**New safeguards added:**
- Pre-flight checks to identify risks before starting
- Rollback procedures documented
- Automated testing between changes
- Type dependency analysis to prevent circular imports

## Quick Reference

| Phase | Files Changed | Lines Removed | Priority |
|-------|---------------|---------------|----------|
| Phase 1 | ~100 | ~200 | Critical |
| Phase 2 | ~30 | ~500 | High |
| Phase 3 | ~50 | ~300 | Medium |
| Phase 4 | ~15 docs | N/A | Medium |

## Getting Started

**⚠️ CRITICAL: Start with Phase 0!**

1. Read [Phase 0: Pre-Flight Checks](./REFACTORING_PLAN_PHASE0.md)
2. Run all Phase 0 baseline captures and safety checks (2-3 hours)
3. Review `refactoring-decisions.md` created in Phase 0
4. Create a git branch: `git checkout -b refactor/phase-0`
5. Create rollback tag as instructed in Phase 0
6. Only then, read [Phase 1: Critical Foundation](./REFACTORING_PLAN_PHASE1.md)
7. Create a git branch: `git checkout -b refactor/phase-1`
8. Follow the phase plan step by step
9. Run `./scripts/validate-refactoring.sh` after each major change
10. Commit frequently with clear messages

**DO NOT skip Phase 0. It's your safety net.**

## Additional Resources

- [REFACTORING_PLAN_PHASE0.md](./REFACTORING_PLAN_PHASE0.md) - **Start here!**
- [INFRASTRUCTURE_MIGRATION_PLAN.md](./INFRASTRUCTURE_MIGRATION_PLAN.md) - Overall architecture migration
- [CHANGELOG.md](../CHANGELOG.md) - Track completed changes
- [LOGGING_STRATEGY.md](./LOGGING_STRATEGY.md) - Logging patterns
- [FILE_NAMING_CONVENTION.md](./FILE_NAMING_CONVENTION.md) - Naming standards

## Critical Notes and Decisions

### Edge Cases Addressed
1. **Settings type NOT moved** - Stays in `settings/settings.ts` co-located with implementation
2. **BaseCache type-safe** - Uses `T extends { timestamp: number }` for type safety
3. **ContactCache keeps extra methods** - getByEmail, getByLinkedInSlug, etc. preserved
4. **OAuth2Client uses import type** - Ensures type-only import, no runtime impact
5. **EditableContactData optional fields** - Requires usage audit before making optional
6. **Import changes done incrementally** - One pattern at a time with testing between
7. **PHI safety preserved** - All new utilities reviewed for PHI leaks
8. **Test coverage gaps documented** - New utilities need tests added

### Suspicious Patterns to Resolve
These are documented in `refactoring-decisions.md` created during Phase 0:
- Cache TTL inconsistency (different constants used)
- Cache singleton pattern inconsistency
- FolderCache schema validation differs from others
- FolderCache path in linkedin.cachePath (should it be separate?)
- Summary box width (55 vs 56)

Make decisions on these during implementation.

---

**Created:** March 18, 2026  
**Status:** Planning Phase  
**Next Step:** Begin Phase 1
