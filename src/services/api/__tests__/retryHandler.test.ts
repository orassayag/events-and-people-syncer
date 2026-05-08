import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryHandler } from '../retryHandler';

vi.mock('../../logging', () => ({
  Logger: class {
    error = vi.fn();
    warn = vi.fn();
  },
}));

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    retryHandler = new RetryHandler();
    vi.useFakeTimers();
  });

  it('should return result on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const promise = retryHandler.withRetry(operation);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('success');

    const promise = retryHandler.withRetry(operation, 3);

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = retryHandler.withRetry(operation, 2);
    // Catch it immediately to avoid unhandled rejection,
    // but we still want to test the rejection later with expect
    promise.catch(() => {});

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('fail');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
