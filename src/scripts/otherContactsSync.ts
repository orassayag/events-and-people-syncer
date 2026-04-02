/**
 * Other Contacts Sync Script
 *
 * IMPORTANT: This script must only run one instance at a time.
 * Running multiple instances simultaneously is not supported and may cause
 * cache corruption or duplicate operations.
 */
import { injectable, inject } from 'inversify';
import ora from 'ora';
import {
  selectWithEscape,
  inputWithEscape,
  TextUtils,
  formatDateDDMMYYYY,
} from '../utils';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { OtherContactsFetcher } from '../services/otherContacts';
import { ContactEditor, DuplicateDetector, EmailNormalizer, PhoneNormalizer } from '../services/contacts';
import { ContactCache, OtherContactsCache } from '../cache';
import { FormatUtils, EMOJIS } from '../constants';
import type { Script, ContactData, MatchedContactInfo } from '../types';
import { OtherContactsSyncStats, OtherContactEntry } from '../types';

@injectable()
export class OtherContactsSyncScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private stats: OtherContactsSyncStats = {
    added: 0,
    updated: 0,
    skipped: 0,
    error: 0,
    phonesAutoAdded: 0,
  };
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;
  private isCancelled = false;
  private sigintHandler: (() => void) | null = null;

  constructor(
    @inject(OtherContactsFetcher)
    private otherContactsFetcher: OtherContactsFetcher,
    @inject(ContactEditor) private contactEditor: ContactEditor,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {
    this.logger = new SyncLogger('other-contacts-sync');
    this.uiLogger = new Logger('OtherContactsSync');
  }

  async run(): Promise<void> {
    this.uiLogger.display('Other Contacts Sync');
    await this.logger.initialize();
    this.setupConsoleCapture();
    this.setupSigintHandler();
    await this.logger.logMain('Other Contacts Sync started');
    try {
      const authService = new AuthService();
      const requiredScopes = [
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/contacts.other.readonly',
      ];
      const scopeValidation = await authService.validateScopes(requiredScopes);
      if (!scopeValidation.hasAllScopes) {
        this.uiLogger.displayWarning(
          `Token missing required scope: ${scopeValidation.missingScopes.join(', ')}`
        );
        this.uiLogger.displayInfo(
          'Re-authentication required to grant the new permissions...'
        );
        await this.logger.logMain(
          `Missing scopes: ${scopeValidation.missingScopes.join(', ')} - triggering re-auth`
        );
        await authService.ensureScopes(requiredScopes);
      } else {
        await authService.authorize();
      }
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
      const menuAction = await this.showMainMenu();
      if (menuAction === 'clear_cache') {
        await this.clearCache();
        this.displayFinalSummary();
        this.restoreConsole();
        return;
      }
      if (menuAction === 'escape' || menuAction === 'exit') {
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        this.restoreConsole();
        return;
      }
      const entries = await this.ensureOtherContactsCached();
      if (entries.length === 0) {
        this.uiLogger.displayInfo('No Other Contacts found to process');
        this.displayFinalSummary();
        this.restoreConsole();
        return;
      }
      await this.ensureGoogleContactsCached();
      await this.processEntries(entries);
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled') {
        this.uiLogger.error('Script failed', error);
        await this.logger.logError(`Script failed: ${error.message}`);
      }
    }
    this.displayFinalSummary();
    await this.logger.logMain(
      `Script ended - Added: ${this.stats.added}, Updated: ${this.stats.updated}, Skipped: ${this.stats.skipped}, Error: ${this.stats.error}, Phones auto-added: ${this.stats.phonesAutoAdded}`
    );
    this.uiLogger.displayExit();
    this.removeSigintHandler();
    this.restoreConsole();
  }

  private async showMainMenu(): Promise<string> {
    const result = await selectWithEscape<string>({
      message: 'What would you like to do?',
      loop: false,
      choices: [
        { name: `${EMOJIS.ACTIONS.PROCESS}  Process Other Contacts`, value: 'process' },
        { name: `${EMOJIS.ACTIONS.DELETE}  Clear Cache`, value: 'clear_cache' },
        { name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: 'exit' },
      ],
    });
    if (result.escaped) {
      return 'escape';
    }
    return result.value;
  }

  private async clearCache(): Promise<void> {
    const cache = OtherContactsCache.getInstance();
    await cache.invalidate();
    this.uiLogger.displaySuccess('Other Contacts cache cleared successfully');
  }

  private async ensureOtherContactsCached(): Promise<OtherContactEntry[]> {
    const cache = OtherContactsCache.getInstance();
    const cached = await cache.get();
    if (cached !== null) {
      this.uiLogger.displayInfo(
        `Using cached Other Contacts (${FormatUtils.formatNumberWithLeadingZeros(cached.length)} entries)`
      );
      return cached;
    }
    this.uiLogger.displayInfo('Fetching Other Contacts from API...');
    const entries = await this.fetchOtherContacts();
    if (!entries || entries.length === 0) {
      return [];
    }
    const deduplicated = this.deduplicateEmails(entries);
    const filtered = deduplicated.filter(
      (entry) => entry.emails.length > 0 || entry.displayName
    );
    await cache.set(filtered);
    await this.logger.logMain(
      `Fetched ${entries.length} entries, ${filtered.length} after filtering`
    );
    return filtered;
  }

  private async ensureGoogleContactsCached(): Promise<ContactData[]> {
    const cache = ContactCache.getInstance();
    const cached = await cache.get();
    if (cached !== null) {
      this.uiLogger.displayInfo(
        `Using cached Google Contacts (${FormatUtils.formatNumberWithLeadingZeros(cached.length)} contacts)`
      );
      return cached;
    }
    this.uiLogger.displayInfo('Google Contacts cache not found, fetching...');
    await this.duplicateDetector.ensureCachePopulated();
    const contacts = (await cache.get()) || [];
    this.uiLogger.displayInfo(`Cached ${FormatUtils.formatNumberWithLeadingZeros(contacts.length)} Google Contacts`);
    return contacts;
  }

  private async refreshGoogleContactsFromFile(): Promise<ContactData[]> {
    const cache = ContactCache.getInstance();
    const contacts = await cache.get();
    if (contacts === null) {
      await this.duplicateDetector.ensureCachePopulated();
      return (await cache.get()) || [];
    }
    return contacts;
  }

  private setupSigintHandler(): void {
    this.sigintHandler = (): void => {
      this.isCancelled = true;
      this.uiLogger.displayWarning('Cancelling - please wait for summary...');
    };
    process.on('SIGINT', this.sigintHandler);
  }

  private removeSigintHandler(): void {
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
  }

  private setupConsoleCapture(): void {
    const self = this;
    const originalLog = this.originalConsoleLog;
    const originalError = this.originalConsoleError;
    console.log = function (...args: unknown[]): void {
      if (
        self.uiLogger &&
        (self.uiLogger as unknown as { isDisplayMethod: boolean }).isDisplayMethod
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
        (self.uiLogger as unknown as { isDisplayMethod: boolean }).isDisplayMethod
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

  private async fetchOtherContacts(): Promise<OtherContactEntry[]> {
    const spinner = ora('Fetching Other Contacts...').start();
    let lastUpdate = '';
    const entries = await this.otherContactsFetcher.fetchOtherContacts(
      (fetched, total) => {
        const formatted = `${fetched.toLocaleString()} / ${total.toLocaleString()}`;
        if (formatted !== lastUpdate) {
          spinner.text = `Fetching Other Contacts... (${formatted})`;
          lastUpdate = formatted;
        }
      }
    );
    spinner.succeed(`Fetched ${entries.length.toLocaleString()} Other Contacts`);
    return entries;
  }

  private deduplicateEmails(entries: OtherContactEntry[]): OtherContactEntry[] {
    const seenEmails = new Set<string>();
    return entries
      .map((entry) => {
        const uniqueEmails = entry.emails.filter((email) => {
          const normalized = EmailNormalizer.normalize(email);
          if (seenEmails.has(normalized)) {
            return false;
          }
          seenEmails.add(normalized);
          return true;
        });
        return { ...entry, emails: uniqueEmails };
      })
      .filter((entry) => entry.emails.length > 0 || entry.displayName);
  }

  private buildEmailToContactMap(
    contacts: ContactData[]
  ): Map<string, MatchedContactInfo> {
    const emailToContact = new Map<string, MatchedContactInfo>();
    for (const contact of contacts) {
      for (const emailObj of contact.emails) {
        const normalizedEmail = EmailNormalizer.normalize(emailObj.value);
        if (!emailToContact.has(normalizedEmail)) {
          emailToContact.set(normalizedEmail, {
            resourceName: contact.resourceName || '',
            firstName: contact.firstName,
            lastName: contact.lastName,
            phones: contact.phones.map((p) => p.number),
          });
        }
      }
    }
    return emailToContact;
  }

  private categorizeEmails(
    entry: OtherContactEntry,
    emailToContact: Map<string, MatchedContactInfo>
  ): {
    matchedEmails: string[];
    unmatchedEmails: string[];
    matchedContact: MatchedContactInfo | null;
  } {
    const matchedEmails: string[] = [];
    const unmatchedEmails: string[] = [];
    let matchedContact: MatchedContactInfo | null = null;
    for (const email of entry.emails) {
      const normalizedEmail = EmailNormalizer.normalize(email);
      const contact = emailToContact.get(normalizedEmail);
      if (contact) {
        matchedEmails.push(email);
        matchedContact = contact;
      } else {
        unmatchedEmails.push(email);
      }
    }
    return { matchedEmails, unmatchedEmails, matchedContact };
  }

  private async processEntries(entries: OtherContactEntry[]): Promise<void> {
    const fetchSpinner = ora('Loading Google Contacts...').start();
    let allContacts = await this.ensureGoogleContactsCached();
    const contactCount = allContacts.length;
    fetchSpinner.succeed(
      `Google Contacts loaded (${FormatUtils.formatNumberWithLeadingZeros(contactCount)} contacts)`
    );
    const filterSpinner = ora('Filtering entries already in contacts...').start();
    let emailToContact = this.buildEmailToContactMap(allContacts);
    const autoSkipped: Array<{ entry: OtherContactEntry; contactName: string }> =
      [];
    const phonesAdded: Array<{
      entry: OtherContactEntry;
      contactName: string;
      phonesAdded: string[];
    }> = [];
    const toProcess: Array<{
      entry: OtherContactEntry;
      unmatchedEmails: string[];
      matchedEmails: string[];
    }> = [];
    const cache = OtherContactsCache.getInstance();
    for (const entry of entries) {
      const { matchedEmails, unmatchedEmails, matchedContact } =
        this.categorizeEmails(entry, emailToContact);
      if (
        unmatchedEmails.length === 0 &&
        entry.emails.length > 0 &&
        matchedContact
      ) {
        const missingPhones = entry.phones.filter((phone) => {
          return !matchedContact.phones.some((existingPhone) =>
            PhoneNormalizer.phonesMatch(phone, existingPhone)
          );
        });
        if (missingPhones.length > 0 && matchedContact.resourceName) {
          for (const phone of missingPhones) {
            await this.contactEditor.addPhoneToExistingContact(
              matchedContact.resourceName,
              phone
            );
            this.stats.phonesAutoAdded++;
          }
          allContacts = await this.refreshGoogleContactsFromFile();
          emailToContact = this.buildEmailToContactMap(allContacts);
          phonesAdded.push({
            entry,
            contactName:
              `${matchedContact.firstName} ${matchedContact.lastName}`.trim(),
            phonesAdded: missingPhones,
          });
          this.stats.updated++;
        } else {
          autoSkipped.push({
            entry,
            contactName:
              `${matchedContact.firstName} ${matchedContact.lastName}`.trim(),
          });
          this.stats.skipped++;
        }
        await cache.removeEntry(entry);
      } else if (unmatchedEmails.length > 0) {
        toProcess.push({ entry, unmatchedEmails, matchedEmails });
      } else {
        toProcess.push({
          entry,
          unmatchedEmails: entry.emails,
          matchedEmails: [],
        });
      }
    }
    const totalPhonesAdded = phonesAdded.reduce(
      (sum, p) => sum + p.phonesAdded.length,
      0
    );
    filterSpinner.succeed(
      `Filtered: ${FormatUtils.formatNumberWithLeadingZeros(autoSkipped.length)} skipped, ` +
        `${FormatUtils.formatNumberWithLeadingZeros(totalPhonesAdded)} phones added to ${FormatUtils.formatNumberWithLeadingZeros(phonesAdded.length)} contacts, ` +
        `${FormatUtils.formatNumberWithLeadingZeros(toProcess.length)} to process`
    );
    if (toProcess.length === 0) {
      this.uiLogger.displaySuccess(
        `All ${entries.length} entries processed! No new entries to review.`
      );
      return;
    }
    const total = toProcess.length;
    for (let i = 0; i < toProcess.length; i++) {
      if (this.isCancelled) {
        break;
      }
      const { entry, unmatchedEmails, matchedEmails } = toProcess[i];
      const currentIndex = i + 1;
      this.displayEntry(entry, currentIndex, total, unmatchedEmails, matchedEmails);
      const action = await this.promptForAction();
      if (action === 'escape' || this.isCancelled) {
        break;
      }
      await this.handleAction(action, entry, unmatchedEmails);
      allContacts = await this.refreshGoogleContactsFromFile();
      emailToContact = this.buildEmailToContactMap(allContacts);
      await cache.removeEntry(entry);
    }
  }

  private displayEntry(
    entry: OtherContactEntry,
    currentIndex: number,
    total: number,
    unmatchedEmails: string[],
    matchedEmails: string[]
  ): void {
    console.log('');
    console.log('═'.repeat(67));
    console.log(
      `${EMOJIS.DATA.INDEX} Index: ${FormatUtils.formatNumberWithLeadingZeros(currentIndex)} / ${FormatUtils.formatNumberWithLeadingZeros(total)}`
    );
    const displayName = entry.displayName
      ? this.truncateDisplayName(TextUtils.reverseHebrewText(entry.displayName))
      : '(none)';
    console.log(`${EMOJIS.FIELDS.PERSON} Name: ${displayName}`);
    if (unmatchedEmails.length > 0) {
      const displayEmails = unmatchedEmails
        .map((e) => TextUtils.reverseHebrewText(e))
        .join(', ');
      console.log(`${EMOJIS.FIELDS.EMAIL} Emails: ${displayEmails}`);
    }
    if (matchedEmails.length > 0) {
      const displayMatched = matchedEmails
        .map((e) => TextUtils.reverseHebrewText(e))
        .join(', ');
      console.log(`${EMOJIS.FIELDS.EMAIL} Emails (already in contacts): ${displayMatched}`);
    }
    if (unmatchedEmails.length === 0 && matchedEmails.length === 0) {
      console.log(`${EMOJIS.FIELDS.EMAIL} Emails: (none)`);
    }
    if (entry.phones.length > 0) {
      const displayPhones = entry.phones
        .map((p) => TextUtils.reverseHebrewText(p))
        .join(', ');
      console.log(`${EMOJIS.FIELDS.PHONE} Phones: ${displayPhones}`);
    } else {
      console.log(`${EMOJIS.FIELDS.PHONE} Phones: (none)`);
    }
    console.log('═'.repeat(67));
    console.log('');
  }

  private truncateDisplayName(name: string, maxLength: number = 100): string {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  }

  private async promptForAction(): Promise<string> {
    const result = await selectWithEscape<string>({
      message: 'What would you like to do?',
      loop: false,
      choices: [
        { name: `${EMOJIS.ACTIONS.SEARCH} Search in contacts`, value: 'search' },
        { name: `${EMOJIS.ACTIONS.ADD} Add a new contact`, value: 'add' },
        { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this entry`, value: 'skip' },
      ],
    });
    if (result.escaped) {
      return 'escape';
    }
    return result.value;
  }

  private async handleAction(
    action: string,
    entry: OtherContactEntry,
    unmatchedEmails: string[]
  ): Promise<void> {
    if (action === 'search') {
      await this.handleSearchAction(entry, unmatchedEmails);
    } else if (action === 'add') {
      await this.handleAddAction(entry, unmatchedEmails);
    } else if (action === 'skip') {
      await this.handleSkipAction();
    }
  }

  private async handleSearchAction(
    entry: OtherContactEntry,
    unmatchedEmails: string[]
  ): Promise<void> {
    while (true) {
      const searchResult = await inputWithEscape({
        message: 'Enter name to search:',
        default: entry.displayName || '',
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
            { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this entry`, value: 'skip' },
          ],
        });
        if (nextAction.escaped || nextAction.value === 'skip') {
          await this.handleSkipAction();
          return;
        }
        if (nextAction.value === 'add') {
          await this.handleAddAction(entry, unmatchedEmails);
          return;
        }
        continue;
      }
      this.uiLogger.displayInfo(`Found ${matches.length} similar contacts:`);
      for (let i = 0; i < matches.length; i++) {
        const { contact: matchContact, similarityType } = matches[i];
        const matchNumber = (i + 1).toString().padStart(3, '0');
        const matchLines: string[] = [];
        matchLines.push(`=================Match ${matchNumber}:==================`);
        matchLines.push(`${EMOJIS.FIELDS.GROUP} Similarity Type: ${similarityType}`);
        const fullName =
          `${matchContact.firstName} ${matchContact.lastName}`.trim();
        matchLines.push(`${EMOJIS.FIELDS.PERSON} Full Name: ${TextUtils.reverseHebrewText(fullName)}`);
        if (matchContact.label) {
          matchLines.push(
            `${EMOJIS.FIELDS.LABEL}  Labels: ${TextUtils.reverseHebrewText(matchContact.label)}`
          );
        }
        if (matchContact.company) {
          matchLines.push(
            `${EMOJIS.FIELDS.COMPANY} Company: ${TextUtils.reverseHebrewText(matchContact.company)}`
          );
        }
        if (matchContact.emails.length > 0) {
          const emailValues = matchContact.emails.map((e) => e.value).join(', ');
          matchLines.push(`${EMOJIS.FIELDS.EMAIL} Email: ${emailValues}`);
        }
        if (matchContact.phones.length > 0) {
          const phoneValues = matchContact.phones.map((p) => p.number).join(', ');
          matchLines.push(`${EMOJIS.FIELDS.PHONE} Phone: ${phoneValues}`);
        }
        if (matchContact.etag) {
          matchLines.push(`${EMOJIS.FIELDS.LABEL}  ETag: ${matchContact.etag}`);
        }
        const matchOutput = matchLines.join('\n');
        console.log(matchOutput);
        await this.logger.logMain(matchOutput);
        console.log('');
        await this.logger.logMain('');
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
        { name: `${EMOJIS.NAVIGATION.SKIP}  Skip this entry`, value: 'skip' }
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
        await this.handleAddAction(entry, unmatchedEmails);
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
        await this.addDataToExistingContact(
          entry,
          selectedContact,
          unmatchedEmails
        );
        return;
      }
    }
  }

  private async addDataToExistingContact(
    entry: OtherContactEntry,
    selectedContact: ContactData,
    unmatchedEmails: string[]
  ): Promise<void> {
    const resourceName = selectedContact.resourceName;
    if (!resourceName) {
      this.uiLogger.displayError('Selected contact has no resource name');
      this.stats.error++;
      return;
    }
    const contactDisplayName = `${selectedContact.firstName} ${selectedContact.lastName} ${selectedContact.label}`.trim();
    let anyUpdated = false;
    for (const email of unmatchedEmails) {
      const updateSpinner = ora(`Adding email ${email} to contact...`).start();
      try {
        await this.contactEditor.addEmailToExistingContact(resourceName, email);
        updateSpinner.succeed(`Email ${email} processed`);
        anyUpdated = true;
      } catch (error) {
        updateSpinner.fail(`Failed to add email ${email}`);
        await this.logger.logError(
          `Failed to add email to contact: ${(error as Error).message}`
        );
      }
    }
    for (const phone of entry.phones) {
      const updateSpinner = ora(`Adding phone ${phone} to contact...`).start();
      try {
        await this.contactEditor.addPhoneToExistingContact(resourceName, phone);
        updateSpinner.succeed(`Phone ${phone} processed`);
        anyUpdated = true;
      } catch (error) {
        updateSpinner.fail(`Failed to add phone ${phone}`);
        await this.logger.logError(
          `Failed to add phone to contact: ${(error as Error).message}`
        );
      }
    }
    if (anyUpdated) {
      this.stats.updated++;
      await this.logger.logMain(
        `Updated contact ${resourceName} (${contactDisplayName}) with data from Other Contact`
      );
    }
  }

  private async handleAddAction(
    entry: OtherContactEntry,
    unmatchedEmails: string[]
  ): Promise<void> {
    try {
      this.contactEditor.setLogCallback(async (msg: string) => {
        await this.logger.logMain(msg);
      });
      if (entry.displayName) {
        console.log(
          `Name from Other Contact: ${TextUtils.reverseHebrewText(entry.displayName)}`
        );
      }
      if (unmatchedEmails.length > 0) {
        console.log(`Emails to add: ${unmatchedEmails.join(', ')}`);
      }
      if (entry.phones.length > 0) {
        console.log(`Phones to add: ${entry.phones.join(', ')}`);
      }
      console.log('');
      const { firstName, lastName } = TextUtils.parseFullName(
        entry.displayName || ''
      );
      const prePopulatedData = {
        firstName,
        lastName,
        emails: unmatchedEmails,
        phones: entry.phones,
      };
      const initialData =
        await this.contactEditor.collectInitialInput(prePopulatedData);
      const finalData = await this.contactEditor.showSummaryAndEdit(
        initialData,
        'Create'
      );
      if (finalData === null) {
        this.stats.skipped++;
        return;
      }
      const currentDate = formatDateDDMMYYYY(new Date());
      const note = `Added by Other Contacts sync script - Last update: ${currentDate}`;
      await this.contactEditor.createContact(finalData, note);
      this.stats.added++;
      await this.logger.logMain(
        `Created new contact from Other Contact: ${entry.displayName || unmatchedEmails[0] || 'unknown'}`
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

  private displayFinalSummary(): void {
    const totalWidth = 56;
    const title = 'Other Contacts Sync Summary';
    const line1 = `Added: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.added)} | Updated: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.updated)}`;
    const line2 = `Skipped: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.skipped)} | Error: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.error)}`;
    const line3 = `Phones auto-added: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.phonesAutoAdded)}`;
    console.log('\n' + FormatUtils.padLineWithEquals(title, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line1, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line2, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line3, totalWidth));
    console.log('='.repeat(totalWidth));
  }
}
export const otherContactsSyncScript: Script = {
  metadata: {
    name: 'Other Contacts Sync',
    description:
      'Sync Google Other Contacts (auto-saved contacts) into main Google Contacts',
    version: '1.0.0',
    category: 'interactive',
    requiresAuth: true,
    estimatedDuration: '2-10 minutes',
    emoji: EMOJIS.SCRIPTS.OTHER_CONTACTS,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(OtherContactsSyncScript);
    await script.run();
  },
};
