import { config } from 'dotenv';
import { z } from 'zod';
import { SETTINGS } from './settings';
import { Logger } from '../logging';

const logger = new Logger('Settings');

const EnvSchema = z.object({
  CLIENT_ID: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  PROJECT_ID: z.string().min(1),
  AUTH_URI: z.string().min(1),
  TOKEN_URI: z.string().min(1),
  AUTH_PROVIDER_CERT_URL: z.string().min(1),
  REDIRECT_PORT: z.coerce.number().int().min(1024).max(65535),
});

type Env = z.infer<typeof EnvSchema>;

function parseEnvironment(): Env {
  logger.debug('Validating environment variables');
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    const errorMsg = `Invalid environment configuration: ${details}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  logger.debug('Environment variables validated');
  return result.data;
}

export function initiate(): void {
  const environment: string = process.env.NODE_ENV || 'test';
  logger.info(`Initiating settings for environment: ${environment}`);
  SETTINGS.environment = environment as 'test' | 'production';
  const envFile: string =
    environment === 'production' ? '.env.production' : '.env.test';
  logger.debug(`Loading environment file: ${envFile}`);
  config({ path: envFile });
  const env = parseEnvironment();
  SETTINGS.auth.clientId = env.CLIENT_ID;
  SETTINGS.auth.clientSecret = env.CLIENT_SECRET;
  SETTINGS.auth.projectId = env.PROJECT_ID;
  SETTINGS.auth.authUri = env.AUTH_URI;
  SETTINGS.auth.tokenUri = env.TOKEN_URI;
  SETTINGS.auth.authProviderCertUrl = env.AUTH_PROVIDER_CERT_URL;
  SETTINGS.auth.redirectPort = env.REDIRECT_PORT;
  logger.debug('Settings initiated successfully');
}
