# ESC Navigation Quick Reference

> **🔄 UPDATED:** Now using `enquirer` with native ESC support. Import path updated to `promptWithEnquirer`.

## Basic Usage

```typescript
import { selectWithEscape, inputWithEscape, confirmWithEscape, checkboxWithEscape } from '../utils/promptWithEnquirer';

// Select
const result = await selectWithEscape<string>({
  message: 'Choose an option:',
  choices: [
    { name: 'Option 1', value: 'opt1' },
    { name: 'Option 2', value: 'opt2' },
  ],
});

if (result.escaped) {
  return; // User pressed ESC
}
console.log('Selected:', result.value);

// Input
const inputResult = await inputWithEscape({
  message: 'Enter name:',
  default: '',
  validate: (input) => input.length > 0 || 'Required',
});

if (inputResult.escaped) return;
console.log('Name:', inputResult.value);

// Confirm
const confirmResult = await confirmWithEscape({
  message: 'Continue?',
  default: true,
});

if (confirmResult.escaped) return;
if (confirmResult.value) {
  // User confirmed
}

// Checkbox
const checkboxResult = await checkboxWithEscape<string>({
  message: 'Select labels:',
  choices: [
    { name: 'Label 1', value: 'label1' },
    { name: 'Label 2', value: 'label2' },
  ],
});

if (checkboxResult.escaped) return;
console.log('Selected labels:', checkboxResult.value);
```

## Common Patterns

### Top-Level Menu (Exit on ESC)
```typescript
const result = await selectWithEscape({...});
if (result.escaped) {
  process.exit(0); // Clean exit
}
```

### Sub-Menu (Return on ESC)
```typescript
async function subMenu() {
  const result = await selectWithEscape({...});
  if (result.escaped) {
    return; // Back to parent menu
  }
  // Handle choice...
}
```

### While Loop Menu
```typescript
while (true) {
  const result = await selectWithEscape({...});
  
  if (result.escaped) {
    break; // Exit loop
  }
  
  if (result.value === 'exit') break;
  await handleChoice(result.value);
}
```

### Sequential Prompts
```typescript
// Get folder
const folderResult = await selectFolder();
if (folderResult.escaped) return;

// Get name
const nameResult = await inputName();
if (nameResult.escaped) return;

// Both completed - safe to save
await cache.set(folderResult.value, nameResult.value);
```

### With Validation
```typescript
const result = await inputWithEscape({
  message: 'Enter email:',
  validate: (input) => {
    if (!input.includes('@')) return 'Invalid email';
    return true;
  },
});

if (result.escaped) {
  return; // User can ESC even during validation error
}

const email = result.value; // Valid email
```

## Type Information

```typescript
// Result type
type PromptResult<T> = 
  | { escaped: true }
  | { escaped: false; value: T };

// TypeScript knows value exists when escaped is false
const result = await selectWithEscape<string>({...});
if (!result.escaped) {
  // TypeScript knows result.value is string here
  const value: string = result.value; // No error
}
```

## Testing

```typescript
import { selectWithEscape } from '../../utils/promptWithEscape';

vi.mock('../../utils/promptWithEscape', () => ({
  selectWithEscape: vi.fn(),
  inputWithEscape: vi.fn(),
  confirmWithEscape: vi.fn(),
  checkboxWithEscape: vi.fn(),
}));

const mockSelect = vi.mocked(selectWithEscape);

// Mock normal completion
mockSelect.mockResolvedValue({ 
  escaped: false, 
  value: 'option1' 
});

// Mock ESC
mockSelect.mockResolvedValue({ 
  escaped: true 
});

// Test
const result = await selectWithEscape({...});
expect(result.escaped).toBe(true);
```

## What NOT to Do

```typescript
// ❌ DON'T use destructuring
const { value } = await selectWithEscape({...}); // Error!

// ❌ DON'T use try-catch for ESC
try {
  const result = await selectWithEscape({...});
} catch (error) {
  // ESC doesn't throw!
}

// ❌ DON'T forget to check escaped
const result = await selectWithEscape({...});
const value = result.value; // Might be undefined!

// ✅ DO check escaped first
const result = await selectWithEscape({...});
if (result.escaped) return;
const value = result.value; // Safe!
```

## Key Rules

1. **Always check `result.escaped` first** before accessing `result.value`
2. **No try-catch needed** for ESC handling (real errors still throw)
3. **Check escaped at each prompt** in sequential flows
4. **ESC only works during prompts** - not during API calls, spinners, etc.
5. **One ESC handler at a time** - singleton prevents nesting

## When ESC Works

- ✅ During menu selection
- ✅ During text input
- ✅ During confirm prompt
- ✅ During checkbox selection
- ✅ During validation errors

## When ESC Doesn't Work

- ❌ During API calls
- ❌ During file operations
- ❌ During spinner/loading
- ❌ During clipboard operations
- ❌ In non-TTY environments (CI)

## Ctrl+C vs ESC

- **ESC**: Navigate back one level (graceful)
- **Ctrl+C**: Force exit entire app (emergency)

Both work correctly - ESC for navigation, Ctrl+C to kill.
