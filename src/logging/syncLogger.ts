import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export class SyncLogger {
  private logPath: string;
  private lineCount: number = 0;
  private readonly maxLines: number = 30000;
  private currentCounter: number = 1;
  private scriptName: string;
  private dateStr: string;

  constructor(scriptName: string) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    this.dateStr = `${day}_${month}_${year}`;
    this.scriptName = scriptName;
    
    const logDir: string = join(process.cwd(), 'logs');
    this.logPath = join(logDir, `${this.scriptName}_${this.dateStr}-${this.currentCounter}.log`);
  }

  private async checkRotation(newLines: number): Promise<void> {
    if (this.lineCount + newLines > this.maxLines) {
      this.currentCounter++;
      const logDir: string = join(process.cwd(), 'logs');
      this.logPath = join(logDir, `${this.scriptName}_${this.dateStr}-${this.currentCounter}.log`);
      this.lineCount = 0;
      await this.initialize();
    }
  }

  async initialize(): Promise<void> {
    const logDir: string = dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });
    
    // Check if current file exists and if it exceeds max lines
    let fileExists = await fs.access(this.logPath).then(() => true).catch(() => false);
    
    if (fileExists) {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.split('\n').length;
      if (lines >= this.maxLines) {
        this.currentCounter++;
        this.logPath = join(logDir, `${this.scriptName}_${this.dateStr}-${this.currentCounter}.log`);
        fileExists = false;
      } else {
        this.lineCount = lines;
      }
    }

    if (!fileExists) {
      const header = `[INFO] Log started - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`;
      await fs.writeFile(this.logPath, header, 'utf-8');
      this.lineCount = header.split('\n').length;
    } else {
      const runHeader = `\n${'='.repeat(80)}\n[INFO] New run started - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`;
      await fs.appendFile(this.logPath, runHeader, 'utf-8');
      this.lineCount += runHeader.split('\n').length;
    }
  }

  async logMain(message: string): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `[INFO] [${timestamp}] ${message}\n`;
    const lines = logEntry.split('\n').length - 1;
    await this.checkRotation(lines);
    await fs.appendFile(this.logPath, logEntry, 'utf-8');
    this.lineCount += lines;
  }

  async logError(message: string): Promise<void> {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `[ERROR] [${timestamp}] ${message}\n`;
    const lines = logEntry.split('\n').length - 1;
    await this.checkRotation(lines);
    await fs.appendFile(this.logPath, logEntry, 'utf-8');
    this.lineCount += lines;
  }

  getMainLogPath(): string {
    return this.logPath;
  }
}
