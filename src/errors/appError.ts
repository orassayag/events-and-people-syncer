import { ErrorCode } from './errorCodes';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(`[ERROR-${code}] ${message}`);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}
