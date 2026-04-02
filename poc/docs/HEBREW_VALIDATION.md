# Hebrew Text Validation

## Feature Added

Added validation to prevent Hebrew characters in text fields, ensuring all input is in English only.

## Affected Fields

Hebrew validation is applied to the following fields:
- ✅ **Full Name** (First Name + Last Name)
- ✅ **Company**
- ✅ **Job Title**
- ✅ **Email Address**

## How It Works

When a user tries to enter Hebrew characters in any text field, they will see:
```
>> Hebrew characters are not supported. Please use English only.
```

The validation:
- Detects Hebrew characters (Unicode range U+0590 to U+05FF)
- Shows clear error message
- Re-prompts user to enter English text
- Allows empty/optional fields

## Implementation

### Added Validation Methods

In `src/validators/inputValidator.ts`:

```typescript
static validateNoHebrew(text: string): string | true {
  if (!text || !text.trim()) return true;
  if (RegexPatterns.HEBREW.test(text)) {
    return 'Hebrew characters are not supported. Please use English only.';
  }
  return true;
}

static validateText(text: string): string | true {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return this.validateNoHebrew(trimmed);
}
```

### Updated Validators

- **Email validation**: Now checks for Hebrew before format validation
- **Text validation**: Used for name, company, job title fields

### Updated ContactWriter

Added `validate: InputValidator.validateText` to:
- Company input (initial and edit)
- Full name input (initial)
- First name edit
- Last name edit
- Job title input (initial and edit)

Added Hebrew check to email validation (already in `validateEmail`)

## Testing Results

### Text Field Tests
- ✅ English name: `John Doe` → Valid
- ✅ Hebrew name: `ג׳ון דו` → Error: "Hebrew characters are not supported"
- ✅ Mixed: `John דו` → Error: "Hebrew characters are not supported"
- ✅ English company: `Google Inc.` → Valid
- ✅ Hebrew company: `גוגל בע״מ` → Error
- ✅ English job: `Software Engineer` → Valid
- ✅ Hebrew job: `מהנדס תוכנה` → Error
- ✅ Empty string → Valid (optional fields)

### Email Tests
- ✅ English email: `john@example.com` → Valid
- ✅ Hebrew in email: `ג׳ון@example.com` → Error

## User Experience

### When Entering Hebrew Text

**Initial Input**:
```
? Full name: ג׳ון דו
>> Hebrew characters are not supported. Please use English only.
? Full name: John Doe
✓ Accepted
```

**Editing Field**:
```
? Edit first name
? First name: ישראל
>> Hebrew characters are not supported. Please use English only.
? First name: Israel
✓ Accepted
```

### Error Recovery
Like all other validations, inquirer automatically:
1. Shows the error message
2. Re-prompts the user
3. Allows them to enter correct input
4. Continues when valid input is provided

## Technical Details

### Hebrew Character Detection
Uses Unicode range U+0590 to U+05FF which covers:
- Hebrew letters
- Hebrew vowel marks (nikud)
- Hebrew punctuation
- Special Hebrew characters (like ״, ׳)

### Validation Order
For email validation:
1. Check for Hebrew characters (first)
2. Check email format
3. Check for duplicates (if adding to list)

For text fields:
1. Check for Hebrew characters
2. Allow if valid or empty

## Benefits

1. **Data Consistency**: Ensures all contact data is in English
2. **Clear Feedback**: Users immediately know Hebrew is not supported
3. **Easy Recovery**: Users can simply re-enter in English
4. **Comprehensive**: Covers all text input fields
5. **Early Detection**: Catches Hebrew before further validation

## How to Test

Run the POC and try entering Hebrew:
```bash
cd poc
pnpm start
```

**Test Scenarios**:
1. Enter Hebrew name: `ישראל כהן` → Should show error and re-prompt
2. Enter mixed text: `John דו` → Should show error
3. Enter Hebrew company: `גוגל` → Should show error
4. Enter Hebrew job title: `מהנדס` → Should show error
5. Enter Hebrew in email: `אימייל@example.com` → Should show error
6. Enter English text → Should work fine

All fields with Hebrew will be rejected with a clear message!
