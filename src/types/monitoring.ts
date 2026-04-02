import type { Settings as SettingsType } from '../settings/settings';

export type Settings = SettingsType;

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: string;
}

export interface PathValidationResult {
  path: string;
  exists: boolean;
  isDirectory: boolean;
}
