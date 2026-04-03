# Setup and Usage Instructions

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Environment Management](#environment-management)
4. [Available Commands](#available-commands)
5. [Script Usage Guide](#script-usage-guide)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)
8. [API Usage Tracking](#api-usage-tracking)
9. [Best Practices](#best-practices)

## Prerequisites

### System Requirements

- **Node.js**: Version 18 or higher
- **Package Manager**: pnpm (recommended) or npm
- **Operating System**: macOS, Linux, or Windows with WSL
- **Memory**: 2GB RAM minimum
- **Disk Space**: 500MB for application and dependencies

### Google Cloud Platform Requirements

- Active Google Cloud Platform account
- Project with Google People API enabled
- OAuth 2.0 credentials (Desktop application type)
- Appropriate API quotas for your usage

### Knowledge Prerequisites

- Basic understanding of command line/terminal
- Familiarity with Google Contacts
- Understanding of OAuth 2.0 authentication flow (helpful but not required)

## Initial Setup

### 1. Install Dependencies

**Using pnpm (recommended):**

```bash
pnpm install
```

**Using npm:**

```bash
npm install
```

**Verify installation:**

```bash
pnpm build
```

### 2. Google Cloud Console Setup

#### Step-by-Step Google Cloud Setup

1. **Create or Select Project**
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/).
   - Click "Select a project" → "New Project".
   - Enter project name (e.g., "contact-manager-49221").
   - Click "Create".
   - Wait a few seconds until it finish to create.
   - You will see a notification: "Create Project: contact-manager-492213".
   - Once finished, click again on "Select a project", and select the new project "contact-manager-492213".

2. **Enable Google People API**
   - In the left sidebar, go to "APIs & Services" → "Library".
   - Search for "Google People API".
   - Click on "Google People API".
   - Click "Enable".

3. **Create OAuth 2.0 Credentials**
   - Once clicked on the "Enable" you will be redirect to: https://console.cloud.google.com/apis/api/people.googleapis.com/metrics?project=contact-manager-492213
   - If not - Go to "APIs & Services" → "Credentials".
   - On "Credentials Type" section, from the "Select an API" dropdown, select "People API".
   - Check the "User data" radio button.
   - Click on the "Next" button.
   - On the "OAuth Consent Screen" section:
     - App name: Your application name ('people-syncer').
     - User support email: Your email (You can select it from the dropdown).
     - App Logo - Ignore it.
     - Developer contact information - Your email (You need to write it here).
   - Once done to fill, click on "Save and continue" button.
   - On the "Scopes (optional)" section, click on "Save and continue" button.
   - On the "OAuth Client ID" section, select from the "Application type" dropdown, "Web application".
     - On the new textbox "Name" - Enter the name of the application (e.g., "people-syncer").
     - On the "Authorized JavaScript origins" - Ignore it.
     - On the "Authorized redirect URIs":
       - Click on "Add URI".
       - Enter "http://localhost".
       - Click on "Add URI".
       - Enter "http://localhost:3000".
   - Once done to fill, click on "Create" button.

4. **Download Credentials**
   - Once done to load, you will reach the "Your Credentials" section.
   - Copy the "Client ID" value from the textbox.
   - Paste it on the .env.test file on the CLIENT_ID field.
   - Click the download icon next to your newly created OAuth 2.0 Client ID.
   - Put is somewhere in reach.
   - Open the downloaded json file and:
     - Copy the "project_id" value and paste it on the .env.test file on the PROJECT_ID field.
     - Copy the "client_secret" value and paste it on the .env.test file on the CLIENT_SECRET field.
   - The rest of the fields, you can leave as it is.
   - Once done, click on the "Done" button.

5. **Test Users**
   - If you are using a personal Google account, you need to add it as a test user.
   - Click on the "OAuth consent screen" tab.
   - Click on the "Audience" tab.
   - Scoll donw to "Test users" title.
   - Click on "+ Add users" button.
   - Enter your email address and click on the "Save" button.

#### Understanding the Credentials File

The downloaded JSON file will contain:

```json
{
  "installed": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "your-client-secret",
    "redirect_uris": ["http://localhost"]
  }
}
```

### 3. Environment Configuration

#### Create Environment File

Copy the example environment file:

```bash
cp .env.example .env.test
```

#### Configure Credentials

Edit `.env.test` and add your credentials from the downloaded JSON file:

```env
# Required: Google OAuth Credentials
CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
CLIENT_SECRET=your-oauth-client-secret
PROJECT_ID=your-project-id

# Standard OAuth URLs (usually don't need to change)
AUTH_URI=https://accounts.google.com/o/oauth2/auth
TOKEN_URI=https://oauth2.googleapis.com/token
AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs

# OAuth Redirect Port (change if 3000 is already in use)
REDIRECT_PORT=3000

# Optional: LinkedIn Sync Settings
# Limit the number of connections to process (useful for testing)
# Set to 0 or omit to process all connections
TEST_CONNECTION_LIMIT=50

# Optional: Dry-Mode Setting
# Prevents real writes to Google API (recommended for initial testing)
# Default: true (enabled for safety)
# Set to false, 0, no, or n to disable and allow real API writes
DRY_MODE=true
```

#### Production Environment (Optional)

For production use, create `.env.production`:

```bash
cp .env.test .env.production
```

Then edit `.env.production` with production-specific settings. Use production environment by setting:

```bash
NODE_ENV=production pnpm start
```

### 4. First Run - Authentication

#### Initial Authentication Flow

Run the application for the first time:

```bash
pnpm start
```

**What happens during authentication:**

1. The application starts and displays the main menu
2. When you select a script requiring authentication, a browser window opens automatically
3. You'll see the Google OAuth consent screen
4. Review the permissions requested (read and write access to Google Contacts)
5. Click "Allow" to grant permissions
6. The browser will redirect to a success page
7. Return to the terminal - authentication is complete
8. A `token.json` file is created in the project root (stores your access token)

#### First-Time Recommendations

1. **Start with Dry-Mode**: Keep `DRY_MODE=true` for your first few runs (the default, you don't need to add anything if you don't see it on the env file).
2. **Test Authentication**: Run `pnpm health` to verify your setup
3. **Review Logs**: Check `logs/` directory to understand script behavior
4. **Read Alert Documentation**: Familiarize yourself with the alert file system

#### Token Security

- **Never commit `token.json` to version control** (already in `.gitignore`)
- Store `token.json` securely - it provides access to your Google Contacts
- If compromised, revoke access in [Google Account Security](https://myaccount.google.com/security)
- Tokens expire periodically and are automatically refreshed

## Available Commands

### Development Commands

**Linting and Formatting:**

```bash
# Check code style and quality
pnpm lint

# Format all TypeScript files
pnpm format

# Check formatting without modifying files
pnpm format:check
```

**Building:**

```bash
# Compile TypeScript to JavaScript
pnpm build

# Development mode with auto-reload
pnpm dev
```

**Testing:**

```bash
# Run all tests
pnpm test

# Run tests in watch mode (during development)
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Running Scripts

**Interactive Menu (Recommended):**

```bash
# Start interactive menu (dry-mode)
pnpm start

# Start interactive menu (live mode)
pnpm start:live

# Start with cache bypass
pnpm start:no-cache
```

**Direct Script Execution:**

```bash
# Run a specific script by name
pnpm script <script-name>

# List all available scripts
pnpm script:list
```

**Built-In Script Shortcuts:**

```bash
# LinkedIn Sync
pnpm linkedin-sync              # Dry-mode
pnpm linkedin-sync:live         # Live mode
pnpm linkedin-sync:no-cache     # Bypass cache

# HiBob Sync (via menu only)
pnpm start

# Contacts Sync
pnpm interactive                # Dry-mode
pnpm interactive:live           # Live mode
```

**Utility Commands:**

```bash
# Health check (verify setup)
pnpm health
```

### Command-Line Flags

**Dry-Mode Control:**

```bash
# Enable dry-mode (no real API writes)
DRY_MODE=true pnpm start

# Disable dry-mode (allow writes)
DRY_MODE=false pnpm start

# Skip dry-mode confirmation prompt
pnpm start --yes
pnpm start -y
```

**Cache Control:**

```bash
# Bypass contact cache
pnpm linkedin-sync --no-cache

# Or use environment variable
NO_CACHE=true pnpm linkedin-sync
```

**Environment Selection:**

```bash
# Use test environment (default)
NODE_ENV=test pnpm start

# Use production environment
NODE_ENV=production pnpm start
```

## Script Usage Guide

### LinkedIn Sync

#### Purpose

Syncs LinkedIn connections from exported CSV files to Google Contacts with intelligent duplicate detection and company-based organization.

#### Prerequisites

1. Export your LinkedIn connections:
   - Go to LinkedIn Settings → Data Privacy → Get a copy of your data
   - Select "Connections" only
   - Request archive
   - Download the ZIP file when ready
2. Place the ZIP file in the configured sources path (default: `sources/linkedin/`)

#### Running LinkedIn Sync

```bash
# Dry-mode (recommended for first run)
pnpm linkedin-sync

# Live mode (makes real changes)
pnpm linkedin-sync:live

# Without cache (fresh Google Contacts data)
pnpm linkedin-sync:no-cache
```

#### What LinkedIn Sync Does

1. Extracts connection data from CSV in ZIP archive
2. Fetches all Google Contacts for duplicate detection
3. Matches connections against existing contacts using:
   - Email address (exact match)
   - Full name + LinkedIn URL
   - Fuzzy name matching (for typos and variations)
4. For new connections: Creates contact with company label
5. For existing connections: Updates job title, email, LinkedIn URL if changed
6. Logs warnings for uncertain matches to alert file
7. Displays comprehensive statistics

#### Understanding Match Types

- **Exact Match**: Email or name+URL match → Updates existing contact
- **Uncertain Match**: Multiple similar names → Logged as warning, no action
- **No Match**: Creates new contact with company label

### HiBob Sync

#### Purpose

Imports employee contact information from HiBob exports.

#### Prerequisites

1. Export employee data from HiBob to text file
2. Place file in configured path

#### Running HiBob Sync

```bash
pnpm start
# Select "HiBob Sync" from menu
```

### Contacts Sync

#### Purpose

Interactive wizard for manually adding and updating Google Contacts with full validation.

#### Use Cases

- Complete missing information in existing contacts
- Add new contacts with guided prompts
- Fix contact data quality issues
- Bulk update contacts one-by-one

#### Running Contacts Sync

```bash
pnpm interactive         # Dry-mode
pnpm interactive:live    # Live mode
```

#### Workflow

1. Choose "Add contacts" or "Sync contacts"
2. For sync: Script finds contacts with missing data
3. For each contact:
   - Review current data
   - Edit fields as needed
   - Assign labels/groups
   - Confirm changes
4. View summary statistics

### Events & Jobs Sync

#### Purpose

Create notes for job interviews and life events, with automatic contact creation.

#### Prerequisites

1. Configure folder paths in settings:
   - Job interviews folder path
   - Life events folder path

#### Folder Naming Conventions

- **Job/HR folders**: `Job_CompanyName` or `HR_CompanyName` (PascalCase)
- **Life event folders**: `Event Name Label` (e.g., "Wedding Venue", "Birthday Party")

#### Running Events & Jobs Sync

```bash
pnpm start
# Select "Events & Jobs Sync"
```

#### Features

- **Write notes**: Batch create multiple notes in a folder
- **Write a note**: Create single note with contact prompt
- **Rewrite a note**: Edit existing note
- **Delete last note**: Undo last created note
- **Delete empty folders**: Clean up unused folders
- **Rename folder**: Change folder name/company

#### Note Creation Workflow

1. Enter company or event name
2. Script searches for existing folder or prompts to create one
3. For new folders:
   - Select type (Job Interview or Life Event)
   - For jobs: Choose label (Job or HR)
   - For life events: Choose or create label
4. Copy text to clipboard
5. Press Enter in terminal
6. Script reads clipboard and creates note
7. Optionally create contact with pre-filled company/label

### Other Contacts Sync

#### Purpose

Migrates contacts from "Other Contacts" to main contact list.

#### What It Does

- Fetches all contacts in "Other Contacts"
- For each contact: Prompts to add to main contacts with label
- Validates and normalizes contact data
- Removes from "Other Contacts" after successful migration

### SMS/WhatsApp Sync

#### Purpose

Extracts contacts from SMS and WhatsApp chat exports.

#### Supported Formats

- WhatsApp Web HTML exports
- Google Messages HTML exports

#### Running SMS/WhatsApp Sync

```bash
pnpm start
# Select "SMS/WhatsApp Sync"
```

#### What It Does

1. Prompts for HTML file path
2. Detects source (WhatsApp or Google Messages)
3. Extracts phone numbers and names
4. Normalizes phone numbers to international format
5. Creates contacts with appropriate labels
6. Handles duplicate detection by phone number

### Statistics Script

#### Purpose

Display comprehensive analytics about your Google Contacts.

#### Information Provided

- Total contact count
- Contacts by label/group
- Contacts without labels
- Contacts with missing fields
- Recent sync history
- API usage statistics

#### Running Statistics

```bash
pnpm start
# Select "Statistics"
```

### Maintenance Scripts

#### Clear Cache

Removes all cached data (contact cache, folder cache).

**When to use:**

- After manual changes in Google Contacts
- When folder structure changed externally
- To force fresh data fetch

```bash
pnpm start
# Select "Clear Cache"
```

#### Clear Logs

Removes old log files to free up disk space.

**When to use:**

- Periodically to clean up storage
- Before sharing logs (privacy)

```bash
pnpm start
# Select "Clear Logs"
```

## Environment Management

The system includes a **dry-mode** feature that is **enabled by default** to prevent accidental changes to your Google Contacts. This provides a safe environment for testing and validation.

#### What is Dry-Mode?

When dry-mode is enabled (the default):

- **No write operations** are sent to the Google People API
- All write operations are **logged** with `[DRY-MODE]` prefix at info level
- **Mock contacts** are created and tracked in the duplicate detector for validation
- **Mock contact groups** are created with `[DRY-MODE]` prefix in their names
- API **statistics** are prefixed with `[DRY MODE]`
- **Success messages** include `[DRY MODE]` prefix
- All **delays and timing** behavior remains identical to live mode
- **Read operations** (fetching contacts, groups) work normally

#### Enabling/Disabling Dry-Mode

**Default Behavior (Dry-Mode Enabled):**

```bash
pnpm interactive
# or
pnpm script linkedin-sync
```

**Disable Dry-Mode (Enable Live Writes):**

```bash
# Any of these values disable dry-mode (case-insensitive):
DRY_MODE=false pnpm interactive
DRY_MODE=0 pnpm script linkedin-sync
DRY_MODE=no pnpm script hibob-sync
DRY_MODE=n pnpm script contacts-sync
```

**Skip Confirmation Prompt:**

```bash
# Use --yes or -y flag to bypass the dry-mode confirmation prompt
pnpm interactive --yes
pnpm script linkedin-sync -y
```

#### Dry-Mode Behavior Details

**Operations Blocked in Dry-Mode:**

- Creating new contacts
- Updating existing contacts
- Adding phones/emails to contacts
- Creating contact groups/labels

**Operations Allowed in Dry-Mode:**

- Reading Google Contacts
- Reading contact groups
- Writing cache files
- Writing log files
- Writing notes files
- Maintenance operations (clear-cache, clear-logs)

**Mock Contact Tracking:**

- Mock contacts are tracked in `DuplicateDetector.recentlyModifiedContacts` array
- Duplicate detection works with mock contacts during dry-mode runs
- Mock contacts are NOT saved to the contact cache
- Mock resource names use prefix `people/dryMode_` for easy identification

**Example Dry-Mode Log Output:**

```
[DRY-MODE] Calling API service.people.createContact() - Contact: John Smith (john@example.com) - Label: TechCorp
[DRY MODE] [API Counter] Read: 150, Write: 25
[DRY MODE] Contact created successfully
```

#### When to Use Dry-Mode

**Use Dry-Mode (Default) When:**

- Testing new scripts or features
- Validating data before making real changes
- Running in test environments
- Reviewing sync results without side effects
- Training or demonstration purposes

**Disable Dry-Mode (Use Live Mode) When:**

- You've verified the operations in dry-mode
- You're ready to make actual changes to Google Contacts
- Running in production with real data

**Important Notes:**

- Dry-mode applies **regardless of environment setting** (test/production)
- This is an **opt-out** flag - you must explicitly disable it
- Confirmation prompt appears at startup unless `--yes` flag is used
- Always verify dry-mode logs before running in live mode

### Test Environment (Default)

```bash
NODE_ENV=test pnpm script <script-name>
```

Uses `.env.test` configuration file.

### Production Environment

```bash
NODE_ENV=production pnpm script <script-name>
```

Uses `.env.production` configuration file.

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, change `REDIRECT_PORT` in your `.env.test` file.

### Authentication Issues

Delete `token.json` and re-authenticate:

```bash
rm token.json
pnpm interactive
```

### Rate Limits

The Google People API has rate limits:

- 300 read requests per minute
- 60 write requests per minute
- 1,000,000 requests per day

The application will warn you when approaching limits.

### Logs

Application logs are stored in the `logs/` directory. Check `logs/app.log` for detailed information.

## API Usage Tracking

API usage statistics are automatically tracked in `api-stats.json`. Counters reset daily.

## Health Checks

Run the health check to verify system status:

```bash
pnpm health
```

Checks:

- Authentication status
- Google API connectivity
- File system access
- Environment variables

## Adding New Scripts

1. Create a new script file in `src/scripts/`
2. Register it in `src/scripts/index.ts` with metadata
3. Run `pnpm script:list` to verify

Example:

```typescript
// src/scripts/my-script.ts
export async function myScript(): Promise<void> {
  console.log('Hello from my script!');
}

// Register in src/scripts/index.ts
AVAILABLE_SCRIPTS['my-script'] = {
  metadata: {
    name: 'My Script',
    description: 'Does something useful',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: true,
    estimatedDuration: '1 minute',
  },
  run: myScript,
};
```

## Troubleshooting

### Common Issues and Solutions

#### Authentication Errors

**Problem**: "Authentication failed" or "Invalid credentials"

**Solutions:**

1. Verify credentials in `.env.test` match your Google Cloud Console
2. Check that Google People API is enabled in your GCP project
3. Delete `token.json` and re-authenticate:
   ```bash
   rm token.json
   pnpm start
   ```
4. Ensure OAuth consent screen is properly configured
5. Check that your Google account has appropriate permissions

**Problem**: "Redirect URI mismatch"

**Solutions:**

1. Check that `REDIRECT_PORT` in `.env.test` matches OAuth configuration
2. Update OAuth redirect URIs in Google Cloud Console to include `http://localhost:<PORT>`
3. Common ports: 3000, 8080, 3001

#### Port Already in Use

**Problem**: "Error: listen EADDRINUSE: address already in use :::3000"

**Solutions:**

1. Change `REDIRECT_PORT` in `.env.test` to an available port (e.g., 3001, 8080)
2. Or stop the process using port 3000:

   ```bash
   # macOS/Linux
   lsof -ti:3000 | xargs kill -9

   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

#### Rate Limit Errors

**Problem**: "429 Too Many Requests" or quota exceeded

**Understanding Google People API Limits:**

- Read requests: 300 per minute, 30,000 per day
- Write requests: 60 per minute, 3,000 per day
- Group operations: 30 per minute

**Solutions:**

1. Wait for quota to reset (typically 1 minute for per-minute quotas)
2. Reduce `TEST_CONNECTION_LIMIT` for testing
3. Split large operations across multiple days
4. Request quota increase in Google Cloud Console if needed
5. The application will warn you when approaching limits

#### File Not Found Errors

**Problem**: "ENOENT: no such file or directory"

**Solutions:**

1. Verify source file paths in settings
2. For LinkedIn: Check ZIP file is in correct location
3. For Events & Jobs: Ensure folder paths exist and are writable
4. Use absolute paths if relative paths cause issues

#### Permission Denied Errors

**Problem**: "EACCES: permission denied"

**Solutions:**

1. Check file/folder permissions:
   ```bash
   ls -la <path>
   ```
2. Ensure you have write permissions for:
   - Project directory
   - Logs folder
   - Cache folder
   - Source data folders
3. Run with appropriate permissions (avoid `sudo` if possible)

#### Memory Errors

**Problem**: "JavaScript heap out of memory"

**Solutions:**

1. Increase Node.js memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm start
   ```
2. Process large datasets in smaller batches
3. Clear cache before large operations
4. Close other memory-intensive applications

#### CSV/ZIP Parsing Errors

**Problem**: "Failed to parse LinkedIn connections" or encoding issues

**Solutions:**

1. Ensure ZIP file is from official LinkedIn export
2. Check file is not corrupted (try extracting manually)
3. Verify CSV encoding is UTF-8
4. Re-download LinkedIn data export if needed

#### Hebrew/Unicode Display Issues

**Problem**: Hebrew or other Unicode text displays incorrectly

**Solutions:**

1. Ensure terminal supports UTF-8:
   ```bash
   echo $LANG  # Should show UTF-8
   ```
2. Set locale if needed:
   ```bash
   export LANG=en_US.UTF-8
   ```
3. Use a terminal with bidirectional text support (iTerm2, Windows Terminal)

#### Dry-Mode Issues

**Problem**: Dry-mode not activating or unexpected behavior

**Solutions:**

1. Verify `DRY_MODE=true` in environment file
2. Check that you're not using `:live` script variants
3. Look for `[DRY-MODE]` prefix in logs to confirm activation
4. Clear cache and restart application

#### Alert File Issues

**Problem**: Alert file growing too large or contains stale data

**Solutions:**

1. Review alerts using pre-run menu
2. Delete alert file to retry all contacts:
   ```bash
   rm logs/linkedin-sync_ALERTS.log
   rm logs/hibob-sync_ALERTS.log
   ```
3. Or remove specific alerts via menu option
4. Archive old alerts periodically:
   ```bash
   mv logs/linkedin-sync_ALERTS.log logs/archive/linkedin-sync_ALERTS_$(date +%Y%m%d).log
   ```

### Debugging Tips

#### Enable Verbose Logging

1. Check log files in `logs/` directory:

   ```bash
   tail -f logs/linkedin-sync_*.log
   ```

2. Review alert files for detailed error information:
   ```bash
   cat logs/linkedin-sync_ALERTS.log
   ```

#### Test Configuration

```bash
# Run health check
pnpm health

# Test authentication only
pnpm start
# Select any script and verify authentication works
```

#### Verify Dependencies

```bash
# Check Node version
node --version  # Should be 18+

# Verify pnpm installation
pnpm --version

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### Common Validation Errors

**Problem**: "Invalid email format" or "Invalid phone number"

**Solutions:**

- Emails must contain `@` and valid domain
- Phone numbers should be in international format (+1234567890)
- Remove special characters from names
- Check for hidden Unicode characters

### Getting Help

If issues persist:

1. **Check logs**: Review `logs/` directory for detailed error messages
2. **Search issues**: Check [GitHub Issues](https://github.com/orassayag/events-and-people-syncer/issues)
3. **Create issue**: If new problem, create detailed issue with:
   - Error message
   - Steps to reproduce
   - Environment (OS, Node version)
   - Relevant log excerpts (remove sensitive data)
4. **Contact**: Email orassayag@gmail.com with questions

## Advanced Configuration

### Custom Settings

Edit `src/settings/settings.ts` to customize:

- API page sizes
- Rate limit thresholds
- File paths and locations
- LinkedIn connection limits
- Cache durations
- Company label patterns

### Environment Variables

All supported environment variables:

```env
# Required
CLIENT_ID=<oauth-client-id>
CLIENT_SECRET=<oauth-secret>
PROJECT_ID=<gcp-project-id>

# OAuth Configuration
AUTH_URI=https://accounts.google.com/o/oauth2/auth
TOKEN_URI=https://oauth2.googleapis.com/token
AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
REDIRECT_PORT=3000

# Feature Flags
DRY_MODE=true|false
TEST_CONNECTION_LIMIT=<number|0>
NO_CACHE=true|false

# Environment Selection
NODE_ENV=test|production
```

### Extending the Application

#### Adding New Scripts

1. Create script class in `src/scripts/`:

   ```typescript
   import { injectable } from 'inversify';
   import type { Script } from '../types/script';

   @injectable()
   export class MyScript {
     async run(): Promise<void> {
       // Implementation
     }
   }

   export const myScript: Script = {
     metadata: {
       name: 'My Script',
       description: 'Does something useful',
       version: '1.0.0',
       category: 'batch',
       requiresAuth: true,
       estimatedDuration: '5 minutes',
       emoji: '🎯',
     },
     run: async () => {
       const { container } = await import('../di/container');
       const script = container.get(MyScript);
       await script.run();
     },
   };
   ```

2. Register in `src/scripts/index.ts`:

   ```typescript
   import { myScript } from './myScript';

   export const AVAILABLE_SCRIPTS: Record<string, Script> = {
     'my-script': myScript,
     // ... other scripts
   };
   ```

3. Add to `package.json` (optional):
   ```json
   "scripts": {
     "my-script": "tsx src/runner.ts my-script"
   }
   ```

## API Usage Tracking

### Understanding API Quotas

The application automatically tracks API usage and displays statistics:

```
[People API Stats] 📖 Read: 150, ✏️  Write: 25
```

### Daily Quotas

**Default Google People API Quotas:**

- **Read operations**: 30,000 requests per day, 300 per minute
- **Write operations**: 3,000 requests per day, 60 per minute
- **Group operations**: 1,500 requests per day, 30 per minute

### Monitoring Usage

- Check `api-stats.json` in project root
- Statistics reset daily at midnight UTC
- Application warns when approaching limits

### Optimizing API Usage

**For Large Operations:**

1. Use dry-mode first to estimate API calls
2. Run during off-peak hours
3. Split large imports across multiple days
4. Use cache when possible (don't use `--no-cache` unnecessarily)

**Request Quota Increase:**

1. Go to Google Cloud Console → APIs & Services → Quotas
2. Select Google People API
3. Request increase with justification

## Best Practices

### Before Running in Live Mode

1. **Test in Dry-Mode**: Always run with `DRY_MODE=true` first
2. **Review Logs**: Check `logs/` directory for expected behavior
3. **Verify Data**: Ensure source data is clean and properly formatted
4. **Backup Contacts**: Export Google Contacts as backup before large operations
5. **Start Small**: Use `TEST_CONNECTION_LIMIT` for initial tests

### Data Quality

1. **Clean Source Data**: Fix formatting issues before import
2. **Review Alerts**: Check alert files before retry attempts
3. **Handle Duplicates**: Review uncertain matches manually
4. **Validate Phone Numbers**: Use international format (+country code)
5. **Standardize Names**: Use consistent capitalization

### Operational Best Practices

1. **Regular Maintenance**:
   - Clear old logs monthly
   - Review and clear alert files quarterly
   - Update dependencies regularly: `pnpm update`

2. **Monitoring**:
   - Run health check before major operations
   - Monitor API quota usage
   - Check disk space for logs/cache

3. **Security**:
   - Never commit `.env.*` or `token.json` files
   - Rotate OAuth credentials annually
   - Review OAuth app permissions periodically
   - Store backups securely

4. **Performance**:
   - Clear cache when data is stale
   - Use `--no-cache` sparingly (increases API calls)
   - Run during off-peak hours for large operations
   - Close unnecessary applications to free memory

### Backup and Recovery

**Before Large Operations:**

```bash
# Export Google Contacts
# Via Google Contacts → Export → Google CSV format
```

**Recovery from Errors:**

1. Review error logs in `logs/` directory
2. Check alert files for skipped contacts
3. Address issues in source data
4. Re-run with fixes (alert system prevents re-processing)

---

## Support and Resources

### Documentation

- [README.md](README.md) - Project overview and features
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history

### Getting Help

- **GitHub Issues**: [Create an issue](https://github.com/orassayag/events-and-people-syncer/issues)
- **Email**: orassayag@gmail.com
- **StackOverflow**: Tag questions with `google-people-api` and `typescript`

### External Resources

- [Google People API Documentation](https://developers.google.com/people)
- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [InversifyJS Documentation](https://inversify.io/)

## Author

**Or Assayag**

- Email: orassayag@gmail.com
- GitHub: [@orassayag](https://github.com/orassayag)
- StackOverflow: [or-assayag](https://stackoverflow.com/users/4442606/or-assayag)
- LinkedIn: [orassayag](https://linkedin.com/in/orassayag)

---

**Last Updated**: March 2026
**Version**: 1.0.0
