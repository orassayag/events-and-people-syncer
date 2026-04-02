# Infrastructure Migration Plan

## Overview

This plan migrates the infrastructure from the reference project ([event-dates-calendar-ts](https://github.com/orassayag/event-dates-calendar-ts)) into the current project's `src` folder, merging it with existing `poc` files while preserving POC-specific configurations.

## Key Decisions

Based on clarifications:
- **File Naming Convention**: All files use camelCase format matching POC convention (e.g., `authService.ts`, `apiTracker.ts`, not `AuthService.ts`)
- **Runner pattern**: Adopt `runner.ts` for extensible script execution
- **Settings**: Adopt reference `settings/initiate.ts` pattern, merge POC `config.ts` + `settings.ts` into unified `settings/` folder
- **Types**: Split monolithic `types.ts` into separate files by concern (`contact.ts`, `auth.ts`, `api.ts`, `validation.ts`, `settings.ts`)
- **Entities**: Create new `entities/` folder for Zod schemas, split `validationSchemas.ts` into individual schema files
- **Service Architecture**: Dual-mode contact management - interactive wizard + programmatic API
- **Contact Operations**: Full CRUD + Search + Fuzzy matching + Filters + Future extensibility
- **Error Handling**: Adopt error code system from reference project with dedicated `errors/` folder
- **Logging**: Replace console.log with structured Logger service (logs/ folder in .gitignore)
- **Environment Management**: Support test and prod environments with environment-specific .env files
- **Dependency Injection**: Use InversifyJS for service dependencies
- **Constants**: Dedicated `constants/` folder for API limits, UI strings, validation constants
- **Script Registration**: Manual registration pattern (Option A)
- **Rate Limiting**: Add rate limit warnings via Logger
- **VSCode**: Include `.vscode` for consistent development experience
- **Testing**: Keep vitest infrastructure (POC has it, reference doesn't)

### Rationale for Key Changes

**Why use camelCase for file names?**
- **Consistency**: Matches POC naming convention
- **TypeScript best practice**: File names match exported class/function names in case
- **Import clarity**: `import { Logger } from './logger'` is cleaner than `import { Logger } from './Logger'`
- **Prevents confusion**: No ambiguity between file names and class names
- **Cross-platform**: Avoids case-sensitivity issues on different operating systems

**Why merge config.ts and settings.ts?**
- **Single source of truth**: All configuration in one place reduces confusion
- **Consistent pattern**: Matches reference project's approach
- **Better maintainability**: Environment variables are just another type of setting
- **Cleaner imports**: `import { SETTINGS } from './settings'` instead of multiple imports

**Why split types.ts into separate files?**
- **Separation of concerns**: Contact types separate from auth types separate from API types
- **Better maintainability**: Easier to find and modify specific type definitions
- **Reduced cognitive load**: Each file focuses on one domain concept
- **Follows reference pattern**: Reference project uses separate type files per domain
- **Scalability**: As types grow, files remain manageable

**Why create entities/ folder for Zod schemas?**
- **Domain-driven design**: Entities represent domain objects with their validation rules
- **Reusability**: Schemas can be imported and composed across validators
- **Single responsibility**: Each schema file validates one specific entity
- **Testability**: Individual schemas easier to test in isolation
- **Separation from validation logic**: Schemas (what to validate) separated from validators (how to use schemas)
- **Clear naming**: `.schema.ts` suffix makes schema files immediately identifiable

**Why centralize regex patterns in utils/regexPatterns.ts?**
- **Single source of truth**: All regex patterns defined once, reused everywhere
- **Consistency**: Same pattern used across Zod schemas, validators, and utilities
- **Maintainability**: Update pattern once, applies everywhere
- **Testability**: Patterns can be tested independently
- **Discoverability**: All patterns in one place for easy reference
- **No duplication**: Eliminates hardcoded regex scattered across files

**Why adopt dual-mode service architecture (interactive + programmatic)?**
- **Flexibility**: Support both batch operations (CSV imports) and interactive wizards
- **Code reuse**: Both modes share validation, duplicate detection, and API logic
- **Script variety**: Different scripts have different data flows and user interaction needs
- **Separation of concerns**: Interactive UI separated from business logic
- **Future-proof**: Easy to add CLI commands, REST APIs, or automated workflows
- **Testability**: Business logic can be tested without UI dependencies

**Why eliminate utils/ folder in favor of domain-specific folders?**
- **Clear purpose**: Each folder has a specific, well-defined responsibility
- **Discoverability**: Developers know exactly where to find code (validators/, cache/, parsers/, etc.)
- **Avoid dumping ground**: "Utils" becomes a catch-all for unorganized code
- **Domain-driven design**: Folders organized by what they do, not how general they are
- **Scalability**: Easy to add new domains without creating confusion
- **Better naming**: `parsers/nameParser.ts` more descriptive than `utils/nameParser.ts`

**Why adopt error code system?**
- **Troubleshooting**: Unique error codes make debugging easier
- **Documentation**: Each error can be documented with its code
- **Consistency**: Standardized error handling across the application
- **User support**: Users can reference error codes when reporting issues
- **Tracking**: Easy to track which errors occur most frequently

**Why use structured logging instead of console.log?**
- **Log levels**: Control verbosity (debug, info, warn, error)
- **Structured data**: JSON format for machine parsing
- **Filtering**: Easy to filter logs by level, module, or context
- **Production-ready**: Proper logging for production environments
- **PHI safety**: Can filter sensitive healthcare information (per user rules)

**Why use InversifyJS for dependency injection?**
- **Testability**: Easy to mock dependencies in tests
- **Flexibility**: Swap implementations without changing consumers
- **Loose coupling**: Services don't create their own dependencies
- **Type safety**: TypeScript decorators with type checking
- **Industry standard**: Well-established DI container for TypeScript

## Migration Strategy

### Phase 1: Root Configuration Files

Merge and migrate root-level configuration files from both projects:

**From reference project (event-dates-calendar-ts):**
- `eslint.config.mjs` - ESLint configuration with TypeScript rules
- `.prettierrc` - Prettier formatting rules
- `pnpm-workspace.yaml` - PNPM workspace configuration
- `LICENSE` - MIT License
- `CONTRIBUTING.md` - Contribution guidelines
- `.vscode/settings.json` - Editor settings
- `.vscode/extensions.json` - Recommended extensions

**From POC (merge/preserve):**
- `.env.example` - Keep POC OAuth configuration structure
- `vitest.config.ts` - Keep test configuration (not in reference)
- `api-stats.json` - Keep (POC-specific runtime data)
- `token.json` - Keep (OAuth token, in .gitignore)

**Merged files:**
- `.gitignore` - Combine both (POC has OAuth-specific entries, reference has cleaner structure, add logs/ folder)
- `tsconfig.json` - Use reference as base, add POC's stricter options (`strict`, `declaration`, `sourceMap`), add decorator support for InversifyJS
- `package.json` - Merge scripts, dependencies, and metadata
- `README.md` - Update with new structure and merged features

### Phase 2: Source Code Structure

Adopt reference project's folder structure while preserving POC functionality and refactoring for dual-mode operation:

```
src/
├── index.ts              # Simple entry point (from reference)
├── runner.ts             # Script runner with argument parsing (from reference)
├── settings/
│   ├── index.ts          # Export settings (from reference)
│   ├── settings.ts       # Main settings object with merged OAuth config (from reference pattern)
│   └── initiate.ts       # Initialize settings at runtime, detect environment (from reference)
├── types/                # Separate types by concern (improved structure)
│   ├── index.ts          # Export all types
│   ├── contact.ts        # Contact-related types (ContactData, EmailAddress, PhoneNumber, Website)
│   ├── auth.ts           # Auth types (GoogleCredentials, TokenData, EnvironmentConfig)
│   ├── api.ts            # API types (CreateContactRequest, ContactGroup, ApiStats)
│   ├── validation.ts     # Validation types (InitialContactData, EditableContactData)
│   ├── settings.ts       # Settings types
│   ├── error.ts          # Error types (AppError, ErrorCode)
│   ├── logger.ts         # Logger types (LogLevel, LogEntry)
│   └── di.ts             # Dependency injection types (ServiceIdentifiers)
├── entities/             # Zod schemas for validation (NEW)
│   ├── index.ts          # Export all schemas
│   ├── email.schema.ts   # Email validation schema
│   ├── phone.schema.ts   # Phone number validation schema
│   ├── linkedin.schema.ts # LinkedIn URL validation schema
│   ├── field.schema.ts   # Field length validation schema
│   └── port.schema.ts    # Port validation schema
├── constants/            # Application constants (NEW)
│   ├── index.ts          # Export all constants
│   ├── apiConstants.ts   # API limits, timeouts, rate limits
│   ├── uiConstants.ts    # UI strings, messages, prompts
│   └── validationConstants.ts # Max lengths, field limits
├── errors/               # Error handling (NEW)
│   ├── index.ts          # Export error utilities
│   ├── ErrorCodes.ts     # Enum of all error codes
│   ├── AppError.ts       # Custom error class with codes
│   └── errorMessages.ts  # Centralized error messages
├── logging/              # Logging infrastructure (NEW)
│   ├── index.ts          # Export logger
│   ├── Logger.ts         # Logger class with levels
│   └── logConfig.ts      # Log configuration
├── di/                   # Dependency injection configuration (NEW)
│   ├── index.ts          # Export container
│   ├── container.ts      # InversifyJS container setup
│   └── identifiers.ts    # Service identifiers/symbols
├── monitoring/           # System health monitoring (NEW)
│   ├── index.ts          # Export monitoring utilities
│   └── HealthCheck.ts    # Health check system
├── scripts/
│   ├── index.ts          # Script registry with metadata (manual registration)
│   ├── interactive-contact-manager.ts # Interactive wizard script (migrated from POC index.ts)
│   ├── import-linkedin-contacts.ts    # Example: CSV → Google batch import
│   ├── health-check.ts   # Health check script
│   └── [future scripts]  # Placeholder for extensibility
├── services/             # Refactored service layer
│   ├── contacts/         # NEW: Contact management (dual-mode)
│   │   ├── ContactService.ts        # Core CRUD operations (programmatic API)
│   │   ├── ContactWizard.ts         # Interactive wizard using inquirer
│   │   ├── ContactSearchService.ts  # Search, filter, and query capabilities
│   │   ├── DuplicateDetector.ts     # Fuzzy matching service (from POC)
│   │   ├── ContactValidator.ts      # Contact validation logic
│   │   └── index.ts
│   ├── auth/             # Authentication services
│   │   ├── AuthService.ts           # OAuth service (from POC)
│   │   └── index.ts
│   ├── api/              # API utilities
│   │   ├── ApiTracker.ts            # API usage tracking (from POC)
│   │   ├── RetryHandler.ts          # API retry logic with exponential backoff (from POC utils)
│   │   ├── RateLimitMonitor.ts      # Rate limit warnings (NEW)
│   │   └── index.ts
│   └── index.ts
├── validators/           # Input validation logic
│   ├── inputValidator.ts # Validation logic using schemas from entities/
│   └── index.ts
├── cache/                # Caching mechanisms
│   ├── contactCache.ts   # Contact caching with 24h TTL (from POC utils)
│   └── index.ts
├── parsers/              # Data parsing utilities
│   ├── nameParser.ts     # Name parsing with title detection (from POC utils)
│   ├── textParser.ts     # Text processing utilities (from POC textUtils)
│   └── index.ts
├── managers/             # System resource managers
│   ├── portManager.ts    # Cross-platform port management (from POC utils)
│   └── index.ts
├── flow/                 # CLI UI components and user interaction
│   ├── statusBar.ts      # Persistent status bar (from POC utils)
│   └── index.ts
└── regex/                # Centralized regex patterns
    ├── patterns.ts       # All regex patterns (from POC regexPatterns.ts)
    ├── validationHelpers.ts # Validation helper functions (from POC validationUtils)
    └── index.ts
```

**Note on folder organization:**
- **constants/**: Application-wide constants (API limits, UI strings, validation rules)
- **errors/**: Error handling infrastructure with unique error codes
- **logging/**: Structured logging service replacing console.log
- **di/**: InversifyJS dependency injection container configuration
- **monitoring/**: Health check system for service monitoring
- **validators/**: Input validation logic using Zod schemas
- **cache/**: Caching strategies and implementations
- **parsers/**: Data transformation and parsing
- **managers/**: System resource management (ports, files, etc.)
- **flow/**: CLI UI components for user interaction
- **regex/**: All regex patterns and pattern-based validation helpers
- **No more utils/**: Each domain has its dedicated folder

### Phase 3: Package.json Scripts

Merge scripts from both projects and add comprehensive metadata:

**Package.json metadata (from reference):**
```json
{
  "name": "events-and-people-syncer",
  "version": "1.0.0",
  "private": false,
  "description": "Infrastructure for running multiple scripts that interact with Google People API for contact management, supporting both interactive wizards and programmatic batch operations",
  "repository": {
    "type": "git",
    "url": "git://github.com/orassayag/events-and-people-syncer.git"
  },
  "keywords": [
    "nodejs",
    "typescript",
    "google-people-api",
    "contacts",
    "automation",
    "wizard",
    "batch-processing",
    "dual-mode",
    "typescript-infrastructure"
  ],
  "main": "src/index.ts",
  "type": "module",
  "author": "Or Assayag <orassayag@gmail.com>",
  "contributors": [
    {
      "name": "Or Assayag",
      "email": "orassayag@gmail.com",
      "url": "https://github.com/orassayag"
    }
  ],
  "files": [
    ".vscode",
    "dist",
    "src",
    ".gitignore",
    ".prettierrc",
    "eslint.config.mjs",
    "CONTRIBUTING.md",
    "LICENSE",
    "INSTRUCTIONS.md",
    "CHANGELOG.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "README.md",
    "tsconfig.json",
    "vitest.config.ts"
  ],
  "license": "MIT"
}
```

**Merged scripts:**

**From reference:**
- `lint` - ESLint check
- `format` - Prettier format
- `format:check` - Prettier check
- `script` - Run named script via runner.ts

**From POC:**
- `start` - Run main application
- `start:verbose` - Run with verbose flag
- `dev` - Development mode with watch
- `test` - Run vitest tests
- `test:watch` - Watch mode
- `test:coverage` - Coverage report

**New/merged:**
- `build` - TypeScript compilation

**Final package.json scripts section:**
```json
"scripts": {
  "lint": "eslint \"src/**/*.ts\"",
  "format": "prettier --write \"src/**/*.ts\"",
  "format:check": "prettier --check \"src/**/*.ts\"",
  "start": "tsx src/runner.ts",
  "script": "tsx src/runner.ts",
  "script:list": "tsx src/runner.ts list",
  "interactive": "tsx src/runner.ts interactive-contact-manager",
  "import-linkedin": "tsx src/runner.ts import-linkedin-contacts",
  "health": "tsx src/runner.ts health-check",
  "dev": "tsx watch src/runner.ts",
  "test": "NODE_OPTIONS='--no-warnings' vitest run",
  "test:watch": "NODE_OPTIONS='--no-warnings' vitest",
  "test:coverage": "NODE_OPTIONS='--no-warnings' vitest run --coverage",
  "build": "tsc"
}
```

### Phase 4: Dependencies Management

**Preserve POC dependencies:**
- `@types/inquirer`, `bidi-js`, `cli-spinners`, `dotenv`, `fuse.js`, `googleapis`, `inquirer`, `ora`, `zod`

**Add from reference:**
- ESLint packages: `@eslint/js`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint`, `eslint-config-prettier`, `eslint-plugin-prettier`, `typescript-eslint`
- Prettier: `prettier`

**Add for new infrastructure:**
- Dependency Injection: `inversify`, `reflect-metadata`
- Type definitions: `@types/node` (already exists in both)

**Keep POC dev dependencies:**
- `@vitest/ui`, `vitest` (testing)
- `tsx` (already in both)
- `@types/node`, `typescript` (already in both)

### Phase 5: Documentation

**Merge docs folder:**
- Keep all POC docs in `poc/docs`:
  - `VALIDATION_RULES.md`
  - `WINDOWS_SETUP.md`
  - `HEBREW_VALIDATION.md`
  - `DUPLICATE_VALIDATION.md`
  - And other POC-specific docs

**Add from reference (adapted):**
- `CONTRIBUTING.md` - Update with POC-specific guidelines
- `LICENSE` - MIT License (update copyright year to 2026)
- `CHANGELOG.md` - Create changelog for version tracking (from reference)
- `INSTRUCTIONS.md` - Create usage instructions (from reference)

**Move to `src/docs`:**
- Create consolidated documentation folder
- Merge POC docs with infrastructure docs

**New documentation to create:**
- `CHANGELOG.md` - Version history and breaking changes
- `INSTRUCTIONS.md` - Setup, configuration, and running scripts
- `README.md` - Update with new architecture and dual-mode features

### Phase 6: Settings Pattern Migration

Transform POC's `config.ts` + `settings.ts` into reference's `settings/` folder pattern with environment support:

**Current POC pattern:**
```typescript
// config.ts - loads env vars with dotenv, validates required vars
// settings.ts - application constants, port validation
```

**New unified pattern with environment management:**
```typescript
// settings/settings.ts - main SETTINGS object with all configs including OAuth
// settings/initiate.ts - runtime initialization, env validation, environment detection
// settings/index.ts - exports
```

**Key improvements:**
- Eliminate separate `config.ts` - merge OAuth configuration into `settings/settings.ts`
- Move environment validation to `settings/initiate.ts`
- **Add environment detection**: Detect test vs prod based on NODE_ENV
- Keep all application configuration in one cohesive location
- Maintain dotenv loading but centralize validation logic
- Use port validation from `entities/port.schema.ts`

**Environment Configuration:**

Create environment-specific files:
- `.env.test` - Test environment (current POC credentials)
- `.env.production` - Production environment (empty for now)

**`settings/initiate.ts`** - Environment detection:
```typescript
import { config } from 'dotenv';
import { SETTINGS } from './settings';

export function initiate(): void {
  const environment = process.env.NODE_ENV || 'test';
  SETTINGS.environment = environment;
  
  // Load environment-specific .env file
  const envFile = environment === 'production' ? '.env.production' : '.env.test';
  config({ path: envFile });
  
  // Validate required environment variables
  validateEnvironment();
  
  // Additional initialization logic
}
```

**`settings/settings.ts`** - With environment field:
```typescript
export const SETTINGS = {
  environment: 'test' as 'test' | 'production',
  auth: {
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    // ... rest of OAuth config
  },
  // ... rest of settings
};
```

### Phase 7: Error Handling Infrastructure

Create error handling system with unique error codes (from reference project pattern):

**`errors/ErrorCodes.ts`** - Error code enum:
```typescript
export enum ErrorCode {
  // Authentication errors (2000xxx)
  AUTH_MISSING_CREDENTIALS = 2000001,
  AUTH_INVALID_TOKEN = 2000002,
  AUTH_TIMEOUT = 2000003,
  
  // Contact errors (2001xxx)
  CONTACT_NOT_FOUND = 2001001,
  CONTACT_INVALID_DATA = 2001002,
  CONTACT_DUPLICATE = 2001003,
  
  // API errors (2002xxx)
  API_RATE_LIMIT = 2002001,
  API_REQUEST_FAILED = 2002002,
  API_NETWORK_ERROR = 2002003,
  
  // Validation errors (2003xxx)
  VALIDATION_FAILED = 2003001,
  VALIDATION_EMAIL_INVALID = 2003002,
  VALIDATION_PHONE_INVALID = 2003003,
  
  // System errors (2009xxx)
  SYSTEM_FILE_NOT_FOUND = 2009001,
  SYSTEM_PORT_IN_USE = 2009002,
}
```

**`errors/AppError.ts`** - Custom error class:
```typescript
import { ErrorCode } from './ErrorCodes';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(`[ERROR-${code}] ${message}`);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**`errors/errorMessages.ts`** - Centralized messages:
```typescript
import { ErrorCode } from './ErrorCodes';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_MISSING_CREDENTIALS]: 'Missing required OAuth credentials',
  [ErrorCode.AUTH_INVALID_TOKEN]: 'Invalid or expired authentication token',
  [ErrorCode.CONTACT_NOT_FOUND]: 'Contact not found',
  // ... all error messages
};
```

**Usage example:**
```typescript
import { AppError, ErrorCode } from '../errors';

throw new AppError(
  ErrorCode.CONTACT_NOT_FOUND,
  'Contact with ID {id} not found',
  { id: contactId }
);
```

**Create `misc/error_index.txt`** for documentation (like reference project).

### Phase 8: Logging Infrastructure

Replace console.log with structured logging service:

**`logging/Logger.ts`** - Logger class:
```typescript
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export class Logger {
  constructor(private context: string) {}
  
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }
  
  info(message: string, data?: Record<string, unknown>, options?: { noPHI?: boolean }): void {
    this.log(LogLevel.INFO, message, data, options);
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }
  
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, { ...data, error: error?.message, stack: error?.stack });
  }
  
  private log(level: LogLevel, message: string, data?: Record<string, unknown>, options?: { noPHI?: boolean }): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
      noPHI: options?.noPHI,
    };
    
    // Console output
    console.log(JSON.stringify(entry));
    
    // File output (append to logs/)
    this.writeToFile(entry);
  }
  
  private writeToFile(entry: LogEntry): void {
    // Append to logs/app.log
  }
}
```

**`logging/logConfig.ts`** - Configuration:
```typescript
export const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  logDir: 'logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  enableConsole: true,
  enableFile: true,
};
```

**Usage:**
```typescript
import { Logger } from '../logging';

const logger = new Logger('ContactService');
logger.info('Contact created successfully', { contactId: '123' }, { noPHI: true });
logger.error('Failed to create contact', error, { input: contactData });
```

**Update `.gitignore`:**
```
logs/
*.log
```

### Phase 9: Dependency Injection with InversifyJS

Set up InversifyJS for dependency injection:

**Install InversifyJS:**
```bash
pnpm add inversify reflect-metadata
pnpm add -D @types/node
```

**`di/identifiers.ts`** - Service identifiers:
```typescript
export const TYPES = {
  // Services
  AuthService: Symbol.for('AuthService'),
  ContactService: Symbol.for('ContactService'),
  ContactWizard: Symbol.for('ContactWizard'),
  ContactSearchService: Symbol.for('ContactSearchService'),
  DuplicateDetector: Symbol.for('DuplicateDetector'),
  ContactValidator: Symbol.for('ContactValidator'),
  
  // API
  ApiTracker: Symbol.for('ApiTracker'),
  RetryHandler: Symbol.for('RetryHandler'),
  RateLimitMonitor: Symbol.for('RateLimitMonitor'),
  
  // Infrastructure
  Logger: Symbol.for('Logger'),
  
  // Auth
  OAuth2Client: Symbol.for('OAuth2Client'),
};
```

**`di/container.ts`** - Container setup:
```typescript
import { Container } from 'inversify';
import 'reflect-metadata';
import { TYPES } from './identifiers';
import { ContactService } from '../services/contacts/ContactService';
// ... other imports

export const container = new Container();

// Bind services
container.bind(TYPES.ContactService).to(ContactService).inSingletonScope();
container.bind(TYPES.ContactWizard).to(ContactWizard).inTransientScope();
container.bind(TYPES.DuplicateDetector).to(DuplicateDetector).inSingletonScope();
// ... other bindings
```

**Service with DI:**
```typescript
import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/identifiers';

@injectable()
export class ContactWizard {
  constructor(
    @inject(TYPES.ContactService) private contactService: ContactService,
    @inject(TYPES.DuplicateDetector) private duplicateDetector: DuplicateDetector,
    @inject(TYPES.Logger) private logger: Logger
  ) {}
  
  async addContactInteractive(): Promise<Contact> {
    this.logger.info('Starting interactive contact creation');
    // Implementation
  }
}
```

**Update `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Phase 10: Constants Management

Create centralized constants folder:

**`constants/apiConstants.ts`** - API-related constants:
```typescript
export const API_CONSTANTS = {
  GOOGLE_PEOPLE_API: {
    VERSION: 'v1',
    PAGE_SIZE: 1000,
    DISPLAY_PAGE_SIZE: 15,
    TOP_CONTACTS_DISPLAY: 10,
    
    // Rate limits (from Google)
    RATE_LIMIT_READ: 300, // per minute
    RATE_LIMIT_WRITE: 60, // per minute
    RATE_LIMIT_DAILY: 1_000_000,
    
    // Timeouts
    BROWSER_TIMEOUT: 240000, // 4 minutes
    REQUEST_TIMEOUT: 30000, // 30 seconds
    
    // Retry configuration
    MAX_RETRIES: 5,
    RETRY_BASE_DELAY: 1000,
    RETRY_MAX_DELAY: 16000,
    
    // Field limits
    MAX_FIELD_LENGTH: 1024,
    MAX_FIELDS_PER_CONTACT: 500,
  },
  
  SCOPES: ['https://www.googleapis.com/auth/contacts'],
};
```

**`constants/uiConstants.ts`** - UI strings and messages:
```typescript
export const UI_CONSTANTS = {
  MESSAGES: {
    WELCOME: '=== Google People API POC ===',
    GOODBYE: 'Goodbye!',
    CONTACT_CREATED: 'Contact created successfully',
    CONTACT_CANCELLED: 'Contact creation cancelled',
    FETCHING_CONTACTS: 'Fetching contacts from Google People API...',
  },
  
  PROMPTS: {
    COMPANY: '🏢 Company:',
    FULL_NAME: '👤 Full name:',
    JOB_TITLE: '💼 Job Title:',
    EMAIL: '📧 Email address:',
    PHONE: '📞 Phone number:',
    LINKEDIN: '🔗 LinkedIn URL:',
  },
  
  MENU_CHOICES: {
    READ_CONTACTS: 'Read and display all contacts',
    ADD_CONTACT: 'Add new contact',
    EXIT: 'Exit',
  },
};
```

**`constants/validationConstants.ts`** - Validation limits:
```typescript
export const VALIDATION_CONSTANTS = {
  EMAIL: {
    MAX_LENGTH: 254,
    MIN_LENGTH: 3,
  },
  
  PHONE: {
    MIN_DIGITS: 1,
    MAX_DIGITS: 100,
  },
  
  PORT: {
    MIN: 1024,
    MAX: 65535,
  },
  
  CACHE: {
    TTL_HOURS: 24,
    TTL_MS: 24 * 60 * 60 * 1000,
  },
};
```

### Phase 11: Rate Limit Monitoring

Add rate limit warnings to API service:

**`services/api/RateLimitMonitor.ts`** - Rate limit tracking:
```typescript
import { injectable, inject } from 'inversify';
import { TYPES } from '../../di/identifiers';
import { Logger } from '../../logging';
import { API_CONSTANTS } from '../../constants';

@injectable()
export class RateLimitMonitor {
  private readCount = 0;
  private writeCount = 0;
  private windowStart = Date.now();
  private readonly WINDOW_MS = 60 * 1000; // 1 minute
  
  constructor(@inject(TYPES.Logger) private logger: Logger) {}
  
  trackRead(): void {
    this.resetWindowIfNeeded();
    this.readCount++;
    this.checkLimits('read', this.readCount, API_CONSTANTS.GOOGLE_PEOPLE_API.RATE_LIMIT_READ);
  }
  
  trackWrite(): void {
    this.resetWindowIfNeeded();
    this.writeCount++;
    this.checkLimits('write', this.writeCount, API_CONSTANTS.GOOGLE_PEOPLE_API.RATE_LIMIT_WRITE);
  }
  
  private checkLimits(operation: string, count: number, limit: number): void {
    const percentUsed = (count / limit) * 100;
    
    if (percentUsed >= 90) {
      this.logger.warn(`Rate limit warning: ${operation} operations at ${percentUsed.toFixed(1)}% of limit`, {
        count,
        limit,
        percentUsed,
      });
    }
    
    if (count >= limit) {
      this.logger.error(`Rate limit exceeded: ${operation} operations`, {
        count,
        limit,
      });
    }
  }
  
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.readCount = 0;
      this.writeCount = 0;
      this.windowStart = now;
    }
  }
}
```

### Phase 11b: Script Metadata & Registration

Enhance script registration with metadata for better discoverability:

**`types/script.ts`** - Script metadata types:
```typescript
export interface ScriptMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  category: 'interactive' | 'batch' | 'maintenance';
  requiresAuth: boolean;
  estimatedDuration?: string;
}

export interface Script {
  metadata: ScriptMetadata;
  run: () => Promise<void>;
}
```

**`scripts/index.ts`** - Enhanced script registry:
```typescript
import { Script } from '../types/script';
import { interactiveContactManager } from './interactive-contact-manager';
import { importLinkedinContacts } from './import-linkedin-contacts';

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  'interactive-contact-manager': {
    metadata: {
      name: 'Interactive Contact Manager',
      description: 'Manual contact management with user prompts and duplicate detection',
      version: '1.0.0',
      author: 'Or Assayag',
      category: 'interactive',
      requiresAuth: true,
      estimatedDuration: '5-10 minutes per contact',
    },
    run: interactiveContactManager,
  },
  'import-linkedin-contacts': {
    metadata: {
      name: 'LinkedIn Contacts Import',
      description: 'Batch import contacts from LinkedIn CSV export',
      version: '1.0.0',
      category: 'batch',
      requiresAuth: true,
      estimatedDuration: '1-5 minutes (depends on CSV size)',
    },
    run: importLinkedinContacts,
  },
};

// Helper to list available scripts
export function listScripts(): void {
  console.log('\nAvailable Scripts:\n');
  Object.entries(AVAILABLE_SCRIPTS).forEach(([key, script]) => {
    const { metadata } = script;
    console.log(`  ${key}`);
    console.log(`    Name: ${metadata.name}`);
    console.log(`    Description: ${metadata.description}`);
    console.log(`    Category: ${metadata.category}`);
    console.log(`    Duration: ${metadata.estimatedDuration || 'Unknown'}\n`);
  });
}
```

**`runner.ts`** - Enhanced runner with script listing:
```typescript
import { initiate } from './settings';
import { AVAILABLE_SCRIPTS, listScripts } from './scripts';

const scriptName: string = process.argv[2];

if (!scriptName || scriptName === '--list' || scriptName === 'list') {
  listScripts();
  process.exit(0);
}

if (!AVAILABLE_SCRIPTS[scriptName]) {
  console.error(`Error: Script "${scriptName}" not found`);
  console.error('Run "pnpm script list" to see available scripts');
  process.exit(1);
}

initiate();

const script = AVAILABLE_SCRIPTS[scriptName];
console.log(`Running: ${script.metadata.name}`);
console.log(`Category: ${script.metadata.category}`);
if (script.metadata.estimatedDuration) {
  console.log(`Estimated duration: ${script.metadata.estimatedDuration}`);
}

try {
  await script.run();
} catch (error) {
  console.error(`Error running script "${scriptName}":`, error);
  process.exit(1);
}
```

**Package.json script:**
```json
"scripts": {
  "script:list": "tsx src/runner.ts list"
}
```

### Phase 11c: Service Factory Pattern

Add factory pattern for creating service instances with proper DI:

**`services/ServiceFactory.ts`** - Service factory:
```typescript
import { injectable, inject } from 'inversify';
import { container } from '../di/container';
import { TYPES } from '../di/identifiers';
import { ContactService } from './contacts/ContactService';
import { ContactWizard } from './contacts/ContactWizard';
import { ContactSearchService } from './contacts/ContactSearchService';
import { Logger } from '../logging';

@injectable()
export class ServiceFactory {
  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  createContactService(): ContactService {
    this.logger.debug('Creating ContactService instance');
    return container.get<ContactService>(TYPES.ContactService);
  }

  createContactWizard(): ContactWizard {
    this.logger.debug('Creating ContactWizard instance');
    return container.get<ContactWizard>(TYPES.ContactWizard);
  }

  createContactSearchService(): ContactSearchService {
    this.logger.debug('Creating ContactSearchService instance');
    return container.get<ContactSearchService>(TYPES.ContactSearchService);
  }

  // Factory method for batch operations
  createBatchProcessor(): {
    contactService: ContactService;
    searchService: ContactSearchService;
  } {
    return {
      contactService: this.createContactService(),
      searchService: this.createContactSearchService(),
    };
  }

  // Factory method for interactive workflows
  createInteractiveWorkflow(): {
    wizard: ContactWizard;
    contactService: ContactService;
  } {
    return {
      wizard: this.createContactWizard(),
      contactService: this.createContactService(),
    };
  }
}
```

**Usage in scripts:**
```typescript
// scripts/interactive-contact-manager.ts
import { container } from '../di/container';
import { TYPES } from '../di/identifiers';
import { ServiceFactory } from '../services/ServiceFactory';

export async function interactiveContactManager(): Promise<void> {
  const factory = container.get<ServiceFactory>(TYPES.ServiceFactory);
  const { wizard } = factory.createInteractiveWorkflow();
  
  await wizard.addContactInteractive();
}
```

### Phase 11d: Health Check System

Add health check system for monitoring service health:

**`monitoring/HealthCheck.ts`** - Health check service:
```typescript
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/identifiers';
import { Logger } from '../logging';
import { AuthService } from '../services/auth/AuthService';

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: string;
}

@injectable()
export class HealthCheck {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.AuthService) private authService: AuthService
  ) {}

  async checkAll(): Promise<HealthStatus[]> {
    this.logger.info('Running health checks');
    
    const checks: HealthStatus[] = [
      await this.checkAuth(),
      await this.checkApiConnection(),
      await this.checkFileSystem(),
      await this.checkEnvironment(),
    ];

    const unhealthy = checks.filter(c => c.status === 'unhealthy');
    if (unhealthy.length > 0) {
      this.logger.error('Health check failed', { unhealthyServices: unhealthy });
    } else {
      this.logger.info('All health checks passed', { noPHI: true });
    }

    return checks;
  }

  private async checkAuth(): Promise<HealthStatus> {
    try {
      // Attempt to get auth client (doesn't make API call)
      await this.authService.authorize();
      return {
        service: 'authentication',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        service: 'authentication',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkApiConnection(): Promise<HealthStatus> {
    // Check if we can reach Google APIs
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/certs', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      
      return {
        service: 'google-api',
        status: response.ok ? 'healthy' : 'degraded',
        message: response.ok ? undefined : `HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        service: 'google-api',
        status: 'unhealthy',
        message: 'Cannot reach Google APIs',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkFileSystem(): Promise<HealthStatus> {
    // Check if we can write to logs directory
    try {
      const fs = await import('fs/promises');
      const testFile = 'logs/.health-check';
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      return {
        service: 'filesystem',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        service: 'filesystem',
        status: 'unhealthy',
        message: 'Cannot write to logs directory',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkEnvironment(): Promise<HealthStatus> {
    const requiredVars = ['CLIENT_ID', 'CLIENT_SECRET', 'PROJECT_ID'];
    const missing = requiredVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      return {
        service: 'environment',
        status: 'unhealthy',
        message: `Missing variables: ${missing.join(', ')}`,
        timestamp: new Date().toISOString(),
      };
    }
    
    return {
      service: 'environment',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
```

**Add health check script:**

**`scripts/health-check.ts`** - Health check script:
```typescript
import { container } from '../di/container';
import { TYPES } from '../di/identifiers';
import { HealthCheck } from '../monitoring/HealthCheck';

export async function healthCheck(): Promise<void> {
  const checker = container.get<HealthCheck>(TYPES.HealthCheck);
  const results = await checker.checkAll();
  
  console.log('\n=== Health Check Results ===\n');
  results.forEach(result => {
    const icon = result.status === 'healthy' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
    console.log(`${icon} ${result.service}: ${result.status}`);
    if (result.message) {
      console.log(`   ${result.message}`);
    }
  });
  console.log('');
  
  const failed = results.filter(r => r.status === 'unhealthy');
  if (failed.length > 0) {
    process.exit(1);
  }
}
```

**Register in scripts/index.ts:**
```typescript
'health-check': {
  metadata: {
    name: 'Health Check',
    description: 'Check system health and service connectivity',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    estimatedDuration: '5-10 seconds',
  },
  run: healthCheck,
},
```

**Package.json script:**
```json
"scripts": {
  "health": "tsx src/runner.ts health-check"
}
```

### Phase 12: Types Refactoring

Transform POC's `config.ts` + `settings.ts` into reference's `settings/` folder pattern:

**Current POC pattern:**
```typescript
// config.ts - loads env vars with dotenv, validates required vars
// settings.ts - application constants, port validation
```

**New unified pattern:**
```typescript
// settings/settings.ts - main SETTINGS object with all configs including OAuth
// settings/initiate.ts - runtime initialization, env validation
// settings/index.ts - exports
```

**Key improvements:**
- Eliminate separate `config.ts` - merge OAuth configuration into `settings/settings.ts`
- Move environment validation to `settings/initiate.ts`
- Keep all application configuration in one cohesive location
- Maintain dotenv loading but centralize validation logic
- Use port validation from `entities/port.schema.ts`

**Example structure:**
```typescript
// settings/settings.ts
export const SETTINGS = {
  auth: {
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    projectId: process.env.PROJECT_ID || '',
    authUri: process.env.AUTH_URI || '',
    tokenUri: process.env.TOKEN_URI || '',
    authProviderCertUrl: process.env.AUTH_PROVIDER_CERT_URL || '',
    redirectPort: parseInt(process.env.REDIRECT_PORT || '3000', 10),
    scopes: ['https://www.googleapis.com/auth/contacts'],
  },
  api: {
    pageSize: 1000,
    displayPageSize: 15,
    topContactsDisplay: 10,
    browserTimeout: 240000,
  },
  paths: {
    apiStatsFile: 'api-stats.json',
    tokenFile: 'token.json',
  }
};
```

### Phase 7: File Cleanup

**Remove from POC folder after migration:**
- `dist/` folder (build artifacts)
- Keep `.env` and `token.json` at root (in .gitignore)
- Keep `api-stats.json` at root (runtime data)

### Phase 16: Service Layer Refactoring (Dual-Mode Architecture)

Refactor POC services into a layered architecture supporting both interactive and programmatic modes:

#### **services/contacts/ContactService.ts** - Programmatic CRUD API

Core business logic for contact operations (no UI dependencies):

```typescript
import { Auth } from 'googleapis';
import { ContactInput, Contact, ContactFilter } from '../../types/contact';
import { DuplicateDetector } from './DuplicateDetector';
import { ContactValidator } from './ContactValidator';

export class ContactService {
  constructor(private auth: Auth.OAuth2Client) {}

  async createContact(data: ContactInput): Promise<Contact> {
    // Validate input
    // Check duplicates
    // Call Google People API
    // Track API usage
    // Return created contact
  }

  async updateContact(id: string, data: Partial<ContactInput>): Promise<Contact> {
    // Validate input
    // Update via Google People API
    // Track API usage
    // Return updated contact
  }

  async deleteContact(id: string): Promise<void> {
    // Delete via Google People API
    // Track API usage
  }

  async getContact(id: string): Promise<Contact> {
    // Fetch single contact
    // Track API usage
  }

  async listContacts(filter?: ContactFilter): Promise<Contact[]> {
    // Fetch contacts with optional filtering
    // Track API usage
  }

  async batchCreateContacts(contacts: ContactInput[]): Promise<Contact[]> {
    // Batch create for CSV imports, etc.
  }
}
```

#### **services/contacts/ContactWizard.ts** - Interactive Wizard

Interactive UI using inquirer (delegates to ContactService):

```typescript
import inquirer from 'inquirer';
import { ContactService } from './ContactService';
import { ContactInput } from '../../types/contact';
import { InputValidator } from '../../validators';

export class ContactWizard {
  constructor(
    private contactService: ContactService,
    private duplicateDetector: DuplicateDetector
  ) {}

  async addContactInteractive(): Promise<Contact> {
    // Prompt for labels
    // Prompt for company, name, job title
    // Check duplicates with user confirmation
    // Prompt for email, phone, LinkedIn
    // Show summary and allow editing
    // Delegate to ContactService.createContact()
  }

  async editContactInteractive(contact: Contact): Promise<Contact> {
    // Show current values
    // Allow field-by-field editing
    // Delegate to ContactService.updateContact()
  }

  async selectContactInteractive(contacts: Contact[]): Promise<Contact | null> {
    // Display contact list with pagination
    // Allow user to select
    // Return selected contact
  }
}
```

#### **services/contacts/ContactSearchService.ts** - Search & Filter

Advanced querying capabilities:

```typescript
export class ContactSearchService {
  constructor(private auth: Auth.OAuth2Client) {}

  async searchByName(query: string): Promise<Contact[]> {
    // Fuzzy search by name
  }

  async searchByEmail(email: string): Promise<Contact[]> {
    // Search by email
  }

  async filterByLabel(labels: string[]): Promise<Contact[]> {
    // Filter by contact groups
  }

  async filterByCompany(company: string): Promise<Contact[]> {
    // Filter by organization
  }

  async advancedSearch(criteria: SearchCriteria): Promise<Contact[]> {
    // Complex multi-field search
  }
}
```

#### **services/contacts/ContactValidator.ts** - Validation Logic

Centralized validation (extracted from inputValidator):

```typescript
import { ContactInput } from '../../types/contact';
import { InputValidator } from '../../validators';

export class ContactValidator {
  static validateContactInput(data: ContactInput): ValidationResult {
    // Validate all fields
    // Check minimum requirements
    // Check field limits
    // Return structured validation result
  }

  static validateForUpdate(data: Partial<ContactInput>): ValidationResult {
    // Validate partial data for updates
  }
}
```

#### **services/contacts/DuplicateDetector.ts** - Enhanced Duplicate Detection

Keep existing POC logic, enhance with additional methods:

```typescript
export class DuplicateDetector {
  // Existing methods from POC
  async checkDuplicateName(firstName: string, lastName: string): Promise<DuplicateMatch[]>
  async checkDuplicateEmail(email: string): Promise<DuplicateMatch[]>
  
  // NEW: Programmatic duplicate handling (no prompts)
  async findDuplicates(data: ContactInput): Promise<DuplicateMatch[]> {
    // Check all duplicate types, return results
  }

  // Existing: Interactive prompt
  async promptForDuplicateContinue(matches: DuplicateMatch[]): Promise<boolean> {
    // Show duplicates, ask user to continue
  }
}
```

#### **Migration from POC:**

**POC contactReader.ts → ContactService + ContactSearchService:**
- `readContacts()` → `ContactService.listContacts()`
- `displayContacts()` → Move display logic to ContactWizard or script

**POC contactWriter.ts → ContactService + ContactWizard:**
- `addContact()` → Split into:
  - `ContactWizard.addContactInteractive()` (UI)
  - `ContactService.createContact()` (business logic)
- `collectInitialInput()` → `ContactWizard` private method
- `showSummaryAndEdit()` → `ContactWizard` private method
- `createContact()` → `ContactService.createContact()`

**Benefits:**
- **Separation of concerns**: UI separated from business logic
- **Testability**: Business logic testable without UI
- **Reusability**: Same ContactService used by wizard and batch scripts
- **Extensibility**: Easy to add REST API, CLI commands, webhooks
- **Type safety**: Clear interfaces between layers

### Phase 12: Types Refactoring

Split POC's monolithic `types.ts` (129 lines) into focused type files:

**`src/types/contact.ts`** - Contact display and structure types
```typescript
EmailAddress, PhoneNumber, Website, ContactData
```

**`src/types/auth.ts`** - Authentication and credentials
```typescript
GoogleCredentials, TokenData, EnvironmentConfig
```

**`src/types/api.ts`** - Google People API types
```typescript
ContactName, ContactEmail, ContactPhone, ContactOrganization, 
ContactUrl, ContactMembership, CreateContactRequest, ContactGroup, ApiStats
```

**`src/types/validation.ts`** - Input validation types
```typescript
InitialContactData, EditableContactData
```

**`src/types/settings.ts`** - Settings configuration types
```typescript
Settings, AuthSettings, ApiSettings, PathSettings
```

**`src/types/index.ts`** - Central export
```typescript
export * from './contact';
export * from './auth';
export * from './api';
export * from './validation';
export * from './settings';
```

### Phase 13: Entities (Zod Schemas) Refactoring

Create new `entities/` folder for Zod validation schemas, extracting from `validators/validationSchemas.ts`:

**Create `regex/patterns.ts`** with all validation patterns:
```typescript
export class RegexPatterns {
  // Existing patterns
  static readonly HEBREW = /[\u0590-\u05FF]/;
  static readonly EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  static readonly EMAIL_CONSECUTIVE_DOTS = /\.\./;
  static readonly EMAIL_LEADING_DOT = /^\./;
  static readonly EMAIL_TRAILING_DOT = /\.@/;
  static readonly PHONE = /^[\d+\-\s()]+$/;
  static readonly PHONE_NON_DIGITS = /[\s\-()]/g;
  static readonly LABEL_NAME = /^[a-zA-Z0-9\s\-_]+$/;
  static readonly MULTIPLE_SPACES = /\s+/;
  static readonly NUMBER_GROUPING = /\B(?=(\d{3})+(?!\d))/g;
  static readonly MIXED_CONTENT = /[a-zA-Z0-9]/;

  // New patterns from validationSchemas.ts
  static readonly PHONE_ALLOWED_CHARS = /^[\d+\-\s()#*]+$/;
  static readonly PHONE_ONLY_SPECIAL = /^[\s\-+()#*]+$/;
  
  // Additional patterns for validation
  static readonly DIGITS_ONLY = /[^\d]/g;
}
```

**Create `regex/validationHelpers.ts`** for validation helper functions:
```typescript
import { RegexPatterns } from './patterns';

export class ValidationHelpers {
  static isValidEmail(email: string): boolean {
    if (!RegexPatterns.EMAIL.test(email)) return false;
    if (RegexPatterns.EMAIL_CONSECUTIVE_DOTS.test(email)) return false;
    if (RegexPatterns.EMAIL_LEADING_DOT.test(email)) return false;
    if (RegexPatterns.EMAIL_TRAILING_DOT.test(email)) return false;
    return true;
  }
}
```

**`src/entities/email.schema.ts`** - Email validation (using centralized regex)
```typescript
import { z } from 'zod';

export const emailSchema = z
  .string()
  .email('Invalid email address format')
  .max(254, 'Email address too long (max 254 characters)')
  .refine(
    (email: string) => !email.includes('..'),
    'Email cannot contain consecutive dots'
  );
```

**`src/entities/phone.schema.ts`** - Phone validation (using centralized regex)
```typescript
import { z } from 'zod';
import { RegexPatterns } from '../regex';

export const phoneSchema = z
  .string()
  .regex(
    RegexPatterns.PHONE_ALLOWED_CHARS,
    'Only numbers, +, -, spaces, parentheses, #, and * allowed'
  )
  .refine((phone: string) => {
    const digits = phone.replace(RegexPatterns.DIGITS_ONLY, '');
    return digits.length >= 1 && digits.length <= 100;
  }, 'Phone must contain 1-100 digits')
  .refine(
    (phone: string) => !RegexPatterns.PHONE_ONLY_SPECIAL.test(phone),
    'Phone cannot be only special characters'
  );
```

**`src/entities/linkedin.schema.ts`** - LinkedIn URL validation
```typescript
import { z } from 'zod';

export const linkedinUrlSchema = z
  .string()
  .url('Invalid URL format')
  .refine((url: string) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      const validHosts = ['linkedin.com', 'www.linkedin.com'];
      return validHosts.includes(parsed.hostname);
    } catch {
      return false;
    }
  }, 'Must be a valid LinkedIn URL')
  .refine((url: string) => {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const validPaths = ['/in/', '/company/', '/school/'];
    return validPaths.some((path: string) => parsed.pathname.includes(path));
  }, 'LinkedIn URL must contain a valid profile path (/in/, /company/, or /school/)');
```

**`src/entities/field.schema.ts`** - Field length validation
```typescript
import { z } from 'zod';

export const fieldLengthSchema = z
  .string()
  .max(1024, 'Field exceeds Google API limit of 1024 characters');
```

**`src/entities/port.schema.ts`** - Port validation
```typescript
import { z } from 'zod';

export const redirectPortSchema = z
  .number()
  .int('Port must be an integer')
  .min(1024, 'Port must be >= 1024')
  .max(65535, 'Port must be <= 65535');
```

**`src/entities/index.ts`** - Central export
```typescript
export { emailSchema } from './email.schema';
export { phoneSchema } from './phone.schema';
export { linkedinUrlSchema } from './linkedin.schema';
export { fieldLengthSchema } from './field.schema';
export { redirectPortSchema } from './port.schema';
```

**Migration notes:**
- First create `regex/` folder with patterns and helpers
- Create entity schema files that import patterns from `regex/patterns`
- Remove `validators/validationSchemas.ts` after migration
- Update `validators/inputValidator.ts` to import from `entities/`
- Update `settings/initiate.ts` to import `redirectPortSchema` from `entities/`
- All regex patterns now have single source of truth in `regex/patterns.ts`

### Phase 14: Index Files and Import Conventions

**Every folder MUST have an `index.ts` barrel export file:**

**`src/regex/index.ts`**
```typescript
export * from './patterns';
export * from './validationHelpers';
```

**`src/cache/index.ts`**
```typescript
export * from './contactCache';
```

**`src/parsers/index.ts`**
```typescript
export * from './nameParser';
export * from './textParser';
```

**`src/managers/index.ts`**
```typescript
export * from './portManager';
```

**`src/flow/index.ts`**
```typescript
export * from './statusBar';
```

**`src/validators/index.ts`**
```typescript
export * from './inputValidator';
```

**`src/services/contacts/index.ts`**
```typescript
export * from './ContactService';
export * from './ContactWizard';
export * from './ContactSearchService';
export * from './ContactValidator';
export * from './DuplicateDetector';
```

**`src/services/auth/index.ts`**
```typescript
export * from './AuthService';
```

**`src/services/api/index.ts`**
```typescript
export * from './ApiTracker';
export * from './RetryHandler';
```

**`src/services/index.ts`**
```typescript
export * from './contacts';
export * from './auth';
export * from './api';
```

**`src/scripts/index.ts`**
```typescript
export * from './interactive-contact-manager';
export * from './import-linkedin-contacts';
```

**Import Convention Rules:**

❌ **NEVER import with `/index.ts`:**
```typescript
// BAD - explicit index.ts
import { RegexPatterns } from '../regex/index.ts';
import { ContactService } from '../services/contacts/index.ts';
```

✅ **ALWAYS import from folder (implicit index):**
```typescript
// GOOD - implicit index.ts
import { RegexPatterns } from '../regex';
import { ContactService } from '../services/contacts';
```

✅ **Or import from specific file:**
```typescript
// ALSO GOOD - specific file
import { RegexPatterns } from '../regex/patterns';
import { ContactService } from '../services/contacts/ContactService';
```

**Benefits:**
- Clean imports without repetitive `/index.ts`
- Barrel exports provide single import point per domain
- Easy to switch between folder imports vs specific file imports
- TypeScript/Node automatically resolves `index.ts`

### Phase 15: Documentation Maintenance

Following the reference project pattern, maintain comprehensive documentation:

#### **Root-Level Documentation Files:**

**1. `README.md`** - Project overview and quick start

**2. `INSTRUCTIONS.md`** - Detailed setup and usage  
Includes: Setup instructions, configuration, running scripts, development commands

**3. `CHANGELOG.md`** - Version history  
Track all significant changes, breaking changes, and new features

**4. `CONTRIBUTING.md`** - Contribution guidelines  
Code style, testing requirements, pull request process

**5. `LICENSE`** - MIT License (update copyright to 2026)

#### **Source Documentation (`src/docs/`):**

- `INFRASTRUCTURE_MIGRATION_PLAN.md` - This document
- POC documentation files (VALIDATION_RULES.md, WINDOWS_SETUP.md, etc.)
- Technical documentation

#### **Package.json `files` Field:**

```json
"files": [
  ".vscode",
  "dist",
  "src",
  ".gitignore",
  ".prettierrc",
  "eslint.config.mjs",
  "CONTRIBUTING.md",
  "LICENSE",
  "INSTRUCTIONS.md",
  "CHANGELOG.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "README.md",
  "tsconfig.json",
  "vitest.config.ts"
]
```

**Documentation Maintenance Rules:**
1. Update `CHANGELOG.md` for every significant change
2. Keep `INSTRUCTIONS.md` in sync with available scripts
3. Update `README.md` when adding new features
4. Document breaking changes prominently
5. Include author contact information

## Key Files to Create/Modify

### New Files in src/
Note: All files follow camelCase naming convention matching POC

1. `src/runner.ts` - Script runner adapted from reference
2. `src/settings/initiate.ts` - Initialize and validate settings, detect environment
3. `src/settings/settings.ts` - Main SETTINGS object with environment field
4. `src/settings/index.ts` - Export settings
5. `src/types/contact.ts` - Contact-related types
6. `src/types/auth.ts` - Authentication types
7. `src/types/api.ts` - API-related types
8. `src/types/validation.ts` - Validation types
9. `src/types/settings.ts` - Settings types
10. `src/types/error.ts` - Error types (AppError, ErrorCode)
11. `src/types/logger.ts` - Logger types (LogLevel, LogEntry)
12. `src/types/di.ts` - Dependency injection types
13. `src/types/index.ts` - Export all types
14. `src/entities/email.schema.ts` - Email Zod schema
15. `src/entities/phone.schema.ts` - Phone Zod schema
16. `src/entities/linkedin.schema.ts` - LinkedIn URL Zod schema
17. `src/entities/field.schema.ts` - Field length Zod schema
18. `src/entities/port.schema.ts` - Port Zod schema
19. `src/entities/index.ts` - Export all schemas
20. `src/constants/apiConstants.ts` - API limits, timeouts, rate limits
21. `src/constants/uiConstants.ts` - UI strings, messages, prompts
22. `src/constants/validationConstants.ts` - Validation limits
23. `src/constants/index.ts` - Export all constants
24. `src/errors/errorCodes.ts` - Error code enum (camelCase)
25. `src/errors/appError.ts` - Custom error class (camelCase)
26. `src/errors/errorMessages.ts` - Centralized error messages
27. `src/errors/index.ts` - Export error utilities
28. `src/logging/logger.ts` - Logger class with levels (camelCase)
29. `src/logging/logConfig.ts` - Log configuration
30. `src/logging/index.ts` - Export logger
31. `src/di/identifiers.ts` - Service identifiers/symbols
32. `src/di/container.ts` - InversifyJS container setup
33. `src/di/index.ts` - Export container
34. `src/regex/patterns.ts` - Centralized regex patterns
35. `src/regex/validationHelpers.ts` - Regex-based validation helpers
36. `src/regex/index.ts` - Export regex utilities
37. `src/cache/contactCache.ts` - Contact caching with TTL
38. `src/cache/index.ts` - Export cache utilities
39. `src/parsers/nameParser.ts` - Name parsing with title detection
40. `src/parsers/textParser.ts` - Text processing utilities
41. `src/parsers/index.ts` - Export parsers
42. `src/managers/portManager.ts` - Port management
43. `src/managers/index.ts` - Export managers
44. `src/flow/statusBar.ts` - CLI status bar UI
45. `src/flow/index.ts` - Export flow components
46. `src/services/contacts/contactService.ts` - Programmatic CRUD API (camelCase)
47. `src/services/contacts/contactWizard.ts` - Interactive wizard (placeholder)
48. `src/services/contacts/contactSearchService.ts` - Search & filter (placeholder)
49. `src/services/contacts/contactValidator.ts` - Validation logic (placeholder)
50. `src/services/contacts/duplicateDetector.ts` - Migrated from POC (camelCase)
51. `src/services/contacts/index.ts` - Export contact services
52. `src/services/auth/authService.ts` - Migrated from POC (camelCase)
53. `src/services/auth/index.ts` - Export auth services
54. `src/services/api/apiTracker.ts` - Migrated from POC (camelCase)
55. `src/services/api/retryHandler.ts` - Migrated from POC utils (camelCase)
56. `src/services/api/rateLimitMonitor.ts` - Rate limit warnings (camelCase)
57. `src/services/api/index.ts` - Export API services
58. `src/services/serviceFactory.ts` - Service factory with DI (placeholder)
59. `src/services/index.ts` - Root service barrel export
60. `src/monitoring/healthCheck.ts` - Health check system (camelCase)
61. `src/monitoring/index.ts` - Export monitoring utilities
62. `src/types/script.ts` - Script metadata types
63. `src/scripts/index.ts` - Script registry with metadata
64. `src/scripts/interactive-contact-manager.ts` - Interactive wizard script
65. `src/scripts/import-linkedin-contacts.ts` - Example batch import script (placeholder)
66. `src/scripts/health-check.ts` - Health check script (placeholder)

### Modified Files
1. `package.json` - Merge scripts, deps (add inversify, reflect-metadata), metadata
2. `tsconfig.json` - Merge compiler options, add decorator support
3. `.gitignore` - Merge ignore patterns, add logs/ folder
4. `README.md` - Update with new structure
5. `src/index.ts` - Update to use new settings pattern and DI container
6. `validators/inputValidator.ts` - Update imports to use schemas from `entities/` and patterns from `regex/`
7. `.env` - Rename to `.env.test`, create `.env.production`

### New Root Files
1. `eslint.config.mjs` - From reference
2. `.prettierrc` - From reference
3. `pnpm-workspace.yaml` - From reference
4. `CONTRIBUTING.md` - Adapted from reference
5. `LICENSE` - From reference (update year)
6. `CHANGELOG.md` - Create for version tracking (from reference pattern)
7. `INSTRUCTIONS.md` - Create for setup and usage (from reference pattern)
8. `.env.test` - Test environment configuration (current POC credentials)
9. `.env.production` - Production environment configuration (empty for now)
10. `.vscode/settings.json` - From reference
11. `.vscode/extensions.json` - From reference
12. `misc/error_index.txt` - Error code documentation (from reference pattern)

## Implementation Checklist

- [x] Migrate root configuration files (eslint, prettier, gitignore with logs/, tsconfig with decorators)
- [x] Create .vscode folder with settings and extensions
- [x] Rename all files to camelCase format matching POC convention
- [ ] Merge package.json with scripts, dependencies (add inversify, reflect-metadata), and metadata
- [ ] Create environment files:
  - [ ] Rename .env to .env.test (current POC credentials)
  - [ ] Create .env.production (empty for now)
- [ ] Create settings/ folder with environment detection:
  - [ ] settings.ts with environment field
  - [ ] initiate.ts with environment detection and .env loading
  - [ ] index.ts
- [ ] Split types.ts into types/ folder with separate files:
  - [ ] contact.ts, auth.ts, api.ts, validation.ts, settings.ts
  - [ ] error.ts, logger.ts, di.ts (new types)
- [ ] Create error handling infrastructure:
  - [ ] errors/ErrorCodes.ts with error code enum
  - [ ] errors/AppError.ts custom error class
  - [ ] errors/errorMessages.ts centralized messages
  - [ ] misc/error_index.txt documentation
- [ ] Create logging infrastructure:
  - [ ] logging/Logger.ts with log levels
  - [ ] logging/logConfig.ts configuration
  - [ ] Update .gitignore to exclude logs/
- [ ] Set up dependency injection with InversifyJS:
  - [ ] Install inversify and reflect-metadata
  - [ ] di/identifiers.ts service symbols
  - [ ] di/container.ts container setup
  - [ ] Update tsconfig.json for decorators
- [ ] Create constants/ folder:
  - [ ] apiConstants.ts (rate limits, timeouts)
  - [ ] uiConstants.ts (messages, prompts)
  - [ ] validationConstants.ts (limits)
- [ ] Create rate limit monitoring:
  - [ ] services/api/RateLimitMonitor.ts
- [ ] Create domain-specific folders (replacing utils/):
  - [ ] regex/ folder with patterns.ts, validationHelpers.ts, and index.ts
  - [ ] cache/ folder with contactCache.ts and index.ts
  - [ ] parsers/ folder with nameParser.ts, textParser.ts, and index.ts
  - [ ] managers/ folder with portManager.ts and index.ts
  - [ ] flow/ folder with statusBar.ts and index.ts
- [ ] Create entities/ folder and split validationSchemas.ts into individual schema files (with index.ts)
- [ ] Update entity schemas to import regex patterns from regex/ (not regex/patterns)
- [ ] Update validators/inputValidator.ts to import from entities/ and regex/ (without /index.ts)
- [ ] Refactor services into layered architecture with DI:
  - [ ] Add @injectable decorators to all services
  - [ ] Create services/contacts/ folder with index.ts
  - [ ] Extract ContactService from POC (with DI)
  - [ ] Create ContactWizard (with DI)
  - [ ] Create ContactSearchService (with DI)
  - [ ] Create ContactValidator (with DI)
  - [ ] Migrate DuplicateDetector (with DI)
  - [ ] Create services/auth/ folder with index.ts and migrate AuthService (with DI)
  - [ ] Create services/api/ folder with index.ts, ApiTracker, RetryHandler, RateLimitMonitor (with DI)
  - [ ] Create services/index.ts (root service barrel export)
  - [ ] Register all services in DI container
- [ ] Create runner.ts for extensible script execution with --list support
- [ ] Create scripts/ folder with metadata-based registration:
  - [ ] scripts/index.ts with AVAILABLE_SCRIPTS registry and metadata
  - [ ] Add Script and ScriptMetadata types
  - [ ] scripts/interactive-contact-manager.ts (migrate from POC index.ts)
  - [ ] scripts/import-linkedin-contacts.ts (example batch script)
  - [ ] scripts/health-check.ts (health check script)
  - [ ] Enhance runner.ts to show metadata and support --list
- [ ] Create service factory pattern:
  - [ ] services/ServiceFactory.ts with factory methods
  - [ ] Register ServiceFactory in DI container
- [ ] Create health check system:
  - [ ] monitoring/HealthCheck.ts with service health checks
  - [ ] Add auth, API, filesystem, environment checks
  - [ ] Register HealthCheck in DI container
- [ ] Update src/index.ts to use DI container and new settings pattern
- [ ] Replace console.log with Logger throughout codebase
- [ ] Replace Error with AppError with error codes throughout codebase
- [ ] Verify all imports follow convention (no /index.ts in import paths)
- [ ] Migrate and merge documentation files:
  - [ ] Create CHANGELOG.md for version tracking
  - [ ] Create INSTRUCTIONS.md for setup and usage
  - [ ] Update README.md with new architecture
  - [ ] Migrate POC docs to src/docs/
  - [ ] Update CONTRIBUTING.md with project-specific guidelines
- [ ] Add LICENSE and CONTRIBUTING.md from reference
- [ ] Ensure package.json includes all metadata fields (repository, keywords, author, contributors, files)
- [ ] Run validation commands (install, build, lint, format, test)

## Migration Validation

After migration, validate:
1. `pnpm install` - All dependencies install correctly
2. `pnpm build` - TypeScript compiles without errors
3. `pnpm lint` - No linting errors in migrated code
4. `pnpm format:check` - Code formatting is consistent
5. `pnpm test` - All tests pass
6. `pnpm start` - Application runs with new structure
7. Verify `.env` and `token.json` still work at root level

## Notes

- POC-specific files (`.env`, `token.json`, `api-stats.json`, `SETUP.md`) remain at workspace root
- All source code stays in `src/` folder following reference structure
- Testing infrastructure (vitest) is preserved despite reference project not having it
- Documentation is consolidated in `src/docs/`
- The `dist/` folder is git-ignored and not migrated
- The migration maintains backward compatibility with existing POC functionality

## Architecture Summary

### Domain-Driven Folder Organization

The new architecture eliminates the generic "utils" folder in favor of purposeful, domain-specific folders:

| Folder | Purpose | Examples |
|--------|---------|----------|
| **regex/** | All regex patterns & pattern-based validation | `patterns.ts`, `validationHelpers.ts` |
| **cache/** | Caching mechanisms & strategies | `contactCache.ts` (24h TTL) |
| **parsers/** | Data parsing & transformation | `nameParser.ts`, `textParser.ts` |
| **managers/** | System resource management | `portManager.ts` |
| **flow/** | CLI UI components & user interaction | `statusBar.ts`, progress indicators |
| **validators/** | Input validation logic | `inputValidator.ts` using Zod schemas |
| **entities/** | Zod validation schemas | `email.schema.ts`, `phone.schema.ts` |
| **services/** | Business logic & external integrations | `contacts/`, `auth/`, `api/` |
| **scripts/** | Executable scripts for different workflows | Interactive wizards, batch imports |

**Philosophy**: Each folder answers "What does this code do?" not "How generic is it?"

### Before Migration (POC):
```
poc/
├── src/
│   ├── index.ts                  # Interactive wizard only
│   ├── config.ts                 # Environment variables
│   ├── settings.ts               # App settings
│   ├── types.ts                  # All types in one file
│   ├── services/
│   │   ├── authService.ts
│   │   ├── contactReader.ts      # Mixed UI + business logic
│   │   ├── contactWriter.ts      # Mixed UI + business logic
│   │   ├── duplicateDetector.ts
│   │   └── apiTracker.ts
│   ├── validators/
│   │   ├── validationSchemas.ts  # All Zod schemas
│   │   └── inputValidator.ts
│   └── utils/
```

### After Migration (Clean Architecture):
```
src/
├── runner.ts                     # Script execution framework
├── settings/                     # Unified configuration
├── types/                        # Domain types by concern
├── entities/                     # Zod validation schemas
├── regex/                        # Centralized regex patterns & helpers
├── cache/                        # Caching strategies
├── parsers/                      # Data parsing & transformation
├── managers/                     # System resource management
├── flow/                         # CLI UI components
├── validators/                   # Input validation logic
├── services/
│   ├── contacts/                 # Dual-mode contact management
│   │   ├── ContactService.ts     # Programmatic API (batch operations)
│   │   ├── ContactWizard.ts      # Interactive UI (user wizards)
│   │   ├── ContactSearchService.ts
│   │   ├── DuplicateDetector.ts
│   │   └── ContactValidator.ts
│   ├── auth/                     # OAuth & authentication
│   └── api/                      # API tracking & retry logic
└── scripts/                      # Extensible script library
    ├── interactive-contact-manager.ts  # For manual operations
    └── import-linkedin-contacts.ts     # For batch imports
```

### Key Improvements:
1. **Separation of Concerns**: UI separated from business logic
2. **Dual-Mode Operations**: Interactive + Programmatic APIs
3. **Extensibility**: Easy to add new scripts with different data flows
4. **Testability**: Business logic testable without UI dependencies
5. **Type Safety**: Clear domain boundaries with focused type files
6. **Validation**: Centralized schemas and patterns
7. **Maintainability**: Small, focused files with single responsibilities
8. **Domain-Driven Design**: Folders organized by purpose, not generality (no more "utils" dumping ground)

## Use Cases

### Interactive Mode (Manual Operations):
```typescript
// scripts/interactive-contact-manager.ts
const wizard = new ContactWizard(contactService, duplicateDetector);
await wizard.addContactInteractive();  // User prompts
```

### Programmatic Mode (Batch Operations):
```typescript
// scripts/import-linkedin-contacts.ts
const service = new ContactService(auth);
const contacts = parseCSV('linkedin-contacts.csv');
await service.batchCreateContacts(contacts);  // No prompts
```

### Hybrid Mode (Mix of Both):
```typescript
// scripts/sync-contacts.ts
const contacts = await service.listContacts();
const selected = await wizard.selectContactInteractive(contacts);  // User selects
await service.updateContact(selected.id, enrichedData);  // Programmatic update
```

## Reference

- Reference project: `/Users/orassayag/Repos/event-dates-calendar-ts`
- Current POC: `/Users/orassayag/Repos/events-and-people-syncer/code/poc`
- Migration target: `/Users/orassayag/Repos/events-and-people-syncer/code/src`
