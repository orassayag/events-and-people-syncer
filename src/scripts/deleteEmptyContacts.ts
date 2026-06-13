import * as Inversify from 'inversify';
const { injectable, inject } = Inversify;
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { ContactEditor, DuplicateDetector } from '../services/contacts';
import { EMOJIS } from '../constants';
import { SETTINGS } from '../settings';
import type { Script, ContactData } from '../types';

@injectable()
export class DeleteEmptyContactsScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  constructor(
    @inject(ContactEditor) private contactEditor: ContactEditor,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new SyncLogger('delete_empty_contacts');
    this.uiLogger = new Logger('DeleteEmptyContacts');
  }

  async run(): Promise<void> {
    this.uiLogger.display('Delete Empty Contacts');

    await this.logger.initialize();
    this.setupConsoleCapture();
    this.setupSigintHandler();

    try {
      const authService = new AuthService();
      await authService.authorize();
      await this.logger.logMain('Google authentication successful');
    } catch (error) {
      await this.logger.logError(
        `Authentication failed: ${(error as Error).message}`
      );
      this.uiLogger.displayError('Google authentication failed');
      this.restoreConsole();
      return;
    }

    await this.deleteEmptyContacts();
    this.restoreConsole();
  }

  private async deleteEmptyContacts(): Promise<void> {
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Fetching contacts...',
      color: 'cyan',
    }).start();

    try {
      // Use the public method to fetch all contacts
      const allContacts: ContactData[] =
        await this.duplicateDetector.fetchAllContacts();
      spinner.text = `Filtering contacts (Total: ${allContacts.length})...`;

      const targetLabels = [
        'Imported on 6/27',
        'Imported on 6/27 1',
        'Imported on 7/20',
      ];

      const filteredContacts = allContacts.filter((contact) => {
        // 1. Exactly 1 label from the target list
        const labels = contact.label
          ? contact.label.split(' | ').map((l) => l.trim())
          : [];
        if (labels.length !== 1) return false;
        if (!targetLabels.includes(labels[0])) return false;

        // 2. No email addresses
        if (contact.emails && contact.emails.length > 0) return false;

        // 3. No phone numbers
        if (contact.phones && contact.phones.length > 0) return false;

        // 4. Notes must start with "Position:"
        const note = contact.note || contact.biography || '';
        if (!note.startsWith('Position:')) return false;

        return true;
      });

      spinner.stop();
      this.uiLogger.displayInfo(
        `Found ${filteredContacts.length} contacts matching criteria.`
      );

      if (filteredContacts.length === 0) {
        this.uiLogger.displayInfo('No contacts to delete.');
        return;
      }

      for (let i = 0; i < filteredContacts.length; i++) {
        const contact = filteredContacts[i];
        const progress = `[${i + 1}/${filteredContacts.length}]`;

        const contactId = contact.resourceName?.split('/').pop() || '';
        const contactUrl = `https://contacts.google.com/person/${contactId}`;
        const fullName = `${contact.firstName} ${contact.lastName}`.trim();

        this.uiLogger.displayInfo(
          `${progress} Deleting: ${fullName} (${contact.resourceName})`
        );

        // Log in the requested format
        await this.logger.logRaw(`Id: ${contactUrl}`);
        await this.logger.logRaw(`Name: ${fullName}`);
        await this.logger.logRaw(`Label: ${contact.label}`);
        await this.logger.logRaw(`Emails: none`);
        await this.logger.logRaw(`Phones: none`);
        await this.logger.logRaw(
          `Notes: ${contact.note || contact.biography || ''}`
        );
        await this.logger.logRaw('-'.repeat(40));

        if (!SETTINGS.dryMode) {
          try {
            await this.contactEditor.deleteContact(contact.resourceName!);
            this.uiLogger.displaySuccess(`${progress} Deleted ${fullName}`);
          } catch (error) {
            this.uiLogger.displayError(
              `${progress} Failed to delete ${fullName}: ${(error as Error).message}`
            );
            await this.logger.logError(
              `Failed to delete ${contact.resourceName}: ${(error as Error).message}`
            );
          }
        } else {
          this.uiLogger.displayInfo(
            `${progress} [DRY MODE] Would delete ${fullName}`
          );
        }

        // Sleep 1 second after each delete (as requested)
        if (i < filteredContacts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.uiLogger.displaySuccess('Finished deleting empty contacts.');
    } catch (error) {
      spinner.stop();
      this.uiLogger.displayError(
        `Error during process: ${(error as Error).message}`
      );
      await this.logger.logError(
        `Error during process: ${(error as Error).message}`
      );
    }
  }

  private setupSigintHandler(): void {
    process.on('SIGINT', () => {
      console.log(`\n${EMOJIS.STATUS.WARNING} Script interrupted.`);
      process.exit(0);
    });
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
}

export const deleteEmptyContactsScript: Script = {
  metadata: {
    name: 'Delete Empty Contacts',
    description:
      'Delete all empty contacts from Google Contacts based on specific criteria',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: true,
    estimatedDuration: 'Varies',
    emoji: '🗑️',
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(DeleteEmptyContactsScript);
    await script.run();
  },
};
