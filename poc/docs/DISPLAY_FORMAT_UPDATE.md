# Contact Display Format Update

## Changes Made

Updated the contact display format in the "Read and display all contacts" feature to improve readability.

### 1. Single Item Display on Same Line ✅

When a contact has only ONE email, phone, or LinkedIn URL, it now displays on the same line as the label:

**Before**:
```
-Emails:
-john@google.com | Label: work
```

**After**:
```
-Email: john@google.com | Label: work
```

This applies to:
- **Email** (singular when 1, plural "Emails:" when multiple)
- **Phone** (singular when 1, plural "Phones:" when multiple)
- **LinkedIn URL** (singular when 1, stays same when multiple)

### 2. Changed "Websites" to "LinkedIn URL" ✅

The label has been updated to be more specific since we primarily store LinkedIn URLs.

**Before**: `-Websites:`
**After**: `-LinkedIn URL:`

## Display Examples

### Contact with Single Values
```
===Person 00,001/00,002===
-Labels: Work
-First name: John
-Last name: Doe
-Company: Google
-Job Title: Software Engineer
-Email: john@google.com | Label: work
-Phone: +1-555-1234 | Label: mobile
-LinkedIn URL: https://linkedin.com/in/johndoe | Label: LinkedIn
================
```

### Contact with Multiple Values
```
===Person 00,002/00,002===
-Labels: Personal
-First name: Jane
-Last name: Smith
-Company: Microsoft
-Job Title: Product Manager
-Emails:
-jane@microsoft.com | Label: work
-jane@gmail.com | Label: personal
-Phones:
-+1-555-5678 | Label: mobile
-+1-555-9999 | Label: work
-LinkedIn URL:
-https://linkedin.com/in/janesmith | Label: LinkedIn
-https://twitter.com/janesmith | Label: Twitter
================
```

### Contact with No Values
When a contact has no email/phone/LinkedIn URL, the display shows:
```
-Email:
-Phone:
-LinkedIn URL:
```

## Implementation

**File**: `src/services/contactReader.ts`

**Logic**:
- Check array length: `0`, `1`, or `> 1`
- Length `0`: Show label with colon (e.g., `-Email:`)
- Length `1`: Show label with value on same line (e.g., `-Email: john@example.com | Label: work`)
- Length `> 1`: Show label with colon on first line, then list items below

## Benefits

1. **More Compact**: Single items don't take up two lines
2. **Better Readability**: Easier to scan contacts quickly
3. **Clearer Labels**: "LinkedIn URL" is more descriptive than "Websites"
4. **Consistent Grammar**: Uses singular/plural appropriately

## Testing

Run the POC and read contacts:
```bash
cd poc
pnpm start
# Select: Read and display all contacts
```

You'll see the improved display format for all your contacts!
