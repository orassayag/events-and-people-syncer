import { injectable, inject } from 'inversify';
import ora from 'ora';
import {
  selectWithEscape,
  inputWithEscape,
  confirmWithEscape,
  readFromClipboard,
  isHtmlContent,
  clearClipboard,
  TextUtils,
  formatDateDDMMYYYY,
} from '../utils';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { HtmlSanitizer, HtmlSourceDetector, PhoneExtractor } from '../services/messaging';
import { ContactEditor, DuplicateDetector } from '../services/contacts';
import { ContactCache } from '../cache';
import { FormatUtils, EMOJIS } from '../constants';
import { SETTINGS } from '../settings';
import type { Script, SmsWhatsappSyncStats, ExtractedContact, MessageSource, SelectorResult } from '../types';

@injectable()
export class SmsWhatsappSyncScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private stats: SmsWhatsappSyncStats = {
    added: 0,
    updated: 0,
    skipped: 0,
    error: 0,
  };
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  constructor(
    @inject(HtmlSanitizer) private htmlSanitizer: HtmlSanitizer,
    @inject(HtmlSourceDetector) private htmlSourceDetector: HtmlSourceDetector,
    @inject(PhoneExtractor) private phoneExtractor: PhoneExtractor,
    @inject(ContactEditor) private contactEditor: ContactEditor,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new SyncLogger('sms-whatsapp-sync');
    this.uiLogger = new Logger('SmsWhatsappSync');
  }

  async run(): Promise<void> {
    this.uiLogger.display('SMS & WhatsApp Sync');
    const confirmed = await this.showImportantNotice();
    if (!confirmed) {
      this.uiLogger.displayWarning('Script cancelled by user');
      return;
    }
    await this.logger.initialize();
    this.setupConsoleCapture();
    this.setupSigintHandler();
    await this.logger.logMain('SMS & WhatsApp Sync started');
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
    try {
      const phones = await this.extractFromClipboard();
      if (!phones || phones.length === 0) {
        this.displayFinalSummary();
        this.restoreConsole();
        return;
      }
      await this.processPhones(phones);
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled') {
        this.uiLogger.error('Script failed', error);
        await this.logger.logError(`Script failed: ${error.message}`);
      }
    }
    this.displayFinalSummary();
    await this.logger.logMain(
      `Script ended - Added: ${this.stats.added}, Updated: ${this.stats.updated}, Skipped: ${this.stats.skipped}, Error: ${this.stats.error}`
    );
    this.restoreConsole();
  }

  private async showImportantNotice(): Promise<boolean> {
    console.log('');
    console.log(`${EMOJIS.STATUS.IMPORTANT} IMPORTANT ${EMOJIS.STATUS.IMPORTANT}`);
    console.log('When using this script you need to:');
    console.log('1. Scroll down and stay on the screen you want to fetch.');
    console.log('2. Copy the HTML.');
    console.log('');
    console.log(
      'You need to repeat these steps several times since the HTML changes dynamically when scrolling down and up.'
    );
    console.log('');
    const result = await confirmWithEscape({
      message: 'Do you wish to continue?',
      default: true,
    });
    if (result.escaped || !result.value) {
      return false;
    }
    return true;
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

  private async extractFromClipboard(): Promise<ExtractedContact[] | null> {
    this.uiLogger.displayMultiLine([
      'Please pair Google Messages / WhatsApp Web and scroll through ALL conversations',
      'to ensure they are loaded in the DOM, then copy the HTML page to the clipboard',
    ]);
    while (true) {
      const readyResult = await inputWithEscape({
        message: 'Press Enter when ready (ESC to cancel)',
      });
      if (readyResult.escaped) {
        throw new Error('User cancelled');
      }
      const clipboardContent = await this.readAndValidateClipboard();
      if (clipboardContent === null) {
        const exitResult = await confirmWithEscape({
          message: 'Exit?',
          default: true,
        });
        if (exitResult.escaped || exitResult.value) {
          return null;
        }
        continue;
      }
      await clearClipboard();
      return await this.processClipboardContent(clipboardContent);
    }
  }

  private async readAndValidateClipboard(): Promise<string | null> {
    const spinner = ora('Reading from clipboard...').start();
    let clipboardContent: string;
    try {
      const result = await readFromClipboard(
        SETTINGS.smsWhatsappSync.maxHtmlSizeBytes
      );
      clipboardContent = result.content;
      spinner.succeed('Clipboard read successfully');
    } catch (error) {
      spinner.fail((error as Error).message);
      return null;
    }
    if (!clipboardContent.trim()) {
      this.uiLogger.displayWarning(
        'Clipboard is empty or contains non-text content'
      );
      return null;
    }
    if (!isHtmlContent(clipboardContent)) {
      this.uiLogger.displayWarning('Clipboard contains plain text, not HTML');
      return null;
    }
    return clipboardContent;
  }

  private async processClipboardContent(
    clipboardContent: string
  ): Promise<ExtractedContact[] | null> {
    const sanitizeSpinner = ora('Sanitizing and validating HTML...').start();
    const sanitizeResult = this.htmlSanitizer.sanitize(clipboardContent);
    sanitizeSpinner.succeed(
      `HTML sanitized (${sanitizeResult.scriptsRemoved} scripts, ${sanitizeResult.stylesRemoved} styles removed)`
    );
    const detectionResult = this.htmlSourceDetector.detectSource(
      sanitizeResult.html
    );
    if (!detectionResult.source) {
      this.uiLogger.displayMultiLine([
        '✗ Error: Could not detect Google Messages or WhatsApp Web HTML',
        'Please ensure you copied the correct page HTML',
      ]);
      await this.logger.logError(
        `Source detection failed. Matched: ${detectionResult.matchedSelectors.join(', ')}`
      );
      throw new Error('User cancelled');
    }
    const sourceName = this.htmlSourceDetector.getSourceDisplayName(
      detectionResult.source
    );
    if (this.htmlSourceDetector.isLowConfidence(detectionResult.confidence)) {
      this.uiLogger.displayWarning(
        `${sourceName} HTML detected with low confidence (${detectionResult.confidence}%)`
      );
      this.displaySelectorStatus(detectionResult.selectors);
      const proceedResult = await confirmWithEscape({
        message: 'Detection may be unreliable. Proceed anyway?',
        default: false,
      });
      if (proceedResult.escaped || !proceedResult.value) {
        throw new Error('User cancelled');
      }
    } else {
      this.uiLogger.displaySuccess(
        `${sourceName} HTML detected (${detectionResult.confidence}% confidence)`
      );
      this.displaySelectorStatus(detectionResult.selectors);
    }
    await this.logger.logMain(
      `Detected source: ${detectionResult.source} (${detectionResult.confidence}% confidence)`
    );
    const extractSpinner = ora('Extracting phone numbers...').start();
    const extractedContacts = this.phoneExtractor.extractPhoneNumbers(
      sanitizeResult.html,
      detectionResult.source as MessageSource
    );
    const uniqueContacts =
      this.phoneExtractor.deduplicateContacts(extractedContacts);
    const duplicatesRemoved = extractedContacts.length - uniqueContacts.length;
    extractSpinner.succeed(`Found ${uniqueContacts.length} phone numbers`);
    if (uniqueContacts.length === 0) {
      await this.logger.logMain('No phone numbers found');
      return null;
    }
    const withNames = uniqueContacts.filter((c) => c.suggestedName).length;
    const withoutNames = uniqueContacts.length - withNames;
    console.log(`  ${withNames} with suggested names, ${withoutNames} without`);
    if (duplicatesRemoved > 0) {
      console.log(`  Filtered: ${duplicatesRemoved} duplicates removed`);
    }
    await this.logger.logMain(
      `Extracted ${uniqueContacts.length} unique phones (${duplicatesRemoved} duplicates removed)`
    );
    return uniqueContacts;
  }

  private async processPhones(phones: ExtractedContact[]): Promise<void> {
    const fetchSpinner = ora('Fetching Google Contacts...').start();
    await ContactCache.getInstance().invalidate();
    const cache = ContactCache.getInstance();
    await cache.get();
    fetchSpinner.succeed('Google Contacts loaded');
    console.log('');
    const autoSkipped: Array<{ phone: string; contactName: string }> = [];
    const toProcess: ExtractedContact[] = [];
    for (const contact of phones) {
      const existingContacts = await cache.getByNormalizedPhone(contact.phone);
      if (existingContacts.length > 0) {
        const contactName =
          `${existingContacts[0].firstName} ${existingContacts[0].lastName}`.trim();
        autoSkipped.push({ phone: contact.phone, contactName });
      } else {
        toProcess.push(contact);
      }
    }
    if (autoSkipped.length > 0) {
      for (const { phone, contactName } of autoSkipped) {
        this.uiLogger.displaySuccess(
          `Auto-skipped: ${phone} (already saved as "${contactName}")`
        );
        this.stats.skipped++;
      }
      console.log('═'.repeat(67));
      console.log(
        `Auto-skipped ${autoSkipped.length} phones already in contacts. Processing ${toProcess.length} remaining phones...`
      );
      console.log('═'.repeat(67));
    }
    if (toProcess.length === 0) {
      this.uiLogger.displaySuccess(
        `All ${phones.length} extracted phones are already in your contacts! No new phones to process.`
      );
      return;
    }
    const total = toProcess.length;
    for (let i = 0; i < toProcess.length; i++) {
      const contact = toProcess[i];
      const currentIndex = i + 1;
      console.log('═'.repeat(67));
      console.log(
        `Index: ${FormatUtils.formatNumberWithLeadingZeros(currentIndex)} / ${FormatUtils.formatNumberWithLeadingZeros(total)}`
      );
      const displayPhone = TextUtils.reverseHebrewText(contact.phone);
      console.log(`Phone: ${displayPhone}`);
      if (contact.suggestedName) {
        const displayName = TextUtils.reverseHebrewText(contact.suggestedName);
        console.log(`Suggested Name: ${displayName}`);
      }
      if (contact.message) {
        const displayMessage = TextUtils.reverseHebrewText(contact.message);
        console.log(`Message:`);
        console.log(displayMessage);
      }
      console.log('═'.repeat(67));
      const action = await this.promptForAction();
      if (action === 'escape') {
        break;
      }
      await this.handleAction(action, contact);
    }
  }

  private async promptForAction(): Promise<string> {
    const result = await selectWithEscape<string>({
      message: 'What would you like to do?',
      loop: false,
      choices: [
        { name: `${EMOJIS.ACTIONS.SEARCH} Search in contacts`, value: 'search' },
        { name: `${EMOJIS.ACTIONS.ADD} Add a new contact`, value: 'add' },
        { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this phone`, value: 'skip' },
      ],
    });
    if (result.escaped) {
      return 'escape';
    }
    return result.value;
  }

  private async handleAction(
    action: string,
    contact: ExtractedContact
  ): Promise<void> {
    if (action === 'search') {
      await this.handleSearchAction(contact);
    } else if (action === 'add') {
      await this.handleAddAction(contact);
    } else if (action === 'skip') {
      await this.handleSkipAction();
    }
  }

  private async handleSearchAction(contact: ExtractedContact): Promise<void> {
    while (true) {
      const searchResult = await inputWithEscape({
        message: 'Enter name to search:',
        default: contact.suggestedName || '',
      });
      if (searchResult.escaped) {
        return;
      }
      const searchName = searchResult.value.trim();
      if (!searchName) {
        this.uiLogger.displayWarning('Please enter a name to search');
        continue;
      }
      const nameParts = searchName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const matches = await this.duplicateDetector.checkDuplicateName(
        firstName,
        lastName
      );
      if (matches.length === 0) {
        this.uiLogger.displayInfo(`No contacts found matching "${searchName}"`);
        const nextAction = await selectWithEscape<string>({
          message: 'What would you like to do?',
          loop: false,
          choices: [
            { name: `${EMOJIS.ACTIONS.SEARCH} Search again`, value: 'search' },
            { name: `${EMOJIS.ACTIONS.ADD} Add a new contact`, value: 'add' },
            { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this phone`, value: 'skip' },
          ],
        });
        if (nextAction.escaped || nextAction.value === 'skip') {
          await this.handleSkipAction();
          return;
        }
        if (nextAction.value === 'add') {
          await this.handleAddAction(contact);
          return;
        }
        continue;
      }
      this.uiLogger.displayInfo(`Found ${matches.length} similar contacts:`);
      for (let i = 0; i < matches.length; i++) {
        const { contact: matchContact, similarityType } = matches[i];
        const matchNumber = (i + 1).toString().padStart(3, '0');
        console.log(`===Match ${matchNumber}:===`);
        console.log(`-Similarity Type: ${similarityType}`);
        const fullName =
          `${matchContact.firstName} ${matchContact.lastName}`.trim();
        console.log(`-Full Name: ${TextUtils.reverseHebrewText(fullName)}`);
        if (matchContact.label) {
          console.log(
            `-Labels: ${TextUtils.reverseHebrewText(matchContact.label)}`
          );
        }
        if (matchContact.company) {
          console.log(
            `-Company: ${TextUtils.reverseHebrewText(matchContact.company)}`
          );
        }
        console.log('');
      }
      const selectChoices = matches.map((m, idx) => {
        const displayName =
          `${m.contact.firstName} ${m.contact.lastName}`.trim();
        const label = m.contact.label ? ` (${m.contact.label})` : '';
        return {
          name: `${TextUtils.reverseHebrewText(displayName)}${label}`,
          value: `select_${idx}`,
        };
      });
      selectChoices.push(
        { name: `${EMOJIS.ACTIONS.SEARCH} Search again`, value: 'search' },
        { name: `${EMOJIS.ACTIONS.ADD} Add a new contact`, value: 'add' },
        { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this phone`, value: 'skip' }
      );
      const selectResult = await selectWithEscape<string>({
        message: 'Select contact to update, or choose another option:',
        loop: false,
        choices: selectChoices,
      });
      if (selectResult.escaped || selectResult.value === 'skip') {
        await this.handleSkipAction();
        return;
      }
      if (selectResult.value === 'add') {
        await this.handleAddAction(contact);
        return;
      }
      if (selectResult.value === 'search') {
        continue;
      }
      if (selectResult.value.startsWith('select_')) {
        const matchIdx = parseInt(
          selectResult.value.replace('select_', ''),
          10
        );
        const selectedContact = matches[matchIdx].contact;
        if (!selectedContact.resourceName) {
          this.uiLogger.displayError('Selected contact has no resource name');
          this.stats.error++;
          return;
        }
        const updateSpinner = ora('Adding phone to contact...').start();
        try {
          await this.contactEditor.addPhoneToExistingContact(
            selectedContact.resourceName,
            contact.phone
          );
          updateSpinner.succeed('Phone added to contact');
          this.stats.updated++;
          await this.logger.logMain(
            `Updated contact ${selectedContact.firstName} ${selectedContact.lastName} with phone ${contact.phone}`
          );
        } catch (error) {
          updateSpinner.fail('Failed to update contact');
          this.stats.error++;
          await this.logger.logError(
            `Failed to update contact: ${(error as Error).message}`
          );
        }
        return;
      }
    }
  }

  private async handleAddAction(contact: ExtractedContact): Promise<void> {
    try {
      this.contactEditor.setLogCallback(async (msg: string) => {
        await this.logger.logMain(msg);
      });
      if (contact.suggestedName) {
        console.log(
          `Suggested name from source: ${TextUtils.reverseHebrewText(contact.suggestedName)}`
        );
      }
      console.log(`Phone to add: ${contact.phone}`);
      console.log('');
      const initialData = await this.contactEditor.collectInitialInput();
      if (!initialData.phones.includes(contact.phone)) {
        initialData.phones.push(contact.phone);
      }
      const finalData = await this.contactEditor.showSummaryAndEdit(
        initialData,
        'Create'
      );
      if (finalData === null) {
        this.stats.skipped++;
        return;
      }
      const currentDate = formatDateDDMMYYYY(new Date());
      const note = `Added by SMS/WhatsApp sync script - Last update: ${currentDate}`;
      await this.contactEditor.createContact(finalData, note);
      this.stats.added++;
      await this.logger.logMain(
        `Created new contact with phone ${contact.phone}`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        this.stats.skipped++;
      } else {
        this.stats.error++;
        await this.logger.logError(
          `Failed to create contact: ${(error as Error).message}`
        );
      }
    }
  }

  private async handleSkipAction(): Promise<void> {
    const skipSpinner = ora('Skipping...').start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    skipSpinner.succeed('Skipped');
    this.stats.skipped++;
  }

  private displaySelectorStatus(selectors: SelectorResult[]): void {
    console.log('Selectors:');
    for (const sel of selectors) {
      const icon = sel.matched ? EMOJIS.STATUS.SUCCESS : EMOJIS.STATUS.ERROR;
      console.log(`${icon} ${sel.selector}`);
    }
    console.log('');
  }

  private displayFinalSummary(): void {
    const totalWidth = 69;
    const title = 'SMS & WhatsApp Sync Summary';
    const line1 = `Added: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.added)} | Updated: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.updated)}`;
    const line2 = `Skipped: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.skipped)} | Error: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.error)}`;
    console.log('\n' + FormatUtils.padLineWithEquals(title, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line1, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line2, totalWidth));
    console.log('='.repeat(totalWidth));
  }
}
export const smsWhatsappSyncScript: Script = {
  metadata: {
    name: 'SMS & WhatsApp Sync',
    description:
      '(WIP) Extract phone numbers from Google Messages/WhatsApp Web and sync with Google Contacts',
    version: '1.0.0',
    category: 'interactive',
    requiresAuth: true,
    estimatedDuration: '2-10 minutes',
    emoji: EMOJIS.SCRIPTS.SMS_WHATSAPP,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(SmsWhatsappSyncScript);
    await script.run();
  },
};
