import { injectable, inject } from 'inversify';
import readline from 'readline';
import path from 'path';
import type { OAuth2Client, ContactGroup, Script } from '../types';
import { MatchType, MatchResult, SyncStatusType, SyncStatus, SyncResult, HibobContact, Alert, ALERT_REASONS } from '../types';
import { inputWithEscape, confirmWithEscape, selectWithEscape, TextUtils } from '../utils';
import { SETTINGS } from '../settings';
import { HibobExtractor, HibobContactSyncer } from '../services/hibob';
import { DuplicateDetector, DuplicateMatch, ContactEditor } from '../services/contacts';
import { SyncStatusBar } from '../flow/syncStatusBar';
import { SyncLogger, Logger, LogCleanup, AlertLogger } from '../logging';
import { FormatUtils, EMOJIS } from '../constants';
import { ApiTracker } from '../services/api';

@injectable()
export class HibobSyncScript {
  private uiLogger: Logger = new Logger('HibobSync');
  private isCancelled: boolean = false;

  constructor(
    @inject('OAuth2Client') _auth: OAuth2Client,
    @inject(HibobExtractor) private extractor: HibobExtractor,
    @inject(HibobContactSyncer) private contactSyncer: HibobContactSyncer,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector,
    @inject(ContactEditor) private contactEditor: ContactEditor
  ) {}

  async run(): Promise<void> {
    this.isCancelled = false;
    const alertLogger = new AlertLogger('hibob-sync');
    await alertLogger.initialize();
    const shouldContinue = await this.showPreRunMenu(alertLogger);
    if (!shouldContinue) {
      return;
    }
    await LogCleanup.cleanOldLogs();
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const startStats = await apiTracker.getStats();
    this.uiLogger.displayInfo(
      `[People API Stats] ${EMOJIS.API.READ} Read: ${startStats.read}, ${EMOJIS.API.WRITE} Write: ${startStats.write}`
    );
    const logger = new SyncLogger('hibob-sync');
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
    try {
      this.uiLogger.display('Starting HiBob Sync');
      await logger.logMain('HiBob Sync started');
      const filePath = path.resolve(SETTINGS.hibob.filePath);
      this.uiLogger.display(`File path: ${filePath}`);
      await logger.logMain(`File path: ${filePath}`);
      this.uiLogger.display('Extracting HiBob contacts from file');
      const contacts: HibobContact[] = await this.extractor.extract();
      this.uiLogger.breakline();
      await logger.logMain(
        `Extracted ${contacts.length} HiBob contacts`
      );
      if (contacts.length === 0) {
        throw new Error('No contacts found in HiBob file after deduplication');
      }
      const testLimit = SETTINGS.hibob.testContactLimit;
      const contactsToProcess =
        testLimit !== null && testLimit !== undefined && testLimit > 0
          ? contacts.slice(0, testLimit)
          : contacts;
      if (contactsToProcess.length < contacts.length) {
        await logger.logMain(
          `TEST MODE: Limited to ${contactsToProcess.length} contacts for testing`
        );
        this.uiLogger.warn(
          `TEST MODE: Processing ${contactsToProcess.length} of ${contacts.length} contacts (limit set in settings)`
        );
      }
      let labelResourceName = '';
      let companyName = '';
      let userConfirmed = false;
      while (!userConfirmed) {
        companyName = '';
        while (!companyName) {
          const companyResult = await inputWithEscape({
            message: 'Enter company name (will be used as label):',
            default: '',
          });
          if (companyResult.escaped) {
            throw new Error('User cancelled');
          }
          if (!companyResult.value || companyResult.value.trim().length < 2) {
            this.uiLogger.displayError('Company name must be at least 2 characters');
            continue;
          }
          companyName = TextUtils.formatCompanyToPascalCase(companyResult.value.trim());
        }
        await logger.logMain(`Company name: ${companyName}`);
        const existingGroups: ContactGroup[] = await this.contactEditor.fetchContactGroups();
        labelResourceName = '';
        const existingGroup = existingGroups.find(g => g.name.toLowerCase() === companyName.toLowerCase());
        if (existingGroup) {
          labelResourceName = existingGroup.resourceName;
          this.uiLogger.display(`${EMOJIS.STATUS.SUCCESS} Found label "${companyName}"`);
          await logger.logMain(`Using existing label: ${companyName}`);
        } else {
          this.uiLogger.display(`The company "${companyName}" does not exist as a Label in Google Contacts.`);
          const shouldCreateResult = await confirmWithEscape({
            message: 'Should we create this label? (y/n)',
            default: true,
          });
          if (shouldCreateResult.escaped || !shouldCreateResult.value) {
            continue;
          }
          labelResourceName = await this.contactEditor.createContactGroup(companyName);
          this.uiLogger.display(`Created new label: ${companyName}`);
          await logger.logMain(`Created new label: ${companyName}`);
        }
        this.uiLogger.breakline();
        this.uiLogger.display(`${EMOJIS.FIELDS.LABEL}  Label: ${companyName}`);
        this.uiLogger.display(`Total contacts to sync: ${FormatUtils.formatNumberWithLeadingZeros(contactsToProcess.length)}`);
        this.uiLogger.breakline();
        const confirmResult = await confirmWithEscape({
          message: `Proceed with syncing contacts to Google with label "${companyName}"?`,
          default: false,
        });
        if (confirmResult.escaped) {
          throw new Error('User cancelled');
        }
        if (!confirmResult.value) {
          continue;
        }
        userConfirmed = true;
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
      statusBar.setFilePath(filePath);
      const previousCounts = alertLogger.getAlertCounts();
      statusBar.startProcessPhase(contactsToProcess.length, previousCounts);
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
      for (const contact of contactsToProcess) {
        if (this.isCancelled) {
          statusBar.cancel();
          this.uiLogger.displayWarning('Cancelling HiBob Sync - stopping at current position');
          await logger.logMain('Sync cancelled by user');
          break;
        }
        if (alertLogger.isAlertedContact(contact)) {
          status.previouslyAlerted++;
          statusBar.updateStatus(status);
          continue;
        }
        const alertContact = {
          firstName: contact.firstName,
          lastName: contact.lastName || '',
          email: contact.email,
          labels: [companyName]
        };
        try {
          let nameMatches: DuplicateMatch[] = [];
          let emailMatches: DuplicateMatch[] = [];
          nameMatches = await this.duplicateDetector.checkDuplicateName(
            contact.firstName,
            contact.lastName || ''
          );
          if (contact.email) {
            emailMatches = await this.duplicateDetector.checkDuplicateEmail(
              contact.email
            );
          }
          const hasExactEmailMatch = emailMatches.length > 0;
          const hasNameMatch = nameMatches.length > 0;
          const matchType = hasExactEmailMatch
            ? MatchType.EXACT
            : hasNameMatch && nameMatches.length === 1
            ? MatchType.FUZZY
            : hasNameMatch
            ? MatchType.UNCERTAIN
            : MatchType.NONE;
          const matchResult: MatchResult = {
            matchType,
            resourceName: hasExactEmailMatch
              ? emailMatches[0].contact.resourceName
              : hasNameMatch && nameMatches.length === 1
              ? nameMatches[0].contact.resourceName
              : undefined,
            score: hasNameMatch ? nameMatches[0].score : undefined,
          };


        if (matchResult.matchType === MatchType.UNCERTAIN) {
            if (!alertLogger.checkForDuplicateAlert(alertContact)) {
              status.warning++;
              await alertLogger.writeAlert('warning', alertContact, ALERT_REASONS.WARNING.UNCERTAIN_MATCH);
            }
          } else if (matchResult.matchType === MatchType.NONE) {
            const syncResult: SyncResult =
              await this.contactSyncer.addContact(contact, labelResourceName, companyName);
            if (syncResult.status === SyncStatusType.NEW) {
              status.new++;
              await logger.logMain(
                `Added contact: ${contact.firstName} ${contact.lastName || ''} (${companyName || 'No company'}) - Label: ${companyName}`
              );
            } else if (syncResult.status === SyncStatusType.SKIPPED) {
              if (!alertLogger.checkForDuplicateAlert(alertContact)) {
                status.skipped++;
                await alertLogger.writeAlert('skipped', alertContact, ALERT_REASONS.SKIPPED.MISSING_REQUIRED_DATA);
              }
              await logger.logMain(
                `Skipped contact: ${contact.firstName} ${contact.lastName || ''} - Missing required data`
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
                `Error adding contact: ${contact.firstName} ${contact.lastName || ''} (${contact.email || 'No email'})${syncResult.error ? `: ${syncResult.error.message}` : ''}`
              );
            }
          } else if (
            matchResult.matchType === MatchType.EXACT ||
            matchResult.matchType === MatchType.FUZZY
          ) {
            if (!matchResult.resourceName) {
              if (!alertLogger.checkForDuplicateAlert(alertContact)) {
                status.error++;
                await alertLogger.writeAlert('error', alertContact, ALERT_REASONS.ERROR.MISSING_RESOURCE_NAME);
              }
              await logger.logError(
                `Match found but no resourceName for ${contact.firstName} ${contact.lastName || ''} (${contact.email || 'No email'})`
              );
            } else {
              const syncResult =
                await this.contactSyncer.updateContact(
                  matchResult.resourceName,
                  labelResourceName
                );
              if (syncResult.status === SyncStatusType.UPDATED) {
                status.updated++;
                await logger.logMain(
                  `Updated contact: ${contact.firstName} ${contact.lastName || ''} (${companyName || 'No company'}) - Label: ${companyName}`
                );
              } else if (syncResult.status === SyncStatusType.UP_TO_DATE) {
                status.upToDate++;
                await logger.logMain(
                  `Contact up-to-date: ${contact.firstName} ${contact.lastName || ''} (${contact.email || 'No email'})`
                );
              } else if (syncResult.status === SyncStatusType.ERROR) {
                if (!alertLogger.checkForDuplicateAlert(alertContact)) {
                  status.error++;
                  const errorMessage = syncResult.error
                    ? `Failed to update contact via Google API: ${syncResult.error.message}${syncResult.error.stack ? `\n\nStack trace:\n${syncResult.error.stack}` : ''}`
                    : ALERT_REASONS.ERROR.API_UPDATE_FAILED;
                  await alertLogger.writeAlert('error', alertContact, errorMessage);
                }
                await logger.logError(
                  `Error updating contact: ${contact.firstName} ${contact.lastName || ''} (${contact.email || 'No email'})${syncResult.error ? `: ${syncResult.error.message}` : ''}`
                );
              }
            }
          }
          status.processed++;
          statusBar.updateStatus(status, contact, companyName);
        } catch (error: unknown) {
          if (!alertLogger.checkForDuplicateAlert(alertContact)) {
            status.error++;
            await alertLogger.writeAlert('error', alertContact, error instanceof Error ? error.message : ALERT_REASONS.ERROR.UNEXPECTED_ERROR);
          }
          status.processed++;
          await logger.logError(
            `Error processing contact ${contact.firstName} ${contact.lastName || ''}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          statusBar.updateStatus(status);
        }
      }
      statusBar.complete();
      const googleContactsAfter = googleContactsBefore + status.new;
      const endTime: number = Date.now();
      const durationMs: number = endTime - startTime;
      const durationSec: number = Math.floor(durationMs / 1000);
      await logger.logMain(`Sync completed in ${durationSec} seconds`);
      await logger.logMain(
        `Final stats - Processed: ${status.processed}, New: ${status.new}, Up-to-date: ${status.upToDate}, Updated: ${status.updated}, Warning: ${status.warning}, Error: ${status.error}, Skipped: ${status.skipped}`
      );
      const endStats = await apiTracker.getStats();
      this.uiLogger.displayInfo(
        `[People API Stats] ${EMOJIS.API.READ} Read: ${endStats.read}, ${EMOJIS.API.WRITE} Write: ${endStats.write}`
      );
      this.displaySummary(
        contactsToProcess.length,
        status,
        googleContactsBefore,
        googleContactsAfter
      );
      await this.postSyncMenu(status, alertLogger);
          } catch (error: unknown) {
      statusBar.fail('HiBob Sync failed');
      if (error instanceof Error && error.message === 'User cancelled') {
        this.uiLogger.displayWarning('User cancelled operation');
        await logger.logMain('Sync cancelled by user');
      } else {
        this.uiLogger.displayError(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        await logger.logError(
          `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
          } finally {
      this.restoreConsole();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('keypress', keyPressHandler);
      }
      process.removeListener('SIGINT', escapeHandler);
    }
  }

  private setupConsoleCapture(logger: SyncLogger): void {
    const self = this;
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = function (...args: any[]): void {
      if (self.uiLogger && (self.uiLogger as any).isDisplayMethod) {
        originalLog.apply(console, args);
        return;
      }
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      originalLog.apply(console, args);
      if (!spinnerChars.some((char) => message.includes(char))) {
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
      if (!spinnerChars.some((char) => message.includes(char))) {
        logger.logMain(message).catch(() => {});
      }
    };
    (this as any).originalLog = originalLog;
    (this as any).originalError = originalError;
  }

  private restoreConsole(): void {
    if ((this as any).originalLog) {
      console.log = (this as any).originalLog;
    }
    if ((this as any).originalError) {
      console.error = (this as any).originalError;
    }
  }

  private displaySummary(
    totalContacts: number,
    status: SyncStatus,
    googleContactsBefore: number,
    googleContactsAfter: number
  ): void {
    const totalFormatted = FormatUtils.formatNumberWithLeadingZeros(totalContacts);
    const newFormatted = FormatUtils.formatNumberWithLeadingZeros(status.new);
    const updatedFormatted = FormatUtils.formatNumberWithLeadingZeros(status.updated);
    const processedFormatted = FormatUtils.formatNumberWithLeadingZeros(status.processed);
    const upToDateFormatted = FormatUtils.formatNumberWithLeadingZeros(status.upToDate);
    const warningFormatted = FormatUtils.formatNumberWithLeadingZeros(status.warning);
    const errorFormatted = FormatUtils.formatNumberWithLeadingZeros(status.error);
    const skippedFormatted = FormatUtils.formatNumberWithLeadingZeros(status.skipped);
    const beforeFormatted = FormatUtils.formatNumberWithLeadingZeros(googleContactsBefore);
    const afterFormatted = FormatUtils.formatNumberWithLeadingZeros(googleContactsAfter);
    const lineWidth = 55;
    this.uiLogger.info(
      FormatUtils.padLineWithEquals('Hibob Sync Summary', lineWidth),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Hibob Contacts from File: ${totalFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `New: ${newFormatted} | Processed: ${processedFormatted} | Updated: ${updatedFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Warning: ${warningFormatted} | UpToDate: ${upToDateFormatted}`,
        lineWidth
      ),
      {},
      false
    );
    this.uiLogger.info(
      FormatUtils.padLineWithEquals(
        `Skipped: ${skippedFormatted} | Error: ${errorFormatted}`,
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
        message: 'HiBob Sync - What would you like to do:',
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
    this.uiLogger.info(`    -Name: ${alert.contact.firstName} ${alert.contact.lastName || ''}`, {}, false);
    if (alert.contact.email) {
      this.uiLogger.info(`    -Email: ${alert.contact.email}`, {}, false);
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
        const name = `${typeEmoji} Index ${alert.index}: ${alert.contact.firstName} ${alert.contact.lastName || ''} - ${alert.reason}`;
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

  private async postSyncMenu(status: SyncStatus, alertLogger: AlertLogger): Promise<void> {
    if (status.warning === 0 && status.error === 0 && status.skipped === 0) {
      return;
    }
    const currentRunAlerts = alertLogger.getCurrentRunAlerts();
    let continueMenu: boolean = true;
    while (continueMenu) {
      this.uiLogger.breakline();
      const choices: Array<{ name: string; value: string }> = [];
      if (status.warning > 0) {
        choices.push({
          name: `${EMOJIS.STATUS.WARNING}  Display Warnings (${FormatUtils.formatNumberWithLeadingZeros(status.warning)})`,
          value: 'warnings',
        });
      }
      if (status.error > 0) {
        choices.push({
          name: `${EMOJIS.STATUS.ERROR} Display Errors (${FormatUtils.formatNumberWithLeadingZeros(status.error)})`,
          value: 'errors',
        });
      }
      if (status.skipped > 0) {
        choices.push({
          name: `${EMOJIS.NAVIGATION.SKIP} Display Skipped (${FormatUtils.formatNumberWithLeadingZeros(status.skipped)})`,
          value: 'skipped',
        });
      }
      choices.push({ name: `${EMOJIS.NAVIGATION.BACK} Back to Main Menu`, value: 'main' });
      choices.push({ name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: 'exit' });
      this.uiLogger.resetState('menu');
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
    const displayCount = Math.min(alerts.length, 10);
    const remaining = alerts.length - displayCount;
    this.uiLogger.display(`Displaying ${title} from Current Run`);
    for (let i = 0; i < displayCount; i++) {
      const alert = alerts[i];
      const personNumber = FormatUtils.formatNumberWithLeadingZeros(i + 1);
      this.uiLogger.info(
        `===Person ${personNumber}/${FormatUtils.formatNumberWithLeadingZeros(displayCount)}===`,
        {},
        false
      );
      if (alert.reason) {
        this.uiLogger.info(`${EMOJIS.DATA.REASON}  Reason: ${alert.reason}`, {}, false);
      }
      this.uiLogger.info(
        `${EMOJIS.FIELDS.PERSON} Name: ${alert.contact.firstName} ${alert.contact.lastName || ''}`,
        {},
        false
      );
      if (alert.contact.email) {
        this.uiLogger.info(`${EMOJIS.FIELDS.EMAIL} Email: ${alert.contact.email}`, {}, false);
      }
      console.log('');
    }
    if (remaining > 0) {
      this.uiLogger.info(
        `... and ${FormatUtils.formatNumberWithLeadingZeros(remaining)} more`,
        {},
        false
      );
      this.uiLogger.breakline();
    }
  }
}

export const hibobSyncScript: Script = {
  metadata: {
    name: 'Hibob Sync',
    description: 'Syncs Hibob contacts from text file to Google Contacts',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: true,
    estimatedDuration: '5-10 minutes',
    emoji: EMOJIS.SCRIPTS.HIBOB,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(HibobSyncScript);
    await script.run();
  },
};
