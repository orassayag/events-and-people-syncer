# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dry-Mode Feature** - Safe by default read-only mode for testing
  - Global `dryMode` setting (readonly) defaults to `true` to prevent accidental data changes
  - Environment variable `DRY_MODE` accepts `false`, `0`, `no`, `n` to disable (opt-out flag)
  - All Google People API write operations are logged with `[DRY-MODE]` prefix at info level
  - Mock contacts tracked in DuplicateDetector's `recentlyModifiedContacts` for duplicate detection
  - Mock contact groups prefixed with `[DRY-MODE]` in name
  - API statistics prefixed with `[DRY MODE]` when dry-mode enabled
  - Success messages include `[DRY MODE]` prefix in dry-mode
  - Confirmation prompt at startup with `--yes` or `-y` flag to skip
  - Complete mock responses with all fields to prevent downstream issues
  - Unique ID generation for mock resources to prevent collisions
  - Try-catch wrapping for duplicate detector tracking (non-blocking failures)
  - Comprehensive unit tests for all affected services
  - Integration tests for full dry-mode sync scenarios
  - Documentation in README.md with usage examples
- ESC key navigation support across all CLI prompts
  - Press ESC at any prompt to navigate back to the previous menu
  - Press ESC at top-level menus to exit the application
  - ESC hints added to all prompt messages
  - ESC feedback messages for better UX
- `promptWithEscape` utility module with result-based pattern
  - `selectWithEscape`, `inputWithEscape`, `confirmWithEscape`, `checkboxWithEscape` wrapper functions
  - `EscapeKeyManager` singleton for managing keypress detection
  - Raw mode keypress detection with readline
  - TTY detection and graceful fallback for non-TTY environments
  - Comprehensive unit tests for ESC navigation

### Changed

- Migrated from `inquirer` v9 to `@inquirer/prompts` v8
- Replaced error-throwing pattern with result object pattern `{ escaped: boolean, value?: T }`
- Eliminated try-catch blocks for ESC handling (reduced code complexity by ~50%)
- All 68 prompts across 7 production files migrated to use ESC-aware wrappers
- Improved user experience with consistent ESC behavior throughout the application

### Removed

- `inquirer` v9.3.8 package dependency
- `@types/inquirer` v9.0.9 package dependency
- `UserCancelledError` class (replaced with `EscapeSignal` and result-based checks)

## [1.0.0] - 2026-03-11

### Added

- Complete infrastructure migration from POC to production-ready codebase
- InversifyJS dependency injection system
- Structured logging with Logger service
- Error handling with unique error codes
- Environment detection (test/production)
- Domain-driven folder organization
- Health check system
- Rate limit monitoring
- Script runner with metadata
- Comprehensive type system split by domain
- Entity validation schemas with Zod
- Constants management
- Documentation (CONTRIBUTING.md, LICENSE, CHANGELOG.md, INSTRUCTIONS.md)

### Changed

- Migrated from monolithic types.ts to domain-specific type files
- Replaced console.log with structured Logger
- Merged config.ts and settings.ts into unified settings/ folder
- Split validation schemas into individual entity files
- Eliminated utils/ folder in favor of domain-specific folders

### Infrastructure

- TypeScript with strict mode and decorator support
- ESLint and Prettier for code quality
- Vitest for testing
- PNPM for package management
- VSCode configuration for consistent development
