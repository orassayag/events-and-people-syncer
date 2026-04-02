# File Naming Convention Update

## Summary

All TypeScript files in the `src/` directory have been renamed to follow camelCase naming convention, matching the POC project style.

## Changes Made

### Services
- `AuthService.ts` → `authService.ts`
- `ApiTracker.ts` → `apiTracker.ts`
- `RetryHandler.ts` → `retryHandler.ts`
- `RateLimitMonitor.ts` → `rateLimitMonitor.ts`
- `ContactService.ts` → `contactService.ts`
- `DuplicateDetector.ts` → `duplicateDetector.ts`

### Infrastructure
- `Logger.ts` → `logger.ts`
- `AppError.ts` → `appError.ts`
- `ErrorCodes.ts` → `errorCodes.ts`
- `HealthCheck.ts` → `healthCheck.ts`

## Naming Convention Rules

1. **camelCase for all files**: First letter lowercase, subsequent words capitalized
   - ✅ `authService.ts`
   - ❌ `AuthService.ts`

2. **Match exported class/function**: File name matches the primary export
   - File: `apiTracker.ts` exports class `ApiTracker`
   - File: `errorCodes.ts` exports enum `ErrorCode`

3. **Consistency with POC**: All files follow the same pattern as the original POC
   - POC: `contactCache.ts`, `apiTracker.ts`, `statusBar.ts`
   - New: `authService.ts`, `duplicateDetector.ts`, `healthCheck.ts`

## Import Updates

All import statements have been updated to reference the renamed files through their barrel exports (index.ts files). Examples:

```typescript
// Before
import { Logger } from './Logger';
import { AppError } from './AppError';
import { AuthService } from './AuthService';

// After
import { Logger } from './logger';
import { AppError } from './appError';
import { AuthService } from './authService';
```

## Verification

✅ TypeScript build passes
✅ Prettier format check passes
✅ All imports resolved correctly
✅ No PascalCase `.ts` files remain in src/

## Benefits

1. **Consistency**: Matches POC naming convention throughout the codebase
2. **Clarity**: Clear distinction between file names (camelCase) and class names (PascalCase)
3. **Cross-platform**: Avoids case-sensitivity issues on different operating systems
4. **TypeScript best practice**: File names in camelCase, exports in PascalCase

## Files Affected

Total files renamed: 10
- 6 service files
- 3 infrastructure files  
- 1 monitoring file

All changes are backward compatible through barrel exports.
