import { injectable, inject } from 'inversify';
import readline from 'readline';
import path from 'path';
import type { OAuth2Client, Script } from '../types';
import { LinkedInConnection, MatchType, MatchResult, SyncStatusType, SyncStatus, SyncResult, Alert, ALERT_REASONS } from '../types';
import { selectWithEscape, confirmWithEscape, formatMixedHebrewEnglish, calculateFormattedCompany } from '../utils';
import { SETTINGS } from '../settings';
import { LinkedInExtractor, CompanyMatcher, ConnectionMatcher, ContactSyncer } from '../services/linkedin';
import { DuplicateDetector } from '../services/contacts';
import { ContactCache } from '../cache';
import { SyncStatusBar } from '../flow/syncStatusBar';
import { SyncLogger, Logger, LogCleanup, AlertLogger, LogFormatter } from '../logging';
import { FormatUtils, EMOJIS } from '../constants';
import { ApiTracker } from '../services/api';

@injectable()
export class LinkedInSyncScript {
  private uiLogger: Logger = new Logger('LinkedInSync');
  private isCancelled: boolean = false;

  constructor(
    @inject('OAuth2Client') _auth: OAuth2Client,
    @inject(LinkedInExtractor) private extractor: LinkedInExtractor,
    @inject(CompanyMatcher) private companyMatcher: CompanyMatcher,
    @inject(ConnectionMatcher) private connectionMatcher: ConnectionMatcher,
    @inject(ContactSyncer) private contactSyncer: ContactSyncer,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}

  async run(): Promise<void> {
    this.isCancelled = false;
    const alertLogger = new AlertLogger('linkedin-sync');
    await alertLogger.initialize();
    
    let shouldContinue = true;
    if (alertLogger.hasAlerts()) {
      shouldContinue = await this.showPreRunMenu(alertLogger);
    }
    
    if (!shouldContinue) {
      return;
    }
    await LogCleanup.cleanOldLogs();
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const startStats = await apiTracker.getStats();
    this.uiLogger.displayInfo(
      `[People API Stats] ${EMOJIS.API.READ} Read: ${startStats.read}, ${EMOJIS.API.WRITE} Write: ${startStats.write}`
    );
    const logger = new SyncLogger('linkedin-sync');
    const statusBar = new SyncStatusBar();
    await logger.initialize();
    this.setupConsoleCapture(logger);
    let escapeHandlerCalled = false;
    const escapeHandler = (): void => {
      if (escapeHandlerCalled) {
        return;
      }
      escapeHandlerCalled = true;
      this.isCancelled = true;
      statusBar.cancel();
      this.uiLogger.displayWarning('Cancelling LinkedIn Sync - please wait for current operation to complete');
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
    const startTime: number = Date.now();
    const noCacheFlag = process.env.NO_CACHE === 'true';
    if (SETTINGS.linkedin.bypassContactCache || noCacheFlag) {
      if (noCacheFlag) {
        this.uiLogger.warn(
          'Cache bypassed via --no-cache flag - deleting cache and fetching fresh data from Google Contacts'
        );
      } else {
        this.uiLogger.warn(
          'Contact cache bypassed - deleting cache and fetching fresh data from Google Contacts'
        );
      }
      await ContactCache.getInstance().invalidate();
    }
    try {
      this.uiLogger.display('Starting LinkedIn Sync');
      await logger.logMain('LinkedIn Sync started');
      this.uiLogger.display('Extracting LinkedIn connections from ZIP');
      const connections: LinkedInConnection[] = await this.extractor.extract();
      await logger.logMain(
        `Extracted ${connections.length} LinkedIn connections`
      );
      this.uiLogger.display(
        `LinkedIn CSV: Found ${FormatUtils.formatNumberWithLeadingZeros(connections.length)} connections`
      );
      this.uiLogger.display('Validating company folder structure');
      await logger.logMain('Validating company folder structure');
      try {
        await this.companyMatcher.getLabel('__VALIDATION_TEST__');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.uiLogger.displayError(
          `Company folder validation failed: ${errorMessage}`
        );
        await logger.logError(
          `Company folder validation failed: ${errorMessage}`
        );
        throw error;
      }
      await logger.logMain('Company folder validation passed');
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
      this.duplicateDetector['fetchAllContacts'] = async (onProgress?: (count: number) => void): Promise<any> => {
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
      const zipPath = path.join(SETTINGS.linkedin.sourcesPath, SETTINGS.linkedin.zipFileName);
      statusBar.setFilePath(zipPath);
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
      for (const connection of connectionsToProcess) {
        if (this.isCancelled) {
          await logger.logMain('Sync cancelled by user');
          break;
        }
        if (alertLogger.isAlertedContact(connection)) {
          status.previouslyAlerted++;
          statusBar.updateStatus(status);
          continue;
        }
        let label: string = 'Unknown';
        const formattedCompany = calculateFormattedCompany(connection.company, 2);
        const alertContact = {
          firstName: connection.firstName,
          lastName: connection.lastName,
          email: connection.email,
          url: connection.url,
          company: connection.company,
          jobTitle: connection.position,
          labels: [label]
        };
        try {
          label = await this.companyMatcher.getLabel(connection.company);
          // Update labels if needed after finding it
          alertContact.labels = [label];
          const matchResult: MatchResult =
            await this.connectionMatcher.match(connection);

        if (matchResult.matchType === MatchType.UNCERTAIN) {
            if (!alertLogger.checkForDuplicateAlert(alertContact)) {
              status.warning++;
              const topMatches = (matchResult.matches || []).slice(0, 3).map(m => {
                const c = m.contact;
                return {
                  firstName: c.firstName,
                  lastName: c.lastName,
                  email: c.emails?.[0]?.value,
                  url: c.websites?.find(w => w.url?.toLowerCase().includes('linkedin'))?.url || c.websites?.[0]?.url,
                  company: c.company,
                  jobTitle: c.jobTitle,
                  phone: c.phones?.[0]?.number,
                  labels: c.label ? [c.label] : undefined,
                  score: m.score
                };
              });
              await alertLogger.writeAlert('warning', alertContact, ALERT_REASONS.WARNING.UNCERTAIN_MATCH, {
                matches: topMatches,
                exactMatchMessage: matchResult.exactMatchMessage
              });
            }
          } else if (matchResult.matchType === MatchType.NONE) {
            label = 'LinkedIn';
            alertContact.labels = [label];
            const syncResult: SyncResult =
              await this.contactSyncer.addContact(connection, label, 'LinkedIn');
            if (syncResult.status === SyncStatusType.NEW) {
              status.new++;
              await logger.logRaw(
                LogFormatter.formatContactBlock('ADD', connection, label)
              );
            } else if (syncResult.status === SyncStatusType.SKIPPED) {
              if (!alertLogger.checkForDuplicateAlert(alertContact)) {
                status.skipped++;
                await alertLogger.writeAlert('skipped', alertContact, ALERT_REASONS.SKIPPED.MISSING_REQUIRED_DATA);
              }
              await logger.logMain(
                `Skipped contact: ${connection.firstName} ${connection.lastName} (${formattedCompany || 'No company'}) - Missing required data`
              );
            } else if (syncResult.status === SyncStatusType.ERROR) {
              if (!alertLogger.checkForDuplicateAlert(alertContact)) {
                status.error++;
                const errorMessage = syncResult.error
                  ? `Failed to create contact via Google API: ${syncResult.error.message}${syncResult.error.stack ? `\n\nStack trace:\n${syncResult.error.stack}` : ''}`
                  : ALERT_REASONS.ERROR.API_CREATE_FAILED;
                await alertLogger.writeAlert('error', alertContact, errorMessage);
              }
              await logger.logError(
                `Failed to create contact: ${connection.firstName} ${connection.lastName} (${formattedCompany || 'No company'})${syncResult.error ? `: ${syncResult.error.message}` : ''}`
              );
            }
          } else {
            // Exact or Fuzzy match found - skip update as per new requirements
            status.skipped++;
            await logger.logRaw(
              LogFormatter.formatContactBlock('SKIP', connection, label)
            );
            await logger.logMain(
              `Match found for ${connection.firstName} ${connection.lastName} (${formattedCompany || 'No company'}) - Skipping update`
            );
          }
          status.processed++;
          statusBar.updateStatus(status, connection, label);
        } catch (error: unknown) {
          if (!alertLogger.checkForDuplicateAlert(alertContact)) {
            status.error++;
            await alertLogger.writeAlert('error', alertContact, error instanceof Error ? error.message : ALERT_REASONS.ERROR.UNEXPECTED_ERROR);
          }
          status.processed++;
          await logger.logError(
            `Error processing connection ${connection.firstName} ${connection.lastName} (${formattedCompany || 'No company'}): ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          statusBar.updateStatus(status, connection, label);
        }
      }
      // Removed redundant warning log finalization
      statusBar.complete();
      await ContactCache.getInstance().invalidate();
      const googleContactsAfter: number = googleContactsBefore + status.new;
      const duration: number = Math.floor((Date.now() - startTime) / 1000);
      const minutes: number = Math.floor(duration / 60);
      const seconds: number = duration % 60;
      this.uiLogger.breakline();
      if (this.isCancelled) {
        this.uiLogger.displayWarning('LinkedIn Sync was cancelled');
      }
      this.displaySummary(
        connections.length,
        connectionsToProcess.length,
        status,
        googleContactsBefore,
        googleContactsAfter
      );
      await logger.logMain(`Sync completed in ${minutes}m ${seconds}s`);
      await logger.logMain(`Final stats: ${JSON.stringify(status)}`);
      const endStats = await apiTracker.getStats();
      this.uiLogger.breakline();
      this.uiLogger.displayInfo(
        `[People API Stats] ${EMOJIS.API.READ} Read: ${endStats.read}, ${EMOJIS.API.WRITE} Write: ${endStats.write}`
      );
      if (!this.isCancelled) {
        await this.showPostSyncMenu(status, alertLogger);
      } else {
        this.uiLogger.displayExit();
      }
      process.removeListener('SIGINT', escapeHandler);
      if (process.stdin.isTTY) {
        process.stdin.removeListener('keypress', keyPressHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      this.restoreConsole();
    } catch (error: unknown) {
      process.removeListener('SIGINT', escapeHandler);
      if (process.stdin.isTTY) {
        process.stdin.removeListener('keypress', keyPressHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      statusBar.fail('LinkedIn Sync Failed');
      this.uiLogger.resetState('spinner');
      await logger.logMain(
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.restoreConsole();
      throw error;
    }
  }

  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  private setupConsoleCapture(logger: SyncLogger): void {
    const self = this;
    const originalLog = this.originalConsoleLog;
    const originalError = this.originalConsoleError;
    console.log = function (...args: any[]): void {
      if (self.uiLogger && (self.uiLogger as any).isDisplayMethod) {
        originalLog.apply(console, args);
        return;
      }
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      originalLog.apply(console, args);
      if (
        !message.includes('Fetching Google Contacts:') &&
        !message.includes('Processing:') &&
        !message.includes('⠋') &&
        !message.includes('⠙') &&
        !message.includes('⠹') &&
        !message.includes('⠸') &&
        !message.includes('⠼') &&
        !message.includes('⠴') &&
        !message.includes('⠦') &&
        !message.includes('⠧') &&
        !message.includes('⠇') &&
        !message.includes('⠏')
      ) {
        logger.logMain(message).catch(() => {});
      }
    };
    console.error = function (...args: any[]): void {
      if (self.uiLogger && (self.uiLogger as any).isDisplayMethod) {
        originalError.apply(console, args);
        return;
      }
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      originalError.apply(console, args);
      logger.logError(message).catch(() => {});
    };
  }

  private restoreConsole(): void {
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
  }

  private displaySummary(
    totalConnections: number,
    processedConnections: number,
    status: SyncStatus,
    googleContactsBefore: number,
    googleContactsAfter: number
  ): void {
    const totalFormatted =
      FormatUtils.formatNumberWithLeadingZeros(totalConnections);
    const processedFormatted =
      FormatUtils.formatNumberWithLeadingZeros(processedConnections);
    const newFormatted = FormatUtils.formatNumberWithLeadingZeros(status.new);
    const updatedFormatted = FormatUtils.formatNumberWithLeadingZeros(status.updated);
    const upToDateFormatted = FormatUtils.formatNumberWithLeadingZeros(
      status.upToDate
    );
    const warningFormatted = FormatUtils.formatNumberWithLeadingZeros(
      status.warning
    );
    const errorFormatted = FormatUtils.formatNumberWithLeadingZeros(
      status.error
    );
    const skippedFormatted = FormatUtils.formatNumberWithLeadingZeros(
      status.skipped
    );
    const beforeFormatted =
      FormatUtils.formatNumberWithLeadingZeros(googleContactsBefore);
    const afterFormatted =
      FormatUtils.formatNumberWithLeadingZeros(googleContactsAfter);
    const lineWidth = 55;
    this.uiLogger.info(
      FormatUtils.padLineWithEquals('LinkedIn Sync Summary', lineWidth),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `LinkedIn Connections from CSV: ${totalFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `New: ${newFormatted} | Processed: ${processedFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Warning: ${warningFormatted} | Skipped: ${skippedFormatted} | Error: ${errorFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Google Contacts Before: ${beforeFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Google Contacts After: ${afterFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info('='.repeat(lineWidth), {}, false);
  }

  private async showPreRunMenu(alertLogger: AlertLogger): Promise<boolean> {
    const hasAlerts = alertLogger.hasAlerts();
    while (true) {
      if (alertLogger.exceedsThreshold()) {
        const counts = alertLogger.getAlertCounts();
        this.uiLogger.displayWarning(
          `⚠️  WARNING: Alert file contains ${counts.total} entries (200+ threshold exceeded) - Consider reviewing and clearing old alerts to maintain performance.`
        );
        this.uiLogger.breakline();
      }
      const choices: Array<{ name: string; value: string }> = [];
      choices.push({
        name: `${EMOJIS.FIELDS.PERSON} Process the contacts`,
        value: 'process',
      });
      if (hasAlerts) {
        const counts = alertLogger.getAlertCounts();
        const total = counts.warning + counts.error + counts.skipped;
        choices.push({
          name: `⁉️  View Warnings / Skipped / Errors (${total})`,
          value: 'view_alerts',
        });
        choices.push({
          name: `🗑️  Delete Alert File`,
          value: 'delete_file',
        });
        choices.push({
          name: `✏️  Remove Specific Alert`,
          value: 'remove_alert',
        });
      }
      choices.push({
        name: `${EMOJIS.NAVIGATION.EXIT} Exit`,
        value: 'exit',
      });
      const result = await selectWithEscape<string>({
        message: 'LinkedIn Sync - What would you like to do:',
        loop: false,
        choices,
      });
      if (result.escaped || result.value === 'exit') {
        this.uiLogger.displayExit();
        return false;
      }
      if (result.value === 'process') {
        return true;
      }
      if (result.value === 'view_alerts') {
        await this.displayAlertsWithPagination(alertLogger);
        continue;
      }
      if (result.value === 'delete_file') {
        const confirmed = await confirmWithEscape({
          message: 'Are you sure you want to delete the entire alert file? This cannot be undone.',
          default: false,
        });
        if (!confirmed.escaped && confirmed.value) {
          await alertLogger.deleteAlertFile();
          this.uiLogger.displayInfo('Alert file deleted successfully.');
          return await this.showPreRunMenu(alertLogger);
        }
        continue;
      }
      if (result.value === 'remove_alert') {
        await this.removeSpecificAlert(alertLogger);
        continue;
      }
    }
  }

  private async displayAlertsWithPagination(alertLogger: AlertLogger): Promise<void> {
    const allAlerts = alertLogger.getAllAlerts();
    const counts = alertLogger.getAlertCounts();
    this.uiLogger.breakline();
    await this.displayAlertTypeWithPagination('warning', allAlerts.warnings, counts.warning);
    await this.displayAlertTypeWithPagination('skipped', allAlerts.skipped, counts.skipped);
    await this.displayAlertTypeWithPagination('error', allAlerts.errors, counts.error);
  }

  private async displayAlertTypeWithPagination(
    type: 'warning' | 'skipped' | 'error',
    alerts: Alert[],
    count: number
  ): Promise<void> {
    if (count === 0) {
      return;
    }
    const emoji = type === 'warning' ? EMOJIS.STATUS.WARNING : 
                  type === 'skipped' ? EMOJIS.NAVIGATION.SKIP : 
                  EMOJIS.STATUS.ERROR;
    const title = type === 'warning' ? 'Warnings' : 
                  type === 'skipped' ? 'Skipped' : 
                  'Errors';
    let offset = 0;
    const pageSize = 10;
    while (true) {
      this.uiLogger.info(
        `${emoji} ${title} (${FormatUtils.formatNumberWithLeadingZeros(count)}):`,
        {},
        false
      );
      this.uiLogger.info('='.repeat(55), {}, false);
      const pageAlerts = alerts.slice(offset, offset + pageSize);
      for (let i = 0; i < pageAlerts.length; i++) {
        this.displayAlertEntry(pageAlerts[i], offset + i + 1);
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

  private displayAlertEntry(alert: Alert, index: number): void {
    const personNumber = FormatUtils.formatNumberWithLeadingZeros(index);
    this.uiLogger.info(`  Alert ${personNumber} (Index: ${alert.index}):`, {}, false);
    this.uiLogger.info(`    -Name: ${formatMixedHebrewEnglish(alert.contact.firstName)} ${formatMixedHebrewEnglish(alert.contact.lastName)}`, {}, false);
    if (alert.contact.email) {
      this.uiLogger.info(`    -Email: ${alert.contact.email}`, {}, false);
    }
    if (alert.contact.company) {
      this.uiLogger.info(`    -Company: ${formatMixedHebrewEnglish(alert.contact.company)}`, {}, false);
    }
    if (alert.reason) {
      this.uiLogger.info(`    -Reason: ${alert.reason}`, {}, false);
    }
    this.uiLogger.info('', {}, false);
  }

  private async removeSpecificAlert(alertLogger: AlertLogger): Promise<void> {
    const allAlerts = alertLogger.getAllAlerts();
    const allAlertsList: Alert[] = [
      ...allAlerts.warnings,
      ...allAlerts.skipped,
      ...allAlerts.errors,
    ];
    if (allAlertsList.length === 0) {
      this.uiLogger.displayInfo('No alerts to remove.');
      return;
    }
    let offset = 0;
    const pageSize = 10;
    while (true) {
      this.uiLogger.breakline();
      this.uiLogger.info('Select alert to remove:', {}, false);
      this.uiLogger.info('='.repeat(55), {}, false);
      const pageAlerts = allAlertsList.slice(offset, offset + pageSize);
      const choices: Array<{ name: string; value: string }> = [];
      for (const alert of pageAlerts) {
        const typeEmoji = alert.type === 'warning' ? EMOJIS.STATUS.WARNING :
                          alert.type === 'skipped' ? EMOJIS.NAVIGATION.SKIP :
                          EMOJIS.STATUS.ERROR;
        const name = `${typeEmoji} Index ${alert.index}: ${alert.contact.firstName} ${alert.contact.lastName} - ${alert.reason}`;
        choices.push({ name, value: String(alert.index) });
      }
      const hasMore = offset + pageSize < allAlertsList.length;
      if (hasMore) {
        choices.push({ name: 'Show More Alerts', value: 'more' });
      }
      choices.push({ name: 'Back to Menu', value: 'back' });
      const result = await selectWithEscape<string>({
        message: 'Select an alert to remove:',
        loop: false,
        choices,
      });
      if (result.escaped || result.value === 'back') {
        return;
      }
      if (result.value === 'more') {
        offset += pageSize;
        continue;
      }
      const indexToRemove = parseInt(result.value, 10);
      await alertLogger.removeAlertByIndex(indexToRemove);
      this.uiLogger.displayInfo(`Alert ${indexToRemove} removed successfully.`);
      return;
    }
  }

  private async showPostSyncMenu(status: SyncStatus, alertLogger: AlertLogger): Promise<void> {
    const currentRunAlerts = alertLogger.getCurrentRunAlerts();
    let continueMenu: boolean = true;
    while (continueMenu) {
      this.uiLogger.breakline();
      const choices: Array<{ name: string; value: string }> = [];
      if (status.warning > 0) {
        choices.push({
          name: `${EMOJIS.STATUS.WARNING} Display Warnings (${status.warning})`,
          value: 'warnings',
        });
      }
      if (status.error > 0) {
        choices.push({
          name: `${EMOJIS.STATUS.ERROR} Display Errors (${status.error})`,
          value: 'errors',
        });
      }
      if (status.skipped > 0) {
        choices.push({
          name: `${EMOJIS.NAVIGATION.SKIP} Display Skipped (${status.skipped})`,
          value: 'skipped',
        });
      }
      choices.push({ name: `${EMOJIS.NAVIGATION.BACK} Back to Main Menu`, value: 'main' });
      choices.push({ name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: 'exit' });
      const result = await selectWithEscape<string>({
        message: 'What would you like to do now (ESC to return):',
        loop: false,
        choices,
      });
      if (result.escaped) {
        this.uiLogger.displayExit();
        continueMenu = false;
        break;
      }
      const choice = result.value;
      const selectedChoice = choices.find((c) => c.value === choice);
      if (selectedChoice) {
        this.uiLogger.displayInfo(`User selected: ${selectedChoice.name}`);
      }
      if (choice === 'warnings') {
          this.displayCurrentRunAlerts(currentRunAlerts.warnings, 'Warnings');
        } else if (choice === 'errors') {
          this.displayCurrentRunAlerts(currentRunAlerts.errors, 'Errors');
        } else if (choice === 'skipped') {
          this.displayCurrentRunAlerts(currentRunAlerts.skipped, 'Skipped');
        } else if (choice === 'main') {
          continueMenu = false;
      } else if (choice === 'exit') {
        this.uiLogger.displayExit();
        continueMenu = false;
        process.exit(0);
      }
    }
  }

  private displayCurrentRunAlerts(alerts: Alert[], title: string): void {
    this.uiLogger.breakline();
    const displayCount: number = Math.min(10, alerts.length);
    const remaining: number = alerts.length - displayCount;
    this.uiLogger.display(`Displaying ${title} from Current Run`);
    for (let i: number = 0; i < displayCount; i++) {
      const alert = alerts[i];
      const personNumber: string = FormatUtils.formatNumberWithLeadingZeros(i + 1);
      this.uiLogger.info(
        `===Person ${personNumber}/${FormatUtils.formatNumberWithLeadingZeros(displayCount)}===`,
        {},
        false
      );
      if (alert.reason) {
        this.uiLogger.info(`-Reason: ${alert.reason}`, {}, false);
      }
      this.uiLogger.info(
        `-Full name: ${formatMixedHebrewEnglish(alert.contact.firstName)} ${formatMixedHebrewEnglish(alert.contact.lastName)}`,
        {},
        false
      );
      if (alert.contact.company) {
        this.uiLogger.info(
          `-Company: ${formatMixedHebrewEnglish(alert.contact.company)}`,
          {},
          false
        );
      }
      if (alert.contact.email) {
        this.uiLogger.info(
          `-Email: ${alert.contact.email}`,
          {},
          false
        );
      }
      if (alert.contact.url) {
        this.uiLogger.info(
          `-LinkedIn URL: ${alert.contact.url}`,
          {},
          false
        );
      }
      this.uiLogger.info('================', {}, false);
    }
    if (remaining > 0) {
      this.uiLogger.info(
        `\n${remaining} more ${title.toLowerCase()} not displayed`,
        {},
        false
      );
    }
  }
}

export const linkedInSyncScript: Script = {
  metadata: {
    name: 'LinkedIn Sync',
    description:
      'Syncs LinkedIn connections from exported CSV to Google Contacts',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: true,
    estimatedDuration: '5-10 minutes',
    emoji: EMOJIS.SCRIPTS.LINKEDIN,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(LinkedInSyncScript);
    await script.run();
  },
};
