import { SETTINGS } from '../settings';
import type { Logger } from '../logging';

export class DryModeChecker {
  static isEnabled(): boolean {
    return SETTINGS.dryMode;
  }

  static logApiCall(
    _apiMethod: string,
    _details: string,
    _logger?: { info: (msg: string, meta?: any) => void } | Logger
  ): void {
    // Silencing dry-mode API call logs as requested
    /*
    if (!logger || typeof logger.info !== 'function') {
      console.log(`[DRY-MODE] Calling API ${apiMethod} - ${details}`);
      return;
    }
    const message = `[DRY-MODE] Calling API ${apiMethod} - ${details}`;
    logger.info(message);
    */
  }
}
