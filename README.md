# Events and People Syncer

A comprehensive Node.js TypeScript application for managing Google Contacts through automated synchronization scripts and interactive workflows. Built with enterprise-grade architecture and designed for reliability, testability, and maintainability.

Built in March 2026. This application provides a robust infrastructure for contact management, supporting multiple data sources including LinkedIn connections, HiBob employee records, SMS/WhatsApp history, and custom event tracking.

## Features

### Core Capabilities

- **Multi-Source Contact Syncing**: LinkedIn, HiBob, SMS/WhatsApp, calendar events
- **Dual-Mode Architecture**: Interactive wizards + Programmatic batch operations
- **Intelligent Duplicate Detection**: Fuzzy matching with Unicode normalization
- **Company Organization**: Automatic contact grouping by company labels
- **Alert File System**: Persistent tracking of problematic contacts across runs

### Technical Excellence

- **Dependency Injection**: Clean, testable service architecture with InversifyJS
- **Structured Logging**: JSON logging with log levels and PHI safety
- **Error Handling**: Unique error codes for easy troubleshooting
- **Type Safety**: Full TypeScript with strict type checking and Zod validation
- **Comprehensive Testing**: Unit and integration tests with Vitest
- **Dry-Mode**: Safe testing without making real Google API writes

### Developer Experience

- **Environment Management**: Separate test and production configurations
- **Health Monitoring**: Built-in health check system
- **Domain-Driven Design**: Organized by purpose, not generality
- **ESC Navigation**: Cancel operations gracefully at any prompt
- **CLI UI**: Rich terminal interface with spinners, progress bars, and emojis

## Getting Started

### Prerequisites

- Node.js 18 or higher
- pnpm package manager (recommended) or npm
- Google Cloud Platform account
- Google People API enabled in your GCP project

### Installation

1. Clone the repository:

```bash
git clone https://github.com/orassayag/events-and-people-syncer.git
cd events-and-people-syncer/code
```

2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm build
```

## Configuration

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google People API
4. Create OAuth 2.0 credentials (Desktop application)
5. Download the credentials

### 2. Environment Configuration

Copy `.env.example` to `.env.test`:

```bash
cp .env.example .env.test
```

Fill in your Google OAuth credentials in `.env.test`:

```env
CLIENT_ID=your-oauth-client-id
CLIENT_SECRET=your-oauth-client-secret
PROJECT_ID=your-project-id
AUTH_URI=https://accounts.google.com/o/oauth2/auth
TOKEN_URI=https://oauth2.googleapis.com/token
AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
REDIRECT_PORT=3000

# LinkedIn Sync Settings (Optional)
# Limit number of connections to process for testing
# Set to 0 or omit to process all connections
TEST_CONNECTION_LIMIT=50

# Dry-Mode Setting (Optional)
# Dry-mode enables safe testing without making real Google API writes
# Default: true (enabled for safety)
# Set to false, 0, no, or n to disable and allow real API writes
DRY_MODE=true
```

### 3. First Run - Authentication

Run any script for the first time:

```bash
pnpm start
```

A browser window will open for OAuth authentication. Grant the required permissions. The access token will be saved to `token.json`.

## Dry-Mode (Safe by Default)

The system includes a **dry-mode** feature that is **enabled by default** to prevent accidental changes to your Google Contacts. This provides a safe environment for testing and validation.

### What is Dry-Mode?

When dry-mode is enabled:

- **No write operations** are sent to the Google People API
- All write operations are **logged** with `[DRY-MODE]` prefix
- Mock contacts are **tracked** for duplicate detection
- API **statistics** are prefixed with `[DRY MODE]`
- Write **delays** execute as normal (timing unchanged)
- **Cache invalidation** occurs as normal
- File system operations (logs, cache, notes) work normally

### Enabling/Disabling Dry-Mode

Dry-mode is **enabled by default**. To disable it and allow real Google API writes:

```bash
# Disable dry-mode (allow writes)
DRY_MODE=false pnpm start

# Alternative disable values
DRY_MODE=0 pnpm start
DRY_MODE=no pnpm start
DRY_MODE=n pnpm start

# Enable dry-mode (default - no writes)
pnpm start
# or explicitly:
DRY_MODE=true pnpm start
```

### Skipping the Confirmation Prompt

By default, when running in dry-mode, you'll see a confirmation prompt. To skip this prompt (useful for automation):

```bash
# Skip prompt with --yes flag
pnpm start --yes

# Or with -y flag
pnpm start -y
```

### Example Dry-Mode Output

When running in dry-mode, you'll see clear indicators:

```
⚠️  You are running in DRY MODE

  No write actions to the Google API will be executed.
  All write operations will be logged with [DRY-MODE] prefix.
  Mock contacts will be tracked for duplicate detection.

  To disable dry-mode: Set DRY_MODE=false (or 0, no, n)
  Example: DRY_MODE=false pnpm run start

? Proceed in dry mode? (Y/n)

[DRY MODE] [API Counter] Read: 150, Write: 25
[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith (john@example.com) - Label: TechCorp
[DRY MODE] Contact created successfully
-Resource Name: people/dryMode_1234567890_1_abc123 (mock)
```

### Important Notes

- Dry-mode **bypasses** the `environment` setting (applies in both test and production)
- Read operations from Google API **are allowed** (needed for duplicate detection)
- Maintenance scripts (clear-cache, clear-logs) **always work** regardless of dry-mode
- Mock contacts use resource names with prefix: `people/dryMode_`
- Mock contact groups use prefix: `[DRY-MODE]` in the group name
- Dry-mode works independently of `linkedin.bypassContactCache` setting
- Mock contacts are tracked via `recentlyModifiedContacts` (not cache), so duplicate detection works even when cache is bypassed

## Usage

### Interactive Menu (Recommended)

Start the interactive CLI menu to select and run scripts:

```bash
pnpm start
```

This will display:

```
=== Events & People Syncer ===

Select a script to run:
  ❯ 📧 LinkedIn Sync - Syncs LinkedIn connections from exported CSV to Google Contacts
    🚪 Exit
```

### Direct Script Execution

You can also run scripts directly:

```bash
pnpm script <script-name>
```

### List Available Scripts

```bash
pnpm script:list
```

### Health Check

```bash
pnpm health
```

## Available Scripts

### LinkedIn Sync

Syncs LinkedIn connections from exported CSV files to Google Contacts. The script matches connections with existing contacts using intelligent fuzzy matching to avoid duplicates and automatically organizes contacts into company-based groups.

**Features:**

- Exports LinkedIn connections from CSV in ZIP archives
- Intelligent duplicate detection with name and email matching
- Automatic company folder organization
- Job title synchronization
- LinkedIn URL management
- Alert file system for problematic contacts

**Usage:**

```bash
# Dry-mode (safe, no real writes)
pnpm linkedin-sync

# Live mode (makes real changes)
pnpm linkedin-sync:live

# Without cache (fresh data)
pnpm linkedin-sync:no-cache
```

### HiBob Sync

Syncs HiBob employee contacts from text files to Google Contacts. Designed for organizational contact management with automated data extraction and validation.

**Features:**

- Parses HiBob employee data from text files
- Validates contact information
- Duplicate detection
- Company label assignment
- Alert tracking for failed imports

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "HiBob Sync" from the menu
```

### Contacts Sync

Interactive wizard for manually syncing and completing Google contacts data. Provides a guided workflow for adding and updating individual contacts with full validation.

**Features:**

- Add new contacts with guided prompts
- Sync existing contacts with missing data
- Edit contact information interactively
- Label management
- Field validation with helpful error messages

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "Contacts Sync" from the menu
```

### Events & Jobs Sync

Create and manage notes for job interviews and life events. Integrates with local file system to organize interview notes and track life events alongside Google Contacts.

**Features:**

- Create notes for job interviews and life events
- Folder-based organization (Job_CompanyName, HR_CompanyName, etc.)
- Automatic contact creation from notes
- Label management for categorization
- Batch note creation support
- Clipboard integration for fast note entry

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "Events & Jobs Sync" from the menu
```

### Other Contacts Sync

Syncs contacts from "Other Contacts" folder to the main contacts list. Useful for consolidating contacts that were automatically created by Gmail or other Google services.

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "Other Contacts Sync" from the menu
```

### SMS/WhatsApp Sync

Imports contacts from SMS and WhatsApp chat histories. Extracts phone numbers and contact information from exported chat logs.

**Features:**

- Parse WhatsApp Web HTML exports
- Parse Google Messages HTML exports
- Phone number normalization
- HTML sanitization for safety
- Duplicate detection by phone number

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "SMS/WhatsApp Sync" from the menu
```

### Statistics

Displays comprehensive statistics about your Google Contacts, including contact counts, label distribution, and sync history.

**Usage:**

```bash
# Via interactive menu
pnpm start
# Select "Statistics" from the menu
```

### Maintenance Scripts

**Clear Cache:**

```bash
# Via interactive menu or directly
pnpm start
# Select "Clear Cache"
```

**Clear Logs:**

```bash
# Via interactive menu or directly
pnpm start
# Select "Clear Logs"
```

## Alert File System

Both LinkedIn Sync and HiBob Sync use a persistent alert file system to track contacts that encounter issues during sync operations (warnings, errors, or skipped contacts).

### Overview

- **Purpose**: Prevents reprocessing of problematic contacts across multiple sync runs
- **File Locations**:
  - LinkedIn: `logs/linkedin-sync_ALERTS.log`
  - HiBob: `logs/hibob-sync_ALERTS.log`
- **Persistence**: Alert files persist indefinitely until manually deleted
- **Threshold Warning**: A warning is displayed when alert count exceeds 200 entries

### How It Works

1. **First Run**: Script processes all contacts and logs any issues to the alert file
2. **Subsequent Runs**: Contacts in the alert file are automatically skipped (not reprocessed)
3. **Observability**: The `previouslyAlerted` counter shows how many contacts were skipped due to existing alerts

### Alert Types

- **⚠️ Warnings**: Uncertain matches or multiple potential matches found
- **⏭️ Skipped**: Missing required data (email, name, etc.)
- **❌ Errors**: API failures, validation errors, or unexpected issues

**Important**: Contacts with any alert type are NOT added or updated in Google Contacts until the alert is resolved.

### Pre-Run Menu

Before each sync, you can:

- **👤 Process the contacts**: Continue with the sync operation
- **⁉️ View Warnings / Skipped / Errors**: Browse all historical alerts with pagination (10 per page)
- **🗑️ Delete Alert File**: Remove the entire alert file to retry all contacts
- **✏️ Remove Specific Alert**: Remove individual alerts by index to retry specific contacts
- **🚪 Exit**: Exit without syncing

### Managing Alerts

#### View Alert Files

```bash
# View LinkedIn alerts
cat logs/linkedin-sync_ALERTS.log

# View HiBob alerts
cat logs/hibob-sync_ALERTS.log
```

#### Clear All Alerts

To retry all previously failed contacts:

```bash
# LinkedIn
rm logs/linkedin-sync_ALERTS.log

# HiBob
rm logs/hibob-sync_ALERTS.log
```

Or use the "Delete Alert File" option in the pre-run menu.

#### Remove Specific Alerts

Use the "Remove Specific Alert" option in the pre-run menu to remove individual alerts by index, or manually edit the alert file:

1. Open the alert file in a text editor
2. Find the entry (search by name/email)
3. Delete the entire entry block (from `=== Alert Entry ===` to `=== End Entry ===`)
4. Save the file
5. Next run will reprocess that contact

### Alert File Format

Each alert entry contains:

- **Index**: Global sequential number for removal
- **Timestamp**: When the alert was created
- **Contact Info**: Name, email, company (LinkedIn), LinkedIn URL (LinkedIn)
- **Reason**: Description of why the contact was alerted

Example:

```
[WARNING] === Alert Entry ===
[WARNING] Index: 1
[WARNING] Timestamp: 2026-03-22T10:30:15.123Z
[WARNING] Contact:
[WARNING]   -FirstName: John
[WARNING]   -LastName: Doe
[WARNING]   -Email: john.doe@example.com
[WARNING]   -LinkedIn URL: https://linkedin.com/in/johndoe
[WARNING]   -Company: Acme Corp
[WARNING] Reason: Multiple matches or uncertain match
[WARNING] === End Entry ===
```

### Best Practices

1. **Monitor Alert Growth**: Review alerts periodically (monthly/quarterly)
2. **Address Root Causes**: Fix data quality issues at the source when possible
3. **Archive Old Alerts**: After resolving issues, archive old alert files:
   ```bash
   mv logs/linkedin-sync_ALERTS.log logs/archive/linkedin-sync_ALERTS_2026-03.log.bak
   ```
4. **Threshold Management**: When alerts exceed 200, consider reviewing and clearing old ones

### Contact Matching Logic

The alert system uses robust matching to identify duplicate contacts:

- **Email**: Must contain `@`, case-insensitive, trimmed
- **Names**: Unicode NFC normalization, case-insensitive, extra spaces removed
- **URLs**: Protocol and www removed, trailing slashes handled
- **Priority**: Email match > Name+URL match > Name-only match

This ensures contacts are accurately identified across runs even with slight variations in formatting.

## Development

### Code Quality

**Format code:**

```bash
pnpm format
pnpm format:check  # Check without modifying
```

**Lint code:**

```bash
pnpm lint
```

### Testing

**Run all tests:**

```bash
pnpm test
```

**Watch mode (during development):**

```bash
pnpm test:watch
```

**Coverage report:**

```bash
pnpm test:coverage
```

### Building

**Compile TypeScript:**

```bash
pnpm build
```

**Development mode with auto-reload:**

```bash
pnpm dev
```

### Architecture Principles

This project follows clean architecture principles:

1. **Dependency Injection**: All services use `@injectable` decorators and are managed by InversifyJS
2. **Error Handling**: Every error includes a unique error code (see `misc/error_index.txt`)
3. **Structured Logging**: Use `Logger` class instead of `console.log` for all output
4. **Type Safety**: Strict TypeScript with comprehensive type definitions
5. **Domain Organization**: Code organized by domain (contacts, linkedin, auth, etc.), not by generic categories
6. **Validation**: Zod schemas for runtime validation of external data
7. **Testability**: Pure functions and dependency injection enable easy unit testing

## Architecture

This project follows a clean, domain-driven architecture with dependency injection:

### Directory Structure

```
src/
├── settings/           # Configuration management
│   └── settings.ts     # Centralized settings with environment support
├── types/              # Domain-specific TypeScript types
│   ├── contact.ts      # Contact-related types
│   ├── linkedin.ts     # LinkedIn sync types
│   ├── hibob.ts        # HiBob sync types
│   ├── alert.ts        # Alert system types
│   ├── script.ts       # Script metadata types
│   └── ...             # Other domain types
├── entities/           # Zod validation schemas
│   ├── linkedinConnection.schema.ts
│   └── smsWhatsappSync.schema.ts
├── constants/          # Application constants
│   ├── emojis.ts       # Emoji dictionary for UI
│   ├── formatUtils.ts  # Formatting utilities
│   └── uiConstants.ts  # UI text constants
├── errors/             # Error handling with unique codes
│   └── (future error classes)
├── logging/            # Structured logging system
│   ├── logger.ts       # Base logger with PHI safety
│   ├── syncLogger.ts   # File-based sync logs
│   └── alertLogger.ts  # Alert file management
├── di/                 # Dependency injection configuration
│   └── container.ts    # InversifyJS container setup
├── monitoring/         # Health checks and monitoring
│   └── (future health check services)
├── services/           # Business logic organized by domain
│   ├── contacts/       # Contact management
│   │   ├── contactSyncer.ts       # Core sync logic
│   │   ├── contactEditor.ts       # Interactive editing
│   │   ├── duplicateDetector.ts   # Fuzzy matching
│   │   ├── phoneNormalizer.ts     # Phone validation
│   │   └── emailNormalizer.ts     # Email validation
│   ├── linkedin/       # LinkedIn integration
│   │   ├── linkedinExtractor.ts   # CSV/ZIP parsing
│   │   ├── companyMatcher.ts      # Company folder matching
│   │   ├── connectionMatcher.ts   # Duplicate detection
│   │   └── contactSyncer.ts       # LinkedIn-specific sync
│   ├── hibob/          # HiBob integration
│   │   ├── hibobExtractor.ts      # Text file parsing
│   │   └── contactSyncer.ts       # HiBob-specific sync
│   ├── auth/           # Google OAuth authentication
│   │   ├── authService.ts         # OAuth flow management
│   │   └── initAuth.ts            # Authentication initialization
│   ├── api/            # Google People API utilities
│   │   └── apiTracker.ts          # Rate limit tracking
│   ├── labels/         # Label/group management
│   │   └── labelResolver.ts       # Label creation & resolution
│   ├── messaging/      # SMS/WhatsApp parsing
│   │   ├── phoneExtractor.ts
│   │   ├── whatsappWebExtractor.ts
│   │   ├── googleMessagesExtractor.ts
│   │   ├── htmlSanitizer.ts
│   │   └── htmlSourceDetector.ts
│   ├── folders/        # File system management
│   │   ├── folderManager.ts
│   │   └── folderMatcher.ts
│   ├── notes/          # Note file management
│   │   └── noteWriter.ts
│   ├── otherContacts/  # Other Contacts sync
│   │   └── otherContactsFetcher.ts
│   └── statistics/     # Analytics and reporting
│       └── statisticsCollector.ts
├── validators/         # Input validation
│   ├── pathValidator.ts
│   └── inputValidator.ts
├── cache/              # Caching mechanisms
│   ├── contactCache.ts     # Contact data caching
│   ├── folderCache.ts      # Folder structure caching
│   └── otherContactsCache.ts
├── parsers/            # Data parsing utilities
│   └── (LinkedIn, HiBob parsers)
├── managers/           # Resource lifecycle management
│   └── (Resource managers)
├── flow/               # CLI UI components
│   └── syncStatusBar.ts    # Progress indicators
├── regex/              # Pattern definitions
│   └── patterns.ts         # Regex constants
├── utils/              # Cross-cutting utilities
│   ├── promptWithEnquirer.ts   # ESC-aware prompts
│   ├── dateFormatter.ts        # Date utilities
│   ├── hebrewFormatter.ts      # Bidirectional text
│   ├── companyFormatter.ts     # Company name formatting
│   ├── clipboardReader.ts      # Clipboard integration
│   ├── dryModeChecker.ts       # Dry-mode utilities
│   ├── dryModeMocks.ts         # Mock data generation
│   └── retryWithBackoff.ts     # API retry logic
├── scripts/            # Executable scripts with metadata
│   ├── index.ts            # Script registry
│   ├── linkedinSync.ts     # LinkedIn sync script
│   ├── hibobSync.ts        # HiBob sync script
│   ├── contactsSync.ts     # Contacts sync script
│   ├── eventsJobsSync.ts   # Events & jobs script
│   ├── otherContactsSync.ts
│   ├── smsWhatsappSync.ts
│   ├── statistics.ts
│   ├── clearCache.ts
│   └── clearLogs.ts
├── runner.ts           # Script execution framework
└── index.ts            # Application entry point
```

### Design Patterns

- **Dependency Injection**: Services are loosely coupled via InversifyJS
- **Repository Pattern**: Cache classes abstract data persistence
- **Strategy Pattern**: Different sync strategies for each data source
- **Factory Pattern**: Dynamic script loading and execution
- **Observer Pattern**: Logger callbacks for event tracking

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:

- Reporting issues
- Submitting pull requests
- Code style standards
- Testing requirements
- Documentation expectations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Error Codes

All errors include unique serial numbers for easy identification and troubleshooting. See `misc/error_index.txt` for the complete error code reference.

## Support

For questions, issues, or contributions:

- **GitHub Issues**: [https://github.com/orassayag/events-and-people-syncer/issues](https://github.com/orassayag/events-and-people-syncer/issues)
- **Email**: orassayag@gmail.com

## Author

**Or Assayag**

- Email: orassayag@gmail.com
- GitHub: [@orassayag](https://github.com/orassayag)
- StackOverflow: [or-assayag](https://stackoverflow.com/users/4442606/or-assayag)
- LinkedIn: [orassayag](https://linkedin.com/in/orassayag)

## Acknowledgments

Built with:

- [Node.js](https://nodejs.org/) - JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [InversifyJS](https://inversify.io/) - Dependency injection
- [Google People API](https://developers.google.com/people) - Contact management
- [Zod](https://zod.dev/) - Schema validation
- [Vitest](https://vitest.dev/) - Testing framework
- [Enquirer](https://www.npmjs.com/package/enquirer) - Interactive prompts

---

**Note**: This application interacts with your personal Google Contacts. Always test with dry-mode enabled before running in live mode. Review the dry-mode logs carefully to understand what changes will be made.
