import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { parse } from 'url';
import { exec } from 'child_process';
import { injectable } from 'inversify';
import type {
  GoogleCredentials,
  TokenData,
  OAuth2Client,
  TokenValidationStatus,
  ScopeValidationResult,
} from '../../types';
import { SETTINGS } from '../../settings';
import { PortManager } from '../../managers';
import { Logger } from '../../logging';
import { AppError, ErrorCode } from '../../errors';

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------
const NETWORK_RETRY_ATTEMPTS = 3;
const NETWORK_RETRY_DELAY_MS = 5_000; // 5 s between attempts
const NETWORK_RETRY_BACKOFF_FACTOR = 2; // 5s → 10s → 20s

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Network-wait configuration
// ---------------------------------------------------------------------------
const NETWORK_WAIT_TIMEOUT_MS = 5 * 60_000; // give up after 5 minutes
const NETWORK_WAIT_POLL_MS = 15_000; // re-check every 15 seconds
const NETWORK_PROBE_URL = 'https://oauth2.googleapis.com/token';

async function waitForNetwork(
  logger: Logger,
  timeoutMs = NETWORK_WAIT_TIMEOUT_MS,
  pollMs = NETWORK_WAIT_POLL_MS
): Promise<boolean> {
  const { lookup } = await import('dns/promises');
  const host = new URL(NETWORK_PROBE_URL).hostname;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await lookup(host);
      return true;
    } catch {
      const remaining = Math.round((deadline - Date.now()) / 1000);
      logger.warn(
        `Network unavailable — retrying in ${pollMs / 1000}s ` +
          `(giving up in ${remaining}s)`
      );
      await sleep(Math.min(pollMs, deadline - Date.now()));
    }
  }
  return false;
}

export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  logger: Logger,
  attempts = NETWORK_RETRY_ATTEMPTS,
  baseDelayMs = NETWORK_RETRY_DELAY_MS
): Promise<T> {
  let delayMs = baseDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isNetwork =
        error instanceof Error &&
        [
          'enotfound',
          'econnrefused',
          'econnreset',
          'etimedout',
          'esockettimedout',
          'eai_again',
          'enetunreach',
          'getaddrinfo',
          'failed to fetch',
          'network request failed',
        ].some((code) => error.message.toLowerCase().includes(code));

      if (!isNetwork) throw error;

      logger.warn(
        `API call failed (network error) on attempt ${attempt}/${attempts}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
      if (attempt < attempts) {
        logger.info(`Retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
        delayMs *= NETWORK_RETRY_BACKOFF_FACTOR;
      }
    }
  }

  throw lastError;
}

@injectable()
export class AuthService {
  private oAuth2Client?: OAuth2Client;
  private server?: Server;
  private logger: Logger = new Logger('AuthService');
  private saveTokenQueue: Promise<void> = Promise.resolve();
  private isRefreshing: boolean = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async ensureValidAuth(): Promise<OAuth2Client> {
    this.logger.debug('Ensuring valid authentication');
    const credentials: GoogleCredentials = this.loadCredentials();
    this.oAuth2Client = this.createOAuth2Client(credentials);

    const token: TokenData | null = await this.loadToken();
    if (token) {
      if (!token.refresh_token) {
        this.logger.warn(
          'Stored token is missing refresh_token — deleting and re-authenticating'
        );
        await this.deleteToken();
        await this.getNewToken();
        return this.oAuth2Client;
      }

      this.oAuth2Client.setCredentials(token);

      const EXPIRY_BUFFER_MS = 5 * 60 * 1_000; // 5 minutes
      const now = Date.now();
      let isExpired: boolean;

      if (!token.expiry_date) {
        this.logger.debug(
          'Token has no expiry_date — skipping proactive refresh'
        );
        isExpired = false;
      } else {
        const expiresInMs = token.expiry_date - now;
        const expiresInMin = Math.round(expiresInMs / 60_000);
        isExpired = expiresInMs <= EXPIRY_BUFFER_MS;
        this.logger.debug(
          `Token expiry check: expires in ${expiresInMin} min — ${isExpired ? 'needs refresh' : 'still valid'}`
        );
      }

      if (isExpired && token.refresh_token) {
        this.logger.info(
          'Token expired or nearing expiry - attempting auto-refresh'
        );

        const refreshResult = await this.refreshWithRetry();

        if (refreshResult === 'network_error') {
          this.logger.warn(
            'Token refresh failed due to network error — waiting for network before retrying...'
          );

          const networkCameUp = await waitForNetwork(this.logger);
          if (networkCameUp) {
            this.logger.info(
              'Network is now available — retrying token refresh'
            );
            const retryResult = await this.refreshWithRetry();
            if (retryResult === 'success') {
              this.logger.info('Token refresh succeeded after network wait');
              return this.oAuth2Client;
            }
            if (retryResult === 'auth_error') {
              // FIX: do NOT delete the token before re-auth; getNewToken will
              // merge the new tokens, preserving the refresh_token if Google
              // doesn't return a new one (which it won't unless prompt=consent).
              await this.reAuthenticate();
              return this.oAuth2Client;
            }
          }

          this.logger.error(
            'Network did not become available within the wait window. ' +
              'Aborting run — Task Scheduler will retry on the next trigger.'
          );
          throw new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Cannot refresh token: network unreachable after waiting. ' +
              'The run will be retried by Task Scheduler.'
          );
        } else if (refreshResult === 'auth_error') {
          // FIX: Log the situation clearly. The refresh_token is dead (revoked
          // or superseded). We MUST re-authenticate — but we should NOT force
          // prompt=consent, because that rotates the refresh_token again and
          // creates the same problem next time. Instead, deleteToken() is called
          // inside reAuthenticate() only after the new token is safely saved.
          this.logger.warn(
            'Refresh token rejected by Google (invalid_grant). ' +
              'This means the refresh token was revoked, superseded by a newer one, ' +
              'or the Google account had a security event (password change, ' +
              'signing into a different account, etc.). ' +
              'Re-authenticating WITHOUT forcing consent to avoid token rotation.',
            {
              error:
                this.lastAuthError instanceof Error
                  ? this.lastAuthError.message
                  : String(this.lastAuthError),
            }
          );
          await this.reAuthenticate();
          return this.oAuth2Client;
        } else {
          this.logger.info('Token auto-refresh successful');
          return this.oAuth2Client;
        }
      }

      const validationStatus: TokenValidationStatus =
        await this.validateTokenWithNetworkAwareness();

      this.logger.debug('Token validation status', {
        status: validationStatus,
      });

      if (validationStatus === 'valid') {
        this.logger.debug('Authentication is valid');
        return this.oAuth2Client;
      }

      if (validationStatus === 'network_error') {
        this.logger.warn(
          'Token validation skipped - network unreachable. ' +
            'Proceeding with cached token.'
        );
        return this.oAuth2Client;
      }

      if (validationStatus === 'invalid') {
        if (this.isHeadlessContext()) {
          throw new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Token is invalid and cannot be refreshed interactively in a ' +
              'headless/scheduled context. Please run the app manually once ' +
              'to re-authenticate, then reschedule the task.'
          );
        }
        this.logger.warn('Token is invalid or expired - re-authenticating');
        // FIX: use reAuthenticate() instead of deleteToken() + getNewToken()
        // so the new token is merged before the old one is removed.
        await this.reAuthenticate();
      }
    } else {
      this.logger.info('Token is missing - starting initial authentication');
    }

    if (this.isHeadlessContext()) {
      throw new AppError(
        ErrorCode.AUTH_INVALID_TOKEN,
        'No valid token found and running in headless/scheduled context. ' +
          'Please run the app manually once to authenticate.'
      );
    }

    await this.getNewToken();
    return this.oAuth2Client;
  }

  validateToken(): Promise<TokenValidationStatus> {
    return this.validateTokenWithNetworkAwareness();
  }

  async validateScopes(
    requiredScopes: string[]
  ): Promise<ScopeValidationResult> {
    const token: TokenData | null = await this.loadToken();
    if (!token || !token.scope) {
      return {
        hasAllScopes: false,
        missingScopes: requiredScopes,
        grantedScopes: [],
      };
    }
    const grantedScopes = token.scope.split(' ').filter((s) => s.length > 0);
    const missingScopes = requiredScopes.filter(
      (required) => !grantedScopes.includes(required)
    );
    return {
      hasAllScopes: missingScopes.length === 0,
      missingScopes,
      grantedScopes,
    };
  }

  async ensureScopes(requiredScopes: string[]): Promise<OAuth2Client> {
    const validation = await this.validateScopes(requiredScopes);
    if (!validation.hasAllScopes) {
      this.logger.warn(
        `Token missing required scopes: ${validation.missingScopes.join(', ')}`
      );
      await this.deleteToken();
      const credentials: GoogleCredentials = this.loadCredentials();
      this.oAuth2Client = this.createOAuth2Client(credentials);
      await this.getNewToken();
    }
    return this.ensureValidAuth();
  }

  async authorize(): Promise<OAuth2Client> {
    const credentials: GoogleCredentials = this.loadCredentials();
    this.oAuth2Client = this.createOAuth2Client(credentials);
    const token: TokenData | null = await this.loadToken();
    if (token) {
      if (!token.refresh_token) {
        this.logger.warn(
          'Token file is missing refresh_token - deleting and re-authorizing'
        );
        await this.deleteToken();
        await this.getNewToken();
        return this.oAuth2Client;
      }
      this.oAuth2Client.setCredentials(token);
      return this.oAuth2Client;
    }
    await this.getNewToken();
    return this.oAuth2Client;
  }

  // -------------------------------------------------------------------------
  // Re-authentication (safe replacement for deleteToken + getNewToken)
  // -------------------------------------------------------------------------

  /**
   * FIX: The core of the token rotation problem.
   *
   * Old flow (BROKEN):
   *   deleteToken() → getNewToken() → loadToken() returns null → isFirstAuth=true
   *   → prompt=consent → Google rotates refresh_token → old token (in memory) revoked
   *
   * New flow (FIXED):
   *   getNewToken() → token is saved (merged with existing) → deleteToken() is
   *   never called before auth completes.
   *
   * We only force prompt=consent when there is genuinely no refresh_token at all.
   * After an invalid_grant, we still have the (now-dead) refresh_token on disk,
   * so isFirstAuth=false, and Google issues a new access token without rotating
   * the refresh_token.
   *
   * If the user completes auth without Google returning a new refresh_token, the
   * saveTokenImpl merge logic preserves the one already on disk. If Google DOES
   * return a new one (token rotation), it gets saved properly.
   */
  private async reAuthenticate(): Promise<void> {
    if (this.isHeadlessContext()) {
      throw new AppError(
        ErrorCode.AUTH_INVALID_TOKEN,
        'Cannot re-authenticate in headless context. ' +
          'Please run the app manually once to re-authenticate.'
      );
    }
    this.logger.info(
      'Starting re-authentication (token file preserved until new token is saved)'
    );
    // Do NOT delete the token first. getNewToken → startAuthServer will check
    // loadToken() to decide on prompt=consent. If refresh_token exists on disk,
    // we skip consent, which avoids forcing Google to rotate the refresh_token.
    await this.getNewToken();
    // After successful auth and token save, clean up the old token file only
    // if there was a problem with it. In practice saveTokenImpl merges, so
    // nothing extra needed here.
    this.logger.info('Re-authentication complete');
  }

  // -------------------------------------------------------------------------
  // Network-aware helpers
  // -------------------------------------------------------------------------

  private lastAuthError: unknown = undefined;

  private async refreshWithRetry(): Promise<
    'success' | 'network_error' | 'auth_error'
  > {
    if (!this.oAuth2Client) return 'auth_error';

    this.lastAuthError = undefined;
    let lastError: unknown;
    let delayMs = NETWORK_RETRY_DELAY_MS;

    try {
      for (let attempt = 1; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
        try {
          this.logger.debug(
            `Token refresh attempt ${attempt}/${NETWORK_RETRY_ATTEMPTS}`
          );
          this.isRefreshing = true;
          const { credentials: refreshedTokens } =
            await this.oAuth2Client.refreshAccessToken();
          this.oAuth2Client.setCredentials(refreshedTokens);
          await this.saveToken(refreshedTokens as TokenData);
          return 'success';
        } catch (error) {
          lastError = error;

          if (this.isAuthError(error)) {
            this.lastAuthError = error;
            this.logger.warn('Token refresh rejected by Google (auth error)', {
              error: error instanceof Error ? error.message : String(error),
            });
            return 'auth_error';
          }

          if (this.isNetworkError(error)) {
            this.logger.warn(
              `Token refresh failed (network error) on attempt ${attempt}/${NETWORK_RETRY_ATTEMPTS}`,
              { error: error instanceof Error ? error.message : String(error) }
            );
            if (attempt < NETWORK_RETRY_ATTEMPTS) {
              this.logger.info(`Retrying in ${delayMs / 1000}s...`);
              await sleep(delayMs);
              delayMs *= NETWORK_RETRY_BACKOFF_FACTOR;
            }
            continue;
          }

          throw error;
        }
      }

      this.logger.error(
        'All token refresh attempts exhausted',
        lastError instanceof Error ? lastError : new Error(String(lastError))
      );
      return 'network_error';
    } finally {
      this.isRefreshing = false;
    }
  }

  private async validateTokenWithNetworkAwareness(): Promise<TokenValidationStatus> {
    const token: TokenData | null = await this.loadToken();
    if (!token) return 'missing';
    if (!token.refresh_token) return 'invalid';

    const credentials: GoogleCredentials = this.loadCredentials();
    if (!this.oAuth2Client) {
      this.oAuth2Client = this.createOAuth2Client(credentials);
    }
    this.oAuth2Client.setCredentials(token);

    try {
      const isValid = await this.testTokenValidity();
      return isValid ? 'valid' : 'invalid';
    } catch (error) {
      if (this.isNetworkError(error)) {
        this.logger.warn('Token validity check failed due to network error', {
          error: error instanceof Error ? error.message : String(error),
        });
        return 'network_error' as TokenValidationStatus;
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Error classification
  // -------------------------------------------------------------------------

  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    const networkCodes = [
      'enotfound',
      'econnrefused',
      'econnreset',
      'etimedout',
      'esockettimedout',
      'eai_again',
      'enetunreach',
      'network request failed',
      'getaddrinfo',
      'failed to fetch',
    ];
    return networkCodes.some((code) => msg.includes(code));
  }

  private isAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    const isInvalidGrant =
      message.includes('invalid_grant') ||
      message.includes('token has been expired') ||
      message.includes('token has been revoked');
    const isForbidden =
      message.includes('forbidden') ||
      message.includes('permission') ||
      message.includes('scope');
    const errorWithStatus = error as Error & { status?: number; code?: number };
    const is403 =
      errorWithStatus.status === 403 || errorWithStatus.code === 403;
    return isInvalidGrant || isForbidden || is403;
  }

  // -------------------------------------------------------------------------
  // Headless detection
  // -------------------------------------------------------------------------

  private isHeadlessContext(): boolean {
    const hasAutoFlag = process.argv.includes('AUTO');
    const noTty = !process.stdin.isTTY;
    const envFlag = process.env['SCHEDULED_TASK'] === '1';
    const isHeadless = hasAutoFlag || noTty || envFlag;
    if (isHeadless) {
      this.logger.debug('Headless context detected', {
        hasAutoFlag,
        noTty,
        envFlag,
      });
    }
    return isHeadless;
  }

  // -------------------------------------------------------------------------
  // Token I/O
  // -------------------------------------------------------------------------

  private loadCredentials(): GoogleCredentials {
    const {
      clientId,
      clientSecret,
      projectId,
      authUri,
      tokenUri,
      authProviderCertUrl,
    } = SETTINGS.auth;
    if (
      !clientId ||
      !clientSecret ||
      !projectId ||
      !authUri ||
      !tokenUri ||
      !authProviderCertUrl
    ) {
      throw new AppError(
        ErrorCode.AUTH_MISSING_CREDENTIALS,
        'Missing required environment variables'
      );
    }
    return {
      web: {
        client_id: clientId,
        project_id: projectId,
        auth_uri: authUri,
        token_uri: tokenUri,
        auth_provider_x509_cert_url: authProviderCertUrl,
        client_secret: clientSecret,
      },
    };
  }

  private async loadToken(): Promise<TokenData | null> {
    if (!existsSync(SETTINGS.paths.tokenFile)) return null;
    const content = await readFile(SETTINGS.paths.tokenFile, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  }

  public saveToken(token: TokenData): Promise<void> {
    this.saveTokenQueue = this.saveTokenQueue.then(() =>
      this.saveTokenImpl(token)
    );
    return this.saveTokenQueue;
  }

  private async saveTokenImpl(token: TokenData): Promise<void> {
    const existing = await this.loadToken().catch(() => null);
    const merged: TokenData = existing
      ? {
          ...existing,
          ...token,
          // FIX: Always preserve refresh_token — Google only returns it on first
          // auth or explicit token rotation. If we overwrite with undefined we
          // lose it and the next scheduled run gets invalid_grant.
          refresh_token: token.refresh_token ?? existing.refresh_token,
          expiry_date: token.expiry_date ?? existing.expiry_date,
        }
      : token;

    // FIX: Log a warning if we're about to save a token without a refresh_token.
    // This should never happen but helps diagnose future issues immediately.
    if (!merged.refresh_token) {
      this.logger.warn(
        'DIAGNOSTIC: About to save a token WITHOUT a refresh_token. ' +
          'This will cause invalid_grant on the next scheduled run. ' +
          'Check whether Google returned a refresh_token in this response.'
      );
    } else {
      this.logger.debug('Saving token (refresh_token present: yes)');
    }

    const tempFile = `${SETTINGS.paths.tokenFile}.tmp`;
    await writeFile(tempFile, JSON.stringify(merged, null, 2));
    const { rename } = await import('fs/promises');
    await rename(tempFile, SETTINGS.paths.tokenFile);
    this.logger.info('Token saved');
  }

  private async deleteToken(): Promise<void> {
    try {
      const { unlink } = await import('fs/promises');
      if (existsSync(SETTINGS.paths.tokenFile)) {
        await unlink(SETTINGS.paths.tokenFile);
        this.logger.info('Token file deleted');
      }
    } catch {
      this.logger.warn('Failed to delete token file');
    }
  }

  // -------------------------------------------------------------------------
  // OAuth2 client setup
  // -------------------------------------------------------------------------

  private createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
    const { client_id, client_secret } = credentials.web;
    const redirectUri = `http://localhost:${SETTINGS.auth.redirectPort}`;
    const client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    client.on('tokens', (tokens) => {
      this.logger.debug('OAuth2Client received new tokens');
      if (this.isRefreshing) {
        this.logger.debug(
          'Skipping on(tokens) save — refreshWithRetry is already saving'
        );
        return;
      }
      this.loadToken()
        .then((existingToken) => {
          if (existingToken) {
            const updatedToken = { ...existingToken, ...tokens };
            this.saveToken(updatedToken as TokenData).catch((err) => {
              this.logger.error('Failed to save auto-refreshed tokens', err);
            });
          }
        })
        .catch((err) => {
          this.logger.error('Failed to load token for auto-refresh', err);
        });
    });

    return client;
  }

  private async testTokenValidity(): Promise<boolean> {
    if (!this.oAuth2Client) return false;

    const VALIDITY_CHECK_TIMEOUT_MS = 15_000;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('enotfound token validity check timed out')),
        VALIDITY_CHECK_TIMEOUT_MS
      )
    );

    try {
      const service = google.people({ version: 'v1', auth: this.oAuth2Client });
      const response = await Promise.race([
        service.contactGroups.list({ pageSize: 1 }),
        timeoutPromise,
      ]);
      return response.status === 200;
    } catch (error: unknown) {
      if (this.isAuthError(error)) return false;
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Interactive auth (only used in non-headless contexts)
  // -------------------------------------------------------------------------

  private async getNewToken(): Promise<void> {
    if (!this.oAuth2Client) {
      throw new AppError(
        ErrorCode.AUTH_INVALID_TOKEN,
        'OAuth2 client not initialized'
      );
    }
    await PortManager.ensurePortAvailable(SETTINGS.auth.redirectPort);
    const OAUTH_TIMEOUT = 10 * 60 * 1_000;
    const timeoutPromise: Promise<never> = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new AppError(
            ErrorCode.AUTH_TIMEOUT,
            'OAuth authentication timeout after 10 minutes'
          )
        );
      }, OAUTH_TIMEOUT);
    });
    return Promise.race([this.startAuthServer(), timeoutPromise]);
  }

  private startAuthServer(): Promise<void> {
    if (!this.oAuth2Client) {
      throw new AppError(
        ErrorCode.AUTH_INVALID_TOKEN,
        'OAuth2 client not initialized'
      );
    }
    return new Promise((resolve, reject) => {
      let serverClosed = false;
      const closeServer = (): void => {
        if (this.server && !serverClosed) {
          this.logger.debug('Closing authentication server');
          serverClosed = true;
          this.server.close();
        }
      };
      const handleSignal = (): void => {
        this.logger.info('Authentication signal received (SIGINT/SIGTERM)');
        closeServer();
        reject(
          new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Authentication cancelled by user'
          )
        );
      };
      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);

      this.server = createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!req.url) return;
          this.logger.debug('Auth server request received', { url: req.url });
          const queryData = parse(req.url, true).query;
          if (queryData.code) {
            this.logger.info('Auth code received from browser');
            const code = queryData.code as string;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
              '<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>'
            );
            closeServer();
            if (!this.oAuth2Client) {
              throw new AppError(
                ErrorCode.AUTH_INVALID_TOKEN,
                'OAuth2 client not initialized'
              );
            }
            const { tokens } = await this.oAuth2Client.getToken(code);
            this.oAuth2Client.setCredentials(tokens);
            await this.saveToken(tokens as TokenData);
            this.logger.info('Authentication successful');
            resolve();
          } else if (queryData.error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(
              '<h1>Authentication failed!</h1><p>Error: ' +
                queryData.error +
                '</p>'
            );
            closeServer();
            reject(
              new AppError(
                ErrorCode.AUTH_INVALID_TOKEN,
                'Authentication failed: ' + queryData.error
              )
            );
          }
        }
      );

      this.server.listen(SETTINGS.auth.redirectPort, async () => {
        if (!this.oAuth2Client) {
          reject(
            new AppError(
              ErrorCode.AUTH_INVALID_TOKEN,
              'OAuth2 client not initialized'
            )
          );
          return;
        }

        // FIX: Read the token file to check for an existing refresh_token.
        // IMPORTANT: We do NOT delete the token file before reaching this point.
        // If the token file exists with a refresh_token, isFirstAuth=false, and
        // we skip prompt=consent — Google will NOT rotate the refresh_token.
        // Only a genuinely first-time auth (no token file ever) gets consent,
        // which is the only time Google issues the initial refresh_token.
        const existingToken = await this.loadToken().catch(() => null);
        const isFirstAuth = !existingToken?.refresh_token;

        if (isFirstAuth) {
          this.logger.info(
            'First-time auth detected — using prompt=consent to obtain refresh_token'
          );
        } else {
          this.logger.info(
            'Re-auth with existing refresh_token — skipping prompt=consent to prevent token rotation'
          );
        }

        const authUrl = this.oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          // FIX: Only force consent on first auth. On re-auth (e.g. after
          // invalid_grant), do NOT pass prompt=consent. This is the key fix:
          // - With consent: Google always returns a new refresh_token AND
          //   revokes the previous one. Any other client holding the old one
          //   gets invalid_grant immediately.
          // - Without consent: Google may or may not return a refresh_token
          //   depending on whether the user has already granted access. If it
          //   doesn't, saveTokenImpl will merge and keep the existing one.
          prompt: isFirstAuth ? 'consent' : undefined,
          scope: SETTINGS.auth.scopes,
        });
        this.logger.info('Opening browser for Google authentication...', {
          authUrl,
        });
        this.logger.info(
          'If the browser does not open automatically, visit this URL:'
        );
        console.log(authUrl);
        this.openBrowser(authUrl);
        this.logger.warn(
          'Please review the opened browser and provide the auth needed to continue the flow'
        );
      });

      this.server.on('error', (err: Error) => {
        process.removeListener('SIGINT', handleSignal);
        process.removeListener('SIGTERM', handleSignal);
        reject(
          new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Failed to start local server: ' + err.message
          )
        );
      });
    });
  }

  private openBrowser(url: string): void {
    const platform = process.platform;
    const command =
      platform === 'darwin'
        ? 'open'
        : platform === 'win32'
          ? 'start'
          : 'xdg-open';
    exec(
      `${command} "${url}"`,
      { timeout: SETTINGS.api.browserTimeout },
      (error: Error | null) => {
        if (error) this.logger.warn('Could not automatically open browser');
      }
    );
  }
}
