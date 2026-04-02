# POC Issues Resolution Plan

## ⚠️ IMPORTANT: SCOPE LIMITATION

**ALL CHANGES IN THIS PLAN ARE RESTRICTED TO THE `poc/` FOLDER ONLY**

- Do NOT modify, change, or touch ANY files outside the `poc/` directory
- Do NOT modify files in the root directory
- Do NOT modify files in `sources/` directory
- Do NOT modify files in any other directory
- All file paths mentioned in this plan are relative to the `poc/` folder

## Overview

This plan addresses the identified issues in the Google People API POC, focusing on security, validation, code quality, and user experience improvements.

## 1. Environment & Configuration Setup

### Create .env file and settings.ts

- Create `.env` file in `poc/` directory with credential fields extracted from JSON:
  - `CLIENT_ID`, `CLIENT_SECRET`, `PROJECT_ID`, `AUTH_URI`, `TOKEN_URI`, `AUTH_PROVIDER_CERT_URL`
  - `REDIRECT_PORT=3000`
- Create `poc/src/settings.ts` for all magic numbers:
  - API page sizes (1000), display page size (15), port (3000)
  - Browser timeout (240000ms = 4 minutes)
  - API call counter file path
  - Other constants
- Update `.gitignore` to include:
  - `.env` and `.env.*`
  - `token.json` (already exists)
  - `api-stats.json`
  - `logs/`

### Update config.ts

- Modify `poc/src/config.ts` to read from environment variables using `process.env`
- Add type-safe credential loading with proper error handling if env vars missing

## 2. Security Improvements

### Issue #3 - Add SIGINT/SIGTERM handlers

- Add signal handlers in `poc/src/auth.ts` to properly close server on Ctrl+C
- Ensure port cleanup on process termination

### Issue #8 - Port conflict handling

- Before starting auth server, check if port 3000 is in use
- If occupied, automatically kill the process using the port
- Use `lsof` (macOS/Linux) or `netstat` (Windows) to detect process
- Kill process with `kill -9` command

### Issue #34 - Server cleanup on all error paths

- Wrap server creation in try/finally to ensure `server.close()` is always called
- Add timeout to server listener to prevent indefinite waiting

## 3. API Usage Tracking

### Issue #5 - API call counter

- Create `poc/src/api-tracker.ts` utility module
- Track read and write API calls separately
- Store in `api-stats.json` with format:
  ```json
  {
    "date": "2026-03-10",
    "read_count": 5,
    "write_count": 2
  }
  ```
- Reset counter when date changes
- Increment counter after EACH individual API call:
  - `contactGroups.list()`
  - `contactGroups.create()`
  - `people.connections.list()` (each page)
  - `people.createContact()`
- Log counter to console after each API call

## 4. Input Validation Improvements

### Issue #13 - Strong email validation

Use centralized regex from `RegexPatterns.ts`:

```typescript
import { RegexPatterns } from '../utils/index.js';

// In InputValidator.validateEmail()
if (!RegexPatterns.isValidEmail(trimmed)) {
  return 'Invalid email address format.';
}
```

The `RegexPatterns.isValidEmail()` method handles:
- Standard email format validation
- No consecutive dots check
- No leading/trailing dots check

### Issue #14 - Phone number validation

Use centralized regex from `RegexPatterns.ts`:

```typescript
import { RegexPatterns } from '../utils/index.js';

// In InputValidator.validatePhone()
if (!RegexPatterns.PHONE.test(trimmed)) {
  return 'Invalid phone number format.';
}
```

**Note:** Removed minimum/maximum digit length validation as per requirements.

### Issue #15 - LinkedIn URL validation

No regex needed - use native URL constructor in `InputValidator.validateLinkedInUrl()`:

```typescript
try {
  const url = new URL(trimmed);
  if (!url.hostname.endsWith('linkedin.com')) {
    return 'Invalid LinkedIn URL';
  }
} catch {
  return 'Invalid URL format';
}
```

### Issue #7 - Minimum contact requirements

Add validation before creating contact (around line 544):

- Require at least: first name AND last name AND one label
- Show clear error message if requirements not met

### Issue #20 - Google API field limits

Based on Google documentation:

- Add validation: max 1024 characters per field
- Add validation: max 500 fields per contact
- Show error if limits exceeded

### Issue #22 - Label name validation

Use centralized regex from `RegexPatterns.ts`:

```typescript
import { RegexPatterns } from '../utils/index.js';

// In InputValidator.validateLabelName()
if (!RegexPatterns.LABEL_NAME.test(name.trim())) {
  return 'Label name can only contain letters, numbers, spaces, hyphens, and underscores.';
}
```

- Trim leading/trailing spaces
- Reject if empty after trim
- Allow only: alphanumeric, spaces, hyphens, underscores

## 5. Duplicate Detection

### Issue #10 - Comprehensive duplicate checking

Create `poc/src/services/DuplicateDetector.ts` class with enhanced display:

- Function to check duplicates against ALL contacts in Google account
- Check after each input step:
  - **After entering full name**: Check if firstName AND lastName match any existing contact
  - **After entering email**: Check if email exists in any contact
  - **After entering phone**: Check if phone exists in any contact
- Display ALL matches found with details and similarity type:

  ```
  ⚠️  Found 2 similar contact(s):

  Match 1:
    Similarity Type: Full Name
    Name: John Doe
    Email: john@example.com
    Labels: Work, Client

  Match 2:
    Similarity Type: Full Name
    Name: John Doe
    Email: john.doe@company.com
    Labels: Personal

  Continue anyway? (y/n)
  ```

- User can choose to continue or cancel
- Returns `DuplicateMatch[]` with `{ contact: ContactData, similarityType: SimilarityType }`
- Caches contacts for performance (clear cache after creating new contact)

## 6. Memory & Performance

### Issue #6 - Handle 10K+ contacts

Modify `poc/src/contacts-reader.ts`:

- Keep pagination logic as-is to load all contacts
- After loading, only display top 10 contacts
- Show total count but limit display output
- Add note: "Showing 10 of 12,543 contacts"

### Issue #19 - Contact groups pagination

Add pagination loop to `fetchContactGroups()` in `contacts-writer.ts:12-30`:

- Similar pattern to contacts pagination
- Use `pageToken` to fetch all pages of groups

## 7. Code Quality & Structure - Refactor to Classes

### Issue #48 - Refactor to class-based architecture

Replace floating functions with organized class structure:

**Create `poc/src/services/ContactWriter.ts`:**

```typescript
export class ContactWriter {
  constructor(private auth: OAuth2Client) {}

  /**
   * Main entry point for adding a new contact
   */
  async addContact(): Promise<void> {
    const initialData = await this.collectInitialInput();
    const finalData = await this.showSummaryAndEdit(initialData);
    await this.createContact(finalData);
  }

  /**
   * Collect initial contact information from user
   */
  private async collectInitialInput(): Promise<InitialContactData> {
    // Phase 1: Prompt for labels, company, name, job title, email, phone, LinkedIn
  }

  /**
   * Display summary and handle edit loop
   */
  private async showSummaryAndEdit(
    data: EditableContactData,
  ): Promise<EditableContactData> {
    // Phase 2: Display summary, handle edit actions loop
  }

  /**
   * Create contact from finalized data
   */
  private async createContact(data: EditableContactData): Promise<void> {
    // Phase 3: Build request body, validate, call API, log result
  }

  // Helper methods
  private async promptForLabels(): Promise<string[]> { }
  private async fetchContactGroups(): Promise<ContactGroup[]> { }
  private async createContactGroup(name: string): Promise<string> { }
  private buildRequestBody(data: EditableContactData): CreateContactRequest { }
}
```

**Create `poc/src/services/ContactReader.ts`:**

```typescript
export class ContactReader {
  constructor(private auth: OAuth2Client) {}

  /**
   * Read and display all contacts
   */
  async displayContacts(): Promise<void> {
    const contacts = await this.readContacts();
    this.displayContactList(contacts);
  }

  /**
   * Fetch all contacts from Google People API
   */
  private async readContacts(): Promise<ContactData[]> {
    // Pagination logic with progress indicator
  }

  /**
   * Display contacts (top 10 only for large lists)
   */
  private displayContactList(contacts: ContactData[]): void {
    // Display logic
  }

  private displayContact(contact: ContactData, index: number, total: number): void { }
}
```

**Create `poc/src/services/AuthService.ts`:**

```typescript
export class AuthService {
  private oAuth2Client?: OAuth2Client;

  /**
   * Authenticate with Google People API
   */
  async authorize(): Promise<OAuth2Client> {
    const credentials = this.loadCredentials();
    this.oAuth2Client = this.createOAuth2Client(credentials);
    
    const token = this.loadToken();
    if (token) {
      this.oAuth2Client.setCredentials(token);
      return this.oAuth2Client;
    }
    
    await this.getNewToken();
    return this.oAuth2Client;
  }

  private loadCredentials(): GoogleCredentials { }
  private loadToken(): TokenData | null { }
  private saveToken(token: TokenData): void { }
  private createOAuth2Client(credentials: GoogleCredentials): OAuth2Client { }
  private async getNewToken(): Promise<void> { }
  private async startAuthServer(): Promise<void> { }
  private openBrowser(url: string): void { }
}
```

**Create `poc/src/services/ApiTracker.ts`:**

```typescript
export class ApiTracker {
  private static instance: ApiTracker;
  private statsFilePath: string;

  private constructor() {
    this.statsFilePath = join(__dirname, '..', '..', 'api-stats.json');
  }

  static getInstance(): ApiTracker {
    if (!ApiTracker.instance) {
      ApiTracker.instance = new ApiTracker();
    }
    return ApiTracker.instance;
  }

  /**
   * Track a read API call
   */
  async trackRead(): Promise<void> { }

  /**
   * Track a write API call
   */
  async trackWrite(): Promise<void> { }

  private async loadStats(): Promise<ApiStats> { }
  private async saveStats(stats: ApiStats): Promise<void> { }
  private shouldResetCounter(currentDate: string, statsDate: string): boolean { }
}
```

**Create `poc/src/services/DuplicateDetector.ts`:**

```typescript
import { google, Auth } from 'googleapis';
import inquirer from 'inquirer';
import type { ContactData } from '../types.js';
import { ApiTracker } from './index.js';

type OAuth2Client = Auth.OAuth2Client;

export type SimilarityType = 'Full Name' | 'Email' | 'Phone';

export interface DuplicateMatch {
  contact: ContactData;
  similarityType: SimilarityType;
}

export class DuplicateDetector {
  private cachedContacts: ContactData[] | null = null;

  constructor(private auth: OAuth2Client) {}

  /**
   * Check for duplicate contacts by name
   */
  async checkDuplicateName(
    firstName: string,
    lastName: string,
  ): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];

    for (const contact of contacts) {
      if (
        contact.firstName.toLowerCase() === firstName.toLowerCase() &&
        contact.lastName.toLowerCase() === lastName.toLowerCase()
      ) {
        matches.push({
          contact,
          similarityType: 'Full Name',
        });
      }
    }

    return matches;
  }

  /**
   * Check for duplicate contacts by email
   */
  async checkDuplicateEmail(email: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];

    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (contactEmail.value.toLowerCase() === email.toLowerCase()) {
          matches.push({
            contact,
            similarityType: 'Email',
          });
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Check for duplicate contacts by phone
   */
  async checkDuplicatePhone(phone: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    const normalizedPhone = phone.replace(/[\s\-()]/g, '');

    for (const contact of contacts) {
      for (const contactPhone of contact.phones) {
        const normalizedContactPhone = contactPhone.number.replace(/[\s\-()]/g, '');
        if (normalizedContactPhone === normalizedPhone) {
          matches.push({
            contact,
            similarityType: 'Phone',
          });
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Display duplicate warning and ask user to continue
   */
  async promptForDuplicateContinue(duplicates: DuplicateMatch[]): Promise<boolean> {
    if (duplicates.length === 0) {
      return true;
    }

    console.log(`\n⚠️  Found ${duplicates.length} similar contact(s):\n`);

    for (let i = 0; i < duplicates.length; i++) {
      const { contact, similarityType } = duplicates[i];
      console.log(`Match ${i + 1}:`);
      console.log(`  Similarity Type: ${similarityType}`);
      console.log(`  Name: ${contact.firstName} ${contact.lastName}`);
      if (contact.emails.length > 0) {
        console.log(`  Email: ${contact.emails[0].value}`);
      }
      if (contact.phones.length > 0) {
        console.log(`  Phone: ${contact.phones[0].number}`);
      }
      console.log(`  Labels: ${contact.label || '(none)'}`);
      console.log('');
    }

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue anyway?',
        default: false,
      },
    ]);

    return proceed;
  }

  /**
   * Fetch all contacts from Google (with caching)
   */
  private async fetchAllContacts(): Promise<ContactData[]> {
    if (this.cachedContacts) {
      return this.cachedContacts;
    }

    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const contacts: ContactData[] = [];
    let pageToken: string | undefined;

    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,memberships',
        pageToken,
      });

      await apiTracker.trackRead();

      const connections = response.data.connections || [];
      for (const person of connections) {
        const names = person.names?.[0];
        const firstName = names?.givenName || '';
        const lastName = names?.familyName || '';

        const emails = (person.emailAddresses || []).map((email) => ({
          value: email.value || '',
          label: email.type || email.formattedType || '',
        }));

        const phones = (person.phoneNumbers || []).map((phone) => ({
          country: '',
          number: phone.value || '',
          label: phone.type || phone.formattedType || '',
        }));

        const contactGroupMemberships = (person.memberships || [])
          .filter((m) => m.contactGroupMembership?.contactGroupResourceName)
          .map((m) => m.contactGroupMembership!.contactGroupResourceName!)
          .join(' | ');

        contacts.push({
          label: contactGroupMemberships,
          firstName,
          lastName,
          company: person.organizations?.[0]?.name || '',
          jobTitle: person.organizations?.[0]?.title || '',
          emails,
          phones,
          websites: [],
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    this.cachedContacts = contacts;
    return contacts;
  }

  /**
   * Clear cached contacts (call after creating a new contact)
   */
  clearCache(): void {
    this.cachedContacts = null;
  }
}
```

**Create `poc/src/validators/InputValidator.ts`:**

```typescript
import { RegexPatterns } from '../utils/index.js';
import type { EditableContactData, ContactGroup } from '../types.js';
import { SETTINGS } from '../settings.js';

export class InputValidator {
  /**
   * Validate email address
   */
  static validateEmail(email: string): string | true {
    const trimmed = email.trim();
    if (!trimmed) return true;

    if (!RegexPatterns.isValidEmail(trimmed)) {
      return 'Invalid email address format. Please enter a valid email (e.g., user@example.com).';
    }

    return true;
  }

  /**
   * Validate phone number
   */
  static validatePhone(phone: string): string | true {
    const trimmed = phone.trim();
    if (!trimmed) return true;

    if (!RegexPatterns.PHONE.test(trimmed)) {
      return 'Invalid phone number format. Only numbers, +, -, spaces, and parentheses are allowed.';
    }

    return true;
  }

  /**
   * Validate LinkedIn URL
   */
  static validateLinkedInUrl(url: string): string | true {
    const trimmed = url.trim();
    if (!trimmed) return true;

    try {
      const parsedUrl = new URL(trimmed);
      if (!parsedUrl.hostname.endsWith('linkedin.com')) {
        return 'Invalid LinkedIn URL. Must be a valid linkedin.com URL.';
      }
    } catch {
      return 'Invalid URL format.';
    }

    return true;
  }

  /**
   * Validate label name
   */
  static validateLabelName(name: string, existingGroups: ContactGroup[]): string | true {
    const trimmed = name.trim().toLowerCase();
    
    if (trimmed === 'cancel') {
      return true;
    }

    if (!trimmed) {
      return "Error: Label name cannot be empty. Type 'cancel' to go back.";
    }

    if (!RegexPatterns.LABEL_NAME.test(name.trim())) {
      return 'Label name can only contain letters, numbers, spaces, hyphens, and underscores.';
    }

    const exists = existingGroups.find(
      (g) => g.name.toLowerCase() === trimmed,
    );
    if (exists) {
      return `Label "${name.trim()}" already exists.`;
    }

    return true;
  }

  /**
   * Validate field length (Google API limits)
   */
  static validateFieldLength(value: string, maxLength: number = SETTINGS.MAX_FIELD_LENGTH): string | true {
    if (value.length > maxLength) {
      return `Value too long. Maximum ${maxLength} characters allowed.`;
    }
    return true;
  }

  /**
   * Validate minimum contact requirements
   */
  static validateMinimumRequirements(data: EditableContactData): string | true {
    if (!data.firstName || !data.firstName.trim()) {
      return 'First name is required.';
    }

    if (!data.lastName || !data.lastName.trim()) {
      return 'Last name is required.';
    }

    if (!data.labelResourceNames || data.labelResourceNames.length === 0) {
      return 'At least one label is required.';
    }

    return true;
  }
}
```
```

**Create `poc/src/utils/RegexPatterns.ts`:**

```typescript
/**
 * Centralized regex patterns used throughout the application
 */
export class RegexPatterns {
  /**
   * Hebrew character detection (Unicode range U+0590 to U+05FF)
   */
  static readonly HEBREW = /[\u0590-\u05FF]/;

  /**
   * Email validation pattern
   * Matches: standard email format (user@domain.tld)
   * Requires: at least 2 character TLD, no consecutive dots
   */
  static readonly EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /**
   * Additional email validation checks
   */
  static readonly EMAIL_CONSECUTIVE_DOTS = /\.\./;
  static readonly EMAIL_LEADING_DOT = /^\./;
  static readonly EMAIL_TRAILING_DOT = /\.@/;

  /**
   * Phone number validation pattern
   * Allows: digits, +, -, spaces, parentheses
   */
  static readonly PHONE = /^[\d+\-\s()]+$/;

  /**
   * Phone number cleanup pattern - removes non-digit characters
   */
  static readonly PHONE_NON_DIGITS = /[\s\-()]/g;

  /**
   * Label name validation pattern
   * Allows: alphanumeric, spaces, hyphens, underscores
   */
  static readonly LABEL_NAME = /^[a-zA-Z0-9\s\-_]+$/;

  /**
   * Multiple spaces pattern (for name parsing)
   */
  static readonly MULTIPLE_SPACES = /\s+/;

  /**
   * Number formatting pattern (for comma insertion)
   */
  static readonly NUMBER_GROUPING = /\B(?=(\d{3})+(?!\d))/g;

  /**
   * Mixed content detection (letters and numbers)
   */
  static readonly MIXED_CONTENT = /[a-zA-Z0-9]/;

  /**
   * Validate email with all rules
   */
  static isValidEmail(email: string): boolean {
    if (!this.EMAIL.test(email)) return false;
    if (this.EMAIL_CONSECUTIVE_DOTS.test(email)) return false;
    if (this.EMAIL_LEADING_DOT.test(email)) return false;
    if (this.EMAIL_TRAILING_DOT.test(email)) return false;
    return true;
  }

  /**
   * Extract digits from phone number
   */
  static extractDigits(phone: string): string {
    return phone.replace(this.PHONE_NON_DIGITS, '');
  }
}
```

**Create `poc/src/utils/TextUtils.ts`:**

```typescript
import { RegexPatterns } from './RegexPatterns.js';

export class TextUtils {
  /**
   * Check if text contains Hebrew characters
   */
  static hasHebrewCharacters(text: string): boolean {
    return RegexPatterns.HEBREW.test(text);
  }

  /**
   * Reverse Hebrew words only (word-by-word)
   */
  static reverseHebrewText(text: string): string {
    if (!text || !this.hasHebrewCharacters(text)) {
      return text;
    }
    const words = text.split(' ');
    const processedWords = words.map(word => {
      if (this.hasHebrewCharacters(word) && !this.hasMixedContent(word)) {
        return word.split('').reverse().join('');
      }
      return word;
    });
    return processedWords.join(' ');
  }

  /**
   * Check if word has mixed Hebrew and non-Hebrew content
   */
  private static hasMixedContent(word: string): boolean {
    const hasHebrew = RegexPatterns.HEBREW.test(word);
    const hasNonHebrew = RegexPatterns.MIXED_CONTENT.test(word);
    return hasHebrew && hasNonHebrew;
  }

  /**
   * Format number with leading zeros and commas
   */
  static formatNumberWithLeadingZeros(num: number): string {
    return num
      .toString()
      .padStart(5, '0')
      .replace(RegexPatterns.NUMBER_GROUPING, ',');
  }

  /**
   * Parse full name into first and last name
   */
  static parseFullName(fullName: string): { firstName: string; lastName: string } {
    const trimmed = fullName.trim();
    const nameParts = trimmed.split(RegexPatterns.MULTIPLE_SPACES);
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    };
  }

  /**
   * Check if value is empty (null, undefined, or empty string)
   */
  static isEmpty(value: string | undefined | null): boolean {
    return value === null || value === undefined || value.trim() === '';
  }
}
```
```

**Create `poc/src/utils/PortManager.ts`:**

```typescript
export class PortManager {
  /**
   * Check if port is in use and kill process if needed
   */
  static async ensurePortAvailable(port: number): Promise<void> {
    const isInUse = await this.isPortInUse(port);
    if (isInUse) {
      console.log(`Port ${port} is in use. Killing process...`);
      await this.killProcessOnPort(port);
    }
  }

  private static async isPortInUse(port: number): Promise<boolean> { }
  private static async killProcessOnPort(port: number): Promise<void> { }
  private static async findProcessOnPort(port: number): Promise<number | null> { }
}
```

### Refactoring Benefits

- **Encapsulation**: Related functionality grouped together
- **Dependency Injection**: Auth client passed via constructor
- **Single Responsibility**: Each class has one clear purpose
- **Testability**: Easy to mock and test individual classes
- **Maintainability**: Clear structure, easy to find and modify code
- **Type Safety**: All methods properly typed with interfaces

### Issue #26 - Remove `any` types and use proper interfaces

Replace `requestBody: any` (line 499) with proper typed interfaces in `poc/src/types.ts`:

```typescript
interface ContactName {
  givenName?: string;
  familyName?: string;
}

interface ContactEmail {
  value: string;
  type: string;
}

interface ContactPhone {
  value: string;
  type: string;
}

interface ContactOrganization {
  name?: string;
  title?: string;
  type: string;
}

interface ContactUrl {
  value: string;
  type: string;
}

interface ContactMembership {
  contactGroupMembership: {
    contactGroupResourceName: string;
  };
}

interface CreateContactRequest {
  names?: ContactName[];
  emailAddresses?: ContactEmail[];
  phoneNumbers?: ContactPhone[];
  organizations?: ContactOrganization[];
  urls?: ContactUrl[];
  memberships?: ContactMembership[];
}
```

Use these types throughout the codebase instead of inline object types.

### Issue #27 - Remove unused parameters

Remove `_rl` parameter from `promptForLabels()` (line 49)

### Issue #45 - Add types for credential validation

Create comprehensive interfaces in `poc/src/types.ts` for all data structures:

**Environment Configuration:**
```typescript
interface EnvironmentConfig {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  PROJECT_ID: string;
  AUTH_URI: string;
  TOKEN_URI: string;
  AUTH_PROVIDER_CERT_URL: string;
  REDIRECT_PORT: string;
}
```

**Contact Input Data (for function parameters):**
```typescript
interface InitialContactData {
  labelResourceNames: string[];
  company: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
}

interface EditableContactData {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
  labelResourceNames: string[];
}
```

Validate all required fields are present when loading config and use these types instead of inline primitives throughout the codebase.

## 8. Error Handling

### Issue #31 - Prevent crashes on errors

Wrap all major operations in try/catch:

- Auth operations
- API calls (already handled by main menu)
- File operations
  Show user-friendly error messages, allow retry or return to menu

### Issue #33 - Browser open timeout

Add 4-minute timeout to `exec()` command in `auth.ts:32`:

```typescript
exec(`${command} "${url}"`, { timeout: 240000 }, (error) => { ... })
```

## 9. User Experience Improvements

### Issue #16 - Better name parsing

Use `TextUtils.parseFullName()` which uses `RegexPatterns.MULTIPLE_SPACES`:

```typescript
import { TextUtils } from '../utils/index.js';

const { firstName, lastName } = TextUtils.parseFullName(fullName);
```

This handles:
- Multiple spaces between names
- Leading/trailing spaces
- Empty string edge cases

Special cases to document (not implement):
- Names with prefixes (Dr., Mr.) - user should include in first/last name as desired
- Mononyms - user leaves last name empty
- International names - user controls splitting

### Issue #17 - Hebrew text word-by-word reversal

Use `TextUtils.reverseHebrewText()` which uses `RegexPatterns.HEBREW` and `RegexPatterns.MIXED_CONTENT`:

```typescript
import { TextUtils } from '../utils/index.js';

console.log(TextUtils.reverseHebrewText(contact.label));
```

This implementation:
- Splits text into words by spaces
- Checks each word with `RegexPatterns.HEBREW`
- Reverses only pure Hebrew words
- Keeps English words and mixed words as-is
- Joins back with spaces

### Issue #23 - Case-insensitive cancel check

Update all 'cancel' checks throughout `contacts-writer.ts`:

```typescript
if (trimmed.toLowerCase() === "cancel") {
  return; // or continue
}
```

### Issue #25 - Array bounds checking

Add safety check before accessing `currentSelectedLabelNames[0]` (line 199):

```typescript
const firstLabelName =
  currentSelectedLabelNames.length > 0 ? currentSelectedLabelNames[0] : "";
```

### Issue #32 - Log contact creation details

After successful creation (line 554), log:

- Full name created
- Email addresses added
- Phone numbers added
- Labels assigned
- Company/Job title

### Issue #41 - Progress indicators

Use `ora` spinner (already in dependencies):

- When fetching contacts: "⠋ Fetching contacts... 250/1000"
- When creating contact: "⠋ Creating contact..."
- When fetching groups: "⠋ Loading labels..."
- Update spinner text with progress during pagination

## 10. Code Cleanup & Consistency

### Issue #12 - Remove unnecessary auth calls

Cache auth client in main loop instead of calling `authorize()` every operation:

```typescript
const auth = await authorize(); // Once at start
while (continueRunning) {
  // Pass auth to handlers
  continueRunning = await handleMenuChoice(rl, choice, auth);
}
```

### Issue #36 - Remove unused readline interface

Remove `createInterface()` from `index.ts:35-38` since inquirer handles all input

### Issue #37, 38 - Country code handling

Options:

1. Remove country field entirely (store only full phone number)
2. Keep extraction but don't display separately
   **Recommendation**: Remove country field from `PhoneNumber` interface, store only full number

### Issue #42 - Align null/undefined/empty string

Standardize across codebase:

- Use `undefined` for optional/missing values in TypeScript interfaces
- Use empty string `''` only for user-facing display
- Use `null` for explicit "no value" in API responses
- Add utility function: `function isEmpty(value: string | undefined | null): boolean`

### Issue #51 - Consistent quotes

Convert all to single quotes `'` (project appears to use single quotes in most places)

### Issue #52 - Add JSDoc comments

Add documentation for all exported functions:

```typescript
/**
 * Authenticates with Google People API using OAuth2
 * @returns {Promise<OAuth2Client>} Authenticated OAuth2 client
 * @throws {Error} If authentication fails or credentials are invalid
 */
export async function authorize(): Promise<OAuth2Client>;
```

### Issue #53 - Locale-aware sorting

Update `localeCompare()` calls to specify locale:

```typescript
.sort((a, b) => a.name.localeCompare(b.name, 'en-US'))
```

### Issue #54 - Use built-in number formatting

Use `TextUtils.formatNumberWithLeadingZeros()` which uses `RegexPatterns.NUMBER_GROUPING`:

```typescript
import { TextUtils } from '../utils/index.js';

const personNum = TextUtils.formatNumberWithLeadingZeros(index + 1);
```

### Issue #55 - All regex centralized

All regex patterns now in `RegexPatterns.ts`:
- `HEBREW` - Hebrew character detection
- `EMAIL` - Email validation
- `EMAIL_CONSECUTIVE_DOTS`, `EMAIL_LEADING_DOT`, `EMAIL_TRAILING_DOT` - Email checks
- `PHONE` - Phone number validation
- `PHONE_NON_DIGITS` - Phone cleanup pattern
- `LABEL_NAME` - Label name validation
- `MULTIPLE_SPACES` - Name parsing
- `NUMBER_GROUPING` - Number formatting
- `MIXED_CONTENT` - Mixed language detection

Helper methods:
- `isValidEmail()` - Complete email validation
- `extractDigits()` - Extract digits from phone

**Import pattern:**
```typescript
import { RegexPatterns } from '../utils/index.js';
```

### Issue #56 - LinkedIn as single value not array

Change LinkedIn URL handling:

- Store as single string, not array
- Update interface: `website?: { url: string; label: string }` (optional, not array)
- Simplify input/display logic

## 12. Barrel Exports (Index Files)

Create index.ts files in each directory to enable clean imports:

**Create `poc/src/utils/index.ts`:**

```typescript
export { RegexPatterns } from './RegexPatterns.js';
export { TextUtils } from './TextUtils.js';
export { PortManager } from './PortManager.js';
```

**Create `poc/src/validators/index.ts`:**

```typescript
export { InputValidator } from './InputValidator.js';
```

**Create `poc/src/services/index.ts`:**

```typescript
export { AuthService } from './AuthService.js';
export { ContactWriter } from './ContactWriter.js';
export { ContactReader } from './ContactReader.js';
export { ApiTracker } from './ApiTracker.js';
export { DuplicateDetector } from './DuplicateDetector.js';
export type { SimilarityType, DuplicateMatch } from './DuplicateDetector.js';
```

**Usage Examples:**

```typescript
// ✅ GOOD - Import from index
import { RegexPatterns, TextUtils, PortManager } from '../utils/index.js';
import { InputValidator } from '../validators/index.js';
import { AuthService, ContactWriter, ApiTracker } from '../services/index.js';

// ❌ BAD - Direct file imports
import { RegexPatterns } from '../utils/RegexPatterns.js';
import { TextUtils } from '../utils/TextUtils.js';
import { AuthService } from '../services/AuthService.js';
```

This approach:
- Provides clean, organized imports
- Makes it easy to refactor internal file structure
- Reduces import statement clutter
- Follows modern TypeScript/ES6 module patterns

## 11. Documentation

### Issue #60 - Accessibility improvements

Add aria-friendly output:

- Use clear section headers with separators
- Avoid unicode symbols for critical information (use text labels)
- Ensure screen readers can parse contact display format
- Add `--verbose` mode that explicitly labels everything:
  ```
  Person 1 of 100
  Labels: Work, Client
  First Name: John
  Last Name: Doe
  ...
  ```

Add instructions in README about running in screen-reader friendly mode

## Implementation Order

1. **Setup phase**: .env, settings.ts, .gitignore, comprehensive types
2. **Utility classes first**: 
   - `TextUtils` (no dependencies)
   - `PortManager` (no dependencies)
   - `InputValidator` (no dependencies, uses settings)
3. **Core service classes**:
   - `ApiTracker` (singleton, minimal dependencies)
   - `AuthService` (uses PortManager, ApiTracker, settings)
4. **Domain service classes**:
   - `DuplicateDetector` (depends on AuthService, ApiTracker)
   - `ContactReader` (depends on AuthService, ApiTracker, TextUtils)
   - `ContactWriter` (depends on AuthService, ApiTracker, InputValidator, DuplicateDetector)
5. **Config refactoring**: Load from env, add validation
6. **Main entry point**: Refactor `index.ts` to use service classes
7. **Testing**: Test each class individually, then integration testing
8. **Cleanup**: Delete old files (auth.ts, contacts-writer.ts, contacts-reader.ts)
9. **Documentation**: Add JSDoc comments to all classes and public methods

## Files to Create

- `poc/.env` (gitignored)
- `poc/src/settings.ts` - All constants and magic numbers
- `poc/src/types.ts` - Comprehensive type definitions (expand existing file):
  - `EnvironmentConfig`
  - `InitialContactData`
  - `EditableContactData`
  - `ContactName`, `ContactEmail`, `ContactPhone`, `ContactOrganization`, `ContactUrl`, `ContactMembership`
  - `CreateContactRequest`
  - `ApiStats`
  - Validation utility types

**New Service Classes:**
- `poc/src/services/AuthService.ts` - Authentication logic
- `poc/src/services/ContactWriter.ts` - Contact creation logic
- `poc/src/services/ContactReader.ts` - Contact reading and display logic
- `poc/src/services/ApiTracker.ts` - API call tracking (singleton)
- `poc/src/services/DuplicateDetector.ts` - Duplicate detection logic
- `poc/src/services/index.ts` - Barrel export for services

**New Utility Classes:**
- `poc/src/validators/InputValidator.ts` - All input validation logic
- `poc/src/validators/index.ts` - Barrel export for validators
- `poc/src/utils/TextUtils.ts` - Text manipulation utilities (Hebrew, formatting, parsing)
- `poc/src/utils/PortManager.ts` - Port management and process killing
- `poc/src/utils/RegexPatterns.ts` - All regex patterns centralized
- `poc/src/utils/index.ts` - Barrel export for utilities

## Files to Modify

- `poc/.gitignore`
- `poc/src/config.ts` - Load from environment variables
- `poc/src/index.ts` - Refactor to use service classes:
  ```typescript
  async function main(): Promise<void> {
    const authService = new AuthService();
    const auth = await authService.authorize();
    
    const contactReader = new ContactReader(auth);
    const contactWriter = new ContactWriter(auth);
    
    let continueRunning = true;
    while (continueRunning) {
      console.log('\n=== Google People API POC ===\n');
      const { choice } = await inquirer.prompt([/* menu */]);
      
      try {
        switch (choice) {
          case 'read':
            await contactReader.displayContacts();
            break;
          case 'add':
            await contactWriter.addContact();
            break;
          case 'exit':
            continueRunning = false;
            break;
        }
      } catch (error) {
        // Error handling
      }
    }
  }
  ```

**Files to Delete (replaced by classes):**
- `poc/src/auth.ts` → replaced by `AuthService`
- `poc/src/contacts-writer.ts` → replaced by `ContactWriter`
- `poc/src/contacts-reader.ts` → replaced by `ContactReader`

## Testing Strategy

After implementing each class:

1. **Unit Testing** (manual verification for POC):
   - `TextUtils`: Test Hebrew reversal, name parsing, number formatting
   - `PortManager`: Test port detection and killing
   - `InputValidator`: Test all validation rules
   - `ApiTracker`: Test counter increment, date reset, file operations
   - `AuthService`: Test authentication flow, token loading/saving
   - `DuplicateDetector`: Test duplicate detection logic
   - `ContactReader`: Test reading contacts with progress indicator
   - `ContactWriter`: Test contact creation with all validation

2. **Integration Testing**:
   - Test full flow: Auth → Read contacts → Create contact
   - Test error scenarios (network failure, invalid input)
   - Test duplicate detection during contact creation
   - Verify API counter increments correctly across operations
   - Test Hebrew text displays correctly
   - Test progress indicators work during pagination

3. **Edge Cases**:
   - Large contact lists (10K+) with top 10 display
   - Empty contact fields
   - Special characters in names
   - Multiple labels and groups pagination
   - Port conflicts during authentication

## TODO List

- [ ] Create .env file, settings.ts, update .gitignore, comprehensive types
- [ ] Create utility classes: RegexPatterns (all regex), TextUtils, PortManager
- [ ] Create InputValidator class
- [ ] Create barrel exports: utils/index.ts, validators/index.ts, services/index.ts
- [ ] Create ApiTracker service class (singleton pattern)
- [ ] Create AuthService class with port handling, signal handlers, browser timeout
- [ ] Create DuplicateDetector service class with enhanced display (similarity type, multiple matches)
- [ ] Create ContactReader service class with progress indicators, Hebrew handling, top 10 display
- [ ] Create ContactWriter service class with validation, duplicate checks, contact creation
- [ ] Refactor config.ts to load from environment variables with validation
- [ ] Refactor index.ts to use service classes (import from barrel exports)
- [ ] Fix quotes, locale sorting, constants, LinkedIn single value, country code removal
- [ ] Add comprehensive JSDoc comments to all classes and public methods
- [ ] Delete old files: auth.ts, contacts-writer.ts, contacts-reader.ts
- [ ] Verify all imports use barrel exports (from index.ts files)
