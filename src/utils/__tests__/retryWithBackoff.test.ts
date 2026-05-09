import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff } from '../retryWithBackoff';

// Mock SyncStatusBar
vi.mock('../../flow/syncStatusBar', () => ({
  SyncStatusBar: {
    getInstance: vi.fn(() => ({
      setApiStatus: vi.fn(),
    })),
  },
}));

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should return result on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(operation);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on quota error and eventually succeed', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Quota exceeded (429)'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(operation);

    // First attempt fails
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should retry on 502 error and eventually succeed', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Error 502'))
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(operation);

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw if non-retryable error occurs', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Fatal Error'));
    await expect(retryWithBackoff(operation)).rejects.toThrow('Fatal Error');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should throw after max retries for quota errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('429 quota error'));
    const maxRetries = 3;

    const promise = retryWithBackoff(operation, maxRetries);
    promise.catch(() => {}); // Prevent unhandled rejection

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('429 quota error');
    expect(operation).toHaveBeenCalledTimes(maxRetries);
  });

  it('should handle quota error as object with status 429', async () => {
    const quotaError = { response: { status: 429 } };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(operation);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle quota error as object with code RESOURCE_EXHAUSTED', async () => {
    const quotaError = { code: 'RESOURCE_EXHAUSTED' };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(operation);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle 502 error as object with status 502', async () => {
    const serverError = { response: { status: 502 } };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(operation);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should limit 502 retries independently', async () => {
    const serverError = { response: { status: 502 } };
    const operation = vi.fn().mockRejectedValue(serverError);

    // max502Retries is 3 in the implementation
    const promise = retryWithBackoff(operation, 10);
    promise.catch(() => {}); // Prevent unhandled rejection

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ response: { status: 502 } });
    // It should try once + 3 retries = 4 times
    expect(operation).toHaveBeenCalledTimes(4);
  });
});
