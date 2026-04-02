import { config } from 'dotenv';
import { SETTINGS } from './settings';

const requiredVars: string[] = [
  'CLIENT_ID',
  'CLIENT_SECRET',
  'PROJECT_ID',
  'AUTH_URI',
  'TOKEN_URI',
  'AUTH_PROVIDER_CERT_URL',
  'REDIRECT_PORT',
];

function validateEnvironment(): void {
  const missingVars: string[] = requiredVars.filter(
    (varName: string) => !process.env[varName]
  );
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
  const redirectPort: number = parseInt(
    process.env.REDIRECT_PORT || '3000',
    10
  );
  if (isNaN(redirectPort) || redirectPort < 1024 || redirectPort > 65535) {
    throw new Error(
      `Invalid REDIRECT_PORT: must be a number between 1024 and 65535`
    );
  }
}

export function initiate(): void {
  const environment: string = process.env.NODE_ENV || 'test';
  SETTINGS.environment = environment as 'test' | 'production';
  const envFile: string =
    environment === 'production' ? '.env.production' : '.env.test';
  config({ path: envFile });
  validateEnvironment();
  SETTINGS.auth.clientId = process.env.CLIENT_ID || '';
  SETTINGS.auth.clientSecret = process.env.CLIENT_SECRET || '';
  SETTINGS.auth.projectId = process.env.PROJECT_ID || '';
  SETTINGS.auth.authUri = process.env.AUTH_URI || '';
  SETTINGS.auth.tokenUri = process.env.TOKEN_URI || '';
  SETTINGS.auth.authProviderCertUrl = process.env.AUTH_PROVIDER_CERT_URL || '';
  SETTINGS.auth.redirectPort = parseInt(
    process.env.REDIRECT_PORT || '3000',
    10
  );
}
