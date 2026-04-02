import { injectable } from 'inversify';
import { Logger } from '../../logging';
import { API_CONSTANTS } from '../../constants';

@injectable()
export class RateLimitMonitor {
  private readCount: number = 0;
  private writeCount: number = 0;
  private windowStart: number = Date.now();
  private readonly WINDOW_MS: number = 60 * 1000;
  private logger: Logger = new Logger('RateLimitMonitor');

  trackRead(): void {
    this.resetWindowIfNeeded();
    this.readCount++;
    this.checkLimits(
      'read',
      this.readCount,
      API_CONSTANTS.GOOGLE_PEOPLE_API.RATE_LIMIT_READ
    );
  }

  trackWrite(): void {
    this.resetWindowIfNeeded();
    this.writeCount++;
    this.checkLimits(
      'write',
      this.writeCount,
      API_CONSTANTS.GOOGLE_PEOPLE_API.RATE_LIMIT_WRITE
    );
  }

  private checkLimits(operation: string, count: number, limit: number): void {
    const percentUsed: number = (count / limit) * 100;
    if (percentUsed >= 90) {
      this.logger.warn(
        `Rate limit warning: ${operation} operations at ${percentUsed.toFixed(1)}% of limit`,
        { count, limit, percentUsed }
      );
    }
    if (count >= limit) {
      this.logger.error(
        `Rate limit exceeded: ${operation} operations`,
        undefined,
        { count, limit }
      );
    }
  }

  private resetWindowIfNeeded(): void {
    const now: number = Date.now();
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.readCount = 0;
      this.writeCount = 0;
      this.windowStart = now;
    }
  }
}
