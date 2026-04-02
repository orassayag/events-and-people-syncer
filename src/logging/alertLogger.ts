import { promises as fs } from 'fs';
import { join } from 'path';
import { LOG_CONFIG } from './logConfig';
import {
  Alert,
  AlertContact,
  AlertType,
  AlertCounts,
  GroupedAlerts,
  ParseResult,
} from '../types';

export class AlertLogger {
  private filePath: string;
  private allAlerts: Alert[] = [];
  private currentRunAlerts: Alert[] = [];
  private previouslyAlertedCount: number = 0;
  private nextIndex: number = 1;

  constructor(scriptName: string) {
    this.filePath = join(LOG_CONFIG.logDir, `${scriptName}_ALERTS.log`);
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
    } catch (error: unknown) {
      throw new Error(
        `Failed to create log directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      if (content.trim().length === 0) {
        this.allAlerts = [];
        this.nextIndex = 1;
        return;
      }
      const parseResult = this.parseAlertFile(content);
      if (
        parseResult.validAlerts.length === 0 &&
        parseResult.corruptedEntries > 0
      ) {
        throw new Error(
          `Alert file is fully corrupted with ${parseResult.corruptedEntries} corrupted entries. Please delete the file manually: ${this.filePath}`
        );
      }
      this.allAlerts = parseResult.validAlerts;
      if (parseResult.corruptedEntries > 0) {
        console.warn(
          `Warning: ${parseResult.corruptedEntries} corrupted alert entries were skipped while loading ${this.filePath}`
        );
      }
      if (this.allAlerts.length > 0) {
        const maxIndex = Math.max(...this.allAlerts.map((a) => a.index));
        this.nextIndex = maxIndex + 1;
      } else {
        this.nextIndex = 1;
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as any).code === 'ENOENT'
      ) {
        this.allAlerts = [];
        this.nextIndex = 1;
        return;
      }
      throw error;
    }
  }

  private parseAlertFile(content: string): ParseResult {
    const validAlerts: Alert[] = [];
    const parseErrors: string[] = [];
    let corruptedEntries = 0;
    const entryRegex =
      /\[(WARNING|ERROR|SKIPPED)\] === Alert Entry ===([\s\S]*?)\[\1\] === End Entry ===/g;
    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      const type = match[1].toLowerCase() as AlertType;
      const block = match[2];
      try {
        const alert = this.parseAlertEntry(block, type);
        if (alert) {
          validAlerts.push(alert);
        }
      } catch (error: unknown) {
        corruptedEntries++;
        parseErrors.push(
          `Entry: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    return { validAlerts, corruptedEntries, parseErrors };
  }

  private parseAlertEntry(block: string, type: AlertType): Alert | null {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return null;
    }
    let index: number | undefined;
    let timestamp: string | undefined;
    const contact: Partial<AlertContact> = {};
    let reason: string | undefined;
    for (const line of lines) {
      const cleanLine = line.replace(/^\[(WARNING|ERROR|SKIPPED)\]\s*/, '');
      if (cleanLine.startsWith('Index:')) {
        index = parseInt(cleanLine.replace('Index:', '').trim(), 10);
      } else if (cleanLine.startsWith('Timestamp:')) {
        timestamp = cleanLine.replace('Timestamp:', '').trim();
      } else if (cleanLine.startsWith('-FirstName:')) {
        contact.firstName = cleanLine.replace('-FirstName:', '').trim();
      } else if (cleanLine.startsWith('-LastName:')) {
        const lastName = cleanLine.replace('-LastName:', '').trim();
        contact.lastName = lastName === '(none)' ? '' : lastName;
      } else if (cleanLine.startsWith('-Email:')) {
        const email = cleanLine.replace('-Email:', '').trim();
        contact.email = email === '(none)' ? undefined : email;
      } else if (cleanLine.startsWith('-LinkedIn URL:')) {
        const url = cleanLine.replace('-LinkedIn URL:', '').trim();
        contact.url = url === '(none)' ? undefined : url;
      } else if (cleanLine.startsWith('-Company:')) {
        const company = cleanLine.replace('-Company:', '').trim();
        contact.company = company === '(none)' ? undefined : company;
      } else if (cleanLine.startsWith('Reason:')) {
        reason = cleanLine.replace('Reason:', '').trim();
      }
    }
    if (!index || !timestamp || !contact.firstName || !reason) {
      throw new Error('Missing required fields in alert entry');
    }
    return {
      index,
      type,
      timestamp,
      contact: contact as AlertContact,
      reason,
    };
  }

  async writeAlert(
    type: AlertType,
    contact: {
      firstName: string;
      lastName?: string;
      email?: string;
      url?: string;
      company?: string;
    },
    reason: string
  ): Promise<void> {
    if (this.checkForDuplicateAlert(contact)) {
      return;
    }
    const alert: Alert = {
      index: this.nextIndex++,
      type,
      timestamp: new Date().toISOString(),
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName || '',
        email: contact.email,
        url: contact.url,
        company: contact.company,
      },
      reason,
    };
    const typePrefix = type.toUpperCase();
    const entry = [
      `[${typePrefix}] === Alert Entry ===`,
      `[${typePrefix}] Index: ${alert.index}`,
      `[${typePrefix}] Timestamp: ${alert.timestamp}`,
      `[${typePrefix}] Contact:`,
      `[${typePrefix}]   -FirstName: ${alert.contact.firstName}`,
      `[${typePrefix}]   -LastName: ${alert.contact.lastName || '(none)'}`,
      `[${typePrefix}]   -Email: ${alert.contact.email || '(none)'}`,
    ];
    if (alert.contact.url !== undefined) {
      entry.push(
        `[${typePrefix}]   -LinkedIn URL: ${alert.contact.url || '(none)'}`
      );
    }
    if (alert.contact.company !== undefined) {
      entry.push(
        `[${typePrefix}]   -Company: ${alert.contact.company || '(none)'}`
      );
    }
    entry.push(`[${typePrefix}] Reason: ${alert.reason}`);
    entry.push(`[${typePrefix}] === End Entry ===`);
    entry.push('');
    const entryText = entry.join('\n');
    try {
      await fs.appendFile(this.filePath, entryText, 'utf-8');
      this.allAlerts.push(alert);
      this.currentRunAlerts.push(alert);
    } catch (error: unknown) {
      throw new Error(
        `Failed to write alert to file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteAlertFile(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
      this.allAlerts = [];
      this.currentRunAlerts = [];
      this.nextIndex = 1;
      this.previouslyAlertedCount = 0;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as any).code === 'ENOENT'
      ) {
        return;
      }
      throw new Error(
        `Failed to delete alert file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async removeAlertByIndex(index: number): Promise<void> {
    const alertIndex = this.allAlerts.findIndex((a) => a.index === index);
    if (alertIndex === -1) {
      return;
    }
    this.allAlerts.splice(alertIndex, 1);
    const currentRunIndex = this.currentRunAlerts.findIndex(
      (a) => a.index === index
    );
    if (currentRunIndex !== -1) {
      this.currentRunAlerts.splice(currentRunIndex, 1);
    }
    await this.rewriteAlertFile();
  }

  private async rewriteAlertFile(): Promise<void> {
    if (this.allAlerts.length === 0) {
      try {
        await fs.unlink(this.filePath);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as any).code !== 'ENOENT'
        ) {
          throw new Error(
            `Failed to delete alert file: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
      return;
    }
    const entries: string[] = [];
    for (const alert of this.allAlerts) {
      const typePrefix = alert.type.toUpperCase();
      const entry = [
        `[${typePrefix}] === Alert Entry ===`,
        `[${typePrefix}] Index: ${alert.index}`,
        `[${typePrefix}] Timestamp: ${alert.timestamp}`,
        `[${typePrefix}] Contact:`,
        `[${typePrefix}]   -FirstName: ${alert.contact.firstName}`,
        `[${typePrefix}]   -LastName: ${alert.contact.lastName || '(none)'}`,
        `[${typePrefix}]   -Email: ${alert.contact.email || '(none)'}`,
      ];
      if (alert.contact.url !== undefined) {
        entry.push(
          `[${typePrefix}]   -LinkedIn URL: ${alert.contact.url || '(none)'}`
        );
      }
      if (alert.contact.company !== undefined) {
        entry.push(
          `[${typePrefix}]   -Company: ${alert.contact.company || '(none)'}`
        );
      }
      entry.push(`[${typePrefix}] Reason: ${alert.reason}`);
      entry.push(`[${typePrefix}] === End Entry ===`);
      entry.push('');
      entries.push(entry.join('\n'));
    }
    try {
      await fs.writeFile(this.filePath, entries.join(''), 'utf-8');
    } catch (error: unknown) {
      throw new Error(
        `Failed to rewrite alert file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  isAlertedContact(contact: {
    firstName: string;
    lastName?: string;
    email?: string;
    url?: string;
  }): boolean {
    for (const alert of this.allAlerts) {
      if (this.matchContact(contact, alert.contact)) {
        this.previouslyAlertedCount++;
        return true;
      }
    }
    return false;
  }

  private matchContact(
    contact: {
      firstName: string;
      lastName?: string;
      email?: string;
      url?: string;
    },
    alertContact: AlertContact
  ): boolean {
    if (this.hasValidEmail(contact) && this.hasValidEmail(alertContact)) {
      return (
        this.normalizeEmail(contact.email!) ===
        this.normalizeEmail(alertContact.email!)
      );
    }
    const namesMatch =
      this.normalizeFullName(contact) === this.normalizeFullName(alertContact);
    if (this.hasValidUrl(contact) && this.hasValidUrl(alertContact)) {
      return (
        namesMatch &&
        this.normalizeUrl(contact.url!) === this.normalizeUrl(alertContact.url!)
      );
    }
    return (
      namesMatch && !this.hasValidEmail(contact) && !this.hasValidUrl(contact)
    );
  }

  private normalizeEmail(email: string): string {
    if (!email.includes('@')) {
      return '';
    }
    return email.trim().toLowerCase();
  }

  private normalizeFullName(contact: {
    firstName: string;
    lastName?: string;
  }): string {
    const firstName = (contact.firstName || '')
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const lastName = (contact.lastName || '')
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return `${firstName} ${lastName}`.trim();
  }

  private normalizeUrl(url: string): string {
    if (!url) {
      return '';
    }
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '');
  }

  private hasValidEmail(contact: { email?: string }): boolean {
    return (
      !!contact.email &&
      contact.email.trim().length > 0 &&
      contact.email.includes('@')
    );
  }

  private hasValidUrl(contact: { url?: string }): boolean {
    return !!contact.url && contact.url.trim().length > 0;
  }

  getAlertCounts(): AlertCounts {
    const counts: AlertCounts = {
      warning: 0,
      error: 0,
      skipped: 0,
      total: 0,
    };
    for (const alert of this.allAlerts) {
      if (alert.type === 'warning') {
        counts.warning++;
      } else if (alert.type === 'error') {
        counts.error++;
      } else if (alert.type === 'skipped') {
        counts.skipped++;
      }
    }
    counts.total = counts.warning + counts.error + counts.skipped;
    return counts;
  }

  getCurrentRunAlerts(): GroupedAlerts {
    const result: GroupedAlerts = {
      warnings: [],
      errors: [],
      skipped: [],
    };
    for (const alert of this.currentRunAlerts) {
      if (alert.type === 'warning') {
        result.warnings.push(alert);
      } else if (alert.type === 'error') {
        result.errors.push(alert);
      } else if (alert.type === 'skipped') {
        result.skipped.push(alert);
      }
    }
    return result;
  }

  getAllAlerts(): GroupedAlerts {
    const result: GroupedAlerts = {
      warnings: [],
      errors: [],
      skipped: [],
    };
    for (const alert of this.allAlerts) {
      if (alert.type === 'warning') {
        result.warnings.push(alert);
      } else if (alert.type === 'error') {
        result.errors.push(alert);
      } else if (alert.type === 'skipped') {
        result.skipped.push(alert);
      }
    }
    return result;
  }

  getAlertsByType(type: AlertType, offset: number, limit: number): Alert[] {
    const filtered = this.allAlerts.filter((a) => a.type === type);
    return filtered.slice(offset, offset + limit);
  }

  hasAlerts(): boolean {
    return this.allAlerts.length > 0;
  }

  getPreviouslyAlertedCount(): number {
    return this.previouslyAlertedCount;
  }

  exceedsThreshold(): boolean {
    const counts = this.getAlertCounts();
    return counts.total > 200;
  }

  checkForDuplicateAlert(contact: {
    firstName: string;
    lastName?: string;
    email?: string;
    url?: string;
  }): boolean {
    for (const alert of this.currentRunAlerts) {
      if (this.matchContact(contact, alert.contact)) {
        return true;
      }
    }
    return false;
  }
}
