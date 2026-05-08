import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../authService';
import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { SETTINGS } from '../../../settings';
import { AppError } from '../../../errors';

const mockOAuth2Client = {
  setCredentials: vi.fn(),
  generateAuthUrl: vi.fn().mockReturnValue('https://mock-auth-url.com'),
  getToken: vi.fn().mockResolvedValue({
    tokens: { access_token: 'mock-token', refresh_token: 'mock-refresh' },
  }),
};

vi.mock('googleapis', () => {
  class MockOAuth2 {
    constructor() {
      return mockOAuth2Client;
    }
  }
  return {
    google: {
      people: vi.fn().mockReturnValue({
        contactGroups: {
          list: vi.fn().mockResolvedValue({ status: 200 }),
        },
      }),
      auth: {
        OAuth2: MockOAuth2,
      },
    },
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../settings', () => ({
  SETTINGS: {
    auth: {
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      projectId: 'mock-project-id',
      authUri: 'mock-auth-uri',
      tokenUri: 'mock-token-uri',
      authProviderCertUrl: 'mock-cert-url',
      redirectPort: 3000,
      scopes: ['scope1'],
    },
    paths: {
      tokenFile: 'mock-token-file.json',
    },
    api: {
      browserTimeout: 5000,
    },
  },
}));

vi.mock('../../../managers', () => ({
  PortManager: {
    ensurePortAvailable: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../logging', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
  });

  describe('validateToken', () => {
    it('should return missing if token file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const status = await authService.validateToken();
      expect(status).toBe('missing');
    });

    it('should return invalid if refresh_token is missing', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ access_token: 'token' })
      );
      const status = await authService.validateToken();
      expect(status).toBe('invalid');
    });

    it('should return valid if token is valid', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ access_token: 'token', refresh_token: 'refresh' })
      );

      const status = await authService.validateToken();
      expect(status).toBe('valid');
    });

    it('should return invalid if token validity check fails', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ access_token: 'token', refresh_token: 'refresh' })
      );

      const mockPeople = google.people({ version: 'v1' });
      vi.mocked(mockPeople.contactGroups.list).mockRejectedValueOnce(
        new Error('invalid_grant')
      );

      const status = await authService.validateToken();
      expect(status).toBe('invalid');
    });
  });

  describe('validateScopes', () => {
    it('should return hasAllScopes true if all scopes are present', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ scope: 'scope1 scope2' })
      );

      const result = await authService.validateScopes(['scope1']);
      expect(result.hasAllScopes).toBe(true);
    });

    it('should return missing scopes if some are missing', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ scope: 'scope1' })
      );

      const result = await authService.validateScopes(['scope1', 'scope2']);
      expect(result.hasAllScopes).toBe(false);
      expect(result.missingScopes).toEqual(['scope2']);
    });
  });

  describe('saveToken', () => {
    it('should write token to file', async () => {
      const mockToken = { access_token: 'token', refresh_token: 'refresh' };
      await authService.saveToken(mockToken as any);
      expect(writeFile).toHaveBeenCalledWith(
        SETTINGS.paths.tokenFile,
        expect.stringContaining('token')
      );
    });
  });

  describe('loadCredentials', () => {
    it('should throw AppError if credentials are missing', () => {
      const originalClientId = SETTINGS.auth.clientId;
      (SETTINGS.auth as any).clientId = undefined;

      expect(() => (authService as any).loadCredentials()).toThrow(AppError);

      (SETTINGS.auth as any).clientId = originalClientId;
    });
  });
});
