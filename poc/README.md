# Google People API POC

A proof-of-concept application for reading and writing contacts using the Google People API with comprehensive validation, fuzzy duplicate detection, and accessibility features.

## Features

- ✅ **Read and display contacts** with persistent API usage counter
- ✅ **Add contacts** with comprehensive validation (email, phone, LinkedIn URL via Zod)
- ✅ **Fuzzy duplicate detection** using Fuse.js
- ✅ **Automatic retry logic** for transient failures (5 attempts with exponential backoff)
- ✅ **Cross-platform support** (macOS, Linux, Windows)
- ✅ **Accessibility mode** with `--verbose` flag
- ✅ **24-hour contact caching** for improved performance
- ✅ **Loading indicators** with progress updates
- ✅ **Advanced name parsing** with title detection (Dr., Jr., PhD, etc.)
- ✅ **Hebrew text support** using bidi-js for proper bidirectional text handling
- ✅ **OAuth authentication** with 10-minute timeout

## Requirements

- **Node.js 18+**
- **pnpm** (or npm)
- **Google Cloud Project** with People API enabled
- **OAuth 2.0 credentials** (Client ID and Client Secret)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd code/poc
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Google OAuth credentials:
   ```
   CLIENT_ID=your-client-id
   CLIENT_SECRET=your-client-secret
   PROJECT_ID=your-project-id
   AUTH_URI=https://accounts.google.com/o/oauth2/auth
   TOKEN_URI=https://oauth2.googleapis.com/token
   AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
   REDIRECT_PORT=3000
   ```

## Usage

### Standard Mode

```bash
pnpm start
```

### Verbose Mode (Accessibility-Friendly)

```bash
pnpm start:verbose
```

Verbose mode provides:

- Plain text output (no Unicode symbols)
- Clear field labels
- Screen reader-friendly formatting

### Development Mode

```bash
pnpm dev
```

Auto-reloads on file changes.

## Project Structure

```
poc/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── config.ts                   # Environment configuration
│   ├── settings.ts                 # Application settings with port validation
│   ├── types.ts                    # TypeScript interfaces
│   ├── services/                   # Service layer
│   │   ├── authService.ts          # OAuth authentication with timeout
│   │   ├── contactReader.ts        # Read contacts with loading indicators
│   │   ├── contactWriter.ts        # Create contacts with field validation
│   │   ├── duplicateDetector.ts    # Fuzzy duplicate detection (Fuse.js)
│   │   └── apiTracker.ts           # API usage tracking
│   ├── validators/                 # Input validation
│   │   ├── inputValidator.ts       # Custom validators
│   │   ├── validationSchemas.ts    # Zod schemas
│   │   └── __tests__/              # Validator tests
│   └── utils/                      # Utilities
│       ├── textUtils.ts            # Text processing with bidi-js
│       ├── nameParser.ts           # Name parsing with title detection
│       ├── regexPatterns.ts        # Regex patterns
│       ├── portManager.ts          # Cross-platform port management
│       ├── retryHandler.ts         # API retry logic
│       ├── contactCache.ts         # Contact caching with 24h TTL
│       ├── statusBar.ts            # Persistent status bar
│       └── __tests__/              # Utility tests
├── docs/                           # Documentation
│   ├── VALIDATION_RULES.md         # Comprehensive validation documentation
│   └── WINDOWS_SETUP.md            # Windows-specific setup guide
├── vitest.config.ts                # Vitest configuration
└── package.json
```

## Validation

The application uses **Zod schemas** for robust validation:

### Email

- RFC-compliant format
- Max 254 characters
- No consecutive dots

### Phone Numbers

- 7-15 digits
- International format support (+, -, spaces, parentheses)
- Cannot be only special characters

### LinkedIn URLs

- Strict hostname validation (`linkedin.com` or `www.linkedin.com`)
- Valid path requirements (`/in/`, `/company/`, `/school/`)

### Field Limits

- **Per-field limit**: 1024 characters (Google API limit)
- **Total fields**: Maximum 500 fields per contact (Google API limit)

See [VALIDATION_RULES.md](docs/VALIDATION_RULES.md) for complete validation documentation.

## Testing

Run tests:

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

Tests include:

- ✅ Zod validation schemas
- ✅ Name parser with title detection
- ✅ Contact cache with TTL
- ✅ Text utilities

## Windows Support

The application fully supports Windows with automatic platform detection:

- **Port management**: Uses `netstat` and `taskkill` on Windows (vs `lsof` and `kill` on Unix)
- **Path handling**: Automatically handles Windows backslash separators
- **Terminal**: Best experience with Windows Terminal or Git Bash

See [WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for Windows-specific setup and troubleshooting.

## Features in Detail

### Retry Logic

API calls automatically retry on transient failures:

- **Max retries**: 5 attempts
- **Backoff**: Exponential (1s, 2s, 4s, 8s, 16s)
- **Retriable errors**: Network errors, 5xx, 429 (rate limit)
- **Non-retriable**: 4xx errors (except 429), authentication errors

### Contact Caching

Contacts are cached for 24 hours to reduce API calls:

- Singleton cache instance
- Automatic invalidation after 24 hours
- Manual cache clearing after contact creation

### Fuzzy Duplicate Detection

Uses **Fuse.js** for intelligent duplicate detection:

- **Threshold**: 0.2 (strict matching)
- **Fields**: First name and last name
- **Weight**: Equal weighting (0.5 each)

### Name Parsing

Advanced name parser handles:

- **Prefixes**: Dr., Mr., Mrs., Ms., Prof., Rev., etc.
- **Suffixes**: Jr., Sr., II, III, PhD, MD, Esq., etc.
- **Multi-part names**: Handles middle names and compound surnames

### Disabled "Create" Button

The "Create contact" option is automatically disabled until:

- First name is provided
- Last name is provided
- At least one label is selected
- All fields pass validation (length limits, format, etc.)

Error message shows why the button is disabled.

## API Limits

Google People API has the following limits:

- **Read quota**: 300 requests per minute
- **Write quota**: 60 requests per minute
- **Daily quota**: 1,000,000 requests per day (default)

The application tracks API usage and displays counters.

## License

MIT

## Contributing

Contributions are welcome! Please ensure:

- All tests pass (`pnpm test`)
- No linter errors
- New features have accompanying tests
- Documentation is updated

## Support

For issues specific to:

- **Windows**: See [WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md)
- **Validation**: See [VALIDATION_RULES.md](docs/VALIDATION_RULES.md)
- **General issues**: Open a GitHub issue
