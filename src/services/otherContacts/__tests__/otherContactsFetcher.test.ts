import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtherContactsFetcher } from '../otherContactsFetcher';
import { mockGoogleApiResponse } from '../__mocks__/otherContactsFetcher.mock';

vi.mock('googleapis', () => ({
  google: {
    people: vi.fn(() => ({
      otherContacts: {
        list: vi.fn(),
      },
    })),
  },
}));

vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn(() => ({
      trackRead: vi.fn(),
      trackWrite: vi.fn(),
    })),
  },
}));

vi.mock('../../../utils', () => ({
  retryWithBackoff: vi.fn((fn) => fn()),
}));

describe('OtherContactsFetcher', () => {
  let fetcher: OtherContactsFetcher;
  let mockListFn: ReturnType<typeof vi.fn>;
  let mockAuth: { credentials: { access_token: string } };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth = { credentials: { access_token: 'test-token' } };
    const { google } = await import('googleapis');
    mockListFn = vi.fn();
    (google.people as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      otherContacts: {
        list: mockListFn,
      },
    });
    fetcher = new OtherContactsFetcher(mockAuth as never);
  });

  describe('fetchOtherContacts', () => {
    it('should fetch single page of other contacts', async () => {
      mockListFn.mockResolvedValue(mockGoogleApiResponse.singlePage);
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(2);
      expect(entries[0].displayName).toBe('John Doe');
      expect(entries[0].emails).toEqual(['john@example.com']);
      expect(entries[1].displayName).toBe('Jane Smith');
      expect(entries[1].emails).toEqual([
        'jane@example.com',
        'jane.work@example.com',
      ]);
      expect(entries[1].phones).toEqual(['+1-555-123-4567']);
    });

    it('should handle multiple pages of results', async () => {
      mockListFn
        .mockResolvedValueOnce(mockGoogleApiResponse.multiplePagesFirstPage)
        .mockResolvedValueOnce(mockGoogleApiResponse.multiplePagesSecondPage);
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(3);
      expect(mockListFn).toHaveBeenCalledTimes(2);
    });

    it('should call progress callback with correct counts', async () => {
      mockListFn
        .mockResolvedValueOnce(mockGoogleApiResponse.multiplePagesFirstPage)
        .mockResolvedValueOnce(mockGoogleApiResponse.multiplePagesSecondPage);
      const progressCallback = vi.fn();
      await fetcher.fetchOtherContacts(progressCallback);
      expect(progressCallback).toHaveBeenCalledWith(1, 3);
      expect(progressCallback).toHaveBeenCalledWith(3, 3);
    });

    it('should return empty array for empty response', async () => {
      mockListFn.mockResolvedValue(mockGoogleApiResponse.emptyResponse);
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(0);
    });

    it('should handle malformed response data gracefully', async () => {
      mockListFn.mockResolvedValue(mockGoogleApiResponse.malformedResponse);
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(3);
      expect(entries[0].emails).toEqual([]);
      expect(entries[0].phones).toEqual([]);
      expect(entries[0].displayName).toBeUndefined();
      expect(entries[1].emails).toEqual([]);
      expect(entries[1].phones).toEqual([]);
      expect(entries[2].displayName).toBeUndefined();
    });

    it('should include resourceName in all entries', async () => {
      mockListFn.mockResolvedValue(mockGoogleApiResponse.singlePage);
      const entries = await fetcher.fetchOtherContacts();
      entries.forEach((entry) => {
        expect(entry.resourceName).toBeDefined();
        expect(entry.resourceName.startsWith('otherContacts/')).toBe(true);
      });
    });

    it('should skip entries without resourceName', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              names: [{ displayName: 'No Resource Name' }],
              emailAddresses: [{ value: 'test@example.com' }],
            },
            {
              resourceName: 'otherContacts/valid',
              names: [{ displayName: 'Valid Entry' }],
              emailAddresses: [{ value: 'valid@example.com' }],
            },
          ],
          totalSize: 2,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(1);
      expect(entries[0].resourceName).toBe('otherContacts/valid');
    });

    it('should trim whitespace from display names', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              resourceName: 'otherContacts/1',
              names: [{ displayName: '  John Doe  ' }],
              emailAddresses: [{ value: 'john@example.com' }],
            },
          ],
          totalSize: 1,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries[0].displayName).toBe('John Doe');
    });

    it('should treat empty string display name as undefined', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              resourceName: 'otherContacts/1',
              names: [{ displayName: '   ' }],
              emailAddresses: [{ value: 'test@example.com' }],
            },
          ],
          totalSize: 1,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries[0].displayName).toBeUndefined();
    });

    it('should not call progress callback when totalSize is undefined', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              resourceName: 'otherContacts/1',
              names: [{ displayName: 'Test' }],
              emailAddresses: [{ value: 'test@example.com' }],
            },
          ],
        },
      });
      const progressCallback = vi.fn();
      await fetcher.fetchOtherContacts(progressCallback);
      expect(progressCallback).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw 403 error for insufficient scope', async () => {
      const scopeError = new Error(
        'Request had insufficient authentication scopes.'
      );
      (scopeError as { code?: number }).code = 403;
      mockListFn.mockRejectedValue(scopeError);
      await expect(fetcher.fetchOtherContacts()).rejects.toThrow(
        'Request had insufficient authentication scopes.'
      );
    });

    it('should identify 403 scope error by error code', () => {
      const error = { code: 403, message: 'Insufficient Permission' };
      const isScopeError = error.code === 403;
      expect(isScopeError).toBe(true);
    });

    it('should propagate 429 rate limit error to retryWithBackoff', async () => {
      const rateLimitError = new Error('Rate Limit Exceeded');
      (rateLimitError as { code?: number }).code = 429;
      mockListFn.mockRejectedValue(rateLimitError);
      await expect(fetcher.fetchOtherContacts()).rejects.toThrow(
        'Rate Limit Exceeded'
      );
    });

    it('should identify 429 rate limit error by error code', () => {
      const error = { code: 429, message: 'Rate Limit Exceeded' };
      const isRateLimitError = error.code === 429;
      expect(isRateLimitError).toBe(true);
    });

    it('should return partial results on network failure mid-pagination', async () => {
      mockListFn
        .mockResolvedValueOnce(mockGoogleApiResponse.multiplePagesFirstPage)
        .mockRejectedValueOnce(new Error('Network failure'));
      await expect(fetcher.fetchOtherContacts()).rejects.toThrow(
        'Network failure'
      );
    });

    it('should handle undefined otherContacts in response', async () => {
      mockListFn.mockResolvedValue({
        data: {
          totalSize: 0,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(0);
    });

    it('should handle null values in email addresses array', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              resourceName: 'otherContacts/1',
              emailAddresses: [
                { value: null },
                { value: 'valid@test.com' },
                { value: undefined },
              ],
            },
          ],
          totalSize: 1,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(1);
      expect(entries[0].emails).toEqual(['valid@test.com']);
    });

    it('should handle null values in phone numbers array', async () => {
      mockListFn.mockResolvedValue({
        data: {
          otherContacts: [
            {
              resourceName: 'otherContacts/1',
              phoneNumbers: [
                { value: null },
                { value: '+1-555-123-4567' },
                { value: undefined },
              ],
            },
          ],
          totalSize: 1,
        },
      });
      const entries = await fetcher.fetchOtherContacts();
      expect(entries).toHaveLength(1);
      expect(entries[0].phones).toEqual(['+1-555-123-4567']);
    });
  });

  describe('re-authentication flow detection', () => {
    it('should detect scope insufficient error requiring re-auth', () => {
      const error = {
        code: 403,
        errors: [{ reason: 'insufficientPermissions' }],
      };
      const needsReAuth =
        error.code === 403 &&
        error.errors?.some(
          (e: { reason: string }) => e.reason === 'insufficientPermissions'
        );
      expect(needsReAuth).toBe(true);
    });

    it('should not flag other 403 errors as needing re-auth', () => {
      const error = {
        code: 403,
        errors: [{ reason: 'forbidden' }],
      };
      const needsReAuth =
        error.code === 403 &&
        error.errors?.some(
          (e: { reason: string }) => e.reason === 'insufficientPermissions'
        );
      expect(needsReAuth).toBe(false);
    });

    it('should handle error without errors array', () => {
      const error = { code: 403 };
      const needsReAuth =
        error.code === 403 &&
        (error as { errors?: Array<{ reason: string }> }).errors?.some(
          (e: { reason: string }) => e.reason === 'insufficientPermissions'
        );
      expect(needsReAuth).toBeFalsy();
    });
  });
});
