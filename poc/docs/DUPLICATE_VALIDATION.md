# Duplicate Email and Phone Validation

## Feature Added

Added validation to prevent adding the same email or phone number more than once to a contact.

## How It Works

### Email Validation
- **Case-insensitive comparison**: `test@example.com` and `TEST@EXAMPLE.COM` are considered duplicates
- **When adding email**: Checks if email already exists in contact
- **When editing email**: Allows keeping the same email, but prevents changing to another existing email

### Phone Validation
- **Normalized comparison**: Ignores formatting (spaces, dashes, parentheses)
  - `+1-555-1234`, `+1 555 1234`, and `(555) 1234` are all considered the same
- **When adding phone**: Checks if phone already exists in contact (normalized)
- **When editing phone**: Allows keeping the same phone, but prevents changing to another existing phone

## Implementation

### New Validator Methods

Added to `src/validators/inputValidator.ts`:

```typescript
static validateUniqueEmail(
  email: string, 
  existingEmails: string[], 
  currentIndex?: number
): string | true {
  // Validates email format
  // Checks for duplicates (case-insensitive)
  // Allows editing at currentIndex
}

static validateUniquePhone(
  phone: string, 
  existingPhones: string[], 
  currentIndex?: number
): string | true {
  // Validates phone format
  // Checks for duplicates (normalized - ignores formatting)
  // Allows editing at currentIndex
}
```

### Updated Contact Writer

Modified `src/services/contactWriter.ts` to use new validators:
- **Add Email**: Uses `validateUniqueEmail(email, existingEmails)`
- **Edit Email**: Uses `validateUniqueEmail(email, existingEmails, currentIndex)`
- **Add Phone**: Uses `validateUniquePhone(phone, existingPhones)`
- **Edit Phone**: Uses `validateUniquePhone(phone, existingPhones, currentIndex)`

## User Experience

### When Adding Duplicate Email
```
? Email address: test@example.com
✓ Added

? Email address: (trying to add another email)
? Email address: test@example.com
>> This email address is already added to this contact.
? Email address: (user must enter different email)
```

### When Adding Duplicate Phone
```
? Phone number: +1-555-1234
✓ Added

? Phone number: (trying to add another phone)
? Phone number: +1 555 1234
>> This phone number is already added to this contact.
? Phone number: (user must enter different phone)
```

### When Editing Email/Phone
Users can keep the same value when editing, but cannot change to another existing value:
```
Current emails: test@example.com, john@example.com

? Edit which email? test@example.com
? Email address: test@example.com
✓ Allowed (same email)

? Email address: john@example.com
>> This email address is already added to this contact.
? Email address: (user must enter different email)
```

## Testing Results

### Email Validation Tests
- ✅ Rejects exact duplicate: `test@example.com` + `test@example.com` → Error
- ✅ Rejects case-insensitive duplicate: `test@example.com` + `TEST@EXAMPLE.COM` → Error
- ✅ Allows new email: `test@example.com` + `new@example.com` → Valid
- ✅ Allows editing same index: Editing index 0 with same value → Valid

### Phone Validation Tests
- ✅ Rejects duplicate (same formatting): `+1-555-1234` + `+1-555-1234` → Error
- ✅ Rejects duplicate (different formatting): `+1-555-1234` + `+1 555 1234` → Error
- ✅ Rejects duplicate (different formatting): `555-5678` + `(555) 5678` → Error
- ✅ Allows new phone: `+1-555-1234` + `+1-999-9999` → Valid
- ✅ Allows editing same index: Editing index 0 with same value → Valid

## Benefits

1. **Data Quality**: Prevents accidental duplicate entries
2. **User Friendly**: Clear error messages guide users
3. **Smart Comparison**: 
   - Emails: Case-insensitive
   - Phones: Formatting-agnostic (recognizes same number despite different formatting)
4. **Edit-Friendly**: Users can keep the same value when editing without triggering duplicate error

## How to Test

Run the POC and try to add duplicates:
```bash
cd poc
pnpm start
```

**Test Scenarios**:
1. Add a contact with email `test@example.com`
2. Try to add another email with same address → Should show error and re-prompt
3. Try to add email `TEST@EXAMPLE.COM` → Should show error (case-insensitive)
4. Add phone `+1-555-1234`
5. Try to add phone `+1 555 1234` → Should show error (same number, different format)
6. Edit existing email/phone to keep same value → Should work without error
