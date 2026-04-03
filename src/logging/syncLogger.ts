import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { LinkedInConnection, ContactData, WarningEntry } from '../types';

export class SyncLogger {
  private logPath: string;
  private warningEntries: WarningEntry[] = [];

  constructor(scriptName: string) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}_${month}_${year}`;
    const logDir: string = join(process.cwd(), 'logs');
    this.logPath = join(logDir, `${scriptName}_${dateStr}.log`);
  }

  async initialize(): Promise<void> {
    const logDir: string = dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });
    const fileExists = await fs.access(this.logPath).then(() => true).catch(() => false);
    if (!fileExists) {
      await fs.writeFile(
        this.logPath,
        `[INFO] Log started - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`,
        'utf-8'
      );
    } else {
      await fs.appendFile(
        this.logPath,
        `\n${'='.repeat(80)}\n[INFO] New run started - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`,
        'utf-8'
      );
    }
  }

  async logMain(message: string): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `[INFO] [${timestamp}] ${message}\n`;
    await fs.appendFile(this.logPath, logEntry, 'utf-8');
  }

  async logError(message: string): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `[ERROR] [${timestamp}] ${message}\n`;
    await fs.appendFile(this.logPath, logEntry, 'utf-8');
  }

  async logWarning(message: string): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `[WARNING] [${timestamp}] ${message}\n`;
    await fs.appendFile(this.logPath, logEntry, 'utf-8');
  }

  addWarningEntry(
    connection: LinkedInConnection,
    matches: ContactData[],
    reason: string,
    score?: number
  ): void {
    this.warningEntries.push({ connection, matches, reason, score });
  }

  async finalizeWarningLog(): Promise<void> {
    if (this.warningEntries.length === 0) {
      return;
    }
    let content: string = `\n[WARNING] ${'='.repeat(80)}\n[WARNING] Warnings from run at ${new Date().toISOString()}\n[WARNING] ${'='.repeat(80)}\n`;
    for (let i: number = 0; i < this.warningEntries.length; i++) {
      const entry: WarningEntry = this.warningEntries[i];
      content += `\n[WARNING] ${'='.repeat(80)}\n`;
      content += `[WARNING] Entry ${i + 1} of ${this.warningEntries.length}\n`;
      content += `[WARNING] ${'='.repeat(80)}\n`;
      content += `[WARNING] LinkedIn Connection:\n`;
      content += `[WARNING]   -Name: ${entry.connection.firstName} ${entry.connection.lastName}\n`;
      content += `[WARNING]   -Email: ${entry.connection.email || '(none)'}\n`;
      content += `[WARNING]   -Company: ${entry.connection.company || '(none)'}\n`;
      content += `[WARNING]   -Position: ${entry.connection.position || '(none)'}\n`;
      content += `[WARNING]   -URL: ${entry.connection.url}\n`;
      content += `[WARNING] Reason: ${entry.reason}\n`;
      if (entry.score !== undefined) {
        content += `[WARNING] Fuzzy Match Score: ${entry.score.toFixed(3)}\n`;
      }
      if (entry.matches.length > 0) {
        content += `[WARNING] Matched Google Contact(s):\n`;
        for (let j: number = 0; j < entry.matches.length; j++) {
          const match: ContactData = entry.matches[j];
          content += `[WARNING]   Match ${j + 1}:\n`;
          content += `[WARNING]     -Name: ${match.firstName} ${match.lastName}\n`;
          content += `[WARNING]     -Company: ${match.company || '(none)'}\n`;
          content += `[WARNING]     -Job Title: ${match.jobTitle || '(none)'}\n`;
          if (match.emails.length > 0) {
            content += `[WARNING]     -Emails: ${match.emails.map((e: { value: string }) => e.value).join(', ')}\n`;
          } else {
            content += `[WARNING]     -Emails: (none)\n`;
          }
          if (match.websites.length > 0) {
            content += `[WARNING]     -LinkedIn URLs: ${match.websites.map((w: { url: string }) => w.url).join(', ')}\n`;
          } else {
            content += `[WARNING]     -LinkedIn URLs: (none)\n`;
          }
          content += `[WARNING]     -Labels: ${match.label || '(none)'}\n`;
          if (match.resourceName) {
            content += `[WARNING]     -Resource Name: ${match.resourceName}\n`;
          }
        }
      }
      content += `\n`;
    }
    await fs.appendFile(this.logPath, content, 'utf-8');
  }

  getMainLogPath(): string {
    return this.logPath;
  }

  getWarningLogPath(): string {
    return this.logPath;
  }

  getWarningCount(): number {
    return this.warningEntries.length;
  }
}
