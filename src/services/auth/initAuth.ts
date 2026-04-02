import type { OAuth2Client } from '../../types';
import { container } from '../../di';
import { AuthService } from './authService';
import { Logger } from '../../logging';
import { SETTINGS } from '../../settings';
import { EMOJIS } from '../../constants';

const logger: Logger = new Logger('InitAuth');

export async function initializeAuth(): Promise<OAuth2Client> {
  logger.info(`${EMOJIS.AUTH.LOCK} Validating Google OAuth authentication`);
  const authService = new AuthService();
  const requiredScopes = SETTINGS.auth.scopes;
  const scopeValidation = await authService.validateScopes(requiredScopes);
  if (!scopeValidation.hasAllScopes) {
    logger.warn(
      `Token missing required scopes: ${scopeValidation.missingScopes.join(', ')}`
    );
    logger.info('Re-authentication required to grant new permissions...');
    const auth: OAuth2Client = await authService.ensureScopes(requiredScopes);
    if (container.isBound('OAuth2Client')) {
      container.rebindSync('OAuth2Client').toConstantValue(auth);
    } else {
      container.bind('OAuth2Client').toConstantValue(auth);
    }
    logger.info(`${EMOJIS.STATUS.SUCCESS} Authentication validated`);
    return auth;
  }
  const auth: OAuth2Client = await authService.ensureValidAuth();
  if (container.isBound('OAuth2Client')) {
    container.rebindSync('OAuth2Client').toConstantValue(auth);
  } else {
    container.bind('OAuth2Client').toConstantValue(auth);
  }
  logger.info(`${EMOJIS.STATUS.SUCCESS} Authentication validated`);
  return auth;
}
