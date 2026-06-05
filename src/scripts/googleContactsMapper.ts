import { injectable } from 'inversify';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Script } from '../types/script';
import { SyncLogger } from '../logging/syncLogger';
import { Logger } from '../logging';
import { SETTINGS } from '../settings';
import { selectWithEscape, inputWithEscape } from '../utils';

@injectable()
export class GoogleContactsMapperScript implements Script {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private readonly mappingsFile: string;

  constructor() {
    this.logger = new SyncLogger('google-contacts-mapper');
    this.uiLogger = new Logger('GoogleContactsMapper');
    this.mappingsFile = join(
      SETTINGS.backup.contactsPath,
      'companies_mapping.json'
    );
  }

  get metadata(): Script['metadata'] {
    return {
      name: 'Google Contacts Mapper',
      description:
        'Manager the companies mapping of Google Contacts Maintainer',
      version: '1.0.0',
      category: 'maintenance',
      requiresAuth: false,
      emoji: '🏭',
    };
  }

  async run(): Promise<void> {
    this.uiLogger.display('Google Contacts Mapper');
    await this.logger.initialize();

    let continueLoop = true;
    while (continueLoop) {
      const result = await selectWithEscape<string>({
        message: 'Select an action (ESC to exit):',
        choices: [
          { name: '1. Add company', value: 'add' },
          { name: '2. Delete company', value: 'delete' },
        ],
      });

      if (result.escaped) {
        continueLoop = false;
        break;
      }

      switch (result.value) {
        case 'add':
          await this.addCompany();
          break;
        case 'delete':
          await this.deleteCompany();
          break;
      }
    }
  }

  private async addCompany(): Promise<void> {
    while (true) {
      const typoResult = await inputWithEscape({
        message: 'Enter the company name typo (ESC to go back):',
        validate: (input) => {
          if (!input.trim()) return 'Company name typo cannot be empty';
          return true;
        },
      });

      if (typoResult.escaped) break;

      const typo = typoResult.value.trim();
      const mappings = this.loadMappings();

      if (mappings[typo]) {
        this.uiLogger.warn(
          `The typo ${typo} already exists for ${mappings[typo]}`
        );
        continue;
      }

      const correctNameResult = await inputWithEscape({
        message: `Enter the correct name for "${typo}" (ESC to go back):`,
        validate: (input) => {
          if (!input.trim()) return 'Correct company name cannot be empty';
          return true;
        },
      });

      if (correctNameResult.escaped) continue;

      const correctName = correctNameResult.value.trim();
      mappings[typo] = correctName;
      this.saveMappings(mappings);
      this.uiLogger.displaySuccess(
        `Successfully added mapping: ${typo} -> ${correctName}`
      );
      break;
    }
  }

  private async deleteCompany(): Promise<void> {
    while (true) {
      const typoResult = await inputWithEscape({
        message: 'Enter the company name typo to delete (ESC to go back):',
        validate: (input) => {
          if (!input.trim()) return 'Company name typo cannot be empty';
          return true;
        },
      });

      if (typoResult.escaped) break;

      const typo = typoResult.value.trim();
      const mappings = this.loadMappings();

      if (!mappings[typo]) {
        this.uiLogger.displayError(`Typo "${typo}" not found in the mappings.`);
        continue;
      }

      delete mappings[typo];
      this.saveMappings(mappings);
      this.uiLogger.displaySuccess(`Successfully deleted mapping for: ${typo}`);
      break;
    }
  }

  private loadMappings(): Record<string, string> {
    if (!existsSync(this.mappingsFile)) {
      return {};
    }

    try {
      const content = readFileSync(this.mappingsFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.uiLogger.error('Failed to load mappings', error as Error);
      return {};
    }
  }

  private saveMappings(mappings: Record<string, string>): void {
    try {
      // Sort keys alphabetically before saving for better maintainability
      const sortedMappings: Record<string, string> = {};
      Object.keys(mappings)
        .sort()
        .forEach((key) => {
          sortedMappings[key] = mappings[key];
        });

      writeFileSync(this.mappingsFile, JSON.stringify(sortedMappings, null, 2));
    } catch (error) {
      this.uiLogger.error('Failed to save mappings', error as Error);
    }
  }
}

export const googleContactsMapperScript: Script = {
  metadata: {
    name: 'Google Contacts Mapper',
    description: 'Manager the companies mapping of Google Contacts Maintainer',
    version: '1.0.0',
    category: 'maintenance',
    requiresAuth: false,
    emoji: '🏭',
  },
  run: async (): Promise<void> => {
    const { container } = await import('../di/container');
    const script = container.get(GoogleContactsMapperScript);
    await script.run();
  },
};
