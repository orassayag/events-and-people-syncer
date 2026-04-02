# ESC Navigation Plan Update Summary

**Date:** March 19, 2026

## Overview

The ESC Navigation Implementation Plan has been significantly updated to use a **result object pattern** instead of an **error-throwing pattern**. This change simplifies the implementation, reduces code complexity, and improves type safety.

## Major Changes

### 1. Return Value Pattern Instead of Error Throwing

**Old Approach:**
```typescript
try {
  const value = await selectWithEscape<string>({...});
  // use value
} catch (error) {
  if (error instanceof EscapeSignal) {
    return; // Handle ESC
  }
  throw error;
}
```

**New Approach:**
```typescript
const result = await selectWithEscape<string>({...});
if (result.escaped) {
  return; // Handle ESC
}
const value = result.value;
// use value
```

### 2. New Type Definition

```typescript
export type PromptResult<T> = 
  | { escaped: true }
  | { escaped: false; value: T };
```

### 3. Raw Mode Keypress Detection

The implementation now explicitly documents the use of Node.js `readline` module in raw mode:

```typescript
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

const onKeypress = (str, key) => {
  if (key?.name === 'escape') {
    ac.abort();
    cleanup();
    resolve({ escaped: true });
  }
};
```

### 4. AbortSignal Integration

Explicitly uses `@inquirer/prompts` native AbortSignal support (added Sept 2024):

```typescript
const result = await promptFn({ ...config, signal: ac.signal });
```

When aborted, inquirer throws `AbortPromptError` which is caught and converted to `{ escaped: true }`.

## Benefits of New Approach

### 1. No Try-Catch Pollution
- **50% less code** per prompt
- No risk of accidentally swallowing errors
- Clearer separation between navigation and errors

### 2. Simplified Nested Flows
- **Old**: Had to re-throw EscapeSignal in every nested catch block
- **New**: Just check `escaped` flag at each level

### 3. Better TypeScript Support
- Type narrowing works correctly: when `escaped` is false, TypeScript knows `value` exists
- No need for type assertions

### 4. Easier Testing
- Mocks return simple objects: `{ escaped: false, value: 'test' }`
- No need to mock error classes
- Clearer test intent

### 5. Singleton Protection
- `isActive` flag prevents nested ESC handlers
- Prevents multiple raw mode activations
- Prevents terminal corruption

## Updated Sections

### Core Implementation
- Added "Core Technical Approach" section explaining the raw mode + AbortSignal pattern
- Updated Implementation Strategy to mention result object pattern
- Clarified singleton pattern with active state tracking

### Architecture
- Changed wrapper function signatures to return `PromptResult<T>`
- Added `PromptResult<T>` type definition
- Added `isListenerActive()` method to singleton
- Kept `EscapeSignal` class for backward compatibility where needed

### Migration Patterns
All 8 patterns updated to show result object approach:
- Pattern 1: Simple Select - no try-catch needed
- Pattern 2: Input with Validation - check escaped flag
- Pattern 3: Confirm - check escaped flag
- Pattern 4: Checkbox - check escaped flag
- Pattern 5: Nested Flows - **greatly simplified**, no re-throw needed
- Pattern 6: While Loop - cleaner with flag check instead of catch
- Pattern 7: Do-While Loop - unchanged (no prompts)
- Pattern 8: UserCancelledError - most can use result pattern

### ESC Behavior Matrix
- Updated to show "Return `{ escaped: true }`" instead of "Throw EscapeSignal"
- Added row for nested prompt attempts (throws error)

### API Differences Table
- Added rows for new patterns:
  - Try-catch requirement: ❌ Not needed
  - Returns: `PromptResult<T>` object

### Common Pitfalls
Updated all 10 pitfalls to reflect result pattern:
- Checking `result.escaped` instead of catching errors
- TypeScript type narrowing considerations
- No more re-throwing concerns

### Testing Strategy
- Updated mock examples to return `PromptResult` objects
- Changed test assertions from "throws EscapeSignal" to "returns { escaped: true }"
- Added test for singleton preventing nested handlers

### Implementation Checklist
- Phase 1: Added `PromptResult<T>` type and `isActive` flag
- Phases 4-6: Changed from "add try-catch" to "check result.escaped"
- Phase 7: Updated test mocks to return result objects

## New Sections Added

### 1. Key Improvements Over Original Approach
Side-by-side comparison showing:
- Less code (50% reduction)
- Simplified nested flows
- Singleton protection details
- Native AbortSignal integration
- Easier testing

### 2. Success Criteria Updates
Added new criteria:
- Singleton prevents nested ESC handlers
- No try-catch pollution for ESC handling
- TypeScript type narrowing works correctly

## Resource Cleanup

Updated cleanup strategy to show:
1. Raw mode keypress listener detects ESC
2. AbortController signals abort
3. Listeners removed
4. Terminal mode restored
5. Singleton active flag cleared
6. Return result object
7. Caller checks flag

## Estimated Effort Change

**Old Estimate:** 12-16 hours
**New Estimate:** 10-14 hours

**Reason:** Result pattern is simpler to implement and test than error handling pattern.

## Backward Compatibility

The plan keeps `EscapeSignal` class for:
- Legacy code that might need gradual migration
- Special cases where throwing is preferred
- Interfacing with existing error handling

Most code should use the result pattern, but `EscapeSignal` remains available.

## Next Steps

1. ✅ Review updated plan
2. Create prototype of `promptWithEscape.ts` utility
3. Test prototype with one simple file (e.g., `src/index.ts`)
4. Validate approach works as expected
5. Proceed with full migration following updated plan

## Questions Addressed

### Q: Does this work with @inquirer/prompts?
**A:** Yes! `@inquirer/prompts` v8+ has native AbortSignal support. When we call `abort()`, inquirer throws `AbortPromptError` which we catch and convert to `{ escaped: true }`.

### Q: What about nested prompts?
**A:** The singleton `isActive` flag prevents this. If you try to start a prompt while another is active, it throws an error immediately.

### Q: What about try-catch in nested code?
**A:** No longer needed! The result object pattern means ESC handling is explicit at each prompt level, not via exception bubbling.

### Q: How do we test this?
**A:** Mocks return `{ escaped: false, value: 'test' }` for normal completion or `{ escaped: true }` for ESC. Much simpler than mocking errors.

---

**Summary:** The updated plan provides a cleaner, simpler, and more maintainable approach to ESC navigation by using result objects instead of exceptions. The core technical approach (raw mode + AbortSignal) remains the same, but the user-facing API is significantly improved.
