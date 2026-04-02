# Validation Rules

This document describes all validation rules applied in the Google People API POC application.

## Overview

The application uses **Zod schemas** for robust, type-safe validation with clear error messages. Validation is applied at input collection, before API calls, and at configuration loading.

---

## Email Validation

**Schema**: `ValidationSchemas.email`

### Rules

1. **Format**: Must be a valid RFC-compliant email address
2. **Max Length**: 254 characters (RFC 5321 standard)
3. **Consecutive Dots**: Cannot contain consecutive dots (..)
4. **Hebrew Characters**: Not allowed (checked separately in `InputValidator`)

### Valid Examples

```
user@example.com
test.user@domain.co.uk
name+tag@example.com
```

### Invalid Examples

```
not-an-email           # Missing @ symbol
user..name@example.com # Consecutive dots
.user@example.com      # Leading dot
user@                  # Incomplete domain
a@b                    # Too short (but technically valid per RFC)
```

---

## Phone Number Validation

**Schema**: `ValidationSchemas.phone`

### Rules

1. **Allowed Characters**: Only digits (0-9), +, -, spaces, and parentheses
2. **Digit Count**: Must contain 7-15 digits (excluding formatting characters)
3. **Not Only Special Characters**: Cannot be composed entirely of +, -, spaces, and parentheses

### Valid Examples

```
+1-555-0123
(555) 123-4567
1234567
+44 20 7946 0958
123-456-7890
```

### Invalid Examples

```
123456                 # Too few digits (only 6)
1234567890123456       # Too many digits (16)
+++---                 # Only special characters
123-456-7890abc        # Contains letters
phone number           # Contains non-numeric text
```

---

## LinkedIn URL Validation

**Schema**: `ValidationSchemas.linkedinUrl`

### Rules

1. **Valid URL Format**: Must be a well-formed URL
2. **Hostname**: Must be `linkedin.com` or `www.linkedin.com`
3. **Path Requirements**: Must contain one of:
   - `/in/` (personal profile)
   - `/company/` (company page)
   - `/school/` (school/university page)
4. **Protocol**: Automatically adds `https://` if missing

### Valid Examples

```
https://linkedin.com/in/john-doe
https://www.linkedin.com/in/jane-smith
linkedin.com/company/my-company
https://linkedin.com/school/university-name
```

### Invalid Examples

```
https://facebook.com/profile       # Not LinkedIn
https://linkedin.com                # Missing path
https://linkedin.com/about          # Invalid path
https://example.com/in/john         # Wrong domain
linkedin.com/john                   # Missing /in/ prefix
```

---

## Field Length Validation

**Schema**: `ValidationSchemas.fieldLength`

### Rules

1. **Max Length**: 1024 characters
2. **Applies To**: All text fields sent to Google People API

### Rationale

Google People API enforces a **1024-character limit** per field. Exceeding this causes API errors.

### Fields Checked

- First Name
- Last Name
- Company
- Job Title
- Email addresses
- Phone numbers
- LinkedIn URL

---

## Contact Field Limits

**Method**: `InputValidator.validateFieldLimits()`

### Rules

1. **Individual Field Limit**: 1024 characters per field
2. **Total Field Count**: Maximum 500 fields per contact

### Field Count Calculation

```typescript
totalFields = 
  (firstName ? 1 : 0) +
  (lastName ? 1 : 0) +
  (company ? 1 : 0) +
  (jobTitle ? 1 : 0) +
  emails.length +
  phones.length +
  (linkedInUrl ? 1 : 0) +
  labelResourceNames.length
```

### Rationale

Google People API enforces a **500-field maximum** per contact. This includes:
- Name fields
- Organization fields
- All email addresses
- All phone numbers
- All URLs
- All contact group memberships

---

## Port Validation

**Schema**: `ValidationSchemas.redirectPort`

### Rules

1. **Type**: Must be an integer
2. **Minimum**: 1024 (ports below are reserved for system services)
3. **Maximum**: 65535 (highest valid port number)

### Valid Examples

```
3000
8080
1024
65535
```

### Invalid Examples

```
80      # Below 1024 (reserved)
1023    # Below 1024 (reserved)
65536   # Above maximum
70000   # Above maximum
3000.5  # Not an integer
```

---

## Minimum Requirements

**Method**: `InputValidator.validateMinimumRequirements()`

### Rules

To create a contact, the following **must** be provided:

1. **First Name**: Non-empty string (after trimming)
2. **Last Name**: Non-empty string (after trimming)
3. **At Least One Label**: Contact must belong to at least one contact group

### Rationale

These are the minimum fields required for a meaningful contact in the Google People API.

---

## Label Name Validation

**Method**: `InputValidator.validateLabelName()`

### Rules

1. **Allowed Characters**: Letters, numbers, spaces, hyphens (-), and underscores (_)
2. **Not Empty**: Must contain at least one character after trimming
3. **Uniqueness**: Label name must not already exist (case-insensitive)
4. **Reserved**: `'cancel'` is reserved for UI navigation

### Valid Examples

```
Work
Personal_Contacts
Friends-2024
My Label 123
```

### Invalid Examples

```
(empty string)         # Cannot be empty
Work!!!                # Special characters not allowed
```

---

## Hebrew Character Validation

**Method**: `InputValidator.validateNoHebrew()`

### Rules

1. **No Hebrew Characters**: Text must not contain Unicode characters in the range `\u0590-\u05FF`
2. **Applied To**: All text input fields (names, company, job title)

### Rationale

Google People API may have issues with bidirectional (RTL) text. The application includes special handling for Hebrew text display but restricts input to prevent API errors.

---

## Unique Email/Phone Validation

**Methods**:
- `InputValidator.validateUniqueEmail()`
- `InputValidator.validateUniquePhone()`

### Rules

1. **No Duplicates**: Same email or phone cannot be added multiple times to a single contact
2. **Case-Insensitive**: Email comparison is case-insensitive
3. **Normalized Phone**: Phone numbers are normalized (removing spaces, hyphens, parentheses) before comparison
4. **Edit Exception**: When editing an existing email/phone, the current index is excluded from duplicate check

---

## Configuration Validation

### Environment Variables

**File**: `.env`

**Required Variables**:
```
CLIENT_ID          # Google OAuth Client ID
CLIENT_SECRET      # Google OAuth Client Secret
PROJECT_ID         # Google Cloud Project ID
AUTH_URI           # OAuth Authorization URI
TOKEN_URI          # OAuth Token URI
AUTH_PROVIDER_CERT_URL  # OAuth Provider Certificate URL
REDIRECT_PORT      # Local OAuth redirect port (validated with redirectPort schema)
```

### Port Configuration

If `REDIRECT_PORT` is provided in `.env`, it is validated using `ValidationSchemas.redirectPort` at application startup. Invalid ports will cause the application to exit with an error.

---

## Error Messages

All validation errors return **clear, actionable error messages**:

### Examples

- `"Invalid email address format"`
- `"Phone must contain 7-15 digits"`
- `"Must be a valid LinkedIn URL"`
- `"Field too long: <text>... (max 1024 characters)"`
- `"Too many fields (505). Google API allows maximum 500 fields per contact."`
- `"Port must be >= 1024"`

---

## Testing Validation

Run validation tests:
```bash
pnpm test src/validators/__tests__/validationSchemas.test.ts
```

The test suite covers:
- Valid inputs for all schemas
- Edge cases (boundaries, empty strings)
- Invalid formats
- Special characters
- Length limits
