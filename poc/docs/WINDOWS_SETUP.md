# Windows Setup Guide

This guide covers Windows-specific setup and known differences for the Google People API POC.

## Prerequisites

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **pnpm** - Install globally via: `npm install -g pnpm`

## Installation

1. Clone the repository
2. Navigate to the `poc` directory
3. Run `pnpm install` to install dependencies
4. Copy `.env.example` to `.env` and configure your Google OAuth credentials

## Port Management

The application automatically detects and kills processes on port 3000 using:
- **macOS/Linux**: `lsof` command
- **Windows**: `netstat` and `taskkill` commands

No manual configuration is needed. The port manager will automatically use the correct commands for your platform.

## Known Issues

### PowerShell Execution Policy

If you encounter execution policy errors when running scripts, you can:

1. **Temporarily bypass** (for one command):
   ```powershell
   powershell -ExecutionPolicy Bypass -File script.ps1
   ```

2. **Change policy** (requires admin):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

### Terminal Colors and ANSI Support

Some Windows terminals may not fully support ANSI escape sequences used for colors and formatting.

**Recommended Solutions:**
- Use **Windows Terminal** (recommended) - Download from Microsoft Store
- Use **Git Bash** or **WSL2** for better compatibility
- For Command Prompt, enable ANSI support via registry or use Windows 10+

### Path Separators

The application uses Node.js `path.join()` which automatically handles path separators correctly on Windows (`\`) and Unix-like systems (`/`).

## Testing

Run tests normally:
```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
```

## Running the Application

```bash
# Standard mode
pnpm start

# Verbose mode (accessibility-friendly)
pnpm start:verbose

# Development mode with auto-reload
pnpm dev
```

## Troubleshooting

### Port Already in Use

If you see "Port 3000 is already in use":
1. The application will automatically try to kill the process
2. If automatic cleanup fails, manually find and kill the process:
   ```cmd
   netstat -ano | findstr :3000
   taskkill /F /PID <PID>
   ```

### OAuth Timeout

The OAuth flow has a 10-minute timeout. If authentication doesn't complete within this time:
1. Restart the application
2. Complete the authentication promptly
3. Ensure your browser opens automatically (or manually visit the URL shown)

### API Rate Limits

Google People API has rate limits:
- **Read quota**: 300 requests per minute
- **Write quota**: 60 requests per minute

The application tracks API usage and displays counters. If you hit rate limits, wait a few minutes before retrying.
