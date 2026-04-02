# Dry-Mode Implementation Plan

**Date:** March 23, 2026  
**Status:** Planning Phase (Updated)  
**Author:** System  

## Table of Contents

1. [Overview](#overview)
2. [Objectives](#objectives)
3. [Configuration](#configuration)
4. [Scope & Behavior](#scope--behavior)
5. [Implementation Details](#implementation-details)
6. [Testing Strategy](#testing-strategy)
7. [User Experience](#user-experience)
8. [Implementation Checklist](#implementation-checklist)

---

## Overview

Add a global **dry-mode** setting to the Events & People Syncer that defaults to **TRUE** (read-only mode). When enabled, the system will prevent all Google People API write operations while logging what would have been performed. This provides a safe default for testing and validation before making actual changes to Google Contacts.

### Key Principles

- **Safe by Default**: Dry-mode is enabled by default (`dryMode: true`, READ-ONLY parameter)
- **Explicit Opt-In**: Users must explicitly set `dryMode: false` to enable write operations
- **Comprehensive Logging**: All skipped operations are logged with `[DRY-MODE]` prefix at info level
- **Scope-Limited**: Only affects Google People API writes, not file system operations (cache, logs)
- **Maintenance Bypass**: Maintenance scripts (clear-cache, clear-logs) naturally bypass dry-mode as they don't use affected methods (documented in script comments)
- **User Confirmation**: Interactive prompt confirms user intent when running in dry-mode (can be bypassed with --yes flag)
- **Environment Bypass**: Dry-mode bypasses the `environment: 'test' | 'production'` setting - it applies regardless of environment
- **Duplicate Detection Only**: Mock contacts are tracked ONLY in DuplicateDetector's `recentlyModifiedContacts` array, NOT in cache
- **bypassContactCache Interaction**: Dry-mode respects the `linkedin.bypassContactCache` setting - if cache is bypassed in settings, mock tracking still works via `recentlyModifiedContacts`

---

## Objectives

### Primary Goals

1. **Prevent Accidental Data Changes**: Protect production data by requiring explicit confirmation
2. **Enable Safe Testing**: Allow scripts to run in test environments without side effects
3. **Improve Auditability**: Log all intended operations for review and debugging
4. **Maintain Usability**: Ensure scripts still provide value in dry-mode (validation, duplicate detection)

### Non-Goals

- Block file system operations (logs, cache, notes)
- Prevent read operations from Google API
- Affect authentication or data fetching

---

## Configuration

### Settings File

**Location:** [`src/settings/settings.ts`](../src/settings/settings.ts)

**IMPORTANT**: The `dryMode` parameter is READ-ONLY after initialization and must not be mutated during runtime.

```typescript
export interface Settings {
  // ... existing fields ...
  readonly dryMode: boolean;  // NEW: Global dry-mode setting (READ-ONLY)
}

export const SETTINGS: Settings = {
  // ... existing settings ...
  dryMode: process.env.DRY_MODE?.toLowerCase() === 'false' ? false : true,  // DEFAULT: Read-only mode for safety
};
```

### Environment Variable Override

The dry-mode setting can be controlled via the `DRY_MODE` environment variable:

```bash
# Dry mode (default - read-only, no Google API writes)
pnpm run start

# Live mode (writes enabled, Google API writes allowed)
DRY_MODE=false pnpm run start
```

**Note**: The environment variable accepts these values for disabling dry-mode (case-insensitive):
- `false`, `0`, `no`, `n`

Any other value (including unset) will enable dry-mode for safety.

**Important**: DRY_MODE is an **opt-out** flag. The default behavior is read-only (dry-mode enabled). To enable writes, you must explicitly opt-out by setting one of the values above.

---

## Scope & Behavior

### Operations Affected

Dry-mode **BLOCKS** the following Google People API operations:

| Operation | Method | Location |
|-----------|--------|----------|
| Create Contact | `service.people.createContact()` | ContactEditor |
| Update Contact | `service.people.updateContact()` | ContactEditor, ContactSyncer |
| Add Phone to Contact | `service.people.updateContact()` | ContactEditor.addPhoneToExistingContact() |
| Add Email to Contact | `service.people.updateContact()` | ContactEditor.addEmailToExistingContact() |
| Create Contact Group | `service.contactGroups.create()` | ContactEditor, ContactSyncer, LabelResolver |
| Add Contact (LinkedIn) | `service.people.createContact()` | LinkedIn ContactSyncer.addContact() |
| Update Contact (LinkedIn) | `service.people.updateContact()` | LinkedIn ContactSyncer.updateContact() |
| Ensure Group Exists (LinkedIn) | `service.contactGroups.create()` | LinkedIn ContactSyncer.ensureGroupExists() |
| Add Contact (HiBob) | `service.people.createContact()` | HiBob ContactSyncer.addContact() |
| Update Contact (HiBob) | `service.people.updateContact()` | HiBob ContactSyncer.updateContact() |

### Operations NOT Affected

Dry-mode **ALLOWS** the following operations:

| Operation | Reason |
|-----------|--------|
| Read Google Contacts | Needed for duplicate detection and validation |
| Read Contact Groups | Needed for label resolution |
| Write Cache Files | Local optimization, doesn't affect Google data |
| Write Log Files | Essential for debugging and audit trail |
| Write Notes Files | Local notes feature, doesn't sync to Google |
| Delete Local Files | Maintenance operations (clear-cache, clear-logs) |

**Note**: Maintenance scripts (clear-cache, clear-logs) naturally bypass dry-mode because they don't use any of the affected write methods listed above. Each maintenance script file contains an explicit comment at the top documenting this behavior for future maintainers.

### Behavior in Dry-Mode

When dry-mode is active and a write operation is attempted:

1. **Log the Operation**: Record with `[DRY-MODE]` prefix at **info level** indicating what API call would have been made
2. **Return Mock Response**: Provide complete mock responses matching expected method return types (including all fields, even if empty)
3. **Continue Execution**: Allow the script to proceed as if the operation succeeded
4. **Track Statistics**: Prefix statistics with "[DRY MODE]" to distinguish from live operations
5. **Preserve Delays**: Execute write delays exactly as in live mode (timing unchanged)
6. **Track in DuplicateDetector**: Add mock contacts to `recentlyModifiedContacts` array for duplicate detection (NOT to cache)
7. **Error Handling**: Wrap duplicate detector tracking in try-catch - log failures but don't fail the operation
8. **Prefix Mock Groups**: Mock contact group names use prefix `[DRY-MODE]` to distinguish them from real groups

**Example Log Output:**
```
[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith (john@example.com) - Label: TechCorp
[DRY-MODE] Calling API service.people.updateContact() - people/123: Added LinkedIn URL
[DRY-MODE] Calling API service.contactGroups.create() - Group: NewCompany
```

**Example Statistics Output:**
```
[API Counter] [DRY MODE] Read: 150, Write: 25
```

---

## Implementation Details

### 1. Settings Configuration

**File:** [`src/settings/settings.ts`](../src/settings/settings.ts)

```typescript
export interface Settings {
  environment: 'test' | 'production';
  readonly dryMode: boolean;  // READ-ONLY: Global dry-mode setting (bypasses environment setting)
  // ... rest of settings
}

const parseDryMode = (): boolean => {
  const value = process.env.DRY_MODE?.toLowerCase() || '';
  // Only disable dry-mode for explicit false values
  return !['false', '0', 'no', 'n'].includes(value);
};

export const SETTINGS: Settings = {
  environment: 'test',
  dryMode: parseDryMode(),  // Safe default: enabled unless explicitly disabled
  // ... rest of settings
};
```

### 2. Dry-Mode Status Checker Utility

**File:** `src/utils/dryModeChecker.ts` (NEW FILE)

```typescript
import { SETTINGS } from '../settings';
import type { Logger } from '../logging';

export class DryModeChecker {
  static isEnabled(): boolean {
    return SETTINGS.dryMode;
  }
  
  static logApiCall(
    apiMethod: string,
    details: string,
    logger?: { info: (msg: string, meta?: any) => void } | Logger
  ): void {
    if (!logger || typeof logger.info !== 'function') {
      console.log(`[DRY-MODE] Calling API ${apiMethod} - ${details}`);
      return;
    }
    const message = `[DRY-MODE] Calling API ${apiMethod} - ${details}`;
    logger.info(message);
  }
}
```

### 3. Mock Response Utilities

**File:** `src/utils/dryModeMocks.ts` (NEW FILE)

**Note**: Mock responses should be as complete as possible - include all fields even if empty - to ensure downstream code doesn't break on missing fields.

```typescript
import type { ContactData } from '../types/contact';

export class DryModeMocks {
  private static counter = 0;
  
  private static generateUniqueId(): string {
    this.counter++;
    return `${Date.now()}_${this.counter}_${Math.random().toString(36).slice(2, 11)}`;
  }
  
  // For methods that return void, no mock response needed
  // For methods that return string (resourceName), generate mock with unique ID
  static createGroupResponse(groupName: string): string {
    return `contactGroups/dryMode_${this.generateUniqueId()}`;
  }
  
  // For ContactEditor.createContact() - complete response with all fields
  static createContactResponse(firstName: string, lastName: string): { 
    resourceName: string; 
    etag: string; 
    names: Array<{ givenName?: string; familyName?: string }>;
    emailAddresses?: any[];
    phoneNumbers?: any[];
    organizations?: any[];
    urls?: any[];
    memberships?: any[];
    biographies?: any[];
  } {
    return {
      resourceName: `people/dryMode_${this.generateUniqueId()}`,
      etag: `dryMode_etag_${this.generateUniqueId()}`,
      names: [{ givenName: firstName, familyName: lastName }],
      emailAddresses: [],
      phoneNumbers: [],
      organizations: [],
      urls: [],
      memberships: [],
      biographies: [],
    };
  }
}
```

### 4. Service Layer Updates

**Note on Inheritance**: The `EventsContactEditor` class extends `ContactEditor` and will automatically inherit dry-mode behavior from parent methods. No explicit changes needed for `EventsContactEditor`.

**Note on Duplicate Detection**: LinkedIn and HiBob `ContactSyncer` classes will integrate with the duplicate detector to track mock contacts created in dry-mode.

#### ContactEditor

**File:** [`src/services/contacts/contactEditor.ts`](../src/services/contacts/contactEditor.ts)

```typescript
import { SETTINGS } from '../../settings';
import { DryModeChecker } from '../../utils/dryModeChecker';
import { DryModeMocks } from '../../utils/dryModeMocks';

@injectable()
export class ContactEditor {
  private logger = new Logger('ContactEditor');
  // ... existing code ...

  async createContact(data: EditableContactData, note: string): Promise<void> {
    const validationError = InputValidator.validateMinimumRequirements(data);
    if (validationError !== true) {
      this.uiLogger.displayError(validationError);
      throw new Error(validationError);
    }
    
    // ... existing request building logic ...
    
    if (SETTINGS.dryMode) {
      const contactDetails = `Contact: ${data.firstName} ${data.lastName}` +
        (data.emails[0] ? ` (${data.emails[0]})` : '') +
        (data.company ? ` - Label: ${data.company}` : '');
      DryModeChecker.logApiCall('service.people.createContact()', contactDetails, this.logger);
      
      const mockResponse = DryModeMocks.createContactResponse(data.firstName, data.lastName);
      
      // Build mock contact for duplicate detector
      const finalAllGroups = await this.fetchContactGroups();
      const finalSelectedLabelNames = data.labelResourceNames.map((resourceName) => {
        const group = finalAllGroups.find((g) => g.resourceName === resourceName);
        return group ? group.name : resourceName;
      });
      const firstLabelName = finalSelectedLabelNames.length > 0 ? finalSelectedLabelNames[0] : '';
      const compositeSuffix = [firstLabelName, data.company].filter((s) => s).join(' ');
      
      const newContact: ContactData = {
        label: finalSelectedLabelNames.join(' | '),
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company ?? '',
        jobTitle: data.jobTitle ?? '',
        emails: data.emails.map((email) => ({ value: email, label: compositeSuffix || 'other' })),
        phones: data.phones.map((phone) => ({ number: phone, label: compositeSuffix || 'other' })),
        websites: data.linkedInUrl ? [{ url: data.linkedInUrl, label: 'LinkedIn' }] : [],
        resourceName: mockResponse.resourceName,
        biography: note,
        etag: mockResponse.etag,
      };
      
      // Add to duplicate detector - wrap in try-catch to not fail operation on tracking failure
      try {
        this.duplicateDetector.addRecentlyModifiedContact(newContact);
      } catch (error: unknown) {
        this.logger.debug('Failed to add mock contact to duplicate detector', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      await ApiTracker.getInstance().trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      
      this.uiLogger.displaySuccess('[DRY MODE] Contact created successfully');
      console.log(`-Resource Name: ${mockResponse.resourceName} (mock)`);
      // ... rest of display logic ...
      return;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const spinner = ora('Creating new contact...').start();
    const response = await retryWithBackoff(async () => {
      return await service.people.createContact({ requestBody });
    });
    await apiTracker.trackWrite();
    spinner.stop();
    // ... rest of existing logic ...
  }

  async updateContact(
    resourceName: string,
    originalData: ContactData,
    updatedData: EditableContactData,
    uiLogger: Logger
  ): Promise<void> {
    // ... existing logic to fetch current state and build update request ...
    
    if (updateMask.length === 0) {
      this.logger.info('No fields changed, skipping update');
      return;
    }
    
    if (SETTINGS.dryMode) {
      const changes = updateMask.map(field => field.charAt(0).toUpperCase() + field.slice(1)).join(', ');
      DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Updated fields [${changes}]`, this.logger);
      
      await ApiTracker.getInstance().trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      uiLogger.displaySuccess('[DRY MODE] Contact updated successfully');
      return;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const spinner = ora('Updating contact...').start();
    // ... rest of existing logic ...
  }

  async createContactGroup(groupName: string): Promise<string> {
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${groupName}`;
      DryModeChecker.logApiCall('service.contactGroups.create()', `Group: ${prefixedName}`, this.logger);
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      await ApiTracker.getInstance().trackWrite();
      return mockResourceName;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    // ... rest of existing logic ...
  }

  async addPhoneToExistingContact(resourceName: string, phone: string): Promise<void> {
    // ... existing logic to fetch current contact and check for duplicate ...
    
    if (SETTINGS.dryMode) {
      DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Add phone ${phone}`, this.logger);
      await ApiTracker.getInstance().trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return;
    }
    
    // Actual API call with retry logic (existing code)
    // ... rest of existing logic ...
  }

  async addEmailToExistingContact(resourceName: string, email: string): Promise<void> {
    // ... existing logic to fetch current contact and check for duplicate ...
    
    if (SETTINGS.dryMode) {
      DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Add email ${email}`, this.logger);
      await ApiTracker.getInstance().trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return;
    }
    
    // Actual API call with retry logic (existing code)
    // ... rest of existing logic ...
  }
}
```

#### LinkedIn ContactSyncer

**File:** [`src/services/linkedin/contactSyncer.ts`](../src/services/linkedin/contactSyncer.ts)

```typescript
import { SETTINGS } from '../../settings';
import { DryModeChecker } from '../../utils/dryModeChecker';
import { DryModeMocks } from '../../utils/dryModeMocks';
import { DuplicateDetector } from '../contacts/duplicateDetector';

@injectable()
export class ContactSyncer {
  private logger: Logger = new Logger('ContactSyncer');
  private duplicateDetector: DuplicateDetector;
  // ... existing code ...

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) duplicateDetector: DuplicateDetector
  ) {
    this.duplicateDetector = duplicateDetector;
    this.writeDelayMs = SETTINGS.linkedin.writeDelayMs;
  }

  async addContact(
    connection: LinkedInConnection,
    label: string,
    scriptName: string = 'LinkedIn'
  ): Promise<SyncResult> {
    try {
      const groupResourceName: string = await this.ensureGroupExists(label);
      
      // ... existing request building logic ...
      
      if (Object.keys(requestBody).length === 0) {
        return { status: SyncStatusType.SKIPPED };
      }
      
      if (SETTINGS.dryMode) {
        const contactDetails = `Contact: ${connection.firstName} ${connection.lastName}` +
          (connection.email ? ` (${connection.email})` : '') +
          ` - Label: ${label}`;
        DryModeChecker.logApiCall('service.people.createContact()', contactDetails, this.logger);
        
        // Build mock contact for duplicate detector
        const mockResponse = DryModeMocks.createContactResponse(connection.firstName, connection.lastName);
        const formattedCompany = calculateFormattedCompany(connection.company);
        const compositeSuffix = [label, formattedCompany].filter((s) => s).join(' ');
        
        const newContact: ContactData = {
          label: label,
          firstName: connection.firstName,
          lastName: connection.lastName,
          company: formattedCompany,
          jobTitle: connection.position,
          emails: connection.email ? [{ value: connection.email, label: compositeSuffix }] : [],
          phones: [],
          websites: connection.url ? [{ url: connection.url, label: 'LinkedIn' }] : [],
          resourceName: mockResponse.resourceName,
          biography: buildNewContactNote(new Date(), scriptName),
          etag: mockResponse.etag,
        };
        
        // Add to duplicate detector - wrap in try-catch to not fail operation on tracking failure
        try {
          this.duplicateDetector.addRecentlyModifiedContact(newContact);
        } catch (error: unknown) {
          this.logger.debug('Failed to add mock contact to duplicate detector', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        
        await ApiTracker.getInstance().trackWrite();
        await this.delay(this.writeDelayMs);
        return { status: SyncStatusType.NEW };
      }
      
      // Actual API call (existing code)
      const service = google.people({ version: 'v1', auth: this.auth });
      await retryWithBackoff(async () => {
        await service.people.createContact({ requestBody });
      });
      await ApiTracker.getInstance().trackWrite();
      await this.delay(this.writeDelayMs);
      return { status: SyncStatusType.NEW };
    } catch (error: unknown) {
      // ... existing error handling ...
    }
  }

  async updateContact(
    resourceName: string,
    connection: LinkedInConnection,
    label: string,
    scriptName: string = 'LinkedIn'
  ): Promise<SyncResult> {
    try {
      // ... existing logic to build update request and determine changes ...
      
      if (!hasChanges) {
        return { status: SyncStatusType.UP_TO_DATE };
      }
      
      if (SETTINGS.dryMode) {
        const changes = updateMask.map(field => field.charAt(0).toUpperCase() + field.slice(1)).join(', ');
        DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Updated fields [${changes}]`, this.logger);
        await ApiTracker.getInstance().trackWrite();
        await this.delay(this.writeDelayMs);
        await ContactCache.getInstance().invalidate();
        return { status: SyncStatusType.UPDATED, updateDetails };
      }
      
      // Actual API call (existing code)
      const service = google.people({ version: 'v1', auth: this.auth });
      await retryWithBackoff(async () => {
        await service.people.updateContact({
          resourceName,
          updatePersonFields: updateMask.join(','),
          requestBody,
        });
      });
      await ApiTracker.getInstance().trackWrite();
      await this.delay(this.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return { status: SyncStatusType.UPDATED, updateDetails };
    } catch (error: unknown) {
      // ... existing error handling ...
    }
  }

  private async ensureGroupExists(groupName: string): Promise<string> {
    if (this.groupMap[groupName]) {
      return this.groupMap[groupName];
    }
    
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${groupName}`;
      DryModeChecker.logApiCall('service.contactGroups.create()', `Group: ${prefixedName}`, this.logger);
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      await ApiTracker.getInstance().trackWrite();
      this.groupMap[groupName] = mockResourceName;
      return mockResourceName;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    const response = await retryWithBackoff(async () => {
      return await service.contactGroups.create({
        requestBody: { contactGroup: { name: groupName } },
      });
    });
    await ApiTracker.getInstance().trackWrite();
    await this.loadContactGroups();
    const resourceName: string = response.data.resourceName || '';
    return resourceName;
  }
}
```

#### HiBob ContactSyncer

**File:** [`src/services/hibob/contactSyncer.ts`](../src/services/hibob/contactSyncer.ts)

```typescript
import { SETTINGS } from '../../settings';
import { DryModeChecker } from '../../utils/dryModeChecker';
import { DryModeMocks } from '../../utils/dryModeMocks';
import { DuplicateDetector } from '../contacts/duplicateDetector';

@injectable()
export class HibobContactSyncer {
  private logger: Logger = new Logger('HibobContactSyncer');
  private duplicateDetector: DuplicateDetector;
  // ... existing code ...

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) duplicateDetector: DuplicateDetector
  ) {
    this.duplicateDetector = duplicateDetector;
    this.writeDelayMs = SETTINGS.hibob.writeDelayMs;
  }

  async addContact(
    contact: HibobContact,
    labelResourceName: string,
    labelValue: string
  ): Promise<SyncResult> {
    try {
      // ... existing request building logic ...
      
      if (Object.keys(requestBody).length === 0) {
        return { status: SyncStatusType.SKIPPED };
      }
      
      if (SETTINGS.dryMode) {
        const contactDetails = `Contact: ${contact.firstName} ${contact.lastName}` +
          (contact.email ? ` (${contact.email})` : '') +
          ` - Label: ${labelValue}`;
        DryModeChecker.logApiCall('service.people.createContact()', contactDetails, this.logger);
        
        // Build mock contact for duplicate detector
        const mockResponse = DryModeMocks.createContactResponse(contact.firstName, contact.lastName);
        
        const newContact: ContactData = {
          label: labelValue,
          firstName: contact.firstName,
          lastName: contact.lastName,
          company: contact.company || '',
          jobTitle: contact.jobTitle || '',
          emails: contact.email ? [{ value: contact.email, label: labelValue }] : [],
          phones: [],
          websites: [],
          resourceName: mockResponse.resourceName,
          biography: '',
          etag: mockResponse.etag,
        };
        
        // Add to duplicate detector - wrap in try-catch to not fail operation on tracking failure
        try {
          this.duplicateDetector.addRecentlyModifiedContact(newContact);
        } catch (error: unknown) {
          this.logger.debug('Failed to add mock contact to duplicate detector', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        
        await ApiTracker.getInstance().trackWrite();
        await this.delay(this.writeDelayMs);
        return { status: SyncStatusType.NEW };
      }
      
      // Actual API call (existing code)
      const service = google.people({ version: 'v1', auth: this.auth });
      await retryWithBackoff(async () => {
        await service.people.createContact({ requestBody });
      });
      await ApiTracker.getInstance().trackWrite();
      await this.delay(this.writeDelayMs);
      return { status: SyncStatusType.NEW };
    } catch (error: unknown) {
      // ... existing error handling ...
    }
  }

  async updateContact(
    resourceName: string,
    labelResourceName: string
  ): Promise<SyncResult> {
    try {
      // ... existing logic to check memberships and build update request ...
      
      if (existingGroupResourceNames.includes(labelResourceName)) {
        return { status: SyncStatusType.UP_TO_DATE };
      }
      
      if (SETTINGS.dryMode) {
        DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Add membership ${labelResourceName}`, this.logger);
        await ApiTracker.getInstance().trackWrite();
        await this.delay(this.writeDelayMs);
        await ContactCache.getInstance().invalidate();
        return { status: SyncStatusType.UPDATED };
      }
      
      // Actual API call (existing code)
      const service = google.people({ version: 'v1', auth: this.auth });
      await retryWithBackoff(async () => {
        await service.people.updateContact({
          resourceName,
          updatePersonFields: updateMask.join(','),
          requestBody,
        });
      });
      await ApiTracker.getInstance().trackWrite();
      await this.delay(this.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return { status: SyncStatusType.UPDATED };
    } catch (error: unknown) {
      // ... existing error handling ...
    }
  }
}
```

#### ContactSyncer

**File:** [`src/services/contacts/contactSyncer.ts`](../src/services/contacts/contactSyncer.ts)

```typescript
import { SETTINGS } from '../../settings';
import { DryModeChecker } from '../../utils/dryModeChecker';
import { DryModeMocks } from '../../utils/dryModeMocks';

@injectable()
export class ContactSyncer {
  private readonly logger: Logger = new Logger('ContactSyncer');
  // ... existing code ...

  async updateContact(
    resourceName: string,
    originalData: ContactData,
    updatedData: EditableContactData,
    uiLogger: Logger
  ): Promise<void> {
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    
    // Fetch existing contact from Google
    const service = google.people({ version: 'v1', auth: this.auth });
    const existingContact = await retryWithBackoff(async () => {
      return await service.people.get({
        resourceName,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies',
      });
    });
    await apiTracker.trackRead();
    
    // Build update request based on changes
    const requestBody: any = {};
    const updateMask: string[] = [];
    
    // ... existing logic to detect changes in names, emails, phones, organizations, URLs, memberships, and notes ...
    
    if (updateMask.length === 0) {
      this.logger.info('No fields changed, skipping update');
      return;
    }
    
    if (SETTINGS.dryMode) {
      const changes = updateMask.map(field => field.charAt(0).toUpperCase() + field.slice(1)).join(', ');
      DryModeChecker.logApiCall('service.people.updateContact()', `${resourceName}: Updated fields [${changes}]`, this.logger);
      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      uiLogger.displaySuccess('[DRY MODE] Contact updated successfully');
      return;
    }
    
    // Actual API call (existing code)
    const spinner = ora('Updating contact...').start();
    await retryWithBackoff(async () => {
      return await service.people.updateContact({
        resourceName,
        updatePersonFields: updateMask.join(','),
        requestBody,
      });
    });
    await apiTracker.trackWrite();
    spinner.stop();
    uiLogger.resetState('spinner');
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
    uiLogger.displaySuccess('Contact updated successfully');
  }

  async createContactGroup(name: string): Promise<string> {
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${name}`;
      DryModeChecker.logApiCall('service.contactGroups.create()', `Group: ${prefixedName}`, this.logger);
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      await ApiTracker.getInstance().trackWrite();
      return mockResourceName;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    const response = await retryWithBackoff(async () => {
      return await service.contactGroups.create({
        requestBody: { contactGroup: { name } },
      });
    });
    await ApiTracker.getInstance().trackWrite();
    return response.data.resourceName || '';
  }
}
```

#### LabelResolver

**File:** [`src/services/labels/labelResolver.ts`](../src/services/labels/labelResolver.ts)

```typescript
import { SETTINGS } from '../../settings';
import { DryModeChecker } from '../../utils/dryModeChecker';
import { DryModeMocks } from '../../utils/dryModeMocks';

@injectable()
export class LabelResolver {
  private logger = new Logger('LabelResolver');
  // ... existing code ...

  async createLabel(name: string): Promise<string> {
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${name}`;
      DryModeChecker.logApiCall('service.contactGroups.create()', `Group: ${prefixedName}`, this.logger);
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      await ApiTracker.getInstance().trackWrite();
      if (this.logApiStats && this.uiLogger) {
        await ApiTracker.getInstance().logStats(this.uiLogger);
      }
      return mockResourceName;
    }
    
    // Actual API call (existing code)
    const service = google.people({ version: 'v1', auth: this.auth });
    const response = await retryWithBackoff(async () => {
      return await service.contactGroups.create({
        requestBody: { contactGroup: { name } },
      });
    });
    await ApiTracker.getInstance().trackWrite();
    if (this.logApiStats && this.uiLogger) {
      await ApiTracker.getInstance().logStats(this.uiLogger);
    }
    return response.data.resourceName!;
  }
}
```

### 5. ApiTracker Updates

**File:** [`src/services/api/apiTracker.ts`](../src/services/api/apiTracker.ts)

Update the `logStats()` method to prefix output with `[DRY MODE]` when in dry-mode:

```typescript
async logStats(uiLogger?: Logger): Promise<void> {
  const stats: ApiStats = await this.loadStats();
  const prefix = SETTINGS.dryMode ? '[DRY MODE] ' : '';
  const message = `${prefix}[API Counter] Read: ${stats.read_count}, Write: ${stats.write_count}`;
  if (uiLogger) {
    uiLogger.displayInfo(message);
  } else {
    console.log(message);
  }
}
```

### 6. Main Entry Point with Dry-Mode Confirmation

**File:** [`src/index.ts`](../src/index.ts) or main entry point

Add a confirmation prompt before any script runs when dry-mode is enabled (can be bypassed with `--yes` flag):

```typescript
import { SETTINGS } from './settings';
import { confirmWithEscape } from './utils/promptWithEnquirer';
import { EMOJIS } from './constants';

async function main(): Promise<void> {
  // Check for --yes flag to skip prompts
  const flags = process.argv.slice(2);
  const skipPrompt = flags.includes('--yes') || flags.includes('-y');
  
  // Dry-mode confirmation check
  if (SETTINGS.dryMode && !skipPrompt) {
    console.log('');
    console.log(`${EMOJIS.STATUS.WARNING} You are running in DRY MODE`);
    console.log('');
    console.log('  No write actions to the Google API will be executed.');
    console.log('  All write operations will be logged with [DRY-MODE] prefix.');
    console.log('  Mock contacts will be tracked for duplicate detection.');
    console.log('');
    console.log('  To disable dry-mode: Set DRY_MODE=false (or 0, no, n)');
    console.log('  Example: DRY_MODE=false pnpm run start');
    console.log('');
    console.log('  To skip this prompt: Use --yes or -y flag');
    console.log('  Example: pnpm run start --yes');
    console.log('');
    console.log('  Note: Dry-mode applies regardless of environment setting.');
    console.log('  By confirming, you acknowledge you understand the system will NOT make real API writes.');
    console.log('');
    
    const proceedResult = await confirmWithEscape({
      message: 'Proceed in dry mode?',
      default: true,
    });
    
    if (proceedResult.escaped || !proceedResult.value) {
      console.log('Operation cancelled.');
      process.exit(0);
    }
    console.log('');
  } else if (SETTINGS.dryMode && skipPrompt) {
    console.log(`${EMOJIS.STATUS.WARNING} Running in DRY MODE (prompt skipped with --yes flag)`);
    console.log('');
  }
  
  // ... rest of main() logic ...
}

main();
---

## Testing Strategy

### Unit Tests

#### Test: Dry-Mode Checker

**File:** `src/utils/__tests__/dryModeChecker.test.ts` (NEW)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DryModeChecker } from '../dryModeChecker';
import { SETTINGS } from '../../settings';

describe('DryModeChecker', () => {
  const originalDryMode = SETTINGS.dryMode;
  
  afterEach(() => {
    // Restore original setting
    (SETTINGS as any).dryMode = originalDryMode;
  });

  describe('isEnabled', () => {
    it('should return true when dryMode is enabled', () => {
      (SETTINGS as any).dryMode = true;
      expect(DryModeChecker.isEnabled()).toBe(true);
    });

    it('should return false when dryMode is disabled', () => {
      (SETTINGS as any).dryMode = false;
      expect(DryModeChecker.isEnabled()).toBe(false);
    });
  });

  describe('requireLiveMode', () => {
    it('should throw error when dry-mode is enabled', () => {
      (SETTINGS as any).dryMode = true;
      expect(() => {
        DryModeChecker.requireLiveMode('test operation');
      }).toThrow('[DRY-MODE-VERIFICATION] test operation requires live mode');
    });

    it('should not throw when dry-mode is disabled', () => {
      (SETTINGS as any).dryMode = false;
      expect(() => {
        DryModeChecker.requireLiveMode('test operation');
      }).not.toThrow();
    });
  });

  describe('logApiCall', () => {
    it('should log with correct format', () => {
      const mockLogger = {
        info: vi.fn(),
      };
      
      DryModeChecker.logApiCall(
        'service.people.createContact()',
        'Contact: John Smith',
        mockLogger
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith'
      );
    });
  });
});
```

#### Test: Mock Response Utilities

**File:** `src/utils/__tests__/dryModeMocks.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { DryModeMocks } from '../dryModeMocks';

describe('DryModeMocks', () => {
  describe('createContactResponse', () => {
    it('should create mock contact response with correct structure', () => {
      const response = DryModeMocks.createContactResponse('John', 'Smith');
      
      expect(response.resourceName).toMatch(/^people\/dryMode_/);
      expect(response.etag).toMatch(/^dryMode_etag_/);
      expect(response.names).toEqual([
        { givenName: 'John', familyName: 'Smith' }
      ]);
    });

    it('should create unique resource names', () => {
      const response1 = DryModeMocks.createContactResponse('John', 'Smith');
      const response2 = DryModeMocks.createContactResponse('Jane', 'Doe');
      
      expect(response1.resourceName).not.toBe(response2.resourceName);
    });
  });

  describe('createUpdateResponse', () => {
    it('should create mock update response preserving resourceName', () => {
      const resourceName = 'people/123';
      const response = DryModeMocks.createUpdateResponse(resourceName);
      
      expect(response.resourceName).toBe(resourceName);
      expect(response.etag).toMatch(/^dryMode_etag_/);
    });
  });

  describe('createGroupResponse', () => {
    it('should create mock group resourceName', () => {
      const resourceName = DryModeMocks.createGroupResponse('TestGroup');
      
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should create unique group resource names', () => {
      const resourceName1 = DryModeMocks.createGroupResponse('Group1');
      const resourceName2 = DryModeMocks.createGroupResponse('Group2');
      
      expect(resourceName1).not.toBe(resourceName2);
    });
  });
});
```

#### Test: ContactEditor Dry-Mode

**File:** `src/services/contacts/__tests__/contactEditor.dryMode.test.ts` (NEW)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContactEditor } from '../contactEditor';
import { SETTINGS } from '../../../settings';
import type { EditableContactData } from '../contactEditor';

vi.mock('googleapis');
vi.mock('../../../cache', () => ({
  ContactCache: {
    getInstance: vi.fn().mockReturnValue({
      invalidate: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('ContactEditor - Dry Mode', () => {
  let contactEditor: ContactEditor;
  const originalDryMode = SETTINGS.dryMode;
  
  beforeEach(() => {
    contactEditor = new ContactEditor(mockAuth, mockDuplicateDetector);
  });

  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
  });

  describe('createContact', () => {
    const testData: EditableContactData = {
      firstName: 'John',
      lastName: 'Smith',
      emails: ['john@example.com'],
      phones: [],
      labelResourceNames: ['contactGroups/123'],
    };

    it('should skip API call in dry-mode and log operation', async () => {
      (SETTINGS as any).dryMode = true;
      const logSpy = vi.spyOn(console, 'log');
      
      await contactEditor.createContact(testData, 'Test note');
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-MODE]')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('service.people.createContact()')
      );
    });

    it('should execute normally when dry-mode is disabled', async () => {
      (SETTINGS as any).dryMode = false;
      const mockCreateContact = vi.fn().mockResolvedValue({
        data: { resourceName: 'people/real123' }
      });
      
      // Mock the service
      // ... test actual API call ...
    });
  });

  describe('addPhoneToExistingContact', () => {
    it('should skip API call in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const logSpy = vi.spyOn(console, 'log');
      
      await contactEditor.addPhoneToExistingContact('people/123', '+1234567890');
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-MODE]')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Add phone')
      );
    });
  });

  describe('addEmailToExistingContact', () => {
    it('should skip API call in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      const logSpy = vi.spyOn(console, 'log');
      
      await contactEditor.addEmailToExistingContact('people/123', 'test@example.com');
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-MODE]')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Add email')
      );
    });
  });

  describe('createContactGroup', () => {
    it('should return mock resourceName in dry-mode', async () => {
      (SETTINGS as any).dryMode = true;
      
      const resourceName = await contactEditor.createContactGroup('TestCompany');
      
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });
  });
});
```

#### Test: LinkedIn ContactSyncer Dry-Mode

**File:** `src/services/linkedin/__tests__/contactSyncer.dryMode.test.ts` (NEW)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContactSyncer } from '../contactSyncer';
import { SETTINGS } from '../../../settings';
import { SyncStatusType } from '../../../types/linkedin';

describe('LinkedIn ContactSyncer - Dry Mode', () => {
  let contactSyncer: ContactSyncer;
  const originalDryMode = SETTINGS.dryMode;
  
  beforeEach(() => {
    contactSyncer = new ContactSyncer(mockAuth);
    await contactSyncer.initialize();
  });

  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
  });

  describe('addContact', () => {
    it('should return NEW status in dry-mode without API call', async () => {
      (SETTINGS as any).dryMode = true;
      const logSpy = vi.spyOn(console, 'log');
      
      const result = await contactSyncer.addContact(mockConnection, 'TestLabel');
      
      expect(result.status).toBe(SyncStatusType.NEW);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-MODE]')
      );
    });
  });

  describe('updateContact', () => {
    it('should return UPDATED status in dry-mode without API call', async () => {
      (SETTINGS as any).dryMode = true;
      const logSpy = vi.spyOn(console, 'log');
      
      const result = await contactSyncer.updateContact(
        'people/123',
        mockConnection,
        'TestLabel'
      );
      
      expect(result.status).toBe(SyncStatusType.UPDATED);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-MODE]')
      );
    });
  });

  describe('ensureGroupExists', () => {
    it('should return mock resourceName in dry-mode for new groups', async () => {
      (SETTINGS as any).dryMode = true;
      
      const resourceName = await contactSyncer['ensureGroupExists']('NewGroup');
      
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });
  });
});
```

#### Test: HiBob ContactSyncer Dry-Mode

**File:** `src/services/hibob/__tests__/contactSyncer.dryMode.test.ts` (NEW)

Similar structure to LinkedIn ContactSyncer tests, covering `addContact()` and `updateContact()`.

#### Test: ContactSyncer Dry-Mode

**File:** `src/services/contacts/__tests__/contactSyncer.dryMode.test.ts` (NEW)

Tests for `updateContact()` and `createContactGroup()` in dry-mode.

#### Test: LabelResolver Dry-Mode

**File:** `src/services/labels/__tests__/labelResolver.dryMode.test.ts` (NEW)

Tests for `createLabel()` in dry-mode.

### Integration Tests

#### Script Integration Tests

Update existing script tests to verify dry-mode behavior:

**Files to Update:**
- [`src/scripts/__tests__/eventsJobsSync.test.ts`](../src/scripts/__tests__/eventsJobsSync.test.ts)
- [`src/scripts/__tests__/smsWhatsappSync.test.ts`](../src/scripts/__tests__/smsWhatsappSync.test.ts)
- [`src/scripts/__tests__/otherContactsSync.test.ts`](../src/scripts/__tests__/otherContactsSync.test.ts)
- [`src/scripts/__tests__/linkedinSync.test.ts`](../src/scripts/__tests__/linkedinSync.test.ts) (NEW - full integration test)

**Test Cases to Add:**
1. Verify script runs successfully with `dryMode: true`
2. Verify logs contain `[DRY-MODE]` prefix at info level
3. Verify mock contacts added to duplicate detector's recentlyModifiedContacts (NOT cache)
4. Verify statistics are tracked with "[DRY MODE]" prefix
5. Verify delays execute as expected
6. Verify Google Contacts count unchanged after dry-mode run
7. Verify create-then-update scenarios work with mocks (duplicate detection)
8. Verify tracking failure doesn't break operations (try-catch works)
9. Verify mock groups have `[DRY-MODE]` prefix

**New Full Integration Test:**

**File:** `src/scripts/__tests__/linkedinSync.dryMode.integration.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SETTINGS } from '../../settings';
import { DuplicateDetector } from '../../services/contacts/duplicateDetector';
import { container } from '../../di/container';

describe('LinkedIn Sync - Full Dry Mode Integration', () => {
  const originalDryMode = SETTINGS.dryMode;
  
  beforeEach(async () => {
    // Clear duplicate detector state
    const duplicateDetector = container.get(DuplicateDetector);
    await duplicateDetector.clearCache();
  });

  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
  });

  it('should complete full sync in dry-mode with mocks tracked', async () => {
    (SETTINGS as any).dryMode = true;
    
    // Record initial Google contact count
    const initialCount = await getGoogleContactCount();
    
    // Run full LinkedIn sync
    await runLinkedInSync();
    
    // Verify Google contact count unchanged
    const finalCount = await getGoogleContactCount();
    expect(finalCount).toBe(initialCount);
    
    // Verify mocks tracked in duplicate detector
    const duplicateDetector = container.get(DuplicateDetector);
    const recentlyModified = duplicateDetector['recentlyModifiedContacts'];
    expect(recentlyModified.length).toBeGreaterThan(0);
    expect(recentlyModified[0].resourceName).toMatch(/^people\/dryMode_/);
    
    // Verify duplicate detection works with mocks
    const mockContact = recentlyModified[0];
    const duplicates = await duplicateDetector.checkDuplicateName(
      mockContact.firstName,
      mockContact.lastName
    );
    expect(duplicates.length).toBeGreaterThan(0);
  });
  
  it('should handle create-then-update scenario with mocks', async () => {
    (SETTINGS as any).dryMode = true;
    
    // Create mock contact
    const contactSyncer = container.get(ContactSyncer);
    const result1 = await contactSyncer.addContact(mockConnection, 'TestLabel');
    expect(result1.status).toBe(SyncStatusType.NEW);
    
    // Try to create same contact again - should detect duplicate
    const duplicateDetector = container.get(DuplicateDetector);
    const duplicates = await duplicateDetector.checkDuplicateEmail(mockConnection.email);
    expect(duplicates.length).toBe(1);
  });
  
  it('should prefix mock groups with [DRY-MODE]', async () => {
    (SETTINGS as any).dryMode = true;
    
    const contactEditor = container.get(ContactEditor);
    const groupResourceName = await contactEditor.createContactGroup('TestGroup');
    
    expect(groupResourceName).toMatch(/^contactGroups\/dryMode_/);
    // Note: Group name would be '[DRY-MODE] TestGroup' in the actual implementation
  });
  
  it('should continue on duplicate detector tracking failure', async () => {
    (SETTINGS as any).dryMode = true;
    
    // Mock duplicate detector to throw error
    const duplicateDetector = container.get(DuplicateDetector);
    vi.spyOn(duplicateDetector, 'addRecentlyModifiedContact').mockImplementation(() => {
      throw new Error('Tracking failed');
    });
    
    // Operation should still succeed
    const contactSyncer = container.get(ContactSyncer);
    const result = await contactSyncer.addContact(mockConnection, 'TestLabel');
    expect(result.status).toBe(SyncStatusType.NEW);
  });
});
```

### Manual Testing Checklist

- [ ] Verify dry-mode confirmation prompt appears when running `pnpm run start`
- [ ] Verify `--yes` flag skips confirmation prompt: `pnpm run start --yes`
- [ ] Verify `-y` flag also skips confirmation prompt: `pnpm run start -y`
- [ ] Verify canceling the prompt exits gracefully
- [ ] Run LinkedIn sync with `dryMode: true`, verify no contacts created in Google
- [ ] Run HiBob sync with `dryMode: true`, verify no contacts created in Google
- [ ] Run Contacts sync with `dryMode: true`, verify no updates made in Google
- [ ] Check logs contain `[DRY-MODE]` prefixed messages at info level
- [ ] Verify "[DRY MODE]" prefix appears in API statistics
- [ ] Verify all write delays still execute (timing unchanged)
- [ ] Verify mock contacts NOT in cache (only in duplicate detector)
- [ ] Verify duplicate detection works with mock contacts via recentlyModifiedContacts
- [ ] Verify mock groups have `[DRY-MODE]` prefix in name
- [ ] Set `DRY_MODE=false`, verify operations execute normally
- [ ] Set `DRY_MODE=0`, verify operations execute normally (test alternative disable values)
- [ ] Set `DRY_MODE=no`, verify operations execute normally
- [ ] Set `DRY_MODE=n`, verify operations execute normally
- [ ] Set `linkedin.bypassContactCache: true`, verify dry-mode still works
- [ ] Verify maintenance scripts (clear-cache, clear-logs) work without dry-mode checks
- [ ] Verify maintenance scripts have documentation comments about dry-mode bypass

---

## User Experience

### Initial Confirmation Prompt

When running `pnpm run start` with dry-mode enabled, users see:

```
⚠️  You are running in DRY MODE

  No write actions to the Google API will be executed.
  All write operations will be logged with [DRY-MODE] prefix.
  Mock contacts will be tracked for duplicate detection.

  To disable dry-mode: Set DRY_MODE=false (or 0, no, n)
  Example: DRY_MODE=false pnpm run start

  Note: Dry-mode applies regardless of environment setting.
  By confirming, you acknowledge you understand the system will NOT make real API writes.

? Proceed in dry mode? (Y/n)
```

### Log Messages

During execution, dry-mode operations are clearly marked:

```
[DRY MODE] [API Counter] Read: 1, Write: 0
Fetching Google Contacts: ✓ 1,234 contacts fetched

Processing: Person 001/100 🏢 TechCorp
[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith (john@example.com) - Label: TechCorp

Processing: Person 002/100 🏢 StartupInc  
[DRY-MODE] Calling API service.people.updateContact() - people/c123: Updated fields [Urls]

...

LinkedIn Sync Summary
=============================================
LinkedIn Connections from CSV:        100
New:           050 | Processed: 100 | Updated: 030
Warning:       000 | UpToDate:  020
Skipped:       000 | Error:     000
=============================================
Google Contacts Before:             1,234
Google Contacts After:              1,234  ← No change (dry-mode)
=============================================
```

### Success Messages

Operations in dry-mode include "[DRY MODE]" prefix:

```
[DRY MODE] Contact created successfully
[DRY MODE] Contact updated successfully
```

---

## Implementation Checklist

### Phase 1: Foundation (Core Implementation)

- [ ] **Task 1.1**: Add `readonly dryMode` field to Settings interface
  - File: [`src/settings/settings.ts`](../src/settings/settings.ts)
  - Make field readonly
  - Set default value to `true`
  - Create helper function `parseDryMode()` that accepts: `false`, `0`, `no`, `n` (case-insensitive) to disable
  - Remove `as const` from settings object
  - Add comment: "bypasses environment setting"
  
- [ ] **Task 1.2**: Create DryModeChecker utility
  - File: `src/utils/dryModeChecker.ts` (NEW)
  - Implement `isEnabled()` method
  - Implement `logApiCall()` method with `[DRY-MODE]` prefix logged at **info level**
  - Add null checks for logger parameter - fallback to console.log if logger is undefined or doesn't have info method
  - Logger parameter should be optional

- [ ] **Task 1.3**: Create DryModeMocks utility
  - File: `src/utils/dryModeMocks.ts` (NEW)
  - Implement `createContactResponse()` - **complete** mock with all fields (including empty arrays) for ContactEditor
  - Implement `createGroupResponse()` - returns string resourceName only
  - Use `.slice()` instead of `.substr()`
  - Add unique counter to prevent ID collisions
  - Make mock responses as complete as possible to prevent downstream issues
  
- [ ] **Task 1.4**: Update ApiTracker
  - File: [`src/services/api/apiTracker.ts`](../src/services/api/apiTracker.ts)
  - Update `logStats()` to prefix with "[DRY MODE] " when `SETTINGS.dryMode` is true

- [ ] **Task 1.5**: Create unit tests for utilities
  - File: `src/utils/__tests__/dryModeChecker.test.ts` (NEW)
  - File: `src/utils/__tests__/dryModeMocks.test.ts` (NEW)
  - Test all methods and edge cases
  - Remove { noPHI: true } from test assertions

### Phase 2: Service Layer Updates

- [ ] **Task 2.1**: Update ContactEditor
  - File: [`src/services/contacts/contactEditor.ts`](../src/services/contacts/contactEditor.ts)
  - Add dry-mode checks to `createContact()` - log, build mock ContactData, add to duplicate detector ONLY (NOT cache), wrap in try-catch
  - Add dry-mode checks to `updateContact()` - log and return void
  - Add dry-mode checks to `createContactGroup()` - log with `[DRY-MODE]` prefix in group name and return mock resourceName
  - Add dry-mode checks to `addPhoneToExistingContact()` - log and return void
  - Add dry-mode checks to `addEmailToExistingContact()` - log and return void
  - Preserve all delays, cache invalidation, and statistics tracking
  - Add "[DRY MODE]" prefix to success messages
  - Create unit tests: `src/services/contacts/__tests__/contactEditor.dryMode.test.ts`

- [ ] **Task 2.2**: Update LinkedIn ContactSyncer
  - File: [`src/services/linkedin/contactSyncer.ts`](../src/services/linkedin/contactSyncer.ts)
  - Check DI container registration for DuplicateDetector (should already be registered as singleton)
  - Inject DuplicateDetector via constructor
  - Add dry-mode checks to `addContact()` - log, build mock ContactData, add to duplicate detector ONLY (NOT cache), wrap in try-catch, return SyncResult
  - Add dry-mode checks to `updateContact()` - log, invalidate cache, return SyncResult with updateDetails
  - Add dry-mode checks to `ensureGroupExists()` - log with `[DRY-MODE]` prefix in group name and return mock resourceName
  - Preserve all delays and statistics tracking
  - Create unit tests: `src/services/linkedin/__tests__/contactSyncer.dryMode.test.ts`

- [ ] **Task 2.3**: Update HiBob ContactSyncer
  - File: [`src/services/hibob/contactSyncer.ts`](../src/services/hibob/contactSyncer.ts)
  - Check DI container registration for DuplicateDetector (should already be registered as singleton)
  - Inject DuplicateDetector via constructor
  - Add dry-mode checks to `addContact()` - log, build mock ContactData, add to duplicate detector ONLY (NOT cache), wrap in try-catch, return SyncResult
  - Add dry-mode checks to `updateContact()` - log, invalidate cache, return SyncResult
  - Preserve all delays and statistics tracking
  - Create unit tests: `src/services/hibob/__tests__/contactSyncer.dryMode.test.ts`

- [ ] **Task 2.4**: Update ContactSyncer
  - File: [`src/services/contacts/contactSyncer.ts`](../src/services/contacts/contactSyncer.ts)
  - Add dry-mode checks to `updateContact()` - log, invalidate cache, return void
  - Add dry-mode checks to `createContactGroup()` - log with `[DRY-MODE]` prefix in group name and return mock resourceName
  - Add "[DRY MODE]" prefix to success messages
  - Create unit tests: `src/services/contacts/__tests__/contactSyncer.dryMode.test.ts`

- [ ] **Task 2.5**: Update LabelResolver
  - File: [`src/services/labels/labelResolver.ts`](../src/services/labels/labelResolver.ts)
  - Add dry-mode checks to `createLabel()` - log with `[DRY-MODE]` prefix in group name and return mock resourceName
  - Create unit tests: `src/services/labels/__tests__/labelResolver.dryMode.test.ts`

### Phase 3: Main Entry Point & Maintenance Scripts

- [ ] **Task 3.1**: Add dry-mode confirmation prompt with --yes flag support
  - File: [`src/index.ts`](../src/index.ts) or main entry point
  - Parse command line flags for `--yes` or `-y`
  - Display warning with alert emoji
  - Show message about no Google API write actions
  - Show message about mock contacts tracked for duplicate detection
  - Show instruction to disable with multiple options: "Set DRY_MODE=false (or 0, no, n)"
  - Show instruction to skip prompt: "Use --yes or -y flag"
  - Add note that dry-mode bypasses environment setting
  - Add confirmation statement about user understanding
  - Add confirmation prompt "Proceed in dry mode?" (skip if --yes flag present)
  - Exit gracefully if user declines
  
- [ ] **Task 3.2**: Add dry-mode documentation comments to maintenance scripts
  - File: [`src/scripts/clearCache.ts`](../src/scripts/clearCache.ts)
  - Add comment at top: "// NOTE: This script naturally bypasses dry-mode as it only performs local file operations"
  - File: [`src/scripts/clearLogs.ts`](../src/scripts/clearLogs.ts)
  - Add comment at top: "// NOTE: This script naturally bypasses dry-mode as it only performs local file operations"

### Phase 4: Integration Tests

- [ ] **Task 4.1**: Update eventsJobsSync integration tests
  - File: [`src/scripts/__tests__/eventsJobsSync.test.ts`](../src/scripts/__tests__/eventsJobsSync.test.ts)
  - Add test: Script runs successfully in dry-mode
  - Add test: Logs contain `[DRY-MODE]` prefix
  - Add test: Mock contacts added to duplicate detector's recentlyModifiedContacts
  - Add test: Statistics prefixed with "[DRY MODE]"
  - Add test: Delays execute as expected
  - Add test: Google contact count unchanged
  - Add test: Create contact, then update it in same run (duplicate detection works with mocks)

- [ ] **Task 4.2**: Update smsWhatsappSync integration tests
  - File: [`src/scripts/__tests__/smsWhatsappSync.test.ts`](../src/scripts/__tests__/smsWhatsappSync.test.ts)
  - Same test cases as above

- [ ] **Task 4.3**: Update otherContactsSync integration tests
  - File: [`src/scripts/__tests__/otherContactsSync.test.ts`](../src/scripts/__tests__/otherContactsSync.test.ts)
  - Same test cases as above

- [ ] **Task 4.4**: Create comprehensive LinkedIn sync integration test
  - File: [`src/scripts/__tests__/linkedinSync.dryMode.integration.test.ts`](../src/scripts/__tests__/linkedinSync.dryMode.integration.ts) (NEW)
  - Test complete sync flow in dry-mode
  - Verify mock contacts in duplicate detector's recentlyModifiedContacts
  - Verify duplicate detection works with mocks (create, then try to create again)
  - Verify Google contact count unchanged
  - Verify group creation with [DRY-MODE] prefix
  - Test error handling in duplicate detector tracking (mock failure scenario)

### Phase 5: Testing & Validation

- [ ] **Task 5.1**: Run full unit test suite
  - Command: `pnpm run test`
  - Verify all tests pass
  
- [ ] **Task 5.2**: Run test coverage report
  - Command: `pnpm run test:coverage`
  - Verify coverage for new code meets standards
  
- [ ] **Task 5.3**: Manual testing with dry-mode enabled
  - Test confirmation prompt appears and can be cancelled
  - Test `--yes` flag skips confirmation prompt
  - Test all sync scripts with `dryMode: true`
  - Verify no API writes occur in Google Contacts
  - Verify logs show `[DRY-MODE]` operations at info level
  - Verify "[DRY MODE]" prefix in statistics
  - Verify delays execute (timing unchanged)
  - Verify mock contacts in duplicate detector's recentlyModifiedContacts
  - Verify duplicate detection works with mocks
  - Verify mock groups have `[DRY-MODE]` prefix
  - Test with `linkedin.bypassContactCache: true` - verify dry-mode still works via recentlyModifiedContacts
  
- [ ] **Task 5.4**: Manual testing with dry-mode disabled
  - Test all sync scripts with `DRY_MODE=false`
  - Test with `DRY_MODE=0`
  - Test with `DRY_MODE=no`
  - Verify normal operation
  - Verify API writes occur as expected
  - Verify no dry-mode logs appear
  
- [ ] **Task 5.5**: Verify maintenance scripts
  - Test clear-cache without dry-mode checks
  - Test clear-logs without dry-mode checks
  - Confirm they work identically in both modes

### Phase 6: Documentation & Finalization

- [ ] **Task 6.1**: Update README.md
  - Add dry-mode section
  - Document default behavior (enabled by default - this is an **opt-out** flag)
  - Document how to disable: `DRY_MODE=false` (or `0`, `no`, `n`)
  - Document `--yes` flag to skip confirmation prompt
  - Add example log output with `[DRY-MODE]` prefix
  - Note that dry-mode bypasses environment setting
  - Document interaction with `linkedin.bypassContactCache` setting
  
- [ ] **Task 6.2**: Update INSTRUCTIONS.md
  - Add dry-mode usage instructions
  - Explain when to use dry-mode vs live mode
  - Document verification that no API writes occur
  - Document mock contact behavior and duplicate detection (via recentlyModifiedContacts)
  - Document `[DRY-MODE]` prefix in group names
  
- [ ] **Task 6.3**: Update CHANGELOG.md
  - Document new feature: Dry-mode
  - List all affected methods
  - Note readonly setting
  - Document environment variable parsing (accepts multiple disable values)
  - Document `--yes` flag for automation
  - Note that DuplicateDetector is now injected into LinkedIn and HiBob syncers
  
- [ ] **Task 6.4**: Add JSDoc comments
  - Add comments to all affected methods mentioning dry-mode behavior
  - Document mock response formats (complete with all fields)
  - Document resourceName patterns (dryMode_ prefix)
  - Document group name patterns ([DRY-MODE] prefix)
  - Document EventsContactEditor inheritance behavior
  - Document logging level (info)
  
- [ ] **Task 6.5**: Review all code changes
  - Ensure no lint errors
  - Ensure consistent patterns across all services
  - Verify all delays preserved
  - Verify cache invalidation behavior (no cache writes for mocks)
  - Verify statistics tracking with "[DRY MODE]" prefix
  - Verify all "[DRY-MODE]" prefixes consistent
  - Verify try-catch around duplicate detector tracking
  - Verify logger null checks in DryModeChecker
  - Verify unique ID generation in DryModeMocks

---

## Success Criteria

The implementation is complete when:

1. ✅ Settings has `readonly dryMode` field defaulting to `true`
2. ✅ Environment variable parsing accepts `false`, `0`, `no`, `n` (case-insensitive) to disable dry-mode (opt-out flag)
3. ✅ All write operations log with `[DRY-MODE]` prefix at **info level** in dry-mode
4. ✅ No Google API writes occur when dry-mode is enabled (verified by manual testing)
5. ✅ Mock responses are **complete** with all fields (including empty arrays) to prevent downstream issues
6. ✅ Mock contacts are added ONLY to DuplicateDetector's `recentlyModifiedContacts` (NOT to cache)
7. ✅ All delays execute identically in dry-mode and live mode
8. ✅ Duplicate detector tracking wrapped in try-catch to not fail operations
9. ✅ Statistics tracking prefixed with "[DRY MODE]" when in dry-mode
10. ✅ Confirmation prompt appears and works correctly at startup
11. ✅ `--yes` or `-y` flag bypasses confirmation prompt for automation
12. ✅ All unit tests pass with 100% coverage for new code
13. ✅ Integration tests verify mock contacts in recentlyModifiedContacts and duplicate detection
14. ✅ Integration tests include create-then-update scenarios
15. ✅ EventsContactEditor automatically inherits dry-mode behavior
16. ✅ LinkedIn and HiBob ContactSyncers integrate with DuplicateDetector (verified in DI container)
17. ✅ Maintenance scripts have documentation comments about dry-mode bypass
18. ✅ Documentation is updated with examples and usage
19. ✅ Manual testing confirms expected behavior in both modes
20. ✅ Success messages include "[DRY MODE]" prefix when appropriate
21. ✅ Dry-mode bypasses environment setting (applies to all environments)
22. ✅ Mock contact groups have `[DRY-MODE]` prefix in name
23. ✅ DryModeChecker has null checks for logger parameter
24. ✅ DryModeMocks uses unique counter for ID generation
25. ✅ Interaction with `linkedin.bypassContactCache` setting is documented
26. ✅ Logging level is info (not debug or error)

---

## Questions & Decisions

### Q1: Should dry-mode affect cache writes?
**Decision:** No for both invalidation and adding. Cache invalidation happens identically in both modes. Mock contacts are added ONLY to DuplicateDetector's `recentlyModifiedContacts` array, NOT to cache. This simplifies the implementation and avoids cache invalidation conflicts.

### Q2: Should dry-mode affect log writes?
**Decision:** No. Logs are essential for debugging and audit trails. Dry-mode logging is critical for understanding what would have been executed. All dry-mode operations log at **info level** with `[DRY-MODE]` prefix.

### Q3: Should dry-mode affect note file writes?
**Decision:** No. Notes are local files, not synced to Google, so they're outside dry-mode scope.

### Q4: Should maintenance scripts respect dry-mode?
**Decision:** No. Clear-cache and clear-logs don't call any of the affected write methods, so they naturally bypass dry-mode without needing explicit checks. Each maintenance script file contains an explicit comment documenting this behavior for future maintainers.

### Q5: What should the default value be?
**Decision:** `true` (read-only). Safety first - require explicit opt-in for writes via environment variable. This is an **opt-out** flag.

### Q6: Should the setting be mutable at runtime?
**Decision:** No. Mark as `readonly` to prevent accidental mutation. This is a READ-ONLY parameter that must be set at initialization.

### Q7: Should we have different logging for dry-mode operations?
**Decision:** Yes. Use `[DRY-MODE]` prefix to clearly distinguish simulated API calls from actual operations. This makes logs searchable and unambiguous. Log at **info level**, not debug.

### Q8: Should mock responses be identical to API responses?
**Decision:** Yes, make them as complete as possible. Include all fields even if empty to prevent downstream code from breaking on missing fields. Use a counter to prevent ID collisions.

### Q9: Should dry-mode change timing or delays?
**Decision:** No. All delays execute identically to preserve realistic testing conditions and script timing behavior.

### Q10: Should ApiTracker behavior change in dry-mode?
**Decision:** Yes. Prefix statistics with "[DRY MODE]" to distinguish from live operations. Track write operations identically but make it clear these are simulated.

### Q11: Should success messages change in dry-mode?
**Decision:** Yes. Add "[DRY MODE]" prefix to make it clear operations were simulated, not executed.

### Q12: What environment variable values disable dry-mode?
**Decision:** Accept `false`, `0`, `no`, `n` (case-insensitive). Any other value enables dry-mode for safety. Document clearly that this is an opt-out flag.

### Q13: Should dry-mode respect the environment setting?
**Decision:** No. Dry-mode bypasses the `environment: 'test' | 'production'` setting - it applies regardless of environment for maximum safety.

### Q14: Should LinkedIn/HiBob syncers track mock contacts?
**Decision:** Yes. Add DuplicateDetector integration to these syncers so mock contacts are tracked in `recentlyModifiedContacts` for duplicate detection across all sync types. Wrap in try-catch to not fail operations on tracking failures.

### Q15: How should EventsContactEditor handle dry-mode?
**Decision:** Automatic inheritance. Since it extends ContactEditor, it automatically gets dry-mode behavior from parent methods. No explicit changes needed.

### Q16: Should we use ApiCallGuard Proxy pattern?
**Decision:** No. Use direct checks at the start of each write method instead. This is simpler, more maintainable, and doesn't interfere with retry logic.

### Q17: How to prevent automation breakage?
**Decision:** Add `--yes` or `-y` flag support to skip the confirmation prompt. Check for these flags in command line arguments before showing the prompt.

### Q18: How to distinguish mock groups from real groups?
**Decision:** Prefix mock contact group names with `[DRY-MODE]` to make them easily identifiable and prevent confusion with real groups.

### Q19: How to handle duplicate detector tracking failures?
**Decision:** Wrap all `addRecentlyModifiedContact()` calls in try-catch blocks. Log failures at debug level but don't fail the operation. The operation succeeding is more important than tracking succeeding.

### Q20: How does dry-mode interact with bypassContactCache?
**Decision:** Dry-mode works independently of cache settings. Even if `linkedin.bypassContactCache` is true, mock contacts are still tracked in `recentlyModifiedContacts` which is always available. Document this interaction in README.

---

## References

### Implementation Files
- [Settings Configuration](../src/settings/settings.ts) - Readonly dryMode setting with flexible environment variable parsing
- [DryModeChecker Utility](../src/utils/dryModeChecker.ts) - Status checks and logging
- [DryModeMocks Utility](../src/utils/dryModeMocks.ts) - Minimal mock response generation
- [ApiTracker](../src/services/api/apiTracker.ts) - Statistics tracking with dry-mode prefix

### Service Files
- [Contact Editor Service](../src/services/contacts/contactEditor.ts) - createContact, updateContact, createContactGroup, addPhone, addEmail
- [Events Contact Editor Service](../src/services/contacts/eventsContactEditor.ts) - Inherits dry-mode behavior from ContactEditor
- [LinkedIn Contact Syncer](../src/services/linkedin/contactSyncer.ts) - addContact, updateContact, ensureGroupExists (with duplicate detector integration)
- [HiBob Contact Syncer](../src/services/hibob/contactSyncer.ts) - addContact, updateContact (with duplicate detector integration)
- [Contact Syncer](../src/services/contacts/contactSyncer.ts) - updateContact, createContactGroup
- [Label Resolver](../src/services/labels/labelResolver.ts) - createLabel
- [DuplicateDetector](../src/services/contacts/duplicateDetector.ts) - Tracks mock contacts in recentlyModifiedContacts array
- [DI Container](../src/di/container.ts) - Registers DuplicateDetector as singleton for injection

### External Resources
- [Google People API Documentation](https://developers.google.com/people) - API reference for contact and contact group operations

---

**End of Document**
