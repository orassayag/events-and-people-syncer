import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthCheck } from '../healthCheck';
import { Logger } from '../../logging';
import { AuthService } from '../../services/auth';

vi.mock('../../logging', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('../../services/auth', () => ({
  AuthService: class {
    authorize = vi.fn().mockResolvedValue({});
  },
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('HealthCheck', () => {
  let healthCheck: HealthCheck;
  let mockLogger: any;
  let mockAuthService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = new Logger('Test');
    mockAuthService = new AuthService();
    healthCheck = new HealthCheck(mockLogger, mockAuthService);

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  describe('checkAll', () => {
    it('should return healthy for all checks when everything is fine', async () => {
      process.env.CLIENT_ID = 'id';
      process.env.CLIENT_SECRET = 'secret';
      process.env.PROJECT_ID = 'project';

      const results = await healthCheck.checkAll();
      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result.status).toBe('healthy');
      });
    });

    it('should return unhealthy if environment variables are missing', async () => {
      delete process.env.CLIENT_ID;

      const results = await healthCheck.checkAll();
      const envCheck = results.find((r) => r.service === 'environment');
      expect(envCheck?.status).toBe('unhealthy');
      expect(envCheck?.message).toContain('CLIENT_ID');
    });

    it('should return degraded if API connection fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const results = await healthCheck.checkAll();
      const apiCheck = results.find((r) => r.service === 'google-api');
      expect(apiCheck?.status).toBe('degraded');
      expect(apiCheck?.message).toBe('HTTP 500');
    });
  });
});
