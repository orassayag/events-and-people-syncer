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
  private scriptName: string;
  private filePath: string;
  private allAlerts: Alert[] = [];
  private currentRunAlerts: Alert[] = [];
  private previouslyAlertedCount: number = 0;
  private nextIndex: number = 1;
  private currentCounter: number = 1;
  private readonly maxAlertsPerFile: number = 200;

  constructor(scriptName: string) {
    this.scriptName = scriptName;
    this.filePath = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-1.log`);
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
    } catch (error: unknown) {
      throw new Error(
        `Failed to create log directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Migration logic: Rename old *_ALERTS.log to *_alerts-1.log if it exists and no alerts-*.log files exist
    const oldPath = join(LOG_CONFIG.logDir, `${this.scriptName}_ALERTS.log`);
    const newPath1 = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-1.log`);
    
    try {
      await fs.access(oldPath);
      // It exists. Check if any alerts-*.log files already exist
      const files = await fs.readdir(LOG_CONFIG.logDir);
      const hasNewFormat = files.some(f => f.startsWith(`${this.scriptName}_alerts-`) && f.endsWith('.log'));
      if (!hasNewFormat) {
        await fs.rename(oldPath, newPath1);
      }
    } catch {
      // Old file doesn't exist, no migration needed
    }

    try {
      const allFiles = await fs.readdir(LOG_CONFIG.logDir);
      const alertFiles = allFiles
        .filter(f => f.startsWith(`${this.scriptName}_alerts-`) && f.endsWith('.log'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/alerts-(\d+)\.log/)?.[1] || "0", 10);
          const numB = parseInt(b.match(/alerts-(\d+)\.log/)?.[1] || "0", 10);
          return numA - numB;
        });

      if (alertFiles.length === 0) {
        this.allAlerts = [];
        this.nextIndex = 1;
        this.currentCounter = 1;
        this.filePath = newPath1;
        return;
      }

      this.allAlerts = [];
      let totalCorrupted = 0;
      
      for (const file of alertFiles) {
        const fullPath = join(LOG_CONFIG.logDir, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        const parseResult = this.parseAlertFile(content);
        this.allAlerts.push(...parseResult.validAlerts);
        totalCorrupted += parseResult.corruptedEntries;
        
        const counter = parseInt(file.match(/alerts-(\d+)\.log/)?.[1] || "1", 10);
        if (counter >= this.currentCounter) {
          this.currentCounter = counter;
          this.filePath = fullPath;
        }
      }

      if (this.allAlerts.length === 0 && totalCorrupted > 0) {
        throw new Error(
          `Alert files are fully corrupted. Please delete them manually in: ${LOG_CONFIG.logDir}`
        );
      }

      if (totalCorrupted > 0) {
        console.warn(
          `Warning: ${totalCorrupted} corrupted alert entries were skipped while loading alert files for ${this.scriptName}`
        );
      }

      if (this.allAlerts.length > 0) {
        this.nextIndex = Math.max(...this.allAlerts.map((a) => a.index)) + 1;
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
    const entryRegex = /(?:\[(WARNING|ERROR|SKIPPED)\] === Alert Entry ===|=====(WARNING|ERROR|SKIPPED) START=====)([\s\S]*?)(?:\[\1\] === End Entry ===|=====\1 END=====)/gi;
    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      const parsedTypeStr = match[1] || match[2];
      if (!parsedTypeStr) continue;
      const type = parsedTypeStr.toLowerCase() as AlertType;
      const block = match[3];
      try {
        const alert = this.parseAlertEntry(block, type);
        if (alert) {
          validAlerts.push(alert);
        }
      } catch (error: unknown) {
        corruptedEntries++;
        parseErrors.push(
          `Entry: \${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    return { validAlerts, corruptedEntries, parseErrors };
  }

  private parseAlertEntry(block: string, type: AlertType): Alert | null {
    const lines = block.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) return null;

    let index: number | undefined;
    let timestamp: string | undefined;
    let reason: string | undefined;
    let exactMatchMessage: string | undefined;

    const mainContact: Partial<AlertContact> = {};
    const matches: Partial<AlertContact>[] = [];
    let parsingMatches = false;

    for (const line of lines) {
      const cleanLine = line.replace(/^\[(WARNING|ERROR|SKIPPED)\]\s*/, '').replace(/^=====(WARNING|ERROR|SKIPPED) START=====\s*/, '');
      if (cleanLine.startsWith('Index:')) {
        index = parseInt(cleanLine.replace('Index:', '').replace(',', '').trim(), 10);
      } else if (cleanLine.startsWith('Timestamp:')) {
        timestamp = cleanLine.replace('Timestamp:', '').trim();
      } else if (cleanLine.startsWith('Reason:')) {
        reason = cleanLine.replace('Reason:', '').trim();
      } else if (cleanLine.startsWith('Exact Match:')) {
        exactMatchMessage = cleanLine.replace('Exact Match:', '').trim();
      } else if (cleanLine.startsWith('Possible matches:') || cleanLine.startsWith('===Matches:===')) {
        parsingMatches = true;
      } else if (parsingMatches && /^\d+:/.test(cleanLine)) {
        const match = cleanLine.match(/^(\d+):\s+(.*?)(?:\s+\(Score:\s+([\d\.]+)\))?$/);
        if (match) {
          const fullName = match[2].trim();
          const score = match[3] ? parseFloat(match[3]) : undefined;
          const parts = fullName.split(' ');
          const lastName = parts.length > 1 ? parts.pop() || '' : '';
          const firstName = parts.join(' ');
          matches.push({ firstName, lastName, score });
        }
      } else if (cleanLine.startsWith('===Match')) {
        matches.push({});
      } else {
        const target = parsingMatches && matches.length > 0 ? matches[matches.length - 1] : mainContact;

        if (cleanLine.startsWith('👤 Full name:')) {
          const parts = cleanLine.replace('👤 Full name:', '').trim().split(' ').filter(p => !p.toLowerCase().includes('linkedin') && p !== '');
          target.lastName = parts.length > 1 ? parts.pop() || '' : '';
          target.firstName = parts.join(' ');
        } else if (cleanLine.startsWith('-FirstName:')) {
          target.firstName = cleanLine.replace('-FirstName:', '').trim();
        } else if (cleanLine.startsWith('-LastName:')) {
          const lastName = cleanLine.replace('-LastName:', '').trim();
          target.lastName = lastName === '(none)' ? '' : lastName;
        } else if (cleanLine.startsWith('🏷️  Labels:')) {
          const labelsStr = cleanLine.replace('🏷️  Labels:', '').replace(/linkedin/i, '').trim();
          target.labels = labelsStr !== '(none)' && labelsStr !== '' ? labelsStr.split(',').map(s=>s.trim()) : undefined;
        } else if (cleanLine.startsWith('🏢 Company:') || cleanLine.startsWith('-Company:')) {
          const company = cleanLine.replace(/^(🏢 Company:|-Company:)/, '').replace(/linkedin lusha/i, '').trim();
          target.company = company === '(none)' || company === '' ? undefined : company;
        } else if (cleanLine.startsWith('💼 Job Title:')) {
          const val = cleanLine.replace('💼 Job Title:', '').trim();
          target.jobTitle = val === '(none)' ? undefined : val;
        } else if (cleanLine.startsWith('📧 Email:') || cleanLine.startsWith('-Email:')) {
          const email = cleanLine.replace(/^(📧 Email:|-Email:)/, '').trim();
          target.email = email === '(none)' ? undefined : email.split(' ')[0];
        } else if (cleanLine.startsWith('📞 Phone:')) {
          const phone = cleanLine.replace('📞 Phone:', '').trim();
          target.phone = phone === '(none)' ? undefined : phone;
        } else if (cleanLine.startsWith('🔗 LinkedIn URL:') || cleanLine.startsWith('-LinkedIn URL:')) {
          const url = cleanLine.replace(/^(🔗 LinkedIn URL:|-LinkedIn URL:)/, '').trim();
          target.url = url === '(none)' ? undefined : url.split(' ')[0];
        }
      }
    }

    if (!index || !timestamp || !mainContact.firstName || !reason) {
      throw new Error('Missing required fields in alert entry');
    }
    return {
      index,
      type,
      timestamp,
      contact: { ...mainContact, lastName: mainContact.lastName || '' } as AlertContact,
      reason,
      matches: matches.length > 0 ? (matches as AlertContact[]) : undefined,
      exactMatchMessage
    };
  }

  private formatAlertEntry(alert: Alert): string[] {
    const isNewFormat = true;
    if (isNewFormat && alert.type === 'warning') {
       const entry = [
         `=====WARNING START=====`,
         `Index: ${alert.index},`,
         `Timestamp: ${alert.timestamp}`,
         `👤 Full name: ${alert.contact.firstName} ${alert.contact.lastName || ''}`.trim() + (alert.contact.labels ? ` ${alert.contact.labels[0]}` : ' LinkedIn'),
         `🏷️  Labels: ${alert.contact.labels?.join(', ') || 'LinkedIn'}`,
         `🏢 Company: ${alert.contact.company || '(none)'}`,
         `💼 Job Title: ${alert.contact.jobTitle || '(none)'}`,
         `📧 Email: ${alert.contact.email || '(none)'}`,
         `📞 Phone: ${alert.contact.phone || '(none)'}`,
         `🔗 LinkedIn URL: ${alert.contact.url || '(none)'} LinkedIn`,
         `Reason: ${alert.reason}`
       ];
       if (alert.exactMatchMessage) {
         entry.push(`Exact Match: ${alert.exactMatchMessage}`);
       }
       if (alert.matches && alert.matches.length > 0) {
         entry.push(`===Matches:===`);
         alert.matches.forEach((m, idx) => {
           const scoreText = m.score !== undefined ? ` (Score: ${m.score.toFixed(2)})` : '';
           entry.push(`${idx + 1}: ${m.firstName} ${m.lastName || ''}${scoreText}`);
         });
       }
       entry.push(`=====WARNING END=====`);
       return entry;
    }

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
      entry.push(`[${typePrefix}]   -LinkedIn URL: ${alert.contact.url || '(none)'}`);
    }
    if (alert.contact.company !== undefined) {
      entry.push(`[${typePrefix}]   -Company: ${alert.contact.company || '(none)'}`);
    }
    entry.push(`[${typePrefix}] Reason: ${alert.reason}`);
    entry.push(`[${typePrefix}] === End Entry ===`);
    return entry;
  }

  async writeAlert(
    type: AlertType,
    contact: AlertContact,
    reason: string,
    options?: { matches?: AlertContact[]; exactMatchMessage?: string }
  ): Promise<void> {
    if (this.checkForDuplicateAlert({ ...contact, email: contact.email || undefined, url: contact.url || undefined })) {
      return;
    }

    // Check if we need to rotate to a new file
    // We count alerts in the current file by looking at its index in allAlerts
    const currentFileAlerts = this.allAlerts.filter((_, idx) => 
        Math.floor(idx / this.maxAlertsPerFile) + 1 === this.currentCounter
    ).length;

    if (currentFileAlerts >= this.maxAlertsPerFile) {
        this.currentCounter++;
        this.filePath = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-${this.currentCounter}.log`);
    }

    const alert: Alert = {
      index: this.nextIndex++,
      type,
      timestamp: new Date().toISOString(),
      contact,
      reason,
      matches: options?.matches,
      exactMatchMessage: options?.exactMatchMessage,
    };
    const entry = this.formatAlertEntry(alert);
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
      const files = await fs.readdir(LOG_CONFIG.logDir);
      const alertFiles = files.filter(f => f.startsWith(`${this.scriptName}_alerts-`) && f.endsWith('.log'));
      
      for (const file of alertFiles) {
        await fs.unlink(join(LOG_CONFIG.logDir, file));
      }
      
      this.allAlerts = [];
      this.currentRunAlerts = [];
      this.nextIndex = 1;
      this.currentCounter = 1;
      this.filePath = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-1.log`);
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
        `Failed to delete alert files: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    // 1. Delete all current alert files for this script
    try {
      const files = await fs.readdir(LOG_CONFIG.logDir);
      const alertFiles = files.filter(f => f.startsWith(`${this.scriptName}_alerts-`) && f.endsWith('.log'));
      for (const file of alertFiles) {
        await fs.unlink(join(LOG_CONFIG.logDir, file));
      }
    } catch (error: unknown) {
       // Ignore errors if directory is empty
    }

    if (this.allAlerts.length === 0) {
      this.currentCounter = 1;
      this.filePath = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-1.log`);
      return;
    }

    // 2. Distribute alerts into files
    for (let i = 0; i < this.allAlerts.length; i += this.maxAlertsPerFile) {
        const chunk = this.allAlerts.slice(i, i + this.maxAlertsPerFile);
        const counter = Math.floor(i / this.maxAlertsPerFile) + 1;
        const fullPath = join(LOG_CONFIG.logDir, `${this.scriptName}_alerts-${counter}.log`);
        
        const entries: string[] = [];
        for (const alert of chunk) {
          const entry = this.formatAlertEntry(alert);
          entry.push('');
          entries.push(entry.join('\n'));
        }
        
        try {
          await fs.writeFile(fullPath, entries.join(''), 'utf-8');
          if (i + this.maxAlertsPerFile >= this.allAlerts.length) {
              this.currentCounter = counter;
              this.filePath = fullPath;
          }
        } catch (error: unknown) {
          throw new Error(
            `Failed to rewrite alert file: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
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
