// NOTE: This script naturally bypasses dry-mode as it only performs local file operations
import { injectable } from 'inversify';
import { Logger } from '../logging';
import { EMOJIS } from '../constants';
import type { Script } from '../types/script';
import * as fs from 'fs';
import * as path from 'path';

@injectable()
export class ClearLogsScript {
  private readonly logger: Logger;
  private readonly logsDir: string;

  constructor() {
    this.logger = new Logger('ClearLogs');
    this.logsDir = path.join(process.cwd(), 'logs');
  }

  async run(): Promise<void> {
    this.logger.display('Clear Logs');
    if (!fs.existsSync(this.logsDir)) {
      this.logger.info('No logs folder found. Nothing to clear.');
      return;
    }
    const files = fs.readdirSync(this.logsDir).filter((file: string) => file.endsWith('.log'));
    if (files.length === 0) {
      this.logger.info('No log files found.');
      return;
    }
    this.logger.info(`Found ${files.length} log file(s):`);
    files.forEach((file: string) => {
      const filePath = path.join(this.logsDir, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      this.logger.info(`  - ${file} (${sizeKB} KB)`);
    });
    this.logger.info('Clearing logs...');
    files.forEach((file: string) => {
      const filePath = path.join(this.logsDir, file);
      fs.unlinkSync(filePath);
    });
    this.logger.info(`${EMOJIS.STATUS.SUCCESS} Successfully cleared ${files.length} log files`);
  }
}

export const clearLogsScript: Script = {
  metadata: {
    name: 'Clear Logs',
    description: 'Clear all log files from the logs folder',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    estimatedDuration: '1-5 seconds',
    emoji: EMOJIS.ACTIONS.CLEANUP,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(ClearLogsScript);
    await script.run();
  },
};
