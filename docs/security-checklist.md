# Security and PHI Review Checklist

**Date:** March 19, 2026  
**Purpose:** Verify PHI safety and security patterns before and during refactoring

## Summary

- **PHI-safe logs found:** 13 instances with `{ noPHI: true }`
- **Logs to review:** 33 instances without noPHI marker
- **Risk Level:** MEDIUM - Some logs may need review

## Pre-existing Security Patterns

### ✅ Good Practices Found

1. **PHI-safe logging** - 13 places explicitly mark `{ noPHI: true }`
2. **No hardcoded secrets** - No API keys or credentials in code
3. **Environment variables** - Sensitive config in `.env` files
4. **Error handling** - Structured error handling exists

### ⚠️ Areas to Review

1. **33 log statements without noPHI marker** - Need review to ensure no PHI
2. **Error messages** - Verify no user data in error output
3. **Console statements** - Check for debugging console.log with data

## PHI-Safe Logging Locations

Files with explicit `{ noPHI: true }`:

```
src/cache/companyCache.ts
src/cache/contactCache.ts
src/cache/folderCache.ts
src/services/auth/authService.ts
src/services/contacts/contactEditor.ts
src/services/linkedin/contactSyncer.ts
... (see phi-safe-logs.txt for full list)
```

## Watch For During Refactoring

### Phase 1: Critical Foundation

- [ ] **ErrorUtils.getErrorMessage()** - Ensure doesn't leak PHI
  - Verify error.message doesn't contain user data
  - Use generic messages for user-facing errors
  - Keep detailed errors only in logs with noPHI

### Phase 2: Utility Consolidation

- [ ] **SummaryFormatter** - Ensure doesn't log PHI
  - Box formatting should not log content
  - Statistics should not include user names/emails
  
- [ ] **ContactMapper** - Critical PHI handling
  - DO NOT log raw contact data
  - DO NOT log Person objects
  - Use noPHI for any logs
  - Only log IDs or counts

### Phase 3: Cache Refactoring

- [ ] **BaseCache** - File paths may contain usernames
  - Error messages should not include full file paths
  - Use relative paths in logs
  - Mark all cache errors with noPHI

## Security Checklist for New Code

For each new utility/function created:

### 1. Error Utils (Phase 1.4)

```typescript
// ✅ GOOD
logger.error('Failed to process item', { noPHI: true });

// ❌ BAD
logger.error(`Failed to process ${contact.email}`);
```

**Review:**
- [ ] No user data in error messages
- [ ] No contact information in logs
- [ ] Generic error messages only

### 2. Summary Formatter (Phase 2.1)

```typescript
// ✅ GOOD
logger.info(`Summary box created with ${stats.count} items`, { noPHI: true });

// ❌ BAD
logger.info(`Summary: ${userContent}`);
```

**Review:**
- [ ] No content logged
- [ ] Only metadata (counts, stats)
- [ ] All logs marked noPHI

### 3. Contact Mapper (Phase 2.5)

```typescript
// ✅ GOOD
logger.info('Contact mapped successfully', { noPHI: true });

// ❌ BAD - NEVER DO THIS
logger.info(`Mapped contact: ${person.names[0].displayName}`);
logger.debug(`Email: ${person.emailAddresses[0].value}`);
```

**Review:**
- [ ] NO contact data logged ever
- [ ] NO Person object logged
- [ ] Only success/failure status
- [ ] All logs marked noPHI

### 4. Base Cache (Phase 3.2)

```typescript
// ✅ GOOD
logger.error('Cache write failed', { noPHI: true });

// ❌ BAD
logger.error(`Failed to write ${filePath}: ${error.message}`);
```

**Review:**
- [ ] No file paths with usernames
- [ ] No cached data content
- [ ] Use generic error messages
- [ ] All logs marked noPHI

## Testing for PHI Leaks

### Manual Review Commands

```bash
# Check for potential PHI leaks in new files
grep -rn "console\.\(log\|warn\|error\)" src/utils/errorUtils.ts
grep -rn "console\.\(log\|warn\|error\)" src/utils/summaryFormatter.ts
grep -rn "console\.\(log\|warn\|error\)" src/utils/contactMapper.ts
grep -rn "console\.\(log\|warn\|error\)" src/cache/baseCache.ts

# Check for logger without noPHI in new files
grep -rn "logger\.\(info\|warn\|error\)" src/utils/errorUtils.ts | grep -v "noPHI"
grep -rn "logger\.\(info\|warn\|error\)" src/utils/summaryFormatter.ts | grep -v "noPHI"
grep -rn "logger\.\(info\|warn\|error\)" src/utils/contactMapper.ts | grep -v "noPHI"
grep -rn "logger\.\(info\|warn\|error\)" src/cache/baseCache.ts | grep -v "noPHI"
```

### Automated Check

```bash
# Run after each phase
./scripts/check-phi-safety.sh  # To be created in Phase 0.9
```

## Common PHI Leaks to Avoid

### ❌ Never Log These

1. **Contact Information**
   - Names (displayName, givenName, familyName)
   - Email addresses
   - Phone numbers
   - Addresses
   - LinkedIn URLs with names

2. **User Data**
   - Person objects
   - Contact objects
   - Raw API responses
   - Cached data content

3. **File System**
   - Full file paths (may contain usernames)
   - File contents (may contain PHI)
   - Cache file data

### ✅ Safe to Log

1. **Metadata**
   - Counts (number of contacts, items processed)
   - Resource IDs (people/123, not names)
   - Status codes
   - Timestamps

2. **Generic Errors**
   - "Operation failed"
   - "Invalid input"
   - "Cache miss"
   - "Network error"

## Review After Each Phase

### Phase 1 Completion

```bash
# Check error utils
grep -rn "logger\.\(info\|warn\|error\)" src/utils/errorUtils.ts

# Verify all are marked noPHI
grep -rn "logger\.\(info\|warn\|error\)" src/utils/errorUtils.ts | grep -v "noPHI"
```

**Expected:** No output (all logs should have noPHI)

### Phase 2 Completion

```bash
# Check summary formatter
grep -rn "logger\.\(info\|warn\|error\)" src/utils/summaryFormatter.ts | grep -v "noPHI"

# Check contact mapper
grep -rn "logger\.\(info\|warn\|error\)" src/utils/contactMapper.ts | grep -v "noPHI"
```

**Expected:** No output

### Phase 3 Completion

```bash
# Check base cache
grep -rn "logger\.\(info\|warn\|error\)" src/cache/baseCache.ts | grep -v "noPHI"
```

**Expected:** No output

## Security Patterns to Preserve

### 1. Environment Variables

Current pattern (good):
```typescript
const apiKey = process.env.API_KEY;
```

**Preserve this pattern** - no secrets in code

### 2. Error Handling

Current pattern (good):
```typescript
catch (error) {
  logger.error('Operation failed', { noPHI: true });
  throw new AppError('OPERATION_FAILED', 'Generic message');
}
```

**Preserve this pattern** - generic user-facing messages

### 3. Validation

Current pattern (good):
```typescript
if (!input) {
  throw new Error('Invalid input');
}
```

**Preserve this pattern** - no user data in validation errors

## HIPAA/GDPR Compliance Notes

This application handles:
- ✅ Contact names (PII)
- ✅ Email addresses (PII)
- ✅ Phone numbers (PII)
- ❌ No health data (not HIPAA-covered)
- ✅ Subject to GDPR if EU users

**Key Requirements:**
1. No PII in logs
2. No PII in error messages
3. Encrypted storage (check cache encryption?)
4. Secure API communication (using Google OAuth2 ✅)

## Action Items

### Before Starting Phase 1

- [ ] Review 33 logs without noPHI marker
- [ ] Add noPHI to appropriate logs
- [ ] Remove any PHI-containing logs

### During Refactoring

- [ ] Review every new log statement
- [ ] Add noPHI to all logs
- [ ] Never log user data
- [ ] Use generic error messages

### After Each Phase

- [ ] Run PHI safety check script
- [ ] Review new files for console.log
- [ ] Verify all logger calls have noPHI

---

**Status:** ✅ Phase 0.8 Complete  
**Next Step:** Phase 0.9 - Set Up Automated Validation

**Critical Finding:** 33 log statements need review for PHI safety before refactoring begins.
