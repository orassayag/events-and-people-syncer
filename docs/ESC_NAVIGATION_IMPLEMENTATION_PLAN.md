# Enable ESC Key Navigation in CLI

> **⚠️ SUPERSEDED:** This implementation plan describes the original approach using `@inquirer/prompts` with manual ESC handling. 
> 
> **Current Implementation:** The project has migrated to `enquirer` with native ESC support. See [ENQUIRER_MIGRATION_SUMMARY.md](./ENQUIRER_MIGRATION_SUMMARY.md) for details.
> 
> **Date Superseded:** March 18, 2026

---

## Goal

Enable users to press **ESC** at any prompt (menu selection or user input) to navigate back to the previous menu or exit the application, improving the CLI user experience.

**IMPORTANT**: ESC only works during menu selections and user input prompts. During any active process (API calls, file operations, clipboard operations, spinners), ESC is ignored.

## Core Technical Approach

This implementation uses **raw mode keypress detection** combined with **AbortSignal** to provide ESC key navigation:

```typescript
// 1. Set up raw mode to intercept keypresses
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

// 2. Listen for ESC key and abort the prompt
const onKeypress = (str, key) => {
  if (key?.name === 'escape') {
    abortController.abort(); // Signals @inquirer/prompts
    cleanup();
    resolve({ escaped: true });
  }
};

// 3. Pass AbortSignal to @inquirer/prompts
const result = await promptFn({ ...config, signal: ac.signal });

// 4. Return result object instead of throwing errors
return { escaped: false, value: result };
```

**Why This Works:**
- `@inquirer/prompts` v8+ has native AbortSignal support
- Raw mode allows us to intercept ESC before inquirer processes it
- Result object pattern eliminates try-catch pollution
- Singleton manager prevents conflicting handlers

## Implementation Strategy

The migration uses a **wrapper utility pattern with raw mode keypress detection** that:

- Provides centralized ESC key detection across all prompts using Node.js `readline` module
- Uses singleton pattern with AbortController for clean resource management
- Leverages `@inquirer/prompts` native AbortSignal support (added Sept 2024)
- Returns result objects `{ escaped: boolean, value?: T }` instead of throwing errors
- Minimizes code changes in existing files (no try-catch needed for ESC)
- Maintains consistent behavior throughout the application
- Supports all operating systems and TTY environments
- Prevents nested ESC handlers through active state tracking

## Prompt Counts by File

### Production Code (7 files, 68 total prompts)

1. **src/index.ts** - 1 prompt
   - 1 list (select)

2. **src/scripts/contactsSync.ts** - 1 prompt
   - 1 list (select)

3. **src/scripts/linkedinSync.ts** - 1 prompt
   - 1 list (select)

4. **src/services/contacts/duplicateDetector.ts** - 1 prompt
   - 1 confirm

5. **src/services/contacts/eventsContactEditor.ts** - 8 prompts
   - 1 confirm
   - 7 input

6. **src/services/contacts/contactEditor.ts** - 28 prompts
   - 6 list (select)
   - 15 input
   - 1 checkbox
   - (Note: Some prompts may be in nested conditions/loops)

7. **src/scripts/eventsJobsSync.ts** - 38 prompts
   - 10 list (select)
   - 6 input
   - 12 confirm
   - (Note: Higher count due to test file having 1 confirm)

**Total: 68 prompts across production code**

### Test Files (2 files)

1. **src/scripts/__tests__/eventsJobsSync.test.ts** - Mock inquirer usage
2. **src/services/contacts/__tests__/eventsContactEditor.test.ts** - Mock inquirer usage

## Package Dependencies

Currently installed:
- `inquirer` ^9.3.8 (to be removed)
- `@types/inquirer` ^9.0.9 (to be removed)

To be installed:
- `@inquirer/prompts` latest version (8.3.2 or newer)

## Implementation Steps

### Phase 1: Foundation (New Files)

**Create: `src/utils/promptWithEscape.ts`**

This is the core utility that enables ESC functionality. See detailed specification below.

### Phase 2: Package Management

**Update: package.json**

```json
{
  "dependencies": {
    "@inquirer/prompts": "^8.3.2",
    // Remove: "inquirer": "^9.3.8",
    // Remove: "@types/inquirer": "^9.0.9",
  }
}
```

Run: `pnpm install` to update lock file

### Phase 3: Source File Migration

Migration will be done incrementally by identifying all `inquirer.prompt` calls and replacing them with the appropriate wrapper functions.

**Note**: Exact line numbers will be determined during implementation as they may shift. Files will be migrated in order from simple (1 prompt) to complex (38 prompts).

#### Migration Order

1. **Group A: Simple files (1 prompt each)**
   - src/index.ts
   - src/scripts/contactsSync.ts
   - src/scripts/linkedinSync.ts
   - src/services/contacts/duplicateDetector.ts

2. **Group B: Medium complexity**
   - src/services/contacts/eventsContactEditor.ts (8 prompts)

3. **Group C: Complex files**
   - src/services/contacts/contactEditor.ts (28 prompts, includes only checkbox)
   - src/scripts/eventsJobsSync.ts (38 prompts, complex nested menus)

### Phase 4: Test File Migration

**src/scripts/__tests__/eventsJobsSync.test.ts**
- Remove `import inquirer from 'inquirer'`
- Remove `vi.mock('inquirer')`
- Add `vi.mock('../../utils/promptWithEscape')` (adjust path)
- Mock each wrapper function individually:
  ```typescript
  import { selectWithEscape, inputWithEscape, confirmWithEscape, EscapeSignal } from '../../utils/promptWithEscape';
  
  vi.mock('../../utils/promptWithEscape', () => ({
    selectWithEscape: vi.fn(),
    inputWithEscape: vi.fn(),
    confirmWithEscape: vi.fn(),
    checkboxWithEscape: vi.fn(),
    EscapeSignal: class EscapeSignal extends Error {
      constructor() {
        super('User pressed ESC');
        this.name = 'EscapeSignal';
      }
    },
  }));
  ```
- Update all test cases to mock direct return values (not `{ name: value }`)
- Add tests for ESC behavior (throwing EscapeSignal)

**src/services/contacts/__tests__/eventsContactEditor.test.ts**
- Apply same changes as above
- Ensure parent class method mocking still works

### Phase 5: Add ESC-Specific Tests

**Create: `src/utils/__tests__/promptWithEscape.test.ts`**

Test coverage:
- EscapeSignal is properly thrown when ESC is pressed
- AbortController is cleaned up after each prompt
- TTY and non-TTY environments handled correctly
- All four wrapper functions work correctly
- Validation errors don't prevent ESC
- Default values don't prevent ESC
- Singleton pattern works correctly

**Add ESC test cases to existing test files:**
- Test ESC during input validation
- Test ESC in nested flows
- Test ESC cancels before cache modification
- Test ESC cancels in-flight operations

### Phase 6: Verification & Testing

#### Build Verification
```bash
pnpm build
```

#### Lint Check
```bash
pnpm lint
```

#### Unit Tests
```bash
NODE_OPTIONS='--no-warnings' vitest run
```

#### Manual Testing Checklist

**Main Entry Points:**
- [ ] Main menu (index.ts) - ESC should exit
- [ ] Contacts sync menu - ESC should exit
- [ ] LinkedIn sync menu - ESC should return to main
- [ ] Events & Jobs sync main menu - ESC should exit

**Events & Jobs Sync Flows:**
- [ ] Create job folder flow - ESC at each step returns to previous
- [ ] Create life event folder flow - ESC at each step returns to previous
- [ ] Write note flow - ESC cancels and returns
- [ ] Rewrite note flow - ESC cancels
- [ ] Delete note flow - ESC cancels
- [ ] Rename folder flow - ESC cancels
- [ ] Add contact flow - ESC cancels
- [ ] Deep nested (3+ levels) - ESC properly unwinds
- [ ] ESC during clipboard operations - ignored
- [ ] ESC during spinner - ignored

**Contact Editor Flows:**
- [ ] Create contact - ESC at any field cancels
- [ ] Edit contact - ESC returns to edit menu
- [ ] Edit labels - ESC cancels
- [ ] Edit email/phone - ESC cancels

**Cross-Platform Testing:**
- [ ] macOS terminal
- [ ] Windows terminal
- [ ] Linux terminal
- [ ] TTY environment
- [ ] Non-TTY environment (CI)

## Detailed Specification: promptWithEscape.ts

### Overview

This utility provides wrapper functions around `@inquirer/prompts` that enable ESC key detection for navigating back through CLI menus.

### Architecture

```typescript
import readline from 'readline';
import { input, select, confirm, checkbox } from '@inquirer/prompts';

// Result type - returns object instead of throwing errors
export type PromptResult<T> = 
  | { escaped: true }
  | { escaped: false; value: T };

// Singleton keypress manager
class EscapeKeyManager {
  private static instance: EscapeKeyManager | null = null;
  private isActive: boolean = false;
  
  static getInstance(): EscapeKeyManager;
  isListenerActive(): boolean;
  async withEscapeHandler<T>(
    promptFn: (config: any) => Promise<T>,
    config: any
  ): Promise<PromptResult<T>>;
}

// Kept for backward compatibility where needed
export class EscapeSignal extends Error {
  constructor() {
    super('User pressed ESC to go back');
    this.name = 'EscapeSignal';
  }
}

// Wrapper functions return PromptResult<T> instead of T
export async function selectWithEscape<T>(config: SelectConfig): Promise<PromptResult<T>>;
export async function inputWithEscape(config: InputConfig): Promise<PromptResult<string>>;
export async function confirmWithEscape(config: ConfirmConfig): Promise<PromptResult<boolean>>;
export async function checkboxWithEscape<T>(config: CheckboxConfig<T>): Promise<PromptResult<T[]>>;
```

### Key Features

1. **Raw Mode Keypress Detection**: Uses Node.js `readline.emitKeypressEvents()` in raw mode
2. **AbortSignal Integration**: Passes AbortSignal to `@inquirer/prompts` (native support)
3. **Result Object Pattern**: Returns `{ escaped: boolean, value?: T }` instead of throwing
4. **Singleton Pattern**: Prevents nested ESC handlers with active state tracking
5. **Automatic Cleanup**: Always restores terminal mode and removes listeners
6. **Cross-Platform**: Works on macOS, Windows, Linux
7. **TTY Detection**: Graceful fallback for non-TTY environments
8. **No Try-Catch Pollution**: Check `.escaped` flag instead of catching errors

### Implementation Details

**ESC Detection Mechanism:**
```typescript
// Set up raw mode keypress listener
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

const onKeypress = (str: string, key: readline.Key) => {
  if (key?.name === 'escape') {
    ac.abort(); // Signal inquirer to cancel
    cleanup(); // Remove listeners and restore mode
    resolve({ escaped: true }); // Return result object
  }
};
process.stdin.on('keypress', onKeypress);
```

**AbortSignal Integration:**
- Pass `signal: ac.signal` to `@inquirer/prompts` functions
- When `ac.abort()` is called, inquirer throws `AbortPromptError`
- Wrapper catches this and returns `{ escaped: true }`
- All other errors propagate normally

**TTY Handling:**
- Check `process.stdin.isTTY` before enabling raw mode
- Store original TTY state and restore in cleanup
- In non-TTY environments, ESC detection is skipped but prompts still work

**Cleanup Strategy:**
```typescript
const cleanup = () => {
  process.stdin.removeListener('keypress', onKeypress);
  if (wasTTY) process.stdin.setRawMode(false);
  this.isActive = false; // Release singleton lock
};
```
- Always called in all code paths (success, abort, error)
- Prevents resource leaks and terminal corruption

**Error Handling:**
- Catch `AbortPromptError` (thrown when signal aborted) → return `{ escaped: true }`
- Let all other errors propagate normally
- Cleanup guaranteed via try-finally pattern

### Configuration Support

All wrapper functions support the same configuration as their @inquirer/prompts counterparts:
- `message`: Prompt message
- `default`: Default value
- `validate`: Validation function (ESC works during validation)
- `choices`: For select/checkbox
- `loop`: For select (supported in v8+)
- `pageSize`: For select/checkbox
- And other prompt-specific options

### Usage Example

```typescript
import { selectWithEscape } from '../utils/promptWithEscape';

async function myMenu() {
  const result = await selectWithEscape<string>({
    message: 'What would you like to do?',
    choices: [
      { name: 'Option 1', value: 'opt1' },
      { name: 'Option 2', value: 'opt2' },
    ],
    loop: false,
  });
  
  if (result.escaped) {
    // User pressed ESC - navigate back
    return; // or process.exit(0) for top-level
  }
  
  const choice = result.value;
  // Handle choice...
}
```

**Key Benefits:**
- No try-catch needed for normal ESC navigation
- Clear, explicit check with `result.escaped`
- Real errors still throw naturally
- TypeScript knows `result.value` exists when `escaped` is false

## Migration Patterns Reference

### Pattern 1: Simple Select (List)

**Before:**
```typescript
const { action } = await inquirer.prompt([
  {
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [...],
    loop: false,
  },
]);
```

**After:**
```typescript
const result = await selectWithEscape<string>({
  message: 'What would you like to do?',
  choices: [...],
  loop: false,
});

if (result.escaped) {
  // Top-level menu: exit
  process.exit(0);
  // OR sub-menu: return to parent
  // return;
}

const action = result.value;
// Continue with action...
```

**Key Changes:**
- No try-catch needed
- Direct destructuring not needed
- Check `result.escaped` flag
- Access value via `result.value`

### Pattern 2: Input with Validation

**Before:**
```typescript
const { companyInput } = await inquirer.prompt([
  {
    type: 'input',
    name: 'companyInput',
    message: 'Company:',
    default: '',
    validate: (input: string): boolean | string => validateFn(input),
  },
]);
```

**After:**
```typescript
const result = await inputWithEscape({
  message: 'Company:',
  default: '',
  validate: (input: string): boolean | string => validateFn(input),
});

if (result.escaped) {
  // Cancel input and return to previous menu
  return;
}

const companyInput = result.value;
// Use companyInput...
```

**Note**: ESC works even during validation error state - user can press ESC to cancel instead of fixing validation.

### Pattern 3: Confirm

**Before:**
```typescript
const { shouldCreate } = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'shouldCreate',
    message: 'Create?',
    default: true,
  },
]);
```

**After:**
```typescript
const result = await confirmWithEscape({
  message: 'Create?',
  default: true,
});

if (result.escaped) {
  // User pressed ESC instead of y/n
  return;
}

const shouldCreate = result.value;
if (shouldCreate) {
  // User confirmed, proceed
}
```

**Note**: ESC returns `{ escaped: true }`, never returns the default value.

### Pattern 4: Checkbox (Multi-select)

**Before:**
```typescript
const { selectedLabels } = await inquirer.prompt([
  {
    type: 'checkbox',
    name: 'selectedLabels',
    message: 'Select labels:',
    choices: [...],
    validate: (selected) => selected.length > 0 || 'Required',
  },
]);
```

**After:**
```typescript
const result = await checkboxWithEscape<string>({
  message: 'Select labels:',
  choices: [...],
  validate: (selected) => selected.length > 0 || 'Required',
});

if (result.escaped) {
  // User pressed ESC (even if some items were selected)
  return;
}

const selectedLabels = result.value;
// Use selectedLabels array...
```

**Note**: ESC returns `{ escaped: true }` regardless of selected items. Partial selections are never returned.

### Pattern 5: Nested Flows (Simplified!)

**Before:**
```typescript
try {
  const folder = await selectFolder();
  try {
    const data = await fetchData(folder);
    await processData(data);
  } catch (error) {
    console.log('Inner error');
  }
} catch (error) {
  console.log('Outer error');
}
```

**After:**
```typescript
const folderResult = await selectFolder();
if (folderResult.escaped) {
  return; // User cancelled at folder selection
}

try {
  const data = await fetchData(folderResult.value);
  await processData(data);
} catch (error) {
  // Only handle real errors - no ESC to worry about
  console.log('Processing error:', error);
}
```

**Key Benefit**: No need to re-throw `EscapeSignal` in nested catch blocks! Just check `escaped` flag at each prompt level.

### Pattern 6: While Loop Menu

**Before:**
```typescript
while (true) {
  const { choice } = await inquirer.prompt([...]);
  if (choice === 'exit') break;
  await handleChoice(choice);
}
```

**After:**
```typescript
while (true) {
  const result = await selectWithEscape<string>({...});
  
  if (result.escaped) {
    // ESC pressed - exit loop and return to parent
    break;
  }
  
  const choice = result.value;
  if (choice === 'exit') break;
  await handleChoice(choice);
}
```

**Key Benefit**: Much cleaner than try-catch in loop - just check flag and break.

### Pattern 7: Do-While Loop

**Before:**
```typescript
let pageToken: string | undefined;
do {
  const response = await apiCall(pageToken);
  pageToken = response.nextPageToken;
} while (pageToken);
```

**After:**
```typescript
// No change needed - ESC is ignored during API calls
// ESC only works during user prompts, not during processing
let pageToken: string | undefined;
do {
  const response = await apiCall(pageToken);
  pageToken = response.nextPageToken;
} while (pageToken);
```

### Pattern 8: UserCancelledError Replacement

**Before:**
```typescript
class UserCancelledError extends Error {
  constructor() {
    super('User cancelled note creation');
    this.name = 'UserCancelledError';
  }
}

throw new UserCancelledError();
```

**After (Option 1 - Use result pattern):**
```typescript
// Most code can just check result.escaped
const result = await selectWithEscape({...});
if (result.escaped) {
  return; // Natural flow control
}
```

**After (Option 2 - Keep EscapeSignal for special cases):**
```typescript
import { EscapeSignal } from '../utils/promptWithEscape';

// For places that need to throw (e.g., deep in call stack)
throw new EscapeSignal();
```

**Migration Strategy**: 
- Most `UserCancelledError` usage can be replaced with `result.escaped` checks
- Keep `EscapeSignal` for exceptional cases where throwing is needed
- Search for all `UserCancelledError` references and update catch blocks

## ESC Behavior Matrix

| Context | User Action | Behavior | Notes |
|---------|-------------|----------|-------|
| **Menu Selection** | Press ESC | Return `{ escaped: true }` | Navigate back |
| **Text Input** | Press ESC | Return `{ escaped: true }` | Cancel input |
| **Confirm Prompt** | Press ESC | Return `{ escaped: true }` | Don't use default |
| **Checkbox Selection** | Press ESC | Return `{ escaped: true }` | Ignore partial selection |
| **During Validation** | Press ESC | Return `{ escaped: true }` | Works even with error |
| **With Default Value** | Press ESC | Return `{ escaped: true }` | Default not returned |
| **During API Call** | Press ESC | Ignored | ESC listener inactive |
| **During Clipboard Op** | Press ESC | Ignored | ESC listener inactive |
| **During Spinner** | Press ESC | Ignored | ESC listener inactive |
| **During File Op** | Press ESC | Ignored | ESC listener inactive |
| **Non-TTY Environment** | Press ESC | Not available | Prompt works normally |
| **Top-Level Menu** | `escaped: true` | Call `process.exit(0)` | Clean exit |
| **Sub-Menu** | `escaped: true` | `return` to parent | Unwind stack |
| **Nested Prompts** | Attempt | Throws Error | Only one ESC handler at a time |

## Key Changes Summary

### API Differences

| Old (inquirer v9) | New (@inquirer/prompts v8 + wrappers) |
|-------------------|----------------------------|
| `import inquirer from 'inquirer'` | `import { selectWithEscape, inputWithEscape, ... } from '../utils/promptWithEscape'` |
| `type: 'list'` | `selectWithEscape()` |
| `type: 'input'` | `inputWithEscape()` |
| `type: 'confirm'` | `confirmWithEscape()` |
| `type: 'checkbox'` | `checkboxWithEscape()` |
| `name: 'varName'` | ❌ Removed - direct return via result object |
| `await inquirer.prompt([{...}])` | `await selectWithEscape({...})` |
| `const { var } = await` | `const result = await` then check `result.escaped` |
| Array wrapper `[{...}]` | Direct object `{...}` |
| `loop` parameter | ✅ Supported in v8+ |
| Try-catch for cancellation | ❌ Not needed - check `result.escaped` flag |
| Returns value directly | Returns `PromptResult<T>` object |

### ESC Handling Strategy

| Location | ESC Handler | Action |
|----------|-------------|--------|
| **Top-level menus** | Check `result.escaped` | `process.exit(0)` |
| **Sub-menus** | Check `result.escaped` | `return` |
| **Input flows** | Check `result.escaped` | `return` |
| **While loops** | Check `result.escaped` | `break` or `return` |
| **Before cache writes** | Check `result.escaped` before write | Cache never modified |
| **During API calls** | N/A | ESC listener inactive during calls |

### SIGINT (Ctrl+C) vs ESC

| Signal | Trigger | Behavior | Use Case |
|--------|---------|----------|----------|
| **ESC** | User presses ESC key | Navigate back one level | Normal navigation |
| **SIGINT** | User presses Ctrl+C | Force exit entire app | Kill switch / emergency exit |

**Ctrl+C remains unchanged** - it calls the SIGINT handler which displays summary and exits immediately. This is the "last resort" exit option.

## Resource Cleanup Strategy

### On ESC During Prompt
1. Raw mode keypress listener detects ESC key
2. AbortController signals abort to inquirer
3. Keypress listener removed
4. Terminal mode restored to original state
5. Singleton active flag cleared
6. Return `{ escaped: true }` to caller
7. Caller checks flag and takes appropriate action (return/exit/break)

### On ESC Before Cache Write
- **Goal**: ESC should cancel operation before cache is modified
- **Implementation**: Check `result.escaped` before any cache operations
- **Example**:
  ```typescript
  const folderResult = await selectFolder();
  if (folderResult.escaped) {
    return; // Exit before any cache modification
  }
  
  const nameResult = await inputName();
  if (nameResult.escaped) {
    return; // Exit before any cache modification
  }
  
  // If we reach here, user completed all prompts
  await cache.set(folderResult.value, nameResult.value); // Atomic operation
  ```

### On ESC During In-Flight API Calls
- **Goal**: Prevent confusion when ESC is pressed during API operations
- **Solution**: ESC listener is only active during prompts, not during processing
- **Implementation**: Singleton's `isActive` flag ensures no listener during API calls
- **Behavior**: If user presses ESC during API call, nothing happens (as expected)
- **Future Enhancement**: Could add timeout or cancellation for very long API calls

### Console Capture Interference
The code captures console.log/error for logging. This implementation is safe because:
1. ESC detection uses `process.stdin` (raw mode), not stdout/stderr
2. Raw mode doesn't interfere with console output capture
3. Cleanup happens before any console output from ESC handling
4. Terminal mode is restored deterministically in all paths

**Implementation considerations**:
```typescript
const result = await selectWithEscape({...});
// At this point: terminal mode already restored, listeners removed
if (result.escaped) {
  // Safe to log - no raw mode active
  await logger.flush();
  return;
}
```

**Testing**: Verify console capture works correctly during and after ESC events.

## Common Pitfalls to Avoid

1. **Destructuring error**: Don't use `const { var } = await selectWithEscape(...)` - returns `PromptResult<T>` object
2. **Forgetting to check escaped**: Always check `result.escaped` before accessing `result.value`
3. **Array wrapper**: Don't wrap config in array - use direct object `{...}` not `[{...}]`
4. **Testing ESC during process**: ESC only works during prompts, not during API/file operations
5. **Nested ESC handlers**: Singleton prevents this - will throw error if attempted
6. **Assuming escaped means error**: `escaped: true` is normal navigation, not an error condition
7. **Not handling escaped in while loops**: Check `result.escaped` and break/continue appropriately
8. **Mixing old and new patterns**: Don't use try-catch for ESC handling - use result object
9. **Cache before validation**: Check all `result.escaped` flags before any cache writes
10. **Forgetting TypeScript narrowing**: TypeScript knows `result.value` exists when `escaped` is false

## Testing Strategy

### Unit Test Coverage

**promptWithEscape.test.ts:**
- ✅ Result object structure (`{ escaped: boolean, value?: T }`)
- ✅ selectWithEscape returns correct result type
- ✅ inputWithEscape returns correct result type
- ✅ confirmWithEscape returns correct result type
- ✅ checkboxWithEscape returns correct result type
- ✅ ESC key triggers `escaped: true` (mock keypress)
- ✅ Normal completion returns `escaped: false` with value
- ✅ AbortController cleaned up after prompt
- ✅ Terminal mode restored after prompt
- ✅ Non-TTY environment handled gracefully (no raw mode)
- ✅ Singleton pattern prevents nested handlers
- ✅ Validation doesn't prevent ESC
- ✅ Default values don't prevent ESC
- ✅ Rapid ESC presses handled correctly (debounced by cleanup)

**Integration Tests in Existing Files:**
- ✅ Mock returns PromptResult objects
- ✅ Mock can return `{ escaped: true }` for ESC tests
- ✅ Mock returns `{ escaped: false, value: ... }` for normal completion
- ✅ Flows handle `escaped: true` correctly (no cache modification)
- ✅ No try-catch needed for ESC handling

### Mock Strategy for Tests

```typescript
// Mock setup in test files
import { 
  selectWithEscape, 
  inputWithEscape, 
  confirmWithEscape, 
  checkboxWithEscape,
  PromptResult 
} from '../../utils/promptWithEscape';

vi.mock('../../utils/promptWithEscape', () => ({
  selectWithEscape: vi.fn(),
  inputWithEscape: vi.fn(),
  confirmWithEscape: vi.fn(),
  checkboxWithEscape: vi.fn(),
}));

// In test cases:
const mockSelect = vi.mocked(selectWithEscape);
const mockInput = vi.mocked(inputWithEscape);
const mockConfirm = vi.mocked(confirmWithEscape);
const mockCheckbox = vi.mocked(checkboxWithEscape);

// Mock normal completion (return value)
mockSelect.mockResolvedValue({ escaped: false, value: 'option1' });
mockInput.mockResolvedValue({ escaped: false, value: 'John Doe' });
mockConfirm.mockResolvedValue({ escaped: false, value: true });
mockCheckbox.mockResolvedValue({ escaped: false, value: ['label1', 'label2'] });

// Mock ESC behavior
mockSelect.mockResolvedValue({ escaped: true });
mockInput.mockResolvedValue({ escaped: true });
```

### Manual Test Plan

- [ ] Test ESC at every menu level in all scripts
- [ ] Verify deep nesting (3+ levels) works correctly
- [ ] Confirm top-level menu ESC exits with status 0
- [ ] Test all input validations still work
- [ ] Test ESC during validation failure (can escape validation)
- [ ] Verify checkbox multi-select ESC returns `escaped: true`
- [ ] Test ESC with default values (returns `escaped: true`, not default)
- [ ] Test Ctrl+C still force-exits (SIGINT handler)
- [ ] Test ESC ignored during spinner/clipboard/API operations
- [ ] Verify cache not modified when ESC before write
- [ ] Test on macOS, Windows, Linux
- [ ] Test in TTY and non-TTY environments
- [ ] Test rapid ESC presses (should be debounced by cleanup)
- [ ] Test attempting nested prompts (should throw error)
- [ ] Verify no try-catch pollution in migrated code

## Developer Documentation

### Adding New Prompts with ESC Support

```typescript
// 1. Import the utilities
import { selectWithEscape } from '../utils/promptWithEscape';

// 2. Call the wrapper function
const result = await selectWithEscape<string>({
  message: 'Your prompt',
  choices: [...],
});

// 3. Check if user pressed ESC
if (result.escaped) {
  // Top-level: process.exit(0)
  // Sub-level: return
  // In loop: break or continue
  return;
}

// 4. Use the value (TypeScript knows it exists)
const value = result.value;
await doSomething(value);
```

**Key Points:**
- No try-catch needed for ESC
- Always check `result.escaped` first
- TypeScript provides type narrowing (value exists when not escaped)
- Real errors still throw naturally

### User-Facing Improvements

1. **Add ESC hints to prompts**: Update messages to include "(ESC to go back)"
   ```typescript
   message: 'What would you like to do? (ESC to go back)',
   ```

2. **Show ESC behavior on first run**: Display brief tutorial
   ```
   ═══════════════════════════════════════
   💡 Tip: Press ESC at any prompt to go back
   Press Ctrl+C to exit immediately
   ═══════════════════════════════════════
   ```

3. **Consistent ESC feedback**: When ESC is pressed, show message
   ```
   ← Going back...
   ```

## Key Improvements Over Original Approach

### 1. No Try-Catch Pollution
**Old Pattern (error-based):**
```typescript
try {
  const value = await selectWithEscape({...});
  // use value
} catch (error) {
  if (error instanceof EscapeSignal) {
    return;
  }
  throw error;
}
```

**New Pattern (result-based):**
```typescript
const result = await selectWithEscape({...});
if (result.escaped) {
  return;
}
const value = result.value;
```

**Benefits:**
- 50% less code for each prompt
- No accidental error swallowing
- Clearer intent (navigation vs error)
- Better TypeScript type narrowing

### 2. Simplified Nested Flows
**Old**: Had to re-throw EscapeSignal in every nested catch block
**New**: Just check `escaped` flag at each level - no propagation needed

### 3. Singleton Protection
The `isActive` flag prevents nested ESC handlers which could cause:
- Multiple raw mode activations
- Conflicting keypress listeners  
- Terminal corruption

### 4. Native AbortSignal Integration
Uses `@inquirer/prompts` official AbortSignal support instead of trying to intercept errors after the fact.

### 5. Easier Testing
Mocks return simple objects instead of throwing errors, making test code cleaner.

---

## Success Criteria

1. ✅ @inquirer/prompts v8.3.2+ installed
2. ✅ inquirer v9 and @types/inquirer removed
3. ✅ promptWithEscape.ts utility created with PromptResult pattern
4. ✅ All 68 prompts migrated to wrapper functions
5. ✅ Zero TypeScript compilation errors
6. ✅ All unit tests passing
7. ✅ ESC key works at every prompt (menus and input)
8. ✅ ESC ignored during processes (singleton inactive during API/spinner/clipboard)
9. ✅ Navigation flows properly (check escaped flag, return/exit/break)
10. ✅ Ctrl+C still force-exits (SIGINT handler unchanged)
11. ✅ No breaking changes to existing functionality
12. ✅ Cache not modified when ESC pressed (checks before writes)
13. ✅ Singleton prevents nested ESC handlers
14. ✅ Cross-platform support (macOS, Windows, Linux)
15. ✅ TTY and non-TTY environments supported
16. ✅ All UserCancelledError replaced (either with escaped checks or EscapeSignal)
17. ✅ Console capture doesn't interfere with ESC (raw mode on stdin only)
18. ✅ Resources cleaned up properly in all code paths
19. ✅ No try-catch pollution for ESC handling
20. ✅ User-facing documentation (ESC hints in prompts)
21. ✅ Developer documentation complete
22. ✅ TypeScript type narrowing works correctly with PromptResult

## Implementation Checklist

### Phase 1: Foundation
- [ ] Install @inquirer/prompts ^8.3.2
- [ ] Create src/utils/promptWithEscape.ts with full implementation
  - [ ] PromptResult<T> type definition
  - [ ] EscapeKeyManager singleton with isActive flag
  - [ ] Raw mode keypress detection with readline
  - [ ] AbortController integration with inquirer
  - [ ] selectWithEscape function
  - [ ] inputWithEscape function
  - [ ] confirmWithEscape function
  - [ ] checkboxWithEscape function
  - [ ] TTY detection and fallback
  - [ ] Cleanup logic (listeners, raw mode, singleton state)
- [ ] Create src/utils/__tests__/promptWithEscape.test.ts
- [ ] Run tests for promptWithEscape.ts
- [ ] Fix any issues in utility

### Phase 2: Package Management
- [ ] Update package.json: remove inquirer v9
- [ ] Update package.json: remove @types/inquirer
- [ ] Run `pnpm install`
- [ ] Verify pnpm-lock.yaml updated
- [ ] Run `pnpm build` to verify no breakage

### Phase 3: Replace UserCancelledError
- [ ] Search for all UserCancelledError references
- [ ] Replace with EscapeSignal
- [ ] Update imports
- [ ] Update catch blocks

### Phase 4: Source File Migration (Group A)
- [ ] Migrate src/index.ts (1 prompt)
  - [ ] Update imports
  - [ ] Replace prompt call with wrapper
  - [ ] Check `result.escaped` instead of try-catch
  - [ ] Test manually
- [ ] Migrate src/scripts/contactsSync.ts (1 prompt)
  - [ ] Same as above
- [ ] Migrate src/scripts/linkedinSync.ts (1 prompt)
  - [ ] Same as above
- [ ] Migrate src/services/contacts/duplicateDetector.ts (1 prompt)
  - [ ] Same as above

### Phase 5: Source File Migration (Group B)
- [ ] Migrate src/services/contacts/eventsContactEditor.ts (8 prompts)
  - [ ] Update imports
  - [ ] Replace all prompt calls with wrappers
  - [ ] Check `result.escaped` for each prompt
  - [ ] Test manually

### Phase 6: Source File Migration (Group C)
- [ ] Migrate src/services/contacts/contactEditor.ts (28 prompts)
  - [ ] Update imports
  - [ ] Replace all list prompts with selectWithEscape
  - [ ] Replace all input prompts with inputWithEscape
  - [ ] Replace checkbox prompt with checkboxWithEscape
  - [ ] Check `result.escaped` for each prompt
  - [ ] Remove try-catch blocks (no longer needed for ESC)
  - [ ] Test manually
- [ ] Migrate src/scripts/eventsJobsSync.ts (38 prompts)
  - [ ] Update imports
  - [ ] Replace all prompts with wrappers
  - [ ] Check `result.escaped` for each prompt
  - [ ] Simplify while loop ESC handling (no try-catch)
  - [ ] Ensure cache writes only after escaped checks
  - [ ] Test manually

### Phase 7: Test File Migration
- [ ] Update src/scripts/__tests__/eventsJobsSync.test.ts
  - [ ] Remove inquirer imports and mocks
  - [ ] Add promptWithEscape mocks
  - [ ] Update test cases to return PromptResult objects
  - [ ] Normal completion: `{ escaped: false, value: ... }`
  - [ ] ESC behavior: `{ escaped: true }`
  - [ ] Run tests and fix failures
- [ ] Update src/services/contacts/__tests__/eventsContactEditor.test.ts
  - [ ] Same changes as above
  - [ ] Ensure parent class method mocking still works
  - [ ] Run tests and fix failures

### Phase 8: Add ESC-Specific Tests
- [ ] Add ESC test cases to existing test files
  - [ ] Test ESC during validation
  - [ ] Test ESC in nested flows
  - [ ] Test ESC before cache writes
- [ ] Run all tests: `NODE_OPTIONS='--no-warnings' vitest run`
- [ ] Fix any failures

### Phase 9: User-Facing Improvements
- [ ] Add ESC hints to prompt messages
- [ ] Add first-run tutorial message
- [ ] Add ESC feedback messages
- [ ] Test UX improvements

### Phase 10: Documentation & Cleanup
- [ ] Update developer documentation
- [ ] Clean up any TODO comments
- [ ] Remove any dead code
- [ ] Update CHANGELOG.md

### Phase 11: Final Verification
- [ ] Run `pnpm build` - no errors
- [ ] Run `pnpm lint` - no errors
- [ ] Run `NODE_OPTIONS='--no-warnings' vitest run` - all pass
- [ ] Manual testing checklist (see above)
- [ ] Cross-platform testing
- [ ] Performance check (no noticeable slowdown)

### Phase 12: Review Success Criteria
- [ ] Go through all 21 success criteria
- [ ] Mark complete
- [ ] Document any deviations

---

**Last Updated:** March 19, 2026
**Status:** Planning Complete - Ready for Implementation (Updated with improved result pattern)
**Estimated Effort:** 10-14 hours (including testing and documentation)

**Key Changes from Original:**
- Switched from error-throwing to result object pattern
- Eliminates try-catch pollution
- Simpler migration path
- Better TypeScript type safety
- Prevents nested ESC handler bugs
