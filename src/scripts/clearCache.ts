// NOTE: This script naturally bypasses dry-mode as it only performs local file operations
import { injectable } from 'inversify';
import { Logger } from '../logging';
import { EMOJIS } from '../constants';
import type { Script } from '../types/script';
import * as fs from 'fs';
import * as path from 'path';

@injectable()
export class ClearCacheScript {
  private readonly logger: Logger;
  private readonly cacheDir: string;

  constructor() {
    this.logger = new Logger('ClearCache');
    this.cacheDir = path.join(process.cwd(), 'sources', '.cache');
  }

  async run(): Promise<void> {
    this.logger.display('Clear Cache');
    if (!fs.existsSync(this.cacheDir)) {
      this.logger.info('No cache folder found. Nothing to clear.');
      return;
    }
    const files = fs.readdirSync(this.cacheDir);
    if (files.length === 0) {
      this.logger.info('Cache folder is already empty.');
      return;
    }
    this.logger.info(`Found ${files.length} file(s) in cache:`);
    files.forEach((file: string) => {
      const filePath = path.join(this.cacheDir, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      this.logger.info(`  - ${file} (${sizeKB} KB)`);
    });
    this.logger.info('Clearing cache...');
    files.forEach((file: string) => {
      const filePath = path.join(this.cacheDir, file);
      fs.unlinkSync(filePath);
    });
    this.logger.info(`${EMOJIS.STATUS.SUCCESS} Successfully cleared ${files.length} files from cache`);
  }
}

export const clearCacheScript: Script = {
  metadata: {
    name: 'Clear Cache',
    description: 'Clear all cached data (company mappings, folder mappings, contacts)',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    estimatedDuration: '1-5 seconds',
    emoji: EMOJIS.ACTIONS.CLEANUP,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(ClearCacheScript);
    await script.run();
  },
};
