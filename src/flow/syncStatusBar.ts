import ora, { Ora } from 'ora';
import { SyncStatus, SupportedContact, LinkedInConnection, ContactType } from '../types';
import { Logger } from '../logging';
import { FormatUtils, EMOJIS } from '../constants';
import { formatMixedHebrewEnglish, calculateFormattedCompany, DryModeChecker } from '../utils';

export class SyncStatusBar {
  private spinner: Ora | null = null;
  private status: SyncStatus;
  private phase: 'fetch' | 'process';
  private totalConnections: number = 0;
  private currentConnection: SupportedContact | null = null;
  private currentLabel: string = '';
  private apiStatus: string = 'Stable';
  private startTime: number = 0;
  private timerInterval: NodeJS.Timeout | null = null;
  private logger: Logger = new Logger('SyncStatusBar');
  private static instance: SyncStatusBar | null = null;
  private filePath: string = '';
  private previousCounts: Partial<SyncStatus> = { warning: 0, error: 0, skipped: 0 };

  constructor() {
    this.status = {
      processed: 0,
      new: 0,
      upToDate: 0,
      updated: 0,
      warning: 0,
      needClarification: 0,
      error: 0,
      skipped: 0,
      previouslyAlerted: 0,
    };
    this.phase = 'fetch';
    SyncStatusBar.instance = this;
  }

  static getInstance(): SyncStatusBar | null {
    return SyncStatusBar.instance;
  }

  setApiStatus(status: string): void {
    this.apiStatus = status;
    if (this.spinner && this.phase === 'process') {
      this.spinner.text = this.formatProcessStatus();
    }
  }

  setFilePath(path: string): void {
    this.filePath = path;
  }

  startFetchPhase(): void {
    this.phase = 'fetch';
    this.spinner = ora({
      text: `Fetching Google Contacts: ${FormatUtils.formatNumberWithLeadingZeros(0)} contacts fetched`,
      spinner: 'dots',
    }).start();
  }

  updateFetchProgress(count: number): void {
    if (this.spinner) {
      this.spinner.text = `Fetching Google Contacts: ${FormatUtils.formatNumberWithLeadingZeros(count)} contacts fetched`;
    }
  }

  completeFetch(totalCount: number): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    this.logger.info(
      `Google Contacts: Found ${FormatUtils.formatNumberWithLeadingZeros(totalCount)} contacts`
    );
    console.log('');
  }

  startProcessPhase(totalConnections: number, initialCounts?: Partial<SyncStatus>): void {
    this.phase = 'process';
    this.totalConnections = totalConnections;
    this.previousCounts = initialCounts || { warning: 0, error: 0, skipped: 0 };
    this.startTime = Date.now();
    this.spinner = ora({
      text: this.formatProcessStatus(),
      spinner: 'dots',
    }).start();
    this.timerInterval = setInterval(() => {
      if (this.spinner && this.phase === 'process') {
        this.spinner.text = this.formatProcessStatus();
      }
    }, 1000);
  }

  updateStatus(
    status: Partial<SyncStatus>,
    currentConnection?: SupportedContact,
    currentLabel?: string
  ): void {
    this.status = { ...this.status, ...status };
    if (currentConnection !== undefined) {
      this.currentConnection = currentConnection;
    }
    if (currentLabel !== undefined) {
      this.currentLabel = currentLabel;
    }
    if (this.spinner && this.phase === 'process') {
      this.spinner.text = this.formatProcessStatus();
    }
  }

  complete(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  cancel(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  fail(message: string): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    this.logger.error(message);
  }

  private formatProcessStatus(): string {
    const processed = FormatUtils.formatNumberWithLeadingZeros(
      this.status.processed
    );
    const total = FormatUtils.formatNumberWithLeadingZeros(
      this.totalConnections
    );
    const newCount = FormatUtils.formatNumberWithLeadingZeros(this.status.new);
    const upToDate = FormatUtils.formatNumberWithLeadingZeros(
      this.status.upToDate
    );
    const updated = FormatUtils.formatNumberWithLeadingZeros(
      this.status.updated
    );
    const error = FormatUtils.formatNumberWithLeadingZeros(this.status.error);
    const warning = FormatUtils.formatNumberWithLeadingZeros(
      this.status.warning
    );
    const skipped = FormatUtils.formatNumberWithLeadingZeros(
      this.status.skipped
    );
    const percentage: string = this.totalConnections > 0
      ? ((this.status.processed / this.totalConnections) * 100).toFixed(2).padStart(5, '0')
      : '00.00';
    const elapsedSeconds: number = Math.floor(
      (Date.now() - this.startTime) / 1000
    );
    const hours: number = Math.floor(elapsedSeconds / 3600);
    const minutes: number = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds: number = elapsedSeconds % 60;
    const timeString: string = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const dryModeStr: string = DryModeChecker.isEnabled() ? ' | DRY MODE' : '';
    const statusLine = `Time: ${timeString}${dryModeStr} | Status: ${this.apiStatus}`;
    const spinnerPadding = '  ';
    let result = statusLine;
    if (this.filePath) {
      result += `\n${spinnerPadding}Path: ${this.filePath}`;
    }
    const line1 = `${spinnerPadding}Processing: ${processed} / ${total} (${percentage}%) | New: ${newCount} | Up-To-Date: ${upToDate} | Updated: ${updated}`;
    const line2 = `${spinnerPadding}Warning: ${warning} | Error: ${error} | Skipped: ${skipped}`;
    result += `\n${line1}\n${line2}`;
    const prevWarning = this.previousCounts.warning || 0;
    const prevError = this.previousCounts.error || 0;
    const prevSkipped = this.previousCounts.skipped || 0;
    const prevTotal = prevWarning + prevError + prevSkipped;
    if (prevTotal > 0) {
      result += `\n${spinnerPadding}Previously Alerted: ${prevTotal} contacts (not reprocessed)`;
    }
    if (this.currentConnection) {
      const conn = this.currentConnection;
      if (conn.type === ContactType.LINKEDIN) {
        const linkedInConn = conn as LinkedInConnection;
        const firstName = linkedInConn.firstName;
        const lastName = linkedInConn.lastName;
        const company = linkedInConn.company || '';
        const label = this.currentLabel;
        const position = linkedInConn.position || '(none)';
        const formattedCompany: string = company ? calculateFormattedCompany(company, 2) : '';
        const emailLabel: string = `${label} ${formattedCompany}`.trim();
        result += `\n${spinnerPadding}Current:`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.PERSON} Full name: ${firstName} ${lastName} ${label}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.LABEL}  Labels: ${label}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.COMPANY} Company: ${emailLabel}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${position}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.EMAIL} Email: ${linkedInConn.email ? `${linkedInConn.email} ${emailLabel}` : '(none)'}`;
        result += `\n${spinnerPadding}📞 Phone: (none)`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${linkedInConn.url || '(none)'} LinkedIn`;
      } else if (conn.type === ContactType.HIBOB) {
        const hibobConn = conn;
        const firstName = formatMixedHebrewEnglish(hibobConn.firstName);
        const lastName = formatMixedHebrewEnglish(hibobConn.lastName || '');
        const label = formatMixedHebrewEnglish(this.currentLabel);
        result += `\n${spinnerPadding}Current:`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.PERSON} Full name: ${firstName} ${lastName} ${label}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.LABEL}  Labels: ${label}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.COMPANY} Company: ${label}`;
        result += `\n${spinnerPadding}${EMOJIS.FIELDS.EMAIL} Email: ${hibobConn.email || '(none)'} ${label}`;
      }
    }
    return result;
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }
}
