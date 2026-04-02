import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { parse } from 'url';
import { exec } from 'child_process';
import { injectable } from 'inversify';
import type { GoogleCredentials, TokenData, OAuth2Client, TokenValidationStatus, ScopeValidationResult } from '../../types';
import { SETTINGS } from '../../settings';
import { PortManager } from '../../managers';
import { Logger } from '../../logging';
import { AppError, ErrorCode } from '../../errors';

@injectable()
export class AuthService {
  private oAuth2Client?: OAuth2Client;
  private server?: Server;
  private logger: Logger = new Logger('AuthService');

  async ensureValidAuth(): Promise<OAuth2Client> {
    const credentials: GoogleCredentials = this.loadCredentials();
    this.oAuth2Client = this.createOAuth2Client(credentials);
    const validationStatus: TokenValidationStatus = await this.validateToken();
    if (validationStatus === 'valid' && this.oAuth2Client) {
      return this.oAuth2Client;
    }
    if (validationStatus === 'invalid') {
      this.logger.warn('Token is invalid or expired - re-authenticating');
      await this.deleteToken();
    }
    await this.getNewToken();
    return this.oAuth2Client;
  }

  async validateToken(): Promise<TokenValidationStatus> {
    const token: TokenData | null = await this.loadToken();
    if (!token) {
      return 'missing';
    }
    if (!token.refresh_token) {
      return 'invalid';
    }
    const credentials: GoogleCredentials = this.loadCredentials();
    if (!this.oAuth2Client) {
      this.oAuth2Client = this.createOAuth2Client(credentials);
    }
    this.oAuth2Client.setCredentials(token);
    const isValid: boolean = await this.testTokenValidity();
    return isValid ? 'valid' : 'invalid';
  }

  private async testTokenValidity(): Promise<boolean> {
    if (!this.oAuth2Client) {
      return false;
    }
    try {
      const service = google.people({ version: 'v1', auth: this.oAuth2Client });
      const response = await service.contactGroups.list({ pageSize: 1 });
      return response.status === 200;
    } catch (error: unknown) {
      if (this.isAuthError(error)) {
        return false;
      }
      throw error;
    }
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

  private isAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message: string = error.message.toLowerCase();
    const isInvalidGrant: boolean =
      message.includes('invalid_grant') ||
      message.includes('token has been expired') ||
      message.includes('token has been revoked');
    const isForbidden: boolean =
      message.includes('forbidden') ||
      message.includes('permission') ||
      message.includes('scope');
    const errorWithStatus = error as Error & { status?: number; code?: number };
    const is403: boolean =
      errorWithStatus.status === 403 || errorWithStatus.code === 403;
    return isInvalidGrant || isForbidden || is403;
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
    if (!existsSync(SETTINGS.paths.tokenFile)) {
      return null;
    }
    const content: string = await readFile(SETTINGS.paths.tokenFile, 'utf-8');
    return JSON.parse(content);
  }

  private async saveToken(token: TokenData): Promise<void> {
    await writeFile(SETTINGS.paths.tokenFile, JSON.stringify(token, null, 2));
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

  private createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
    const { client_id, client_secret } = credentials.web;
    const redirectUri: string = `http://localhost:${SETTINGS.auth.redirectPort}`;
    return new google.auth.OAuth2(client_id, client_secret, redirectUri);
  }

  private async getNewToken(): Promise<void> {
    if (!this.oAuth2Client) {
      throw new AppError(
        ErrorCode.AUTH_INVALID_TOKEN,
        'OAuth2 client not initialized'
      );
    }
    await PortManager.ensurePortAvailable(SETTINGS.auth.redirectPort);
    const OAUTH_TIMEOUT: number = 10 * 60 * 1000;
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
      let serverClosed: boolean = false;
      const closeServer = (): void => {
        if (this.server && !serverClosed) {
          serverClosed = true;
          this.server.close();
        }
      };
      const handleSignal = (): void => {
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
          if (!req.url) {
            return;
          }
          const queryData = parse(req.url, true).query;
          if (queryData.code) {
            const code: string = queryData.code as string;
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
      this.server.listen(SETTINGS.auth.redirectPort, () => {
        if (!this.oAuth2Client) {
          reject(
            new AppError(
              ErrorCode.AUTH_INVALID_TOKEN,
              'OAuth2 client not initialized'
            )
          );
          return;
        }
        const authUrl: string = this.oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SETTINGS.auth.scopes,
        });
        this.logger.info('Opening browser for authentication');
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
    const platform: string = process.platform;
    const command: string =
      platform === 'darwin'
        ? 'open'
        : platform === 'win32'
          ? 'start'
          : 'xdg-open';
    exec(
      `${command} "${url}"`,
      { timeout: SETTINGS.api.browserTimeout },
      (error: Error | null) => {
        if (error) {
          this.logger.warn('Could not automatically open browser');
        }
      }
    );
  }
}
