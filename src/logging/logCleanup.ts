import { promises as fs } from 'fs';
import { join } from 'path';
import { LOG_CONFIG } from './logConfig';

export class LogCleanup {
  static async cleanOldLogs(): Promise<void> {
    const retentionMs: number = LOG_CONFIG.logRetentionDays * 24 * 60 * 60 * 1000;
    const now: number = Date.now();
    await this.cleanDirectory(LOG_CONFIG.logDir, retentionMs, now);
    const syncLogDir: string = join(LOG_CONFIG.logDir, 'linkedin-sync');
    try {
      await fs.access(syncLogDir);
      await this.cleanDirectory(syncLogDir, retentionMs, now);
    } catch {
    }
  }

  private static async cleanDirectory(dirPath: string, retentionMs: number, now: number): Promise<void> {
    try {
      const files: string[] = await fs.readdir(dirPath);
      for (const file of files) {
        if (file === '.health-check') {
          continue;
        }
        if (file.endsWith('_ALERTS.log')) {
          continue;
        }
        const filePath: string = join(dirPath, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            const ageMs: number = now - stats.mtimeMs;
            if (ageMs > retentionMs) {
              await fs.unlink(filePath);
              console.log(`Deleted old log file: ${file} (age: ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days)`);
            }
          }
        } catch (error: unknown) {
          console.warn(`Failed to process file ${file}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error: unknown) {
      console.warn(`Failed to clean directory ${dirPath}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
