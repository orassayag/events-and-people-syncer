# Emergency Rollback Instructions

**Created:** March 19, 2026  
**Purpose:** Instructions for rolling back refactoring if critical issues occur

## ⚠️ IMPORTANT: Git Repository Not Initialized

The workspace at `/Users/orassayag/Repos/events-and-people-syncer/code` is **NOT** currently a git repository.

### Immediate Action Required

Before proceeding with refactoring, **you must initialize git**:

```bash
cd /Users/orassayag/Repos/events-and-people-syncer/code

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Pre-refactoring snapshot - $(date +%Y-%m-%d)"

# Create rollback tag
git tag "before-refactoring-$(date +%Y-%m-%d)" -m "Snapshot before major refactoring effort"

# Optional: Add remote and push
# git remote add origin <your-repo-url>
# git push -u origin main
# git push origin "before-refactoring-$(date +%Y-%m-%d)"
```

## Rollback Procedures (After Git Init)

### Quick Rollback (Discard ALL Changes)

```bash
# Stop all work
git status

# Discard all changes since tag (⚠️ DESTRUCTIVE)
git reset --hard before-refactoring-YYYY-MM-DD

# Or checkout the tag
git checkout before-refactoring-YYYY-MM-DD
```

### Partial Rollback (Specific Files)

```bash
# Rollback a specific file
git checkout before-refactoring-YYYY-MM-DD -- path/to/file.ts

# Rollback entire directory
git checkout before-refactoring-YYYY-MM-DD -- src/types/

# Rollback multiple files
git checkout before-refactoring-YYYY-MM-DD -- src/cache/*.ts
```

### Rollback Specific Phase

```bash
# If you used branches per phase:
git checkout main
git branch -D refactor/phase-1

# If you committed to main:
git log --oneline  # Find commit before phase
git reset --hard <commit-hash>
```

## Alternative: Manual File Backups

Since git is not currently available, **create manual backups**:

```bash
# Create backup directory
mkdir -p ../backups/code-backup-$(date +%Y%m%d)

# Copy entire codebase
cp -r . ../backups/code-backup-$(date +%Y%m%d)/

# Or create tar archive
tar -czf ../backups/code-backup-$(date +%Y%m%d).tar.gz .

# Verify backup
ls -lh ../backups/
```

### Restoring from Manual Backup

```bash
# Navigate to parent directory
cd /Users/orassayag/Repos/events-and-people-syncer

# Rename current (broken) code
mv code code-broken-$(date +%Y%m%d)

# Restore from backup
cp -r backups/code-backup-YYYYMMDD code

# Or extract from tar
tar -xzf backups/code-backup-YYYYMMDD.tar.gz -C code
```

## Phase-Specific Rollback Points

### If Phase 1 Causes Issues

**Problem:** Import changes broke the build  
**Rollback:**
```bash
git checkout before-refactoring-YYYY-MM-DD -- src/types/
# Re-run tests
pnpm test
```

### If Phase 2 Causes Issues

**Problem:** Utility consolidation broke functionality  
**Rollback:**
```bash
git checkout before-refactoring-YYYY-MM-DD -- src/utils/
# Re-run tests
pnpm test
```

### If Phase 3 Causes Issues

**Problem:** Cache refactoring broke data persistence  
**Rollback:**
```bash
git checkout before-refactoring-YYYY-MM-DD -- src/cache/
# Clear cache files
rm -rf sources/.cache/*.json
# Re-run tests
pnpm test
```

## Verification After Rollback

```bash
# 1. Verify files restored
ls -la src/

# 2. Run tests
pnpm test

# 3. Try to build
pnpm build

# 4. Run linter
pnpm lint

# 5. Compare with baseline
diff test-results-before.txt <(pnpm test 2>&1)
```

## Emergency Contact Points

If rollback fails or data is corrupted:

1. Check backup directory: `/Users/orassayag/Repos/events-and-people-syncer/backups/`
2. Check terminal history for commands that broke things
3. Review error logs in `logs/` directory
4. Restore from baseline files created in Phase 0

## Baseline Files for Reference

These files were created in Phase 0 and represent the working state:

- `test-results-before.txt` - Test output
- `build-output-before.txt` - Build output  
- `lint-output-before.txt` - Lint output
- `file-count-before.txt` - File count (122 files)
- `loc-count-before.txt` - Lines of code (15,063)

## Prevention Tips

1. ✅ **Commit after each major change**
2. ✅ **Use descriptive commit messages**
3. ✅ **Run tests before committing**
4. ✅ **Create branches for each phase**
5. ✅ **Never force push to main**
6. ✅ **Keep backups of critical files**

---

**Status:** ⚠️ Git not initialized - must be set up before refactoring  
**Rollback Tag:** `before-refactoring-YYYY-MM-DD` (to be created after git init)

## CRITICAL WARNING

🚨 **DO NOT PROCEED WITH REFACTORING WITHOUT GIT OR BACKUPS** 🚨

Without version control or backups:
- You cannot easily undo changes
- You risk losing working code
- Recovery from errors is extremely difficult

**Next Step:** Initialize git repository OR create manual backup before starting Phase 1.
