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
// On startup, if the network is down we poll until it comes up rather than
// immediately continuing with a stale token (which would fail downstream).
const NETWORK_WAIT_TIMEOUT_MS = 5 * 60_000; // give up after 5 minutes
const NETWORK_WAIT_POLL_MS = 15_000; // re-check every 15 seconds
const NETWORK_PROBE_URL = 'https://oauth2.googleapis.com/token';

/**
 * Waits until a DNS lookup for Google's OAuth endpoint succeeds, or the
 * timeout is reached.
 *
 * Returns true  → network is available
 * Returns false → timed out, still no network
 */
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

/**
 * Wraps any async API call with network-aware retries.
 * Use this in scripts (e.g. GoogleContactsMaintainer) to handle transient
 * network drops mid-run without crashing the entire job.
 *
 * @example
 *   const contacts = await withNetworkRetry(() => fetchPage(pageToken), logger);
 */
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

      if (!isNetwork) throw error; // non-network errors bubble up immediately

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
  // Mutex for saveToken: holds the tail of the promise chain so concurrent
  // callers queue up instead of racing on the .tmp file.
  private saveTokenQueue: Promise<void> = Promise.resolve();
  // Set to true while refreshWithRetry owns a refresh cycle so the on('tokens')
  // event handler knows to skip its own redundant save.
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
      // Fix: guard against a token file that lost its refresh_token (e.g. due
      // to a partial save). Without this, we'd attempt a refresh that will
      // always fail and then fall through to a full re-auth anyway.
      if (!token.refresh_token) {
        this.logger.warn(
          'Stored token is missing refresh_token — deleting and re-authenticating'
        );
        await this.deleteToken();
        await this.getNewToken();
        return this.oAuth2Client;
      }

      this.oAuth2Client.setCredentials(token);

      // Proactive refresh only if token is genuinely near expiry.
      // Missing expiry_date → don't assume expired; trust the token until Google rejects it.
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
          // ----------------------------------------------------------------
          // Network is down — wait for it to come back before giving up.
          // This handles the common Task Scheduler race where the job fires
          // before the NIC/DNS is fully ready.
          // ----------------------------------------------------------------
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
              // Treat same as the auth_error branch below
              await this.deleteToken();
              await this.getNewToken();
              return this.oAuth2Client;
            }
            // Still a network error after waiting — fall through to throw
          }

          // Network never came up within the timeout
          this.logger.error(
            'Network did not become available within the wait window. ' +
              'Aborting run — Task Scheduler will retry on the next trigger, ' +
              'or configure "Restart task if it fails" in the task settings.'
          );
          throw new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Cannot refresh token: network unreachable after waiting. ' +
              'The run will be retried by Task Scheduler.'
          );
        } else if (refreshResult === 'auth_error') {
          this.logger.warn(
            'Token refresh rejected by Google - deleting token and re-authenticating. ' +
              'This usually means the refresh token was revoked or superseded. ' +
              'Cause: invalid_grant / token rotation / credentials change.',
            {
              error:
                this.lastAuthError instanceof Error
                  ? this.lastAuthError.message
                  : String(this.lastAuthError),
            }
          );
          await this.deleteToken();
          await this.getNewToken();
          return this.oAuth2Client;
        } else {
          // refreshResult === 'success'
          this.logger.info('Token auto-refresh successful');
          return this.oAuth2Client;
        }
      }

      // Validate the existing (possibly non-expired) token
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
        // Same as above: don't nuke the token just because the network is down
        this.logger.warn(
          'Token validation skipped - network unreachable. ' +
            'Proceeding with cached token.'
        );
        return this.oAuth2Client;
      }

      if (validationStatus === 'invalid') {
        if (this.isHeadlessContext()) {
          // In a scheduled task we cannot open a browser; abort loudly rather
          // than hanging or silently doing nothing.
          throw new AppError(
            ErrorCode.AUTH_INVALID_TOKEN,
            'Token is invalid and cannot be refreshed interactively in a ' +
              'headless/scheduled context. Please run the app manually once ' +
              'to re-authenticate, then reschedule the task.'
          );
        }
        this.logger.warn('Token is invalid or expired - re-authenticating');
        await this.deleteToken();
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
  // Network-aware helpers
  // -------------------------------------------------------------------------

  /**
   * Attempts to refresh the access token up to NETWORK_RETRY_ATTEMPTS times,
   * distinguishing between network failures (transient) and auth failures
   * (permanent — bad token / revoked).
   *
   * Returns:
   *   'success'       – token refreshed and saved
   *   'network_error' – could not reach Google after all retries
   *   'auth_error'    – Google rejected the token (invalid_grant, etc.)
   */
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
            // Auth errors won't get better with retries
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

          // Unknown error — don't retry, surface it
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

  /**
   * Like validateToken(), but returns 'network_error' instead of throwing
   * or marking the token invalid when Google is unreachable.
   */
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

  /**
   * Returns true for errors that indicate the *network* is unreachable,
   * as opposed to Google rejecting the token.
   *
   * Common patterns on Windows when DNS / proxy isn't ready:
   *   - getaddrinfo ENOTFOUND <hostname>
   *   - connect ECONNREFUSED
   *   - network timeout (ETIMEDOUT / ESOCKETTIMEDOUT)
   *   - EAI_AGAIN (temporary DNS failure)
   */
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

  /**
   * Returns true when the process is running in a non-interactive context
   * (Task Scheduler, CI, service) where opening a browser is impossible.
   *
   * Detection strategy (multiple signals for reliability):
   *   1. An explicit --AUTO flag passed by your bat file / scheduler
   *   2. No TTY attached to stdin
   *   3. The environment variable SCHEDULED_TASK=1
   */
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
    // Queue saves so concurrent callers never race on the .tmp file.
    // Each call chains onto the previous one; if a save is already in flight
    // the next one waits for it to finish before starting.
    this.saveTokenQueue = this.saveTokenQueue.then(() =>
      this.saveTokenImpl(token)
    );
    return this.saveTokenQueue;
  }

  private async saveTokenImpl(token: TokenData): Promise<void> {
    // Merge with existing token to preserve refresh_token if the new one
    // doesn't include it (Google only returns it on first auth)
    const existing = await this.loadToken().catch(() => null);
    const merged: TokenData = existing
      ? {
          ...existing,
          ...token,
          // Preserve fields Google omits on refresh responses
          refresh_token: token.refresh_token ?? existing.refresh_token,
          expiry_date: token.expiry_date ?? existing.expiry_date,
        }
      : token;

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
      // refreshWithRetry sets isRefreshing=true BEFORE calling refreshAccessToken(),
      // which is what triggers this event. So if isRefreshing is true here, the
      // refresh cycle already owns the save — skip to avoid the .tmp race.
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
    try {
      const service = google.people({ version: 'v1', auth: this.oAuth2Client });
      const response = await service.contactGroups.list({ pageSize: 1 });
      return response.status === 200;
    } catch (error: unknown) {
      if (this.isAuthError(error)) return false;
      throw error; // Let callers handle network errors
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
        // Fix: Only force 'consent' on first-ever auth (no saved refresh_token).
        // Using prompt:'consent' unconditionally causes Google to rotate the
        // refresh token on every interactive login, silently revoking the old one.
        const existingToken = await this.loadToken().catch(() => null);
        const isFirstAuth = !existingToken?.refresh_token;
        const authUrl = this.oAuth2Client.generateAuthUrl({
          access_type: 'offline',
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
