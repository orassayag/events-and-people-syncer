import { promises as fs } from 'fs';
import { join } from 'path';
import { injectable, inject } from 'inversify';
import type { Ora } from 'ora';
import { Logger } from '../../logging';
import { DuplicateDetector } from '../contacts';
import { ContactCache, OtherContactsCache } from '../../cache';
import { SETTINGS } from '../../settings';
import { RegexPatterns } from '../../regex';
import type {
  ContactData,
  Statistics,
  FolderStatistics,
  NoteStatistics,
  ContactStatistics,
  AverageStatistics,
  ActivityStatistics,
  FileMetadata,
  FolderData,
} from '../../types';

@injectable()
export class StatisticsCollector {
  private readonly logger: Logger;

  constructor(
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new Logger('StatisticsCollector');
  }

  async collectAll(spinner: Ora): Promise<Statistics> {
    const timestamp = Date.now();
    await this.validateDirectories();
    spinner.text = 'Scanning job-interviews folder...';
    const jobData = await this.scanJobInterviewsFolder();
    spinner.text = 'Scanning life-events folder...';
    const eventData = await this.scanLifeEventsFolder();
    spinner.text = 'Calculating statistics...';
    const folders = this.calculateFolderStatistics(jobData, eventData);
    const notes = this.calculateNoteStatistics(jobData, eventData);
    const activity = this.calculateActivityStatistics(jobData, eventData);
    const averages = this.calculateAverages(folders, notes);
    spinner.text = 'Fetching Google contacts...';
    const contacts = await this.collectContactStatistics();
    return {
      folders,
      notes,
      contacts,
      averages,
      activity,
      timestamp,
    };
  }

  private async validateDirectories(): Promise<void> {
    const jobPath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
    let jobExists = false;
    let lifeEventsExists = false;
    try {
      await fs.access(jobPath);
      jobExists = true;
    } catch {}
    try {
      await fs.access(lifeEventsPath);
      lifeEventsExists = true;
    } catch {}
    if (!jobExists && !lifeEventsExists) {
      throw new Error(
        'At least one directory must exist (job-interviews or life-events)'
      );
    }
  }

  private getFileCreationDate(stats: any): Date {
    const birthtime = stats.birthtime;
    const mtime = stats.mtime;
    if (
      birthtime.getFullYear() === 1970 &&
      birthtime.getMonth() === 0 &&
      birthtime.getDate() === 1
    ) {
      return mtime;
    }
    if (birthtime > new Date()) {
      return mtime;
    }
    return birthtime;
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const dateStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    return todayStart.getTime() === dateStart.getTime();
  }

  private isThisWeek(date: Date): boolean {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date >= weekAgo;
  }

  private async countNotesInFolder(
    folderPath: string
  ): Promise<{ count: number; files: FileMetadata[] }> {
    try {
      const files = await fs.readdir(folderPath);
      const txtFiles: FileMetadata[] = [];
      for (const file of files) {
        try {
          if (file.toLowerCase().endsWith('.txt')) {
            const filePath = join(folderPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              txtFiles.push({
                name: file,
                creationDate: this.getFileCreationDate(stats),
                size: stats.size,
              });
            }
          }
        } catch {
          continue;
        }
      }
      return { count: txtFiles.length, files: txtFiles };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { count: 0, files: [] };
      }
      throw error;
    }
  }

  private async scanJobInterviewsFolder(): Promise<{
    jobFolders: FolderData[];
    hrFolders: FolderData[];
  }> {
    const jobPath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const jobFolders: FolderData[] = [];
    const hrFolders: FolderData[] = [];
    try {
      const folders = await fs.readdir(jobPath);
      for (const folderName of folders) {
        try {
          const folderPath = join(jobPath, folderName);
          const stats = await fs.stat(folderPath);
          if (stats.isDirectory()) {
            const noteData = await this.countNotesInFolder(folderPath);
            const folderData: FolderData = {
              name: folderName,
              path: folderPath,
              noteCount: noteData.count,
              files: noteData.files,
            };
            if (folderName.startsWith('Job_')) {
              jobFolders.push(folderData);
            } else if (folderName.startsWith('HR_')) {
              hrFolders.push(folderData);
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.warn('Error scanning job-interviews folder');
      }
    }
    return { jobFolders, hrFolders };
  }

  private async scanLifeEventsFolder(): Promise<{
    eventFolders: FolderData[];
  }> {
    const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
    const eventFolders: FolderData[] = [];
    try {
      const folders = await fs.readdir(lifeEventsPath);
      for (const folderName of folders) {
        try {
          const folderPath = join(lifeEventsPath, folderName);
          const stats = await fs.stat(folderPath);
          if (stats.isDirectory()) {
            const noteData = await this.countNotesInFolder(folderPath);
            const folderData: FolderData = {
              name: folderName,
              path: folderPath,
              noteCount: noteData.count,
              files: noteData.files,
            };
            eventFolders.push(folderData);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.warn('Error scanning life-events folder');
      }
    }
    return { eventFolders };
  }

  private calculateFolderStatistics(
    jobData: { jobFolders: FolderData[]; hrFolders: FolderData[] },
    eventData: { eventFolders: FolderData[] }
  ): FolderStatistics {
    const jobFolders = jobData.jobFolders.length;
    const hrFolders = jobData.hrFolders.length;
    const eventFolders = eventData.eventFolders.length;
    const totalFolders = jobFolders + hrFolders + eventFolders;
    const allFolders = [
      ...jobData.jobFolders,
      ...jobData.hrFolders,
      ...eventData.eventFolders,
    ];
    const emptyFolders = allFolders.filter(
      (folder) => folder.noteCount === 0
    ).length;
    return {
      jobFolders,
      hrFolders,
      eventFolders,
      totalFolders,
      emptyFolders,
    };
  }

  private calculateNoteStatistics(
    jobData: { jobFolders: FolderData[]; hrFolders: FolderData[] },
    eventData: { eventFolders: FolderData[] }
  ): NoteStatistics {
    const jobNotes = jobData.jobFolders.reduce(
      (sum, folder) => sum + folder.noteCount,
      0
    );
    const hrNotes = jobData.hrFolders.reduce(
      (sum, folder) => sum + folder.noteCount,
      0
    );
    const eventNotes = eventData.eventFolders.reduce(
      (sum, folder) => sum + folder.noteCount,
      0
    );
    const totalNotes = jobNotes + hrNotes + eventNotes;
    const allFolders = [
      ...jobData.jobFolders,
      ...jobData.hrFolders,
      ...eventData.eventFolders,
    ];
    const allFiles: FileMetadata[] = [];
    for (const folder of allFolders) {
      allFiles.push(...folder.files);
    }
    const notesToday = allFiles.filter((file) =>
      this.isToday(file.creationDate)
    ).length;
    const notesThisWeek = allFiles.filter((file) =>
      this.isThisWeek(file.creationDate)
    ).length;
    return {
      jobNotes,
      hrNotes,
      eventNotes,
      totalNotes,
      notesToday,
      notesThisWeek,
    };
  }

  private calculateAverages(
    folders: FolderStatistics,
    notes: NoteStatistics
  ): AverageStatistics {
    const avgNotesPerJob =
      folders.jobFolders > 0 ? notes.jobNotes / folders.jobFolders : null;
    const avgNotesPerHR =
      folders.hrFolders > 0 ? notes.hrNotes / folders.hrFolders : null;
    const avgNotesPerEvent =
      folders.eventFolders > 0 ? notes.eventNotes / folders.eventFolders : null;
    return {
      avgNotesPerJob,
      avgNotesPerHR,
      avgNotesPerEvent,
    };
  }

  private calculateActivityStatistics(
    jobData: { jobFolders: FolderData[]; hrFolders: FolderData[] },
    eventData: { eventFolders: FolderData[] }
  ): ActivityStatistics {
    const allFolders = [
      ...jobData.jobFolders,
      ...jobData.hrFolders,
      ...eventData.eventFolders,
    ];
    let mostActiveFolder: string | null = null;
    let mostActiveFolderCount = 0;
    for (const folder of allFolders) {
      if (folder.noteCount > mostActiveFolderCount) {
        mostActiveFolderCount = folder.noteCount;
        mostActiveFolder = folder.name;
      }
    }
    const allFiles: FileMetadata[] = [];
    for (const folder of allFolders) {
      allFiles.push(...folder.files);
    }
    let oldestNoteDate: Date | null = null;
    let newestNoteDate: Date | null = null;
    let totalStorageBytes = 0;
    for (const file of allFiles) {
      if (oldestNoteDate === null || file.creationDate < oldestNoteDate) {
        oldestNoteDate = file.creationDate;
      }
      if (newestNoteDate === null || file.creationDate > newestNoteDate) {
        newestNoteDate = file.creationDate;
      }
      totalStorageBytes += file.size;
    }
    return {
      mostActiveFolder,
      mostActiveFolderCount,
      oldestNoteDate,
      newestNoteDate,
      totalStorageBytes,
    };
  }

  async collectContactStatistics(): Promise<ContactStatistics> {
    try {
      await ContactCache.getInstance().invalidate();
      const contacts = await this.duplicateDetector['fetchAllContacts']();
      const contactsToSync = this.calculateContactsToSync(contacts);
      const otherContactsToSync = await this.getOtherContactsCount();
      return {
        googleContacts: contacts.length,
        contactsToSync,
        otherContactsToSync,
      };
    } catch (error) {
      this.logger.error('Failed to fetch contacts', error as Error);
      return {
        googleContacts: -1,
        contactsToSync: -1,
        otherContactsToSync: -1,
      };
    }
  }

  private async getOtherContactsCount(): Promise<number> {
    const cache = OtherContactsCache.getInstance();
    const cached = await cache.get();
    return cached?.length ?? -1;
  }

  private calculateContactsToSync(contacts: ContactData[]): number {
    const filteredContacts = this.filterContactsForSync(contacts);
    return this.categorizeContactsForSync(filteredContacts).length;
  }

  private filterContactsForSync(contacts: ContactData[]): ContactData[] {
    return contacts.filter((contact) => {
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      if (hasUnknownLabel) {
        return true;
      }
      const noteText = contact.note || contact.biography || '';
      return !(
        RegexPatterns.SYNCER_ADDED_NOTE.test(noteText) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(noteText) ||
        RegexPatterns.SYNC_ADDED_NOTE.test(noteText)
      );
    });
  }

  private categorizeContactsForSync(contacts: ContactData[]): ContactData[] {
    const syncableContacts: ContactData[] = [];
    for (const contact of contacts) {
      const reasons: string[] = [];
      const hasHebrew = this.checkHebrewInAllFields(contact);
      const noLabel = !contact.label || contact.label.trim() === '';
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const noCompany = !contact.company || contact.company.trim() === '';
      const missingOther = this.checkMissingFields(contact);
      if (hasHebrew) {
        reasons.push('Contains Hebrew');
        if (noLabel || hasUnknownLabel) reasons.push('Missing label');
        if (noCompany) reasons.push('Missing company');
      } else if (noLabel || hasUnknownLabel) {
        reasons.push('Missing label');
        if (noCompany) reasons.push('Missing company');
      } else if (noCompany) {
        reasons.push('Missing company');
      }
      if (missingOther.length > 0) {
        reasons.push(...missingOther);
      }
      if (reasons.length > 0 && contact.resourceName) {
        syncableContacts.push(contact);
      }
    }
    return syncableContacts;
  }

  private checkHebrewInAllFields(contact: ContactData): boolean {
    const fieldsToCheck = [
      contact.firstName,
      contact.lastName,
      contact.company,
      contact.jobTitle,
      contact.label,
      contact.note || contact.biography || '',
      ...contact.emails.map((e) => e.value),
      ...contact.phones.map((p) => p.number),
    ];
    return fieldsToCheck.some(
      (field) => field && RegexPatterns.HEBREW.test(field)
    );
  }

  private checkMissingFields(contact: ContactData): string[] {
    const missing: string[] = [];
    if (this.isArrayFieldMissing(contact.emails, (e) => e.value)) {
      missing.push('Missing email');
    }
    if (this.isArrayFieldMissing(contact.phones, (p) => p.number)) {
      missing.push('Missing phone');
    }
    const hasLinkedIn = contact.websites.some((w) =>
      w.label.toLowerCase().includes('linkedin')
    );
    if (!hasLinkedIn) {
      missing.push('Missing LinkedIn URL');
    }
    if (this.isMissingField(contact.jobTitle)) {
      missing.push('Missing job title');
    }
    if (this.isMissingField(contact.firstName)) {
      missing.push('Missing first name');
    }
    if (this.isMissingField(contact.lastName)) {
      missing.push('Missing last name');
    }
    return missing;
  }

  private isMissingField(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim() === '';
  }

  private isArrayFieldMissing<T>(
    array: T[] | undefined,
    valueExtractor: (item: T) => string
  ): boolean {
    return (
      !array ||
      array.length === 0 ||
      array.every((item) => this.isMissingField(valueExtractor(item)))
    );
  }
}
