import { injectable, inject } from 'inversify';
import { inputWithEscape } from '../utils';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { ContactEditor } from '../services/contacts';
import { EMOJIS } from '../constants';
import type { Script } from '../types';

@injectable()
export class SyncPhonesScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  constructor(@inject(ContactEditor) private contactEditor: ContactEditor) {
    this.logger = new SyncLogger('sync-phones');
    this.uiLogger = new Logger('SyncPhones');
  }

  async run(): Promise<void> {
    this.uiLogger.display('Sync Phones');

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

    await this.syncPhones();
    this.restoreConsole();
  }

  private async syncPhones(): Promise<void> {
    while (true) {
      const contactIdResult = await inputWithEscape({
        message: 'Enter Google Contact ID (from the URL):',
        validate: (input) =>
          input.trim() ? true : 'Contact ID cannot be empty',
      });

      if (contactIdResult.escaped) return;

      const contactId = contactIdResult.value.trim();

      try {
        const label = await this.contactEditor.getContactFirstLabel(contactId);

        const phonesResult = await inputWithEscape({
          message: 'Enter phone numbers separated by comma:',
          validate: (input) =>
            input.trim() ? true : 'Phone numbers cannot be empty',
        });

        if (phonesResult.escaped) return;

        const phones = [
          ...new Set(
            phonesResult.value
              .split(',')
              .map((p) => p.trim())
              .filter((p) => p)
          ),
        ];

        if (phones.length === 0) {
          throw new Error('No valid phone numbers entered');
        }

        const addedCount = await this.contactEditor.addPhonesToContact(
          contactId,
          phones,
          label
        );

        this.uiLogger.displaySuccess(
          `Successfully added ${addedCount} phone numbers with label "${label}".`
        );
        return; // Return to main menu
      } catch (error) {
        this.uiLogger.displayError((error as Error).message);
      }
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

export const syncPhonesScript: Script = {
  metadata: {
    name: 'Sync Phones',
    description: 'Add multiple phones to an existing Google contact by ID',
    version: '1.0.0',
    category: 'interactive',
    requiresAuth: true,
    estimatedDuration: '1-2 minutes',
    emoji: '☎️',
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(SyncPhonesScript);
    await script.run();
  },
};
