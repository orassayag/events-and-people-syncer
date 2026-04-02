import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { injectable } from 'inversify';
import type { ApiStats } from '../../types';
import { SETTINGS } from '../../settings';
import { Logger } from '../../logging';

@injectable()
export class ApiTracker {
  private static instance: ApiTracker;
  private statsFilePath: string;

  private constructor() {
    this.statsFilePath = SETTINGS.paths.apiStatsFile;
  }

  static getInstance(): ApiTracker {
    if (!ApiTracker.instance) {
      ApiTracker.instance = new ApiTracker();
    }
    return ApiTracker.instance;
  }

  async trackRead(): Promise<void> {
    const stats: ApiStats = await this.loadStats();
    stats.read_count++;
    await this.saveStats(stats);
  }

  async trackWrite(): Promise<void> {
    const stats: ApiStats = await this.loadStats();
    stats.write_count++;
    await this.saveStats(stats);
  }

  async logStats(uiLogger?: Logger): Promise<void> {
    const stats: ApiStats = await this.loadStats();
    const prefix = SETTINGS.dryMode ? '[DRY MODE] ' : '';
    const message = `${prefix}[API Counter] Read: ${stats.read_count}, Write: ${stats.write_count}`;
    if (uiLogger) {
      uiLogger.displayInfo(message);
    } else {
      console.log(message);
    }
  }

  private async loadStats(): Promise<ApiStats> {
    const currentDate: string = new Date().toISOString().split('T')[0];
    if (!existsSync(this.statsFilePath)) {
      const initialStats: ApiStats = {
        date: currentDate,
        read_count: 0,
        write_count: 0,
      };
      await this.saveStats(initialStats);
      return initialStats;
    }
    const data: string = await readFile(this.statsFilePath, 'utf-8');
    const stats: ApiStats = JSON.parse(data);
    if (this.shouldResetCounter(currentDate, stats.date)) {
      return {
        date: currentDate,
        read_count: 0,
        write_count: 0,
      };
    }
    return stats;
  }

  private async saveStats(stats: ApiStats): Promise<void> {
    await writeFile(
      this.statsFilePath,
      JSON.stringify(stats, null, 2),
      'utf-8'
    );
  }

  private shouldResetCounter(currentDate: string, statsDate: string): boolean {
    return currentDate !== statsDate;
  }

  async getStats(): Promise<{ read: number; write: number }> {
    const stats: ApiStats = await this.loadStats();
    return {
      read: stats.read_count,
      write: stats.write_count,
    };
  }
}
