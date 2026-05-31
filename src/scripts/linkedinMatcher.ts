import { injectable, inject } from 'inversify';
import readline from 'readline';
import type { OAuth2Client, Script } from '../types';
import {
  SyncStatusType,
  SyncStatus,
  SyncResult,
  ALERT_REASONS,
} from '../types';
import {
  selectWithEscape,
  formatMixedHebrewEnglish,
  calculateFormattedCompany,
  TextUtils,
} from '../utils';
import { SETTINGS } from '../settings';
import {
  LinkedInExtractor,
  LinkedInMatcher,
  ContactSyncer,
} from '../services/linkedin';
import { DuplicateDetector } from '../services/contacts';
import { ContactCache } from '../cache';
import { SyncStatusBar } from '../flow/syncStatusBar';
import {
  SyncLogger,
  Logger,
  LogCleanup,
  AlertLogger,
  LogFormatter,
} from '../logging';
import { FormatUtils, EMOJIS } from '../constants';
import { ApiTracker } from '../services/api';

@injectable()
export class LinkedInMatcherScript {
  private uiLogger: Logger = new Logger('LinkedInMatcher');
  private isCancelled: boolean = false;

  constructor(
    @inject('OAuth2Client') _auth: OAuth2Client,
    @inject(LinkedInExtractor) private extractor: LinkedInExtractor,
    @inject(LinkedInMatcher) private matcher: LinkedInMatcher,
    @inject(ContactSyncer) private contactSyncer: ContactSyncer,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}

  async run(): Promise<void> {
    this.isCancelled = false;
    const alertLogger = new AlertLogger('linkedin-matcher');
    await alertLogger.initialize();

    await LogCleanup.cleanOldLogs();
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const startStats = await apiTracker.getStats();
    this.uiLogger.displayInfo(
      `[People API Stats] ${EMOJIS.API.READ} Read: ${startStats.read}, ${EMOJIS.API.WRITE} Write: ${startStats.write}`
    );

    const logger = new SyncLogger('linkedin-matcher-main');
    const updateLogger = new SyncLogger('linkedin-matcher', 'txt');
    const errorLogger = new SyncLogger('linkedin-matcher-errors', 'txt');
    const statusBar = new SyncStatusBar();

    await logger.initialize();
    await updateLogger.initialize();
    await errorLogger.initialize();

    this.setupConsoleCapture(logger);

    let escapeHandlerCalled = false;
    const escapeHandler = (): void => {
      if (escapeHandlerCalled) {
        return;
      }
      escapeHandlerCalled = true;
      this.isCancelled = true;
      statusBar.cancel();
      this.uiLogger.displayWarning(
        'Cancelling LinkedIn Matcher - please wait for current operation to complete'
      );
    };

    const keyPressHandler = (_str: string, key: any): void => {
      if (key && key.name === 'escape') {
        escapeHandler();
      } else if (key && key.ctrl && key.name === 'c') {
        escapeHandler();
      }
    };

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('keypress', keyPressHandler);
    }
    process.on('SIGINT', escapeHandler);
    (this as any)._keyPressHandler = keyPressHandler;
    (this as any)._escapeHandler = escapeHandler;

    const startTime: number = Date.now();
    const noCacheFlag = process.env.NO_CACHE === 'true';
    if (SETTINGS.linkedin.bypassContactCache || noCacheFlag) {
      await ContactCache.getInstance().invalidate();
    }

    try {
      this.uiLogger.display('Starting LinkedIn Matcher');
      await logger.logMain('LinkedIn Matcher started');

      this.uiLogger.display('Extracting LinkedIn connections from ZIP');
      const { connections, filePath } = await this.extractor.extract();
      await logger.logMain(
        `Extracted ${connections.length} LinkedIn connections from ${filePath}`
      );

      this.uiLogger.display(
        `LinkedIn CSV: Found ${FormatUtils.formatNumberWithLeadingZeros(connections.length)} connections`
      );

      const testLimit = SETTINGS.linkedin.testConnectionLimit;
      const connectionsToProcess =
        testLimit !== null && testLimit !== undefined && testLimit > 0
          ? connections.slice(0, testLimit)
          : connections;

      if (connectionsToProcess.length < connections.length) {
        await logger.logMain(
          `TEST MODE: Limited to ${connectionsToProcess.length} connections for testing`
        );
        this.uiLogger.warn(
          `TEST MODE: Processing ${connectionsToProcess.length} of ${connections.length} connections (limit set in settings)`
        );
      }

      statusBar.startFetchPhase();
      let googleContactsBefore: number = 0;

      const originalFetch = this.duplicateDetector['fetchAllContacts'].bind(
        this.duplicateDetector
      );
      this.duplicateDetector['fetchAllContacts'] = async (
        onProgress?: (count: number) => void
      ): Promise<any> => {
        const contacts = await originalFetch((count: number) => {
          statusBar.updateFetchProgress(count);
          if (onProgress) {
            onProgress(count);
          }
        });
        googleContactsBefore = contacts.length;
        statusBar.updateFetchProgress(googleContactsBefore);
        return contacts;
      };

      await this.duplicateDetector['fetchAllContacts']();
      statusBar.completeFetch(googleContactsBefore);
      await logger.logMain(`Fetched ${googleContactsBefore} Google contacts`);
      this.duplicateDetector['fetchAllContacts'] = originalFetch;

      await this.contactSyncer.initialize();
      await logger.logMain('Contact syncer initialized');
      statusBar.setFilePath(filePath);

      const previousCounts = alertLogger.getAlertCounts();
      statusBar.startProcessPhase(connectionsToProcess.length, previousCounts);

      const status: SyncStatus = {
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

      let currentIndex = 1;
      for (const connection of connectionsToProcess) {
        if (this.isCancelled) {
          await logger.logMain('Matcher cancelled by user');
          break;
        }

        const formattedCompany = calculateFormattedCompany(
          connection.company,
          2,
          connection.firstName,
          connection.lastName
        );

        const alertContact = {
          firstName: connection.firstName,
          lastName: connection.lastName,
          email: connection.email,
          url: connection.url,
          company: formattedCompany,
          jobTitle: TextUtils.normalizeJobTitle(connection.position ?? ''),
          labels: ['LinkedIn'],
        };

        try {
          const match = await this.matcher.findMatch(connection);

          if (match && match.resourceName) {
            const syncResult: SyncResult =
              await this.contactSyncer.matcherUpdateContact(
                match.resourceName,
                connection,
                match
              );

            if (syncResult.status === SyncStatusType.UPDATED) {
              status.updated++;
              await updateLogger.logRaw(
                LogFormatter.formatContactBlock(
                  'UPDATE',
                  connection,
                  'LinkedIn',
                  currentIndex,
                  syncResult.updateDetails
                )
              );
              await logger.logMain(
                `Updated contact: ${connection.firstName} ${connection.lastName} (${formattedCompany})`
              );
            } else if (syncResult.status === SyncStatusType.ERROR) {
              status.error++;
              const errorMessage = syncResult.error
                ? `Failed to update contact via Google API: ${syncResult.error.message}`
                : ALERT_REASONS.ERROR.API_UPDATE_FAILED;

              await alertLogger.writeAlert('error', alertContact, errorMessage);
              await errorLogger.logRaw(
                LogFormatter.formatContactBlock(
                  'ERROR',
                  connection,
                  'LinkedIn',
                  currentIndex,
                  {
                    skipReason:
                      syncResult.error?.message || 'API Update Failed',
                  }
                )
              );
            } else {
              status.upToDate++;
            }
          } else {
            status.skipped++;
          }

          status.processed++;
          statusBar.updateStatus(status, connection, 'LinkedIn');
          currentIndex++;
        } catch (error: unknown) {
          status.error++;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          await alertLogger.writeAlert('error', alertContact, errorMessage);
          await errorLogger.logRaw(
            LogFormatter.formatContactBlock(
              'ERROR',
              connection,
              'LinkedIn',
              currentIndex,
              { skipReason: errorMessage }
            )
          );
          status.processed++;
          statusBar.updateStatus(status, connection, 'LinkedIn');
          currentIndex++;
        }
      }

      statusBar.complete();
      const endTime: number = Date.now();
      const durationSeconds: number = Math.floor((endTime - startTime) / 1000);

      this.displaySummary(status, durationSeconds, googleContactsBefore);

      if (status.warning > 0 || status.error > 0 || status.skipped > 0) {
        await this.showPostSyncMenu(status, alertLogger);
      }
    } catch (error: unknown) {
      this.uiLogger.displayError(
        `LinkedIn Matcher failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await logger.logError(
        `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.restoreConsole();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener(
          'keypress',
          (this as any)._keyPressHandler
        );
      }
      process.removeListener('SIGINT', (this as any)._escapeHandler);
    }
  }

  private setupConsoleCapture(logger: SyncLogger): void {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]): void => {
      const message = args.join(' ');
      if (!message.includes('\u001b')) {
        logger.logRaw(message).catch(() => {});
      }
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]): void => {
      const message = args.join(' ');
      if (!message.includes('\u001b')) {
        logger.logError(message).catch(() => {});
      }
      originalError.apply(console, args);
    };

    (this as any)._originalLog = originalLog;
    (this as any)._originalError = originalError;
  }

  private restoreConsole(): void {
    if ((this as any)._originalLog) {
      console.log = (this as any)._originalLog;
    }
    if ((this as any)._originalError) {
      console.error = (this as any)._originalError;
    }
  }

  private displaySummary(
    status: SyncStatus,
    durationSeconds: number,
    googleContactsBefore: number
  ): void {
    const lineWidth = 60;
    const formatStat = (label: string, value: number): string => {
      const valStr = FormatUtils.formatNumberWithLeadingZeros(value);
      return `${label.padEnd(lineWidth - valStr.length - 3)} = ${valStr}`;
    };

    console.log('\n' + '='.repeat(lineWidth));
    console.log(
      ' LinkedIn Matcher Summary '
        .padStart(lineWidth / 2 + 13)
        .padEnd(lineWidth)
    );
    console.log('='.repeat(lineWidth));
    console.log(formatStat('Total connections processed', status.processed));
    console.log(formatStat('Contacts updated', status.updated));
    console.log(formatStat('Contacts already up-to-date', status.upToDate));
    console.log(formatStat('Contacts skipped (no match)', status.skipped));
    console.log(formatStat('Errors encountered', status.error));
    console.log('-'.repeat(lineWidth));
    console.log(formatStat('Google Contacts before', googleContactsBefore));
    console.log(
      formatStat('Google Contacts after (calculated)', googleContactsBefore)
    );
    console.log('-'.repeat(lineWidth));
    console.log(`Duration: ${FormatUtils.formatDuration(durationSeconds)}`);
    console.log('='.repeat(lineWidth) + '\n');
  }

  private async showPostSyncMenu(
    status: SyncStatus,
    alertLogger: AlertLogger
  ): Promise<void> {
    const choices = [];
    if (status.error > 0) {
      choices.push({
        name: `${EMOJIS.STATUS.ERROR} View Errors`,
        value: 'errors',
      });
    }
    choices.push({
      name: `${EMOJIS.NAVIGATION.BACK} Back to Main Menu`,
      value: 'back',
    });
    choices.push({ name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: 'exit' });

    const result = await selectWithEscape<string>({
      message: 'What would you like to do now?',
      choices,
    });

    if (result.escaped || result.value === 'back') {
      return;
    }

    if (result.value === 'errors') {
      await this.displayAlerts(alertLogger, 'error');
      await this.showPostSyncMenu(status, alertLogger);
    } else if (result.value === 'exit') {
      process.exit(0);
    }
  }

  private async displayAlerts(
    alertLogger: AlertLogger,
    type: 'warning' | 'error' | 'skipped'
  ): Promise<void> {
    let offset = 0;
    const pageSize = 10;
    const title = type.charAt(0).toUpperCase() + type.slice(1);
    const emoji =
      type === 'warning'
        ? EMOJIS.STATUS.WARNING
        : type === 'error'
          ? EMOJIS.STATUS.ERROR
          : EMOJIS.NAVIGATION.SKIP;

    while (true) {
      const alerts = alertLogger.getAlertsByType(type, offset, pageSize);
      const count = alertLogger.getAlertCounts()[type];

      if (alerts.length === 0) {
        this.uiLogger.displayInfo(`No ${type} alerts to display.`);
        break;
      }

      this.uiLogger.breakline();
      this.uiLogger.info(
        `${emoji} ${title} (${FormatUtils.formatNumberWithLeadingZeros(count)}):`,
        {},
        false
      );
      this.uiLogger.info('='.repeat(55), {}, false);

      for (let i = 0; i < alerts.length; i++) {
        this.displayAlertEntry(alerts[i], offset + i + 1);
      }

      const hasMore = offset + pageSize < count;
      const remaining = count - (offset + pageSize);

      if (hasMore) {
        this.uiLogger.info(
          `... and ${remaining} more ${type} alerts`,
          {},
          false
        );
        const result = await selectWithEscape<string>({
          message: 'What would you like to do?',
          loop: false,
          choices: [
            { name: 'Show More', value: 'more' },
            { name: 'Back to Menu', value: 'back' },
          ],
        });
        if (result.escaped || result.value === 'back') {
          break;
        }
        if (result.value === 'more') {
          offset += pageSize;
          this.uiLogger.breakline();
          continue;
        }
      } else {
        break;
      }
    }
    this.uiLogger.breakline();
  }

  private displayAlertEntry(alert: any, index: number): void {
    const personNumber = FormatUtils.formatNumberWithLeadingZeros(index);
    this.uiLogger.info(`  Alert ${personNumber}:`, {}, false);
    this.uiLogger.info(
      `    -Name: ${formatMixedHebrewEnglish(`${alert.contact.firstName} ${alert.contact.lastName}`)}`,
      {},
      false
    );
    if (alert.contact.email) {
      this.uiLogger.info(`    -Email: ${alert.contact.email}`, {}, false);
    }
    if (alert.contact.company) {
      this.uiLogger.info(
        `    -Company: ${formatMixedHebrewEnglish(alert.contact.company)}`,
        {},
        false
      );
    }
    if (alert.reason) {
      this.uiLogger.info(`    -Reason: ${alert.reason}`, {}, false);
    }
    this.uiLogger.info('', {}, false);
  }
}

export const linkedInMatcherScript: Script = {
  metadata: {
    name: 'LinkedIn Matcher',
    description: 'Syncs LinkedIn empty connections with default values',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: true,
    estimatedDuration: '5-10 minutes',
    emoji: EMOJIS.SCRIPTS.LINKEDIN,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(LinkedInMatcherScript);
    await script.run();
  },
};
