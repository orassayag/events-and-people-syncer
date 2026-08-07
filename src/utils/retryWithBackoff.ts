import { EMOJIS } from '../constants';
import { Logger } from '../logging/logger';

const logger = new Logger('RetryWithBackoff');

const MAX_BACKOFF_MS: number = 60000;

function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    const message: string = error.message.toLowerCase();
    return (
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('429')
    );
  }
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as any;
    if (errorObj.response?.status === 429) {
      return true;
    }
    if (
      errorObj.code === 'RESOURCE_EXHAUSTED' ||
      errorObj.code === '429' ||
      errorObj.code === 429
    ) {
      return true;
    }
  }
  return false;
}

function is502Error(error: unknown): boolean {
  if (error instanceof Error) {
    const message: string = error.message;
    return message.includes('502') || message.includes('Error 502');
  }
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as any;
    if (errorObj.response?.status === 502) {
      return true;
    }
    if (errorObj.code === '502' || errorObj.code === 502) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 8
): Promise<T> {
  let statusBar: any = null;
  try {
    const { SyncStatusBar } = await import('../flow/syncStatusBar');
    statusBar = SyncStatusBar.getInstance();
  } catch (error: unknown) {
    logger.debug('SyncStatusBar unavailable; proceeding without status updates', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const max502Retries: number = 3;
  let retries502: number = 0;
  for (let i: number = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (statusBar && (i > 0 || retries502 > 0)) {
        statusBar.setApiStatus('Stable');
      }
      return result;
    } catch (error: unknown) {
      if (is502Error(error) && retries502 < max502Retries) {
        retries502++;
        const delay: number = 2000;
        if (statusBar) {
          statusBar.setApiStatus(
            `${EMOJIS.STATUS.WARNING}  Retrying (502 Server Error) - Attempt ${retries502}/${max502Retries} - Waiting 2s...`
          );
        }
        await sleep(delay);
        continue;
      }
      if (isQuotaError(error) && i < maxRetries - 1) {
        const base: number = Math.pow(2, i) * 1000;
        const delay: number = Math.min(
          base / 2 + Math.random() * base,
          MAX_BACKOFF_MS
        );
        const delayInSeconds: number = Math.round(delay / 1000);
        if (statusBar) {
          statusBar.setApiStatus(
            `${EMOJIS.STATUS.WARNING}  Retrying (Quota Error) - Attempt ${i + 1}/${maxRetries} - Waiting ${delayInSeconds}s...`
          );
        }
        await sleep(delay);
        continue;
      }
      if (statusBar && (i > 0 || retries502 > 0)) {
        statusBar.setApiStatus('Stable');
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
