# Events & Jobs Sync Script - Setup Guide

## Overview

The Events & Jobs Sync script allows you to create timestamped note files for job interviews and life events, with optional integration to Google Contacts for managing people you meet.

## Prerequisites

### 1. Required Google Contacts Labels

Before running this script for the first time, you **must** create the following labels in your Google Contacts:

#### Mandatory Labels (for Job/HR folders):
- **"Job"** (case-sensitive, exactly as shown)
  - Used for job interview contacts
  - Script will throw an error if this label doesn't exist
  - Create at: https://contacts.google.com

- **"HR"** (case-sensitive, exactly as shown)
  - Used for HR representative contacts
  - Script will throw an error if this label doesn't exist
  - Create at: https://contacts.google.com

#### Optional Labels (for Life Event folders):
- Life event labels (e.g., "OSR", "Airbnb", "Conference", etc.)
  - Created on-demand when needed
  - Script will prompt you to create these if missing
  - No pre-setup required

### 2. Folder Structure

The script expects the following folder structure:

```
project-root/
├── dummy/
│   ├── job-interviews/    # Job/HR folders (shared with LinkedIn sync)
│   │   ├── Job_Microsoft/
│   │   ├── HR_Google/
│   │   └── ...
│   └── life-events/       # Life event folders (new)
│       ├── Alex Z OSR/
│       ├── Airbnb/
│       └── ...
└── sources/
    └── .cache/
        └── folder-mappings.json    # Auto-generated cache
```

### 3. Folder Naming Conventions

#### Job/HR Folders (in `dummy/job-interviews/`):
- **Format**: `{Label}_{CompanyName}`
- **Label** must be exactly "Job" or "HR" (case-sensitive)
- **CompanyName** formatted in PascalCase (e.g., "Microsoft", "EladSoftwareSystems")

**Examples**:
- ✅ Valid: `Job_Microsoft`, `HR_EladSoftwareSystems`, `Job_Google`
- ❌ Invalid: `job_Microsoft`, `JOB_Microsoft`, `Microsoft` (missing label)

#### Life Event Folders (in `dummy/life-events/`):
- **Format**: Any name, minimum 2 characters
- Capitalize first letter of each word
- Last word is typically the label, but you can choose during folder creation

**Examples**:
- ✅ Valid: `Alex Z OSR`, `Airbnb`, `John Doe Meeting`, `Conference 2026`
- ❌ Invalid: `A`, `X` (too short)

### 4. Filesystem Requirements

- **Permissions**: Read/write access to both `dummy/job-interviews/` and `dummy/life-events/`
- **Path Length**: Folder names must not exceed OS path limits (~255 characters for full path)
- **Illegal Characters**: Cannot use: `/ \ : * ? " < > |`
- **Reserved Names**: Cannot use Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
- **Unicode**: Avoid emojis and problematic Unicode characters in folder names

## First-Time Setup

### Step 1: Create Required Labels in Google Contacts

1. Go to https://contacts.google.com
2. Click "Create label" (left sidebar)
3. Create label named **"Job"** (exactly as shown, case-sensitive)
4. Create label named **"HR"** (exactly as shown, case-sensitive)

### Step 2: Create Folder Structure

```bash
# From project root
mkdir -p dummy/job-interviews
mkdir -p dummy/life-events
```

### Step 3: Verify Permissions

```bash
# Test write permissions
touch dummy/job-interviews/test && rm dummy/job-interviews/test
touch dummy/life-events/test && rm dummy/life-events/test

# If commands succeed, permissions are correct
```

### Step 4: Run the Script

```bash
pnpm start
# Select "Events & Jobs Sync" from the menu
```

## How It Works

### Note File Format

Notes are saved as: `notes_DDMMYYYY-N.txt`

Examples:
- `notes_15032026-1.txt` (first note on March 15, 2026)
- `notes_15032026-2.txt` (second note same day)
- `notes_16032026-1.txt` (first note on March 16, 2026)

**Counter Logic**:
- Counter starts at 1 by default
- **Can start at 0**: If `notes_15032026-0.txt` exists, next file is `-1.txt`
- Always uses max+1 (ignores gaps in sequence)
- Files without counter (e.g., `notes_15032026.txt`) are ignored

### Timezone Behavior

- All timestamps use **system local time**
- If system timezone changes between runs, dates reflect the new timezone
- If system timezone changes **during execution**, subsequent operations use the new timezone
- If system time goes backwards, you may see warnings about "future" files (non-fatal)

### Symlink Behavior

- The script **follows symlinks** to their target directories
- If `dummy/job-interviews` is a symlink, the script will scan the target folder
- **Warning**: Circular symlinks are not handled—avoid them to prevent infinite loops

### Logging Policy

The script logs all actions **except** note content:
- ✅ Logged: folder names, file paths, user selections, stats, errors
- ❌ Never logged: note content (may contain sensitive information)

## Usage Examples

### Example 1: Create Note in Existing Folder

1. Run script → Select "📝 Create note"
2. Enter company/event name: "Microsoft"
3. Script finds exact match: `Job_Microsoft`
4. Enter your message
5. Note saved as `notes_DDMMYYYY-N.txt`

### Example 2: Create New Job Folder

1. Run script → Select "📝 Create note"
2. Enter company name: "Apple"
3. No match found → Select "➕ Create new folder"
4. Select type: "Job Interview"
5. Select label: "Job"
6. Enter company: "Apple" (auto-formatted to PascalCase)
7. Confirm: Creates `Job_Apple` folder
8. Enter your message → Note saved

### Example 3: Create Life Event Folder with Contact

1. Run script → Select "📝 Create note"
2. Enter: "John Doe OSR"
3. No match → Create new folder → "Life Event"
4. Select label from words: Choose "OSR"
5. Folder created: `John Doe OSR`
6. Enter note content
7. Select "👤 Add contact"
8. If "OSR" label doesn't exist → Prompt to create it
9. Enter contact details (pre-populated with label "OSR")
10. Contact saved to Google Contacts

## Advanced Features

### Rewrite Note

Allows you to overwrite content of an existing note file.

### Delete Last Note

Deletes the most recently created note in the current session.

### Delete Empty Folder

Removes folders that contain no visible files (ignores `.DS_Store`, `Thumbs.db`, `desktop.ini`).

### Rename Folder

Rename folders while maintaining proper format. **Note**: Folder renames do not affect existing contacts.

### --no-cache Flag

Bypass and refresh the folder cache:

```bash
NO_CACHE=true pnpm start
```

## Troubleshooting

### Error: "Required label 'Job' does not exist"

**Cause**: The "Job" label is missing from Google Contacts.

**Solution**:
1. Go to https://contacts.google.com
2. Create a label named exactly **"Job"** (case-sensitive)
3. Re-run the script

### Error: "Required label 'HR' does not exist"

**Cause**: The "HR" label is missing from Google Contacts.

**Solution**:
1. Go to https://contacts.google.com
2. Create a label named exactly **"HR"** (case-sensitive)
3. Re-run the script

### Error: "Neither job-interviews nor life-events folder found"

**Cause**: Neither required folder exists.

**Solution**:
```bash
mkdir -p dummy/job-interviews
mkdir -p dummy/life-events
```

At least one of these folders must exist.

### Error: "Path exists but is not a directory"

**Cause**: The path points to a file instead of a directory.

**Solution**:
```bash
# Remove the file and create a directory
rm dummy/job-interviews  # or dummy/life-events
mkdir -p dummy/job-interviews  # or dummy/life-events
```

### Error: "Insufficient permissions for path"

**Cause**: The script doesn't have read/write permissions for the folder.

**Solution**:
```bash
# Fix permissions (macOS/Linux)
chmod -R u+rw dummy/job-interviews
chmod -R u+rw dummy/life-events
```

### Error: "Invalid folder format in job-interviews: 'microsoft'"

**Cause**: Folder doesn't match required format `Job_CompanyName` or `HR_CompanyName`.

**Solution**:
- Rename folder to proper format: `Job_Microsoft` or `HR_Microsoft`
- Label must be exactly "Job" or "HR" (case-sensitive)

### Error: "Folder name cannot contain: / \ : * ? \" < > |"

**Cause**: Company or folder name contains illegal filesystem characters.

**Solution**:
- Remove illegal characters from the name
- Use only alphanumeric characters, spaces, hyphens, and underscores

### Warning: "⚠️ Folder already exists"

**Cause**: A folder with the same name already exists (case-insensitive check).

**Solution**:
- Choose a different name
- Or use the existing folder

### Warning: "⚠️ Found note files with future dates"

**Cause**: System time was changed or timezone shifted, creating files with dates ahead of current date.

**Impact**: Non-fatal—script continues normally.

**Note**: Counter logic still works correctly; future-dated files are included in max counter calculation.

## Language Support

This script supports **English only**. All error messages, prompts, and logs are in English. No localization or internationalization support is provided.

## Security & Privacy

### What Gets Logged:
- Folder names and paths
- File names (but NOT content)
- User menu selections
- Operation statistics
- Error messages

### What Does NOT Get Logged:
- **Note content** (never logged to protect sensitive information)
- Google Contacts credentials
- API tokens

### Note Content Limits:
- Maximum size: 1MB (~1,048,576 characters)
- Binary data (null bytes) rejected automatically

## Tips & Best Practices

1. **Use descriptive folder names** for life events to make them easy to find
2. **Create notes immediately after meetings** while details are fresh
3. **Use the fuzzy search** by typing partial names (e.g., "Micro" finds "Microsoft")
4. **Add contacts selectively**—not every note needs a contact entry
5. **Review your folders periodically** and delete empty ones to keep things tidy
6. **Back up your notes** regularly (they're just text files in the folders)
7. **Use consistent naming** for companies to avoid duplicates

## Keyboard Shortcuts

- **Ctrl+C**: Exit script gracefully (shows summary before exit)

## Related Documentation

- Main README: `../README.md`
- Implementation Plan: `./EVENTS_JOBS_SYNC_IMPLEMENTATION_PLAN.md`
- LinkedIn Sync Setup: See existing setup docs for shared `job-interviews` folder

## Support

For issues or questions:
1. Check this troubleshooting guide first
2. Review the implementation plan for technical details
3. Check logs in `logs/events-jobs-sync-{DD_MM_YYYY}.log`
4. Contact the development team

---

**Version**: 1.0.0  
**Last Updated**: March 2026  
**Supported Platforms**: macOS, Linux, Windows (with proper path handling)
