export const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  logDir: 'logs',
  maxFileSize: 10 * 1024 * 1024,
  logRetentionDays: 30,
  enableConsole: true,
  enableFile: false,
};
