import { readFile, writeFile } from 'fs/promises';
import type { ApiStats } from '../types.js';
import { SETTINGS } from '../settings.js';

export class ApiTracker {
  private static instance: ApiTracker;
  private statsFilePath: string;

  private constructor() {
    this.statsFilePath = SETTINGS.API_STATS_FILE_PATH;
  }

  static getInstance(): ApiTracker {
    if (!ApiTracker.instance) {
      ApiTracker.instance = new ApiTracker();
    }
    return ApiTracker.instance;
  }

  async trackRead(): Promise<void> {
    const stats = await this.loadStats();
    stats.read_count++;
    await this.saveStats(stats);
    console.log(`[API Counter] Read: ${stats.read_count}, Write: ${stats.write_count}`);
  }

  async trackWrite(): Promise<void> {
    const stats = await this.loadStats();
    stats.write_count++;
    await this.saveStats(stats);
    console.log(`[API Counter] Read: ${stats.read_count}, Write: ${stats.write_count}`);
  }

  private async loadStats(): Promise<ApiStats> {
    try {
      const data = await readFile(this.statsFilePath, 'utf-8');
      const stats: ApiStats = JSON.parse(data);
      const currentDate = new Date().toISOString().split('T')[0];
      if (this.shouldResetCounter(currentDate, stats.date)) {
        return {
          date: currentDate,
          read_count: 0,
          write_count: 0,
        };
      }
      return stats;
    } catch {
      const currentDate = new Date().toISOString().split('T')[0];
      return {
        date: currentDate,
        read_count: 0,
        write_count: 0,
      };
    }
  }

  private async saveStats(stats: ApiStats): Promise<void> {
    await writeFile(this.statsFilePath, JSON.stringify(stats, null, 2), 'utf-8');
  }

  private shouldResetCounter(currentDate: string, statsDate: string): boolean {
    return currentDate !== statsDate;
  }
}
