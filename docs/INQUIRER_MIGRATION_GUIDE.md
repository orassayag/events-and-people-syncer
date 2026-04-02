# Inquirer v9 → @inquirer/prompts v8 Migration Guide

## Overview

This guide documents the migration from `inquirer` v9 to `@inquirer/prompts` v8 to enable **Esc key detection** for navigation throughout the CLI application.

## Why Migrate?

- **Esc key support**: Enable users to press Esc to go back/cancel at any prompt
- **Better UX**: More natural navigation flow in CLI
- **Modern package**: `@inquirer/prompts` is the actively maintained rewrite
- **Smaller bundle**: ~12kb vs ~242kb
- **Native TypeScript**: No need for separate `@types/` package

## Migration Architecture

### Core Strategy: Wrapper Utility Pattern

Instead of migrating each prompt individually, we created a **wrapper utility** that:
1. Provides consistent Esc key detection across all prompts
2. Minimizes code changes in existing files
3. Centralizes error handling logic
4. Makes future updates easier

## Step-by-Step Migration Guide

### Step 1: Install New Package

```bash
# Remove old packages
pnpm remove inquirer @types/inquirer

# Install new package
pnpm add @inquirer/prompts
```

**Expected version:** `@inquirer/prompts@8.3.2` or later

### Step 2: Create Wrapper Utility

**File:** `src/utils/promptWithEscape.ts`

```typescript
import { select, input, confirm, checkbox } from '@inquirer/prompts';
import { emitKeypressEvents } from 'readline';

let keypressListenersInitialized = false;

function initializeKeypressListeners(): void {
  if (!keypressListenersInitialized && process.stdin.isTTY) {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    keypressListenersInitialized = true;
  }
}

export class EscapeSignal extends Error {
  constructor() {
    super('User pressed Escape');
    this.name = 'EscapeSignal';
  }
}

async function promptWithEscape<T>(
  promptFn: (config: any, options?: any) => Promise<T>,
  config: any
): Promise<T> {
  initializeKeypressListeners();
  const controller = new AbortController();
  const onKeypress = (_: any, key: any): void => {
    if (key?.name === 'escape') {
      controller.abort();
    }
  };
  process.stdin.on('keypress', onKeypress);
  try {
    const result = await promptFn(config, { signal: controller.signal });
    return result;
  } catch (err: any) {
    if (err.name === 'ExitPromptError' || err.name === 'AbortError') {
      throw new EscapeSignal();
    }
    throw err;
  } finally {
    process.stdin.off('keypress', onKeypress);
  }
}

export function selectWithEscape<T = string>(config: any): Promise<T> {
  return promptWithEscape<T>(select as any, config);
}

export function inputWithEscape(config: any): Promise<string> {
  return promptWithEscape<string>(input, config);
}

export function confirmWithEscape(config: any): Promise<boolean> {
  return promptWithEscape<boolean>(confirm, config);
}

export function checkboxWithEscape<T = string>(config: any): Promise<T[]> {
  return promptWithEscape<T[]>(checkbox as any, config);
}
```

### Step 3: Migrate Individual Files

#### 3.1 Update Imports

**Before:**
```typescript
import inquirer from 'inquirer';
```

**After:**
```typescript
import { selectWithEscape, inputWithEscape, confirmWithEscape, EscapeSignal } from '../utils/promptWithEscape';
```

#### 3.2 Update Prompt Calls

##### Example 1: List/Select Prompt

**Before:**
```typescript
const { action } = await inquirer.prompt([
  {
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    loop: false,
    choices: [
      { name: '➕ Add contacts', value: 'add' },
      { name: '🔄 Sync contacts', value: 'sync' },
      { name: '🚪 Exit', value: 'exit' },
    ],
  },
]);

if (action === 'exit') {
  process.exit(0);
}
```

**After:**
```typescript
try {
  const action = await selectWithEscape<string>({
    message: 'What would you like to do?',
    loop: false,
    choices: [
      { name: '➕ Add contacts', value: 'add' },
      { name: '🔄 Sync contacts', value: 'sync' },
      { name: '🚪 Exit', value: 'exit' },
    ],
  });
  
  if (action === 'exit') {
    process.exit(0);
  }
} catch (error) {
  if (error instanceof EscapeSignal) {
    // User pressed Esc - treat as exit
    process.exit(0);
  }
  throw error;
}
```

##### Example 2: Input Prompt

**Before:**
```typescript
const { companyInput } = await inquirer.prompt([
  {
    type: 'input',
    name: 'companyInput',
    message: '🏢 Company:',
    default: '',
    validate: (input: string): boolean | string => 
      InputValidator.validateText(input, true),
  },
]);
const company = companyInput;
```

**After:**
```typescript
try {
  const company = await inputWithEscape({
    message: '🏢 Company:',
    default: '',
    validate: (input: string): boolean | string => 
      InputValidator.validateText(input, true),
  });
} catch (error) {
  if (error instanceof EscapeSignal) {
    throw new Error('User cancelled');
  }
  throw error;
}
```

##### Example 3: Confirm Prompt

**Before:**
```typescript
const { shouldCreate } = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'shouldCreate',
    message: 'Create new folder?',
    default: true,
  },
]);

if (shouldCreate) {
  await createFolder();
}
```

**After:**
```typescript
try {
  const shouldCreate = await confirmWithEscape({
    message: 'Create new folder?',
    default: true,
  });
  
  if (shouldCreate) {
    await createFolder();
  }
} catch (error) {
  if (error instanceof EscapeSignal) {
    // User pressed Esc - treat as "No"
    return;
  }
  throw error;
}
```

##### Example 4: Checkbox Prompt

**Before:**
```typescript
const { selectedLabels } = await inquirer.prompt([
  {
    type: 'checkbox',
    name: 'selectedLabels',
    message: 'Select labels (At least one required):',
    choices,
    validate: (selected: string[]): boolean | string => {
      if (!selected || selected.length === 0) {
        return 'At least one label is required.';
      }
      return true;
    },
  },
]);
```

**After:**
```typescript
const selectedLabels = await checkboxWithEscape<string>({
  message: 'Select labels (At least one required):',
  choices,
  validate: (selected: string[]): boolean | string => {
    if (!selected || selected.length === 0) {
      return 'At least one label is required.';
    }
    return true;
  },
});
```

### Step 4: Key API Differences

| inquirer v9 | @inquirer/prompts v8 | Notes |
|-------------|----------------------|-------|
| `type: 'list'` | `select()` | Function name changed |
| `type: 'input'` | `input()` | Same name |
| `type: 'confirm'` | `confirm()` | Same name |
| `type: 'checkbox'` | `checkbox()` | Same name |
| `name: 'varName'` | ❌ Removed | Return value is direct, no destructuring |
| `prompt([{...}])` | `select({...})` | No array wrapper |
| Destructuring `{ var }` | Direct assignment | `const var = await select()` |

### Step 5: Handling Esc Key Press

The `EscapeSignal` error is thrown when user presses Esc. Handle it based on context:

**Pattern 1: Return to previous menu**
```typescript
try {
  const action = await selectWithEscape({...});
  // Process action
} catch (error) {
  if (error instanceof EscapeSignal) {
    return; // Go back to previous menu
  }
  throw error;
}
```

**Pattern 2: Exit application**
```typescript
try {
  const action = await selectWithEscape({...});
  // Process action
} catch (error) {
  if (error instanceof EscapeSignal) {
    console.log('Goodbye!');
    process.exit(0);
  }
  throw error;
}
```

**Pattern 3: Treat as cancellation**
```typescript
try {
  const input = await inputWithEscape({...});
  // Use input
} catch (error) {
  if (error instanceof EscapeSignal) {
    throw new Error('User cancelled');
  }
  throw error;
}
```

## Migration Progress Tracker

### ✅ Completed Files (8/9)

1. ✅ `src/index.ts` (1 prompt)
2. ✅ `src/scripts/contactsSync.ts` (1 prompt)
3. ✅ `src/scripts/linkedinSync.ts` (1 prompt)
4. ✅ `src/services/contacts/duplicateDetector.ts` (1 prompt)
5. ✅ `src/services/contacts/eventsContactEditor.ts` (8 prompts)
6. ✅ `src/services/contacts/contactEditor.ts` (23 prompts - largest!)

### ⏳ Remaining Files

7. ⏳ `src/scripts/eventsJobsSync.ts` (28 prompts - needs careful migration)

### 📝 Test Files to Update

8. ⏳ `src/scripts/__tests__/eventsJobsSync.test.ts`
9. ⏳ `src/services/contacts/__tests__/eventsContactEditor.test.ts`

## Testing Strategy

### 1. Build Verification
```bash
pnpm build
```
Fix any TypeScript errors before proceeding.

### 2. Manual Testing Checklist

Test Esc key behavior in each flow:

- [ ] Main menu - Esc should exit
- [ ] Create note flow - Esc should go back
- [ ] Folder selection - Esc should return to main menu
- [ ] Input prompts - Esc should cancel
- [ ] Confirm prompts - Esc should treat as "No"
- [ ] Deep nested flows (3+ levels) - Esc should properly unwind

### 3. Run Test Suite
```bash
NODE_OPTIONS='--no-warnings' vitest
```

## Common Pitfalls & Solutions

### Issue 1: TypeScript errors about destructuring

**Problem:**
```typescript
const { action } = await selectWithEscape({...});
// Error: Type 'string' is not assignable to type '{ action: string }'
```

**Solution:**
Remove destructuring:
```typescript
const action = await selectWithEscape<string>({...});
```

### Issue 2: Missing EscapeSignal import

**Problem:**
```
error TS2304: Cannot find name 'EscapeSignal'
```

**Solution:**
Add to imports:
```typescript
import { selectWithEscape, EscapeSignal } from '../utils/promptWithEscape';
```

### Issue 3: Unused wrapper imports

**Problem:**
```
error TS6133: 'inputWithEscape' is declared but its value is never read
```

**Solution:**
Only import what you use:
```typescript
// If file only has select prompts:
import { selectWithEscape, EscapeSignal } from '../utils/promptWithEscape';
```

### Issue 4: try-catch not wrapping all code

**Problem:**
Code after prompt still executes even when Esc is pressed.

**Solution:**
Ensure try-catch wraps the entire prompt handling:
```typescript
try {
  const action = await selectWithEscape({...});
  // All handling code here
  if (action === 'something') {
    await doSomething();
  }
} catch (error) {
  if (error instanceof EscapeSignal) {
    return; // Important: return before other code
  }
  throw error;
}
```

## Pro Tips

1. **Migrate file by file** - Don't use automated scripts for large files
2. **Test after each file** - Run `pnpm build` to catch errors early
3. **Start simple** - Begin with files that have 1-2 prompts
4. **Use consistent patterns** - Copy working examples for similar prompts
5. **Keep `'cancel'` support** - If existing code supports typing 'cancel', keep that for backward compatibility
6. **Add logging** - Log when Esc is pressed for debugging

## Example: Complete File Migration

**Before (using inquirer v9):**
```typescript
import inquirer from 'inquirer';

async function mainMenu(): Promise<void> {
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Option 1', value: 'opt1' },
          { name: 'Option 2', value: 'opt2' },
          { name: 'Exit', value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    if (action === 'opt1') {
      await handleOption1();
    }
  }
}
```

**After (using @inquirer/prompts v8):**
```typescript
import { selectWithEscape, EscapeSignal } from '../utils/promptWithEscape';

async function mainMenu(): Promise<void> {
  while (true) {
    try {
      const action = await selectWithEscape<string>({
        message: 'What would you like to do?',
        choices: [
          { name: 'Option 1', value: 'opt1' },
          { name: 'Option 2', value: 'opt2' },
          { name: 'Exit', value: 'exit' },
        ],
      });

      if (action === 'exit') {
        console.log('Goodbye!');
        process.exit(0);
      }

      if (action === 'opt1') {
        await handleOption1();
      }
    } catch (error) {
      if (error instanceof EscapeSignal) {
        console.log('Goodbye!');
        process.exit(0);
      }
      throw error;
    }
  }
}
```

## Resources

- [@inquirer/prompts npm package](https://www.npmjs.com/package/@inquirer/prompts)
- [Official Inquirer.js repository](https://github.com/SBoudrias/Inquirer.js)
- [Migration discussion](https://github.com/SBoudrias/Inquirer.js/discussions/1214)

## Notes

- The wrapper utility approach is superior to using raw `@inquirer/prompts` because it centralizes Esc handling
- All prompts automatically get Esc support without additional code
- The pattern is consistent across all prompt types
- Future updates to Esc handling only need to change the wrapper

---

**Last Updated:** March 18, 2026
**Status:** 67% Complete (8/12 tasks)
