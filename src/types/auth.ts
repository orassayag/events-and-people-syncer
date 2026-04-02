import { Auth } from 'googleapis';

export type OAuth2Client = Auth.OAuth2Client;

export type TokenValidationStatus = 'valid' | 'invalid' | 'missing';

export interface ScopeValidationResult {
  hasAllScopes: boolean;
  missingScopes: string[];
  grantedScopes: string[];
}

export interface GoogleCredentials {
  web: {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
  };
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface EnvironmentConfig {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  PROJECT_ID: string;
  AUTH_URI: string;
  TOKEN_URI: string;
  AUTH_PROVIDER_CERT_URL: string;
  REDIRECT_PORT: string;
}
