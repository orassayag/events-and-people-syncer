import { SETTINGS } from '../settings';
import type { Logger } from '../logging';

export class DryModeChecker {
  static isEnabled(): boolean {
    return SETTINGS.dryMode;
  }

  static logApiCall(
    apiMethod: string,
    details: string,
    logger?: { info: (msg: string, meta?: any) => void } | Logger
  ): void {
    if (!logger || typeof logger.info !== 'function') {
      console.log(`[DRY-MODE] Calling API ${apiMethod} - ${details}`);
      return;
    }
    const message = `[DRY-MODE] Calling API ${apiMethod} - ${details}`;
    logger.info(message);
  }
}
