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
    await Promise.resolve();
    this.logger.display('Clear Logs');
    if (!fs.existsSync(this.logsDir)) {
      this.logger.info('No logs folder found. Nothing to clear.');
      return;
    }
    const allItems = fs.readdirSync(this.logsDir);

    if (allItems.length === 0) {
      this.logger.info('Logs folder is already empty.');
      return;
    }
    this.logger.info(`Found ${allItems.length} item(s) in logs folder.`);
    this.logger.info('Clearing everything in logs folder...');

    let count = 0;
    allItems.forEach((item: string) => {
      const fullPath = path.join(this.logsDir, item);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        count++;
      } catch (error) {
        this.logger.error(
          `Failed to delete ${item}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    this.logger.info(
      `${EMOJIS.STATUS.SUCCESS} Successfully cleared ${count} item(s) from logs folder`
    );
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
