import { injectable, inject } from 'inversify';
import type { OAuth2Client, Script, Stats } from '../types';
import { selectWithEscape, formatDateTimeDDMMYYYY_HHMMSS, TextUtils, inputWithEscape } from '../utils';
import { ContactSyncer, ContactDisplay, ContactEditor, DuplicateDetector } from '../services/contacts';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { EMOJIS } from '../constants';

@injectable()
export class ContactsSyncScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private stats: Stats = { added: 0, updated: 0, skipped: 0, error: 0 };

  constructor(
    @inject('OAuth2Client') _auth: OAuth2Client,
    @inject(ContactSyncer) private contactSyncer: ContactSyncer,
    @inject(ContactEditor) private contactEditor: ContactEditor,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new SyncLogger('contacts-sync');
    this.uiLogger = new Logger('ContactsSyncScript');
  }

  async run(): Promise<void> {
    this.uiLogger.display('Contacts Sync');
    await this.logger.initialize();
    this.setupConsoleCapture();
    await this.logger.logMain('Contacts Sync started');
    try {
      await this.validateAuth();
      await this.logger.logMain(`====${EMOJIS.STATUS.SUCCESS}  Authentication validated===`);
      await this.mainMenu();
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled') {
        this.uiLogger.error('Script failed', error);
        await this.logger.logError(`Script failed: ${error.message}`);
        this.uiLogger.displayError(`Script failed: ${error.message}`);
      }
    } finally {
      this.displayFinalSummary();
      await this.logger.logMain(
        `Script ended - Added: ${this.stats.added}, Updated: ${this.stats.updated}, Skipped: ${this.stats.skipped}, Error: ${this.stats.error}`
      );
      this.restoreConsole();
    }
  }

  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  private setupConsoleCapture(): void {
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
      self.logger.logMain(message).catch(() => {});
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
      self.logger.logError(message).catch(() => {});
    };
  }

  private restoreConsole(): void {
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
  }

  private async validateAuth(): Promise<void> {
    const authService = new AuthService();
    await authService.authorize();
  }

  private async mainMenu(): Promise<void> {
    while (true) {
      const result = await selectWithEscape<string>({
        message: 'What would you like to do now? (ESC to exit)',
        loop: false,
        choices: [
          { name: `${EMOJIS.ACTIONS.ADD} Add contacts`, value: 'add' },
          { name: `${EMOJIS.ACTIONS.EDIT}  Edit a contact`, value: 'edit' },
          { name: `${EMOJIS.ACTIONS.SYNC} Sync contacts`, value: 'sync' },
          { name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: 'exit' },
        ],
      });
      if (result.escaped) {
        await this.logger.logMain('User pressed ESC');
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        process.exit(0);
      }
      const action = result.value;
      if (action === 'exit') {
        await this.logger.logMain(`User selected: ${EMOJIS.NAVIGATION.EXIT} Exit`);
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        process.exit(0);
      } else if (action === 'sync') {
        await this.logger.logMain(`User selected: ${EMOJIS.ACTIONS.SYNC} Sync contacts`);
        await this.syncContactsFlow();
      } else if (action === 'add') {
        await this.logger.logMain(`User selected: ${EMOJIS.ACTIONS.ADD} Add contacts`);
        this.contactEditor.setApiLogging(true);
        this.contactEditor.setLogCallback(async (msg: string) => {
          await this.logger.logMain(msg);
        });
        await this.addContactFlow();
        this.contactEditor.setApiLogging(false);
      } else if (action === 'edit') {
        await this.logger.logMain(`User selected: ${EMOJIS.ACTIONS.EDIT} Edit a contact`);
        this.contactEditor.setApiLogging(true);
        this.contactEditor.setLogCallback(async (msg: string) => {
          await this.logger.logMain(msg);
        });
        await this.editContactFlow();
        this.contactEditor.setApiLogging(false);
      }
    }
  }

  private async syncContactsFlow(): Promise<void> {
    const syncableContacts = await this.contactSyncer.fetchContactsForSyncing(this.uiLogger);
    await this.logger.logMain(
      `Found ${syncableContacts.length} contacts available for syncing`
    );
    if (syncableContacts.length === 0) {
      this.uiLogger.display('No contacts need syncing!');
      return;
    }
    for (let i = 0; i < syncableContacts.length; i++) {
      const syncableContact = syncableContacts[i];
      try {
        const editableData = this.contactEditor.convertContactDataToEditable(
          syncableContact.contact
        );
        const allGroups = await this.contactEditor.fetchContactGroups();
        const existingLabelResourceNames: string[] = [];
        const labelParts = syncableContact.contact.label.split(' | ');
        for (const labelName of labelParts) {
          const group = allGroups.find((g) => g.name === labelName.trim());
          if (group) {
            existingLabelResourceNames.push(group.resourceName);
          }
        }
        editableData.labelResourceNames = existingLabelResourceNames;
        const updatedData = await this.contactEditor.showSummaryAndEdit(
          editableData,
          'Save',
          true,
          {
            reason: syncableContact.reasons.join(', '),
            currentIndex: i + 1,
            totalCount: syncableContacts.length,
            resourceName: syncableContact.resourceName
          }
        );
        if (updatedData === null) {
          await this.logger.logMain(
            `Skipped contact: ${syncableContact.contact.firstName} ${syncableContact.contact.lastName}`
          );
          this.stats.skipped++;
          continue;
        }
        await this.contactSyncer.updateContact(
          syncableContact.resourceName,
          syncableContact.contact,
          updatedData,
          this.uiLogger
        );
        await this.logger.logMain(
          `${EMOJIS.STATUS.SUCCESS} Contact updated: ${syncableContact.contact.firstName} ${syncableContact.contact.lastName}`
        );
        this.stats.updated++;
      } catch (error) {
        if (error instanceof Error && error.message === 'User cancelled') {
          await this.logger.logMain(`User cancelled sync flow`);
          this.displayFinalSummary();
          console.log('');
          this.uiLogger.resetState('spinner');
          this.uiLogger.displayExit();
          process.exit(0);
        } else {
          this.uiLogger.error('Failed to update contact', error as Error);
          await this.logger.logError(
            `Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          this.uiLogger.displayError(`Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
          this.stats.error++;
        }
      }
    }
    this.uiLogger.display('All contacts have been processed!');
    await this.logger.logMain('All contacts have been processed');
  }

  private async addContactFlow(): Promise<void> {
    try {
      const initialData = await this.contactEditor.collectInitialInput();
      const finalData = await this.contactEditor.showSummaryAndEdit(
        initialData,
        'Create'
      );
      if (finalData === null) {
        await this.logger.logMain('Contact creation cancelled by user');
        this.uiLogger.displayError('Contact creation cancelled');
        return;
      }
      const timestamp = formatDateTimeDDMMYYYY_HHMMSS(new Date());
      const note = `Added by the contacts sync script - Last update: ${timestamp}`;
      await this.contactEditor.createContact(finalData, note);
      this.stats.added++;
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') {
        await this.logger.logMain('User cancelled add contact flow');
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        process.exit(0);
      } else if (error instanceof Error && error.message.includes('duplicate')) {
        this.uiLogger.displayError('Contact creation cancelled - duplicate detected');
      } else {
        this.uiLogger.error('Failed to create contact', error as Error);
        this.uiLogger.displayError(`Failed to create contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async editContactFlow(): Promise<void> {
    try {
      const fullNameResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.PERSON} Enter full name to search (ESC to go back):`,
        validate: (input: string): boolean | string => {
          if (!input.trim()) {
            return 'Full name is required to search contacts.';
          }
          return true;
        },
      });

      if (fullNameResult.escaped) {
        return;
      }

      const fullName = fullNameResult.value;
      const { firstName, lastName } = TextUtils.parseFullName(fullName);

      const matches = await this.duplicateDetector.checkDuplicateName(firstName, lastName);

      if (matches.length === 0) {
        this.uiLogger.displayWarning(`No contacts found matching "${fullName}"`);
        return;
      }

      const choices = matches.map((match, i) => {
        const first = TextUtils.reverseHebrewText(match.contact.firstName);
        const last = TextUtils.reverseHebrewText(match.contact.lastName);
        const email = match.contact.emails[0]?.value ? ` (${match.contact.emails[0].value})` : '';
        return {
          name: `🔍 ${`${first} ${last}`.trim()}${email}`,
          value: i,
        };
      });

      const selectedMatchResult = await selectWithEscape<number>({
        message: 'Select contact to update:',
        choices: [
          ...choices,
          { name: '❌ Cancel', value: -1 }
        ],
        loop: false,
      });

      if (selectedMatchResult.escaped || selectedMatchResult.value === -1) {
        return;
      }

      const selectedContact = matches[selectedMatchResult.value].contact;
      if (!selectedContact.resourceName) {
        this.uiLogger.displayError('Selected contact does not have a resource name');
        return;
      }

      const editableData = this.contactEditor.convertContactDataToEditable(selectedContact);

      // Populate labelResourceNames
      const allGroups = await this.contactEditor.fetchContactGroups();
      const existingLabelResourceNames: string[] = [];
      const labelParts = (selectedContact.label || '').split(' | ');
      for (const labelName of labelParts) {
        const group = allGroups.find((g) => g.name === labelName.trim());
        if (group) {
          existingLabelResourceNames.push(group.resourceName);
        }
      }
      editableData.labelResourceNames = existingLabelResourceNames;

      const updatedData = await this.contactEditor.showSummaryAndEdit(
        editableData,
        'Save'
      );

      if (updatedData === null) {
        await this.logger.logMain('Contact update cancelled by user');
        this.uiLogger.displayError('Contact update cancelled');
        return;
      }

      const timestamp = formatDateTimeDDMMYYYY_HHMMSS(new Date());
      const note = `Updated by the contacts sync script - Last update: ${timestamp}`;
      await this.contactEditor.updateExistingContact(
        selectedContact.resourceName,
        updatedData,
        note
      );
      this.stats.updated++;
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') {
        await this.logger.logMain('User cancelled edit contact flow');
      } else {
        this.uiLogger.error('Failed to update contact', error as Error);
        this.uiLogger.displayError(`Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private displayFinalSummary(): void {
    ContactDisplay.displaySummary(
      this.stats.added,
      this.stats.updated,
      this.stats.skipped,
      this.stats.error
    );
  }
}

export const contactsSyncScript: Script = {
  metadata: {
    name: 'Contacts Sync',
    description: 'Manually sync and complete Google contacts data',
    version: '1.0.0',
    category: 'interactive',
    requiresAuth: true,
    estimatedDuration: 'Variable (depends on contacts to sync)',
    emoji: EMOJIS.SCRIPTS.CONTACTS_SYNC,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(ContactsSyncScript);
    await script.run();
  },
};
