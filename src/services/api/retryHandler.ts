import { injectable } from 'inversify';
import { Logger } from '../../logging';
import { API_CONSTANTS } from '../../constants';

@injectable()
export class RetryHandler {
  private logger: Logger = new Logger('RetryHandler');

  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = API_CONSTANTS.GOOGLE_PEOPLE_API.MAX_RETRIES
  ): Promise<T> {
    let lastError: any;
    for (let attempt: number = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs: number = Math.min(
            API_CONSTANTS.GOOGLE_PEOPLE_API.RETRY_BASE_DELAY *
              Math.pow(2, attempt - 1),
            API_CONSTANTS.GOOGLE_PEOPLE_API.RETRY_MAX_DELAY
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return await operation();
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
        if (attempt === maxRetries - 1) {
          break;
        }
      }
    }
    this.logger.error('Max retries exceeded', lastError);
    throw lastError || new Error('Max retries exceeded');
  }
}
