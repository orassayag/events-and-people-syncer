import { injectable } from 'inversify';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Script } from '../types/script';
import { SyncLogger } from '../logging/syncLogger';
import { Logger } from '../logging';
import { SETTINGS } from '../settings';
import {
  MaintainerIssueDefinitions,
  ExclusionFile,
  ContactExclusion,
  ExclusionEntry,
} from '../types/maintainer';
import { selectWithEscape, inputWithEscape } from '../utils';

@injectable()
export class GoogleContactsExcluderScript implements Script {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private readonly exclusionsFile: string;

  constructor() {
    this.logger = new SyncLogger('google-contacts-excluder');
    this.uiLogger = new Logger('GoogleContactsExcluder');
    this.exclusionsFile = join(SETTINGS.backup.contactsPath, 'exclusions.json');
  }

  get metadata(): Script['metadata'] {
    return {
      name: 'Google Contacts Excluder',
      description:
        'Manage validation exclusions for the Google Contacts Maintainer',
      version: '1.0.0',
      category: 'maintenance',
      requiresAuth: false,
      emoji: '🚫',
    };
  }

  async run(): Promise<void> {
    this.uiLogger.display('Google Contacts Excluder');
    await this.logger.initialize();

    let continueLoop = true;
    while (continueLoop) {
      const result = await selectWithEscape<string>({
        message: 'Select an action (ESC to exit):',
        choices: [
          { name: '1. Add Rules', value: 'add' },
          { name: '2. Delete a Rule', value: 'delete' },
          { name: '3. Skip Contact', value: 'skip' },
        ],
      });

      if (result.escaped) {
        continueLoop = false;
        break;
      }

      switch (result.value) {
        case 'add':
          await this.addRule();
          break;
        case 'delete':
          await this.deleteRule();
          break;
        case 'skip':
          await this.skipContact();
          break;
      }
    }
  }

  private validateAndExtractContactId(input: string): string | string {
    const idPattern = /^c\d+$/;
    const urlPattern = /contacts\.google\.com\/person\/(c\d+)/;

    // Try URL first
    const urlMatch = input.match(urlPattern);
    if (urlMatch) return urlMatch[1];

    // Try direct ID
    const directId = input.trim();
    if (idPattern.test(directId)) return directId;

    throw new Error(
      'Invalid format. Please enter a contact ID (e.g. c123) or a Google Contacts URL.'
    );
  }

  private async addRule(): Promise<void> {
    const issueChoices = Object.values(MaintainerIssueDefinitions).map(
      (def) => ({
        name: `${def.id}: ${def.message}`,
        value: def.id,
      })
    );

    const issueResult = await selectWithEscape<number>({
      message: 'Select a rule to exclude:',
      choices: issueChoices,
      searchable: true,
      pageSize: 15,
    });

    if (issueResult.escaped) return;

    const ruleId = issueResult.value;

    while (true) {
      const idResult = await inputWithEscape({
        message: 'Enter contact ID or URL (ESC to go back):',
        validate: (input) => {
          if (!input) return 'Input cannot be empty';
          try {
            this.validateAndExtractContactId(input);
            return true;
          } catch (e) {
            return (e as Error).message;
          }
        },
      });

      if (idResult.escaped) break;

      const contactId = this.validateAndExtractContactId(idResult.value);
      const exclusions = this.loadExclusions();

      const existingEntry = exclusions.contactExclusions.find(
        (e) => e.id === contactId
      );

      if (existingEntry) {
        if (!existingEntry.excludeIssues.includes(ruleId)) {
          existingEntry.excludeIssues.push(ruleId);
          this.saveExclusions(exclusions);
          this.uiLogger.displaySuccess(
            `Added rule ${ruleId} to contact ${contactId}`
          );
        } else {
          this.uiLogger.warn(
            `Rule ${ruleId} already exists for contact ${contactId}, skipping.`
          );
        }
      } else {
        const newEntry: ContactExclusion = {
          id: contactId,
          excludeIssues: [ruleId],
        };
        exclusions.contactExclusions.push(newEntry);
        this.saveExclusions(exclusions);
        this.uiLogger.displaySuccess(
          `Created new exclusion for contact ${contactId} with rule ${ruleId}`
        );
      }
    }
  }

  private async deleteRule(): Promise<void> {
    while (true) {
      const idResult = await inputWithEscape({
        message: 'Enter contact ID or URL (ESC to go back):',
        validate: (input) => {
          if (!input) return 'Input cannot be empty';
          try {
            this.validateAndExtractContactId(input);
            return true;
          } catch (e) {
            return (e as Error).message;
          }
        },
      });

      if (idResult.escaped) break;

      const contactId = this.validateAndExtractContactId(idResult.value);
      const exclusions = this.loadExclusions();

      const entryIndex = exclusions.contactExclusions.findIndex(
        (e) => e.id === contactId
      );

      if (entryIndex === -1) {
        this.uiLogger.displayError('Contact not found in exclusions');
        continue;
      }

      const entry = exclusions.contactExclusions[entryIndex];

      const ruleResult = await inputWithEscape({
        message: 'Enter rule ID to remove:',
        validate: (input) => {
          const id = parseInt(input);
          if (isNaN(id)) return 'Please enter a valid numeric rule ID';

          const ruleExists = Object.values(MaintainerIssueDefinitions).some(
            (def) => def.id === id
          );
          if (!ruleExists) return 'Unknown rule ID';

          if (!entry.excludeIssues.includes(id)) {
            return 'Rule not assigned to this contact';
          }
          return true;
        },
      });

      if (ruleResult.escaped) continue;

      const ruleId = parseInt(ruleResult.value);
      entry.excludeIssues = entry.excludeIssues.filter((id) => id !== ruleId);

      if (entry.excludeIssues.length === 0) {
        exclusions.contactExclusions.splice(entryIndex, 1);
        this.uiLogger.displayInfo(
          `Removed last rule for ${contactId}, entry deleted.`
        );
      } else {
        this.uiLogger.displaySuccess(
          `Removed rule ${ruleId} from contact ${contactId}`
        );
      }

      this.saveExclusions(exclusions);
    }
  }

  private async skipContact(): Promise<void> {
    while (true) {
      const idResult = await inputWithEscape({
        message: 'Enter contact ID or URL (ESC to go back):',
        validate: (input) => {
          if (!input) return 'Input cannot be empty';
          try {
            this.validateAndExtractContactId(input);
            return true;
          } catch (e) {
            return (e as Error).message;
          }
        },
      });

      if (idResult.escaped) break;

      const contactId = this.validateAndExtractContactId(idResult.value);
      const exclusions = this.loadExclusions();

      if (exclusions.skippedContacts.some((e) => e.id === contactId)) {
        this.uiLogger.displayError('Contact is already fully skipped');
        continue;
      }

      // Automatically remove from contactExclusions if exists
      const contactExclusionIndex = exclusions.contactExclusions.findIndex(
        (e) => e.id === contactId
      );
      if (contactExclusionIndex !== -1) {
        exclusions.contactExclusions.splice(contactExclusionIndex, 1);
        this.uiLogger.displayInfo(
          `Contact ${contactId} removed from rule-based exclusions.`
        );
      }

      const reasonResult = await inputWithEscape({
        message: 'Enter reason (optional, press Enter to skip):',
      });

      if (reasonResult.escaped) continue;

      const newEntry: ExclusionEntry = {
        id: contactId,
        reason: reasonResult.value || '',
      };

      exclusions.skippedContacts.push(newEntry);
      this.saveExclusions(exclusions);
      this.uiLogger.displaySuccess(
        `Contact ${contactId} added to skipped contacts.`
      );
    }
  }

  private loadExclusions(): ExclusionFile {
    const defaultExclusions: ExclusionFile = {
      skippedContacts: [],
      contactExclusions: [],
    };

    if (!existsSync(this.exclusionsFile)) {
      return defaultExclusions;
    }

    try {
      const content = readFileSync(this.exclusionsFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.uiLogger.error('Failed to load exclusions', error as Error);
      return defaultExclusions;
    }
  }

  private saveExclusions(exclusions: ExclusionFile): void {
    try {
      writeFileSync(this.exclusionsFile, JSON.stringify(exclusions, null, 2));
    } catch (error) {
      this.uiLogger.error('Failed to save exclusions', error as Error);
    }
  }
}

export const googleContactsExcluderScript: Script = {
  metadata: {
    name: 'Google Contacts Excluder',
    description:
      'Manage validation exclusions for the Google Contacts Maintainer',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    emoji: '🚫',
  },
  run: async (): Promise<void> => {
    const { container } = await import('../di/container');
    const script = container.get(GoogleContactsExcluderScript);
    await script.run();
  },
};
