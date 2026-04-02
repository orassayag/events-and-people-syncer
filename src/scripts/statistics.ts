import { injectable, inject } from 'inversify';
import { Logger } from '../logging';
import { DuplicateDetector } from '../services/contacts';
import { StatisticsCollector } from '../services/statistics';
import { FormatUtils, EMOJIS } from '../constants';
import { formatDateDDMMYYYY } from '../utils';
import { SETTINGS } from '../settings';
import type { Script, Statistics } from '../types';

@injectable()
export class StatisticsScript {
  private readonly logger: Logger;

  constructor(
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new Logger('Statistics');
  }

  async run(): Promise<void> {
    this.logger.display('Statistics');
    const stats = await this.collectStatistics();
    this.validateStatistics(stats);
    this.displayStatistics(stats);
  }

  private async collectStatistics(): Promise<Statistics> {
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Collecting statistics...',
      color: 'cyan',
    }).start();
    const collector = new StatisticsCollector(this.duplicateDetector);
    const stats = await collector.collectAll(spinner);
    spinner.stop();
    spinner.clear();
    this.logger.resetState('spinner');
    return stats;
  }

  private displayStatistics(stats: Statistics): void {
    const formatNumber = (num: number): string =>
      FormatUtils.formatNumberWithLeadingZeros(num, 6);
    const contactDisplay =
      stats.contacts.googleContacts === -1
        ? 'N/A'
        : formatNumber(stats.contacts.googleContacts);
    const contactsToSyncDisplay =
      stats.contacts.contactsToSync === -1
        ? 'N/A'
        : formatNumber(stats.contacts.contactsToSync);
    const otherContactsToSyncDisplay =
      stats.contacts.otherContactsToSync === -1
        ? 'N/A'
        : formatNumber(stats.contacts.otherContactsToSync);
    const avgJobDisplay =
      stats.averages.avgNotesPerJob === null
        ? 'N/A'
        : `${stats.averages.avgNotesPerJob.toFixed(1)} notes`;
    const avgHRDisplay =
      stats.averages.avgNotesPerHR === null
        ? 'N/A'
        : `${stats.averages.avgNotesPerHR.toFixed(1)} notes`;
    const avgEventDisplay =
      stats.averages.avgNotesPerEvent === null
        ? 'N/A'
        : `${stats.averages.avgNotesPerEvent.toFixed(1)} notes`;
    const oldestDate = stats.activity.oldestNoteDate
      ? formatDateDDMMYYYY(stats.activity.oldestNoteDate)
      : 'N/A';
    const newestDate = stats.activity.newestNoteDate
      ? formatDateDDMMYYYY(stats.activity.newestNoteDate)
      : 'N/A';
    const storage = this.formatStorage(stats.activity.totalStorageBytes);
    const mostActive = stats.activity.mostActiveFolder 
      ? `${stats.activity.mostActiveFolder} (${stats.activity.mostActiveFolderCount} notes)`
      : 'N/A';
    const labels = [
      'Jobs',
      'HR',
      'Events',
      'Notes',
      'Contacts',
      'Contacts to Sync',
      'Other to Sync',
      'Job',
      'HR',
      'Event',
      'Notes Today',
      'Notes Week',
      'Empty Folders',
      'Avg Job',
      'Avg HR',
      'Avg Event',
      'Most Active',
      'Oldest',
      'Newest',
      'Storage',
    ];
    const maxLabelLength = Math.max(...labels.map(label => label.length));
    const padLabel = (label: string): string => label.padEnd(maxLabelLength + 2);
    const formatValue = (num: number, suffix: string): string => 
      `${formatNumber(num)} ${suffix}`;
    const formatContactValue = (display: string, suffix: string): string =>
      `${display} ${suffix}`;
    const allValueParts = [
      formatValue(stats.folders.jobFolders, 'folders'),
      formatValue(stats.folders.hrFolders, 'folders'),
      formatValue(stats.folders.eventFolders, 'folders'),
      formatValue(stats.notes.totalNotes, 'notes'),
      formatContactValue(contactDisplay, 'contacts'),
      formatContactValue(contactsToSyncDisplay, 'contacts'),
      formatContactValue(otherContactsToSyncDisplay, 'entries'),
      formatValue(stats.notes.jobNotes, 'notes'),
      formatValue(stats.notes.hrNotes, 'notes'),
      formatValue(stats.notes.eventNotes, 'notes'),
      formatValue(stats.notes.notesToday, 'notes'),
      formatValue(stats.notes.notesThisWeek, 'notes'),
      formatValue(stats.folders.emptyFolders, 'folders'),
      avgJobDisplay,
      avgHRDisplay,
      avgEventDisplay,
      mostActive,
      oldestDate,
      newestDate,
      storage,
    ];
    const maxValueLength = Math.max(...allValueParts.map(val => val.length));
    const padValue = (value: string): string => value.padEnd(maxValueLength);
    const allLines = [
      'Statistics',
      `${padLabel('Contacts')}${padValue(formatContactValue(contactDisplay, 'contacts'))}`,
      `${padLabel('Contacts to Sync')}${padValue(formatContactValue(contactsToSyncDisplay, 'contacts'))}`,
      `${padLabel('Other to Sync')}${padValue(formatContactValue(otherContactsToSyncDisplay, 'entries'))}`,
      `${padLabel('Notes')}${padValue(formatValue(stats.notes.totalNotes, 'notes'))}`,
      `${padLabel('Job')}${padValue(formatValue(stats.notes.jobNotes, 'notes'))}`,
      `${padLabel('HR')}${padValue(formatValue(stats.notes.hrNotes, 'notes'))}`,
      `${padLabel('Event')}${padValue(formatValue(stats.notes.eventNotes, 'notes'))}`,
      `${padLabel('Jobs')}${padValue(formatValue(stats.folders.jobFolders, 'folders'))}`,
      `${padLabel('HR')}${padValue(formatValue(stats.folders.hrFolders, 'folders'))}`,
      `${padLabel('Events')}${padValue(formatValue(stats.folders.eventFolders, 'folders'))}`,
      `${padLabel('Notes Today')}${padValue(formatValue(stats.notes.notesToday, 'notes'))}`,
      `${padLabel('Notes Week')}${padValue(formatValue(stats.notes.notesThisWeek, 'notes'))}`,
      `${padLabel('Empty Folders')}${padValue(formatValue(stats.folders.emptyFolders, 'folders'))}`,
      `${padLabel('Avg Job')}${padValue(avgJobDisplay)}`,
      `${padLabel('Avg HR')}${padValue(avgHRDisplay)}`,
      `${padLabel('Avg Event')}${padValue(avgEventDisplay)}`,
      `${padLabel('Most Active')}${padValue(mostActive)}`,
      `${padLabel('Oldest')}${padValue(oldestDate)}`,
      `${padLabel('Newest')}${padValue(newestDate)}`,
      `${padLabel('Storage')}${padValue(storage)}`,
    ];
    const maxContentLength = Math.max(...allLines.map(line => line.length));
    const minWidth = SETTINGS.statistics.displayWidth;
    const width = Math.max(maxContentLength + 4, minWidth);
    const padLine = (content: string): string =>
      FormatUtils.padLineWithEquals(content, width);
    console.log('\n' + padLine('Statistics'));
    console.log(padLine(`${padLabel('Contacts')}${padValue(formatContactValue(contactDisplay, 'contacts'))}`));
    console.log(padLine(`${padLabel('Contacts to Sync')}${padValue(formatContactValue(contactsToSyncDisplay, 'contacts'))}`));
    console.log(padLine(`${padLabel('Other to Sync')}${padValue(formatContactValue(otherContactsToSyncDisplay, 'entries'))}`));
    console.log(padLine(`${padLabel('Notes')}${padValue(formatValue(stats.notes.totalNotes, 'notes'))}`));
    console.log(padLine(`${padLabel('Job')}${padValue(formatValue(stats.notes.jobNotes, 'notes'))}`));
    console.log(padLine(`${padLabel('HR')}${padValue(formatValue(stats.notes.hrNotes, 'notes'))}`));
    console.log(padLine(`${padLabel('Event')}${padValue(formatValue(stats.notes.eventNotes, 'notes'))}`));
    console.log(padLine(`${padLabel('Jobs')}${padValue(formatValue(stats.folders.jobFolders, 'folders'))}`));
    console.log(padLine(`${padLabel('HR')}${padValue(formatValue(stats.folders.hrFolders, 'folders'))}`));
    console.log(padLine(`${padLabel('Events')}${padValue(formatValue(stats.folders.eventFolders, 'folders'))}`));
    console.log(padLine(`${padLabel('Notes Today')}${padValue(formatValue(stats.notes.notesToday, 'notes'))}`));
    console.log(padLine(`${padLabel('Notes Week')}${padValue(formatValue(stats.notes.notesThisWeek, 'notes'))}`));
    console.log(padLine(`${padLabel('Empty Folders')}${padValue(formatValue(stats.folders.emptyFolders, 'folders'))}`));
    console.log(padLine(`${padLabel('Avg Job')}${padValue(avgJobDisplay)}`));
    console.log(padLine(`${padLabel('Avg HR')}${padValue(avgHRDisplay)}`));
    console.log(padLine(`${padLabel('Avg Event')}${padValue(avgEventDisplay)}`));
    console.log(padLine(`${padLabel('Most Active')}${padValue(mostActive)}`));
    console.log(padLine(`${padLabel('Oldest')}${padValue(oldestDate)}`));
    console.log(padLine(`${padLabel('Newest')}${padValue(newestDate)}`));
    console.log(padLine(`${padLabel('Storage')}${padValue(storage)}`));
    console.log('='.repeat(width));
    console.log();
  }

  private formatStorage(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const clampedIndex = Math.min(i, units.length - 1);
    return `${(bytes / Math.pow(k, clampedIndex)).toFixed(1)} ${units[clampedIndex]}`;
  }

  private validateStatistics(stats: Statistics): void {
    const { folders, notes } = stats;
    const calculatedTotal = notes.jobNotes + notes.hrNotes + notes.eventNotes;
    if (notes.totalNotes !== calculatedTotal) {
      this.logger.warn(
        `Statistics inconsistency: totalNotes (${notes.totalNotes}) does not match sum (${calculatedTotal})`
      );
    }
    if (notes.notesThisWeek < notes.notesToday) {
      this.logger.warn(
        `Statistics inconsistency: notesThisWeek (${notes.notesThisWeek}) < notesToday (${notes.notesToday})`
      );
    }
    const calculatedTotalFolders = folders.jobFolders + folders.hrFolders + folders.eventFolders;
    if (folders.totalFolders !== calculatedTotalFolders) {
      this.logger.warn(
        `Statistics inconsistency: totalFolders (${folders.totalFolders}) does not match sum (${calculatedTotalFolders})`
      );
    }
    if (folders.emptyFolders > folders.totalFolders) {
      this.logger.warn(
        `Statistics inconsistency: emptyFolders (${folders.emptyFolders}) > totalFolders (${folders.totalFolders})`
      );
    }
  }
}

export const statisticsScript: Script = {
  metadata: {
    name: 'Statistics',
    description: 'Display comprehensive statistics about jobs, HR, events, notes, and contacts',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    estimatedDuration: '10-30 seconds',
    emoji: EMOJIS.SCRIPTS.STATISTICS,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(StatisticsScript);
    await script.run();
  },
};
