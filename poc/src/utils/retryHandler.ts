import { ApiTracker } from "../services/apiTracker.js";

export class RetryHandler {
  private static readonly MAX_RETRIES = 5;
  private static readonly INITIAL_DELAY = 1000;

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    apiType: "read" | "write",
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await operation();
        if (apiType === "read") {
          await ApiTracker.getInstance().trackRead();
        } else {
          await ApiTracker.getInstance().trackWrite();
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        if (this.isNonRetriableError(error)) {
          throw error;
        }
        if (attempt < this.MAX_RETRIES) {
          const delay = this.calculateBackoff(attempt);
          console.log(
            `Retry ${attempt}/${this.MAX_RETRIES} for ${operationName} after ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }
    throw new Error(
      `Failed after ${this.MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  private static isNonRetriableError(error: any): boolean {
    const statusCode = error?.response?.status || error?.code;
    if (!statusCode) return false;
    if (statusCode >= 500) return false;
    if (statusCode === 429) return false;
    if (statusCode >= 400 && statusCode < 500) return true;
    return false;
  }

  private static calculateBackoff(attempt: number): number {
    return this.INITIAL_DELAY * Math.pow(2, attempt - 1);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
