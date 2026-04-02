# ESC Navigation: Error Pattern vs Result Pattern Comparison

## Side-by-Side Comparison

### Basic Usage

| Aspect | Error Pattern (Old) | Result Pattern (New) |
|--------|---------------------|----------------------|
| **Return Type** | `Promise<T>` | `Promise<PromptResult<T>>` |
| **ESC Handling** | Throws `EscapeSignal` | Returns `{ escaped: true }` |
| **Normal Flow** | Returns value directly | Returns `{ escaped: false, value: T }` |
| **Error Handling** | Try-catch required | No try-catch needed |

### Code Examples

#### Simple Select

**Error Pattern:**
```typescript
try {
  const action = await selectWithEscape<string>({
    message: 'What would you like to do?',
    choices: [...],
  });
  
  // Use action
  await handleAction(action);
  
} catch (error) {
  if (error instanceof EscapeSignal) {
    return; // ESC pressed
  }
  throw error; // Real error
}
```
**Lines of code: 14**

**Result Pattern:**
```typescript
const result = await selectWithEscape<string>({
  message: 'What would you like to do?',
  choices: [...],
});

if (result.escaped) {
  return; // ESC pressed
}

await handleAction(result.value);
```
**Lines of code: 9 (36% reduction)**

---

#### Sequential Prompts

**Error Pattern:**
```typescript
try {
  const folder = await selectFolder();
  const name = await inputName();
  
  // Both completed - save
  await cache.set(folder, name);
  
} catch (error) {
  if (error instanceof EscapeSignal) {
    return; // ESC at any step
  }
  throw error;
}
```
**Lines of code: 10**
**Problem:** Can't distinguish which prompt was cancelled

**Result Pattern:**
```typescript
const folderResult = await selectFolder();
if (folderResult.escaped) {
  return; // ESC at folder selection
}

const nameResult = await inputName();
if (nameResult.escaped) {
  return; // ESC at name input
}

// Both completed - save
await cache.set(folderResult.value, nameResult.value);
```
**Lines of code: 11 (similar length but more explicit)**
**Benefit:** Clear which step was cancelled

---

#### Nested Flows

**Error Pattern:**
```typescript
try {
  const folder = await selectFolder();
  
  try {
    const data = await fetchData(folder);
    await processData(data);
  } catch (error) {
    // MUST re-throw EscapeSignal!
    if (error instanceof EscapeSignal) {
      throw error;
    }
    console.error('Processing error:', error);
  }
  
} catch (error) {
  if (error instanceof EscapeSignal) {
    return;
  }
  throw error;
}
```
**Lines of code: 19**
**Pitfall:** Easy to forget re-throw

**Result Pattern:**
```typescript
const folderResult = await selectFolder();
if (folderResult.escaped) {
  return;
}

try {
  const data = await fetchData(folderResult.value);
  await processData(data);
} catch (error) {
  // No ESC concerns - just handle real errors
  console.error('Processing error:', error);
}
```
**Lines of code: 11 (42% reduction)**
**Benefit:** No re-throw needed

---

#### While Loop

**Error Pattern:**
```typescript
while (true) {
  try {
    const choice = await selectWithEscape({...});
    
    if (choice === 'exit') break;
    await handleChoice(choice);
    
  } catch (error) {
    if (error instanceof EscapeSignal) {
      break; // ESC exits loop
    }
    throw error;
  }
}
```
**Lines of code: 12**

**Result Pattern:**
```typescript
while (true) {
  const result = await selectWithEscape({...});
  
  if (result.escaped) {
    break; // ESC exits loop
  }
  
  if (result.value === 'exit') break;
  await handleChoice(result.value);
}
```
**Lines of code: 9 (25% reduction)**

---

## Testing Comparison

### Mock Setup

**Error Pattern:**
```typescript
vi.mock('../../utils/promptWithEscape', () => ({
  selectWithEscape: vi.fn(),
  EscapeSignal: class EscapeSignal extends Error {
    constructor() {
      super('User pressed ESC');
      this.name = 'EscapeSignal';
    }
  },
}));

const mockSelect = vi.mocked(selectWithEscape);

// Normal case
mockSelect.mockResolvedValue('option1');

// ESC case
mockSelect.mockRejectedValue(new EscapeSignal());
```

**Result Pattern:**
```typescript
vi.mock('../../utils/promptWithEscape', () => ({
  selectWithEscape: vi.fn(),
}));

const mockSelect = vi.mocked(selectWithEscape);

// Normal case
mockSelect.mockResolvedValue({ 
  escaped: false, 
  value: 'option1' 
});

// ESC case
mockSelect.mockResolvedValue({ 
  escaped: true 
});
```

**Benefit:** Simpler, no need to mock error classes

---

### Test Cases

**Error Pattern:**
```typescript
it('should handle ESC', async () => {
  mockSelect.mockRejectedValue(new EscapeSignal());
  
  let escaped = false;
  try {
    await myFunction();
  } catch (error) {
    if (error instanceof EscapeSignal) {
      escaped = true;
    }
  }
  
  expect(escaped).toBe(true);
});
```

**Result Pattern:**
```typescript
it('should handle ESC', async () => {
  mockSelect.mockResolvedValue({ escaped: true });
  
  const result = await myFunction();
  
  expect(result.completed).toBe(false);
  // Or check that cache wasn't modified, etc.
});
```

**Benefit:** Tests are about behavior, not exception handling

---

## TypeScript Experience

### Type Narrowing

**Error Pattern:**
```typescript
let value: string;

try {
  value = await selectWithEscape<string>({...});
  // TypeScript knows value is string here
} catch (error) {
  if (error instanceof EscapeSignal) {
    return;
  }
  // But what if we get here? value might be undefined
}

// Is value defined here? TypeScript isn't sure
console.log(value.toUpperCase()); // Possible error
```

**Result Pattern:**
```typescript
const result = await selectWithEscape<string>({...});

if (result.escaped) {
  // TypeScript knows result.value doesn't exist
  // const x = result.value; // Type error!
  return;
}

// TypeScript knows result.value is string here
console.log(result.value.toUpperCase()); // Safe!
```

**Benefit:** Perfect type narrowing

---

## Common Mistakes Prevention

| Mistake | Error Pattern | Result Pattern |
|---------|---------------|----------------|
| **Forget ESC handling** | Code compiles, ESC crashes | Code compiles, ESC works (undefined behavior) |
| **Swallow ESC in catch** | Easy to do accidentally | Impossible - no catch block |
| **Forget re-throw** | Nested catches break ESC | No nested catches needed |
| **Mix ESC with real errors** | Both use catch block | Separate: check escaped vs try-catch |
| **TypeScript confusion** | value might be undefined | Type narrowing ensures safety |

---

## Metrics

| Metric | Error Pattern | Result Pattern | Improvement |
|--------|---------------|----------------|-------------|
| **Avg lines per prompt** | 14 | 9 | **36% reduction** |
| **Nested flows complexity** | High (re-throw) | Low (check flag) | **Much simpler** |
| **Test mock complexity** | High (error class) | Low (objects) | **Simpler** |
| **Accidental bugs** | Medium (catch issues) | Low (explicit) | **Safer** |
| **TypeScript safety** | Medium (narrowing issues) | High (perfect narrowing) | **Better** |
| **Learning curve** | Steep (exceptions) | Gentle (flags) | **Easier** |

---

## Migration Effort

| Aspect | Error Pattern | Result Pattern |
|--------|---------------|----------------|
| **Implementation complexity** | Medium | Low |
| **Migration time** | 12-16 hours | 10-14 hours |
| **Risk of bugs** | Medium | Low |
| **Documentation needed** | More (exception handling) | Less (simple checks) |
| **Developer onboarding** | Harder (try-catch rules) | Easier (if checks) |

---

## Conclusion

**Result Pattern is Superior Because:**

1. ✅ **Less Code** - 36% reduction in lines
2. ✅ **Clearer Intent** - ESC is navigation, not an error
3. ✅ **Fewer Bugs** - No accidental error swallowing
4. ✅ **Better Types** - Perfect TypeScript narrowing
5. ✅ **Easier Testing** - No exception mocking needed
6. ✅ **Simpler Nesting** - No re-throw complexity
7. ✅ **Faster Development** - Less boilerplate per prompt

**When to Use Error Pattern:**
- Never for new code
- Keep `EscapeSignal` only for backward compatibility with legacy code

**Recommendation:** Use Result Pattern for all new ESC navigation implementations.
