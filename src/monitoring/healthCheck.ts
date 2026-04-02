import { injectable, inject } from 'inversify';
import { TYPES } from '../types';
import type { HealthStatus } from '../types';
import { Logger } from '../logging';
import { AuthService } from '../services/auth';

export { HealthStatus };

@injectable()
export class HealthCheck {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.AuthService) private authService: AuthService
  ) {}

  async checkAll(): Promise<HealthStatus[]> {
    this.logger.info('Running health checks');
    const checks: HealthStatus[] = [
      await this.checkAuth(),
      await this.checkApiConnection(),
      await this.checkFileSystem(),
      this.checkEnvironment(),
    ];
    const unhealthy: HealthStatus[] = checks.filter(
      (c: HealthStatus) => c.status === 'unhealthy'
    );
    if (unhealthy.length > 0) {
      this.logger.error('Health check failed', undefined, {
        unhealthyServices: unhealthy,
      });
    } else {
      this.logger.info('All health checks passed');
    }
    return checks;
  }

  private async checkAuth(): Promise<HealthStatus> {
    await this.authService.authorize();
    return {
      service: 'authentication',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkApiConnection(): Promise<HealthStatus> {
    const response: Response = await fetch(
      'https://www.googleapis.com/oauth2/v1/certs',
      {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      }
    );
    return {
      service: 'google-api',
      status: response.ok ? 'healthy' : 'degraded',
      message: response.ok ? undefined : `HTTP ${response.status}`,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkFileSystem(): Promise<HealthStatus> {
    const fs = await import('fs/promises');
    const testFile: string = 'logs/.health-check';
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    return {
      service: 'filesystem',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  private checkEnvironment(): HealthStatus {
    const requiredVars: string[] = ['CLIENT_ID', 'CLIENT_SECRET', 'PROJECT_ID'];
    const missing: string[] = requiredVars.filter(
      (v: string) => !process.env[v]
    );
    if (missing.length > 0) {
      return {
        service: 'environment',
        status: 'unhealthy',
        message: `Missing variables: ${missing.join(', ')}`,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      service: 'environment',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
