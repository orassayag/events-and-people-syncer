import { promises as fs } from 'fs';
import { join } from 'path';
import { LogLevel, LogEntry } from '../types';
import { LOG_CONFIG } from './logConfig';
import { EMOJIS } from '../constants';

export class Logger {
  constructor(private context: string) {}

  private lastOutputType: 'message' | 'blank' | 'spinner' | 'menu' | 'init' =
    'init';

  display(message: string): void {
    const cleaned = this.cleanMessage(message);
    this.outputWithBreakLines(`===${cleaned}===`);
  }

  displayMultiLine(lines: string[]): void {
    if (!LOG_CONFIG.enableConsole) return;
    if (lines.length === 0) {
      throw new Error('displayMultiLine requires at least one line');
    }
    const needsBlankBefore =
      this.lastOutputType !== 'blank' &&
      this.lastOutputType !== 'init' &&
      this.lastOutputType !== 'spinner' &&
      this.lastOutputType !== 'menu';
    if (needsBlankBefore) {
      console.log('');
    }
    for (const line of lines) {
      const cleaned = this.cleanMessage(line);
      console.log(`===${cleaned}===`);
    }
    console.log('');
    this.lastOutputType = 'message';
  }

  displayError(message: string): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.STATUS.ERROR)
      ? cleaned
      : `${EMOJIS.STATUS.ERROR} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayWarning(message: string): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.STATUS.WARNING)
      ? cleaned
      : `${EMOJIS.STATUS.WARNING}  ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displaySuccess(message: string): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.STATUS.SUCCESS)
      ? cleaned
      : `${EMOJIS.STATUS.SUCCESS} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayClipboard(message: string): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.DATA.CLIPBOARD)
      ? cleaned
      : `${EMOJIS.DATA.CLIPBOARD} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayCleanup(message: string): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.ACTIONS.CLEANUP)
      ? cleaned
      : `${EMOJIS.ACTIONS.CLEANUP} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayGoBack(message: string = 'Going back'): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.NAVIGATION.GO_BACK)
      ? cleaned
      : `${EMOJIS.NAVIGATION.GO_BACK} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayExit(message: string = 'Exit script'): void {
    const cleaned = this.cleanMessage(message);
    const withEmoji = cleaned.startsWith(EMOJIS.NAVIGATION.EXIT)
      ? cleaned
      : `${EMOJIS.NAVIGATION.EXIT} ${cleaned}`;
    this.outputWithBreakLines(`===${withEmoji}===`);
  }

  displayInfo(message: string): void {
    const cleaned = this.cleanMessage(message);
    this.outputWithBreakLines(`===${cleaned}===`);
  }

  resetState(type: 'spinner' | 'menu' = 'spinner'): void {
    this.lastOutputType = type;
  }

  private cleanMessage(message: string): string {
    let cleaned = message.trim();
    cleaned = cleaned.replace(/^===|===$/g, '').trim();
    if (!cleaned) {
      throw new Error('Display message cannot be empty');
    }
    cleaned = cleaned.replace(/\n/g, ' ');
    while (cleaned.endsWith('.')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned.trim();
  }

  private outputWithBreakLines(message: string): void {
    if (!LOG_CONFIG.enableConsole) return;
    const needsBlankBefore =
      this.lastOutputType !== 'blank' &&
      this.lastOutputType !== 'init' &&
      this.lastOutputType !== 'spinner' &&
      this.lastOutputType !== 'menu';
    if (needsBlankBefore) {
      console.log('');
      this.lastOutputType = 'blank';
    }
    console.log(message);
    console.log('');
    this.lastOutputType = 'message';
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(
    message: string,
    data?: Record<string, unknown>,
    useDecorators: boolean = true
  ): void {
    this.log(LogLevel.INFO, message, data, useDecorators);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, `${EMOJIS.STATUS.WARNING}  ${message}`, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, `${EMOJIS.STATUS.ERROR} ${message}`, {
      ...data,
      error: error?.message,
      stack: error?.stack,
    });
  }

  breakline(): void {
    if (LOG_CONFIG.enableConsole && this.lastOutputType !== 'blank') {
      console.log('');
      this.lastOutputType = 'blank';
    }
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    useDecorators: boolean = true
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
    };
    if (LOG_CONFIG.enableConsole && this.shouldLog(level)) {
      const formattedMessage = useDecorators ? `===${message}===` : message;
      console.log(formattedMessage);
    }
    if (LOG_CONFIG.enableFile) {
      this.writeToFile(entry).catch((err: Error) => {
        console.error('Failed to write log to file:', err);
      });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };
    const configLevel = LOG_CONFIG.level.toLowerCase();
    const configLevelValue = levels[configLevel as LogLevel] ?? 1;
    return levels[level] >= configLevelValue;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    const logFilePath: string = join(LOG_CONFIG.logDir, 'app.log');
    const logLine: string = JSON.stringify(entry) + '\n';
    try {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      await fs.appendFile(logFilePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}
