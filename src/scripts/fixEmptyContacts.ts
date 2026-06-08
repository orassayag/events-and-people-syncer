import { injectable, inject } from 'inversify';
import readline from 'readline';
import { google } from 'googleapis';
import type { OAuth2Client, Script, ContactData } from '../types';
import { SyncStatusBar } from '../flow/syncStatusBar';
import { SyncLogger, Logger, LogCleanup } from '../logging';
import { FormatUtils } from '../constants';
import { SETTINGS } from '../settings';
import { DuplicateDetector } from '../services/contacts';
import { DryModeChecker, retryWithBackoff } from '../utils';
import { ApiTracker } from '../services/api';

@injectable()
export class FixEmptyContactsScript {
  private uiLogger: Logger = new Logger('FixEmptyContacts');
  private isCancelled: boolean = false;
  private logger: SyncLogger;
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new SyncLogger('fix-empty-contacts');
  }

  async run(): Promise<void> {
    this.isCancelled = false;
    await LogCleanup.cleanOldLogs();

    await this.logger.initialize();
    this.setupConsoleCapture();

    const statusBar = new SyncStatusBar();
    this.setupEscapeHandler(statusBar);

    try {
      this.uiLogger.display('Starting Fix Empty Contacts');
      await this.logger.logMain('Fix Empty Contacts script started');

      // 1. Fetch all google contacts
      statusBar.startFetchPhase();
      let googleContactsTotal: number = 0;

      const contacts = await this.duplicateDetector.fetchAllContacts(
        (count: number) => {
          statusBar.updateFetchProgress(count);
        }
      );

      googleContactsTotal = contacts.length;
      statusBar.completeFetch(googleContactsTotal);
      await this.logger.logMain(
        `Fetched ${googleContactsTotal} Google contacts`
      );

      // 2. Filter contacts
      const contactsToFix = contacts.filter((contact) =>
        this.shouldFixContact(contact)
      );

      this.uiLogger.display(
        `Found ${FormatUtils.formatNumberWithLeadingZeros(contactsToFix.length)} empty contacts with details in notes`
      );
      await this.logger.logMain(
        `Found ${contactsToFix.length} contacts to fix`
      );

      if (contactsToFix.length === 0) {
        this.uiLogger.displaySuccess('No contacts found to fix.');
        this.restoreConsole();
        return;
      }

      // 3. Process contacts
      statusBar.startProcessPhase(contactsToFix.length);

      let processedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const contact of contactsToFix) {
        if (this.isCancelled) {
          await this.logger.logMain('Script cancelled by user');
          break;
        }

        try {
          const { emails, phones } = this.extractDataFromNotes(
            contact.biography || ''
          );

          if (emails.length === 0 && phones.length === 0) {
            skippedCount++;
            processedCount++;
            statusBar.updateStatus({
              processed: processedCount,
              skipped: skippedCount,
            });
            continue;
          }

          const contactId = contact.resourceName?.split('/').pop() || '';
          const contactUrl = `https://contacts.google.com/person/${contactId}`;
          const fullName =
            `${contact.firstName} ${contact.lastName}`.trim() || 'Unknown Name';

          await this.logger.logRaw(`Contact ID: ${contact.resourceName}`);
          await this.logger.logRaw(`URL: ${contactUrl}`);
          await this.logger.logRaw(`Name: ${fullName}`);
          await this.logger.logRaw(
            `Extracted Emails: ${emails.join(', ') || 'none'}`
          );
          await this.logger.logRaw(
            `Extracted Phones: ${phones.join(', ') || 'none'}`
          );
          await this.logger.logRaw(`Note: ${contact.biography || ''}`);

          if (DryModeChecker.isEnabled()) {
            DryModeChecker.logApiCall(
              'service.people.updateContact()',
              `${contact.resourceName}: Assign ${emails.length} emails and ${phones.length} phones from notes`,
              this.uiLogger
            );
            await this.logger.logMain(
              `[DRY MODE] Would update contact ${contact.resourceName}`
            );
            updatedCount++;
          } else {
            await this.updateContactWithExtractedData(contact, emails, phones);
            await this.logger.logMain(
              `Successfully updated contact ${contact.resourceName}`
            );
            updatedCount++;
          }

          await this.logger.logRaw('-'.repeat(40));

          processedCount++;
          statusBar.updateStatus({
            processed: processedCount,
            updated: updatedCount,
            skipped: skippedCount,
          });
        } catch (error) {
          this.uiLogger.error(
            `Failed to fix contact ${contact.resourceName}`,
            error as Error
          );
          await this.logger.logError(
            `Error fixing contact ${contact.resourceName}: ${(error as Error).message}`
          );
          errorCount++;
          processedCount++;
          statusBar.updateStatus({
            processed: processedCount,
            error: errorCount,
          });
        }
      }

      statusBar.complete();
      this.uiLogger.displaySuccess(
        `Finished processing. Updated: ${updatedCount}, Errors: ${errorCount}, Skipped: ${skippedCount}`
      );
    } catch (error) {
      this.uiLogger.error(
        'Fatal error in Fix Empty Contacts script',
        error as Error
      );
      statusBar.fail((error as Error).message);
    } finally {
      this.cleanupEscapeHandler();
      this.restoreConsole();
    }
  }

  private setupConsoleCapture(): void {
    const self = this;
    const originalLog = this.originalConsoleLog;
    const originalError = this.originalConsoleError;
    console.log = function (...args: unknown[]): void {
      if (
        self.uiLogger &&
        (self.uiLogger as unknown as { isDisplayMethod: boolean })
          .isDisplayMethod
      ) {
        originalLog.apply(console, args);
        return;
      }
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      originalLog.apply(console, args);
      self.logger.logMain(message).catch(() => {});
    };
    console.error = function (...args: unknown[]): void {
      if (
        self.uiLogger &&
        (self.uiLogger as unknown as { isDisplayMethod: boolean })
          .isDisplayMethod
      ) {
        originalError.apply(console, args);
        return;
      }
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      originalError.apply(console, args);
      self.logger.logError(message).catch(() => {});
    };
  }

  private restoreConsole(): void {
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
  }

  private shouldFixContact(contact: ContactData): boolean {
    // 3.2.1. No Emails for the contact
    const hasNoEmails = contact.emails.length === 0;

    // 3.2.2. No Phones for the contact
    const hasNoPhones = contact.phones.length === 0;

    // 3.2.3 No first name, middle name, and last name.
    const hasNoName = !contact.firstName && !contact.lastName;

    if (!hasNoEmails || !hasNoPhones || !hasNoName) {
      return false;
    }

    // 3.2.4. A note which contains an email or a phone number exists.
    const note = contact.biography || '';
    if (!note) return false;

    const { emails, phones } = this.extractDataFromNotes(note);
    return emails.length > 0 || phones.length > 0;
  }

  private extractDataFromNotes(notes: string): {
    emails: string[];
    phones: string[];
  } {
    const emails: string[] = [];
    const phones: string[] = [];

    if (!notes) return { emails, phones };

    // 1. Specific Pattern (from googleContactsMaintainer)
    // Extract Emails: Pattern: Emails: email1, email2
    const emailMatches = notes.matchAll(/Emails:\s*([^\r\n]+)/gi);
    for (const match of emailMatches) {
      const emailList = match[1].split(',').map((e) => e.trim().toLowerCase());
      emails.push(...emailList.filter((e) => e && e !== 'null'));
    }

    // Extract PhoneNumbers: Pattern: PhoneNumbers: phone1, phone2
    const phoneMatches = notes.matchAll(/PhoneNumbers:\s*([^\r\n]+)/gi);
    for (const match of phoneMatches) {
      const phoneList = match[1].split(',').map((p) => p.trim());
      phones.push(...phoneList.filter((p) => p && p !== 'null'));
    }

    // 2. General Fallback (if nothing found via specific pattern)
    if (emails.length === 0) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
      const generalEmailMatches = notes.match(emailRegex);
      if (generalEmailMatches) {
        emails.push(...generalEmailMatches.map((e) => e.trim().toLowerCase()));
      }
    }

    if (phones.length === 0) {
      const phoneRegex =
        /\+?\d{1,4}[\s\-.]?\(?\d{1,4}\)?[\s\-.]?\d{1,4}[\s\-.]?\d{1,9}(?:\s*(?:ext|x|extension)\.?\s*\d+)?/gi;
      const generalPhoneMatches = notes.match(phoneRegex);
      if (generalPhoneMatches) {
        phones.push(
          ...generalPhoneMatches
            .filter((p) => p.replace(/[^\d]/g, '').length >= 7)
            .map((p) => p.trim())
        );
      }
    }

    return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
  }

  private async updateContactWithExtractedData(
    contact: ContactData,
    emails: string[],
    phones: string[]
  ): Promise<void> {
    if (!contact.resourceName) return;

    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();

    // No need for label for the email or the phone
    const emailAddresses = emails.map((email) => ({ value: email }));
    const phoneNumbers = phones.map((phone) => ({ value: phone }));

    await retryWithBackoff(async () => {
      return await service.people.updateContact({
        resourceName: contact.resourceName,
        updatePersonFields: 'emailAddresses,phoneNumbers',
        requestBody: {
          etag: contact.etag,
          emailAddresses,
          phoneNumbers,
        },
      });
    });

    await apiTracker.trackWrite();
    // Use the delay from settings if available, otherwise default to 200ms
    const delayMs = SETTINGS.contactsSync?.writeDelayMs || 200;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private setupEscapeHandler(statusBar: SyncStatusBar): void {
    const escapeHandler = (): void => {
      this.isCancelled = true;
      statusBar.cancel();
      this.uiLogger.displayWarning(
        'Cancelling Fix Empty Contacts - please wait for current operation to complete'
      );
    };

    const keyPressHandler = (_str: string, key: any): void => {
      if (key && (key.name === 'escape' || (key.ctrl && key.name === 'c'))) {
        escapeHandler();
      }
    };

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('keypress', keyPressHandler);
    }

    (this as any)._keyPressHandler = keyPressHandler;
  }

  private cleanupEscapeHandler(): void {
    if (process.stdin.isTTY && (this as any)._keyPressHandler) {
      process.stdin.removeListener('keypress', (this as any)._keyPressHandler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}

export const fixEmptyContactsScript: Script = {
  metadata: {
    name: 'Fix empty contacts',
    description: 'Assign details from notes to empty contacts',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: true,
    estimatedDuration: '1-5 minutes',
    emoji: '🔗 ',
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(FixEmptyContactsScript);
    await script.run();
  },
};
