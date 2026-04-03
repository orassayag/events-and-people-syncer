import { injectable, inject } from 'inversify';
import { google } from 'googleapis';
import type { OAuth2Client, Script, ContactGroup } from '../types';
import { FolderType, FolderMapping, FolderCacheData, EventsJobsSyncStats, FolderType as FolderTypeEnum, MenuOption as MenuOptionEnum, ScriptState } from '../types';
import {
  selectWithEscape,
  inputWithEscape,
  confirmWithEscape,
  EscapeSignal,
  TextUtils,
  formatDateDDMMYYYY,
  retryWithBackoff,
  readFromClipboard,
  clearClipboard,
} from '../utils';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { EventsContactEditor } from '../services/contacts';
import { PathValidator, InputValidator } from '../validators';
import { FolderCache } from '../cache';
import { FolderManager, FolderMatcher } from '../services/folders';
import { NoteWriter } from '../services/notes';
import { LabelResolver } from '../services/labels';
import { FormatUtils, UI_CONSTANTS, EMOJIS } from '../constants';
import { ApiTracker } from '../services/api';
import { SETTINGS } from '../settings';

@injectable()
export class EventsJobsSyncScript {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private stats: EventsJobsSyncStats = {
    jobNotes: 0,
    lifeEventNotes: 0,
    contacts: 0,
    deletedNotes: 0,
    createdFolders: 0,
    deletedFolders: 0,
    renamedFolders: 0,
  };
  // @ts-expect-error - scriptState is tracked per plan spec but not currently read
  private scriptState: ScriptState = ScriptState.IDLE;
  private lastCreatedNotePath: string | null = null;
  private lastSelectedFolder: FolderMapping | null = null;
  private cachedContactGroups: ContactGroup[] | null = null;
  private isAuthenticated: boolean = false;
  private originalConsoleLog = console.log;
  private originalConsoleError = console.error;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(EventsContactEditor) private contactEditor: EventsContactEditor,
    @inject(PathValidator) private pathValidator: PathValidator,
    @inject(FolderManager) private folderManager: FolderManager,
    @inject(FolderMatcher) private folderMatcher: FolderMatcher,
    @inject(NoteWriter) private noteWriter: NoteWriter,
    @inject(LabelResolver) private labelResolver: LabelResolver
  ) {
    this.logger = new SyncLogger('events-jobs-sync');
    this.uiLogger = new Logger('EventsJobsSyncScript');
  }

  async run(): Promise<void> {
    this.uiLogger.display('Events & Jobs Sync');
    await this.logger.initialize();
    this.setupConsoleCapture();
    this.labelResolver.setUiLogger(this.uiLogger);
    await this.logger.logMain('Events & Jobs Sync started');
    try {
      const authService = new AuthService();
      this.auth = await authService.authorize();
      this.isAuthenticated = true;
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Google authentication successful`);
    } catch (error) {
      await this.logger.logError(
        `Authentication failed: ${(error as Error).message}`
      );
      this.uiLogger.displayMultiLine([
        `${EMOJIS.STATUS.WARNING} Google authentication failed`,
        'You can still create notes, but contact features will be unavailable',
      ]);
    }
    try {
      await this.validatePaths();
      await this.initializeCache();
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
        `Script ended - Job notes: ${this.stats.jobNotes}, Life event notes: ${this.stats.lifeEventNotes}, Contacts: ${this.stats.contacts}, Created folders: ${this.stats.createdFolders}, Deleted folders: ${this.stats.deletedFolders}, Renamed folders: ${this.stats.renamedFolders}`
      );
      this.restoreConsole();
    }
  }

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

  private async clearClipboardInternal(): Promise<void> {
    try {
      await clearClipboard();
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Clipboard cleared`);
    } catch {
      await this.logger.logMain(`${EMOJIS.STATUS.WARNING}  Failed to clear clipboard (non-critical)`);
    }
  }

  private getFolderTypeDisplayName(type: FolderType): string {
    switch (type) {
      case FolderTypeEnum.JOB:
        return 'job-interviews';
      case FolderTypeEnum.HR:
        return 'job-interviews';
      case FolderTypeEnum.LIFE_EVENT:
        return 'life-events';
      default:
        return type;
    }
  }

  private async validatePaths(): Promise<void> {
    await this.logger.logMain('Validating paths...');
    const paths = [
      SETTINGS.eventsJobsSync.companyFoldersPath,
      SETTINGS.eventsJobsSync.lifeEventsPath,
    ];
    const results = await this.pathValidator.validatePathsExist(paths);
    const jobPath = results[0];
    const lifeEventsPathResult = results[1];
    let hasValidPath = false;
    if (jobPath.exists) {
      if (!jobPath.isDirectory) {
        throw new Error(`Path exists but is not a directory: ${jobPath.path}`);
      }
      await this.pathValidator.validateReadable(jobPath.path);
      await this.pathValidator.validateWritable(jobPath.path);
      await this.logger.logMain(
        `${EMOJIS.STATUS.SUCCESS} Found job-interviews folder: ${jobPath.path}`
      );
      this.uiLogger.displaySuccess(
        `Found job-interviews folder: ${jobPath.path}`
      );
      hasValidPath = true;
    }
    if (lifeEventsPathResult.exists) {
      if (!lifeEventsPathResult.isDirectory) {
        throw new Error(
          `Path exists but is not a directory: ${lifeEventsPathResult.path}`
        );
      }
      await this.pathValidator.validateReadable(lifeEventsPathResult.path);
      await this.pathValidator.validateWritable(lifeEventsPathResult.path);
      await this.logger.logMain(
        `${EMOJIS.STATUS.SUCCESS} Found life-events folder: ${lifeEventsPathResult.path}`
      );
      this.uiLogger.displaySuccess(
        `Found life-events folder: ${lifeEventsPathResult.path}`
      );
      hasValidPath = true;
    }
    if (!hasValidPath) {
      throw new Error(
        `Neither job-interviews nor life-events folder found. At least one must exist at: ${paths.join(', ')}`
      );
    }
  }

  private async initializeCache(): Promise<void> {
    await this.logger.logMain('Invalidating cache and re-scanning folders...');
    await FolderCache.getInstance().invalidate();
    await this.scanFolders();
  }

  private async scanFolders(): Promise<void> {
    const jobFolders: FolderMapping[] = [];
    const lifeEventFolders: FolderMapping[] = [];
    const jobPath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const lifeEventsPath = SETTINGS.eventsJobsSync.lifeEventsPath;
    try {
      await fs.access(jobPath);
      await this.logger.logMain('Scanning job-interviews folder...');
      const jobFiles = await fs.readdir(jobPath);
      for (const folderName of jobFiles) {
        const fullPath = join(jobPath, folderName);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) continue;
        const trimmedName = this.folderManager.trimFolderName(folderName);
        const match = trimmedName.match(/^(Job|HR)_([^ ].+)$/);
        if (!match) {
          throw new Error(
            `Invalid folder format in job-interviews: '${trimmedName}'. Expected format: 'Job_CompanyName' or 'HR_CompanyName' (case-sensitive)`
          );
        }
        const label = match[1];
        const companyName = match[2];
        const type: FolderType =
          label === 'Job' ? FolderTypeEnum.JOB : FolderTypeEnum.HR;
        jobFolders.push({
          name: trimmedName,
          path: fullPath,
          type,
          label,
          companyName,
        });
      }
      await this.logger.logMain(`Found ${jobFolders.length} job/HR folders`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
    try {
      await fs.access(lifeEventsPath);
      await this.logger.logMain('Scanning life-events folder...');
      const lifeEventFiles = await fs.readdir(lifeEventsPath);
      for (const folderName of lifeEventFiles) {
        const fullPath = join(lifeEventsPath, folderName);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) continue;
        const trimmedName = this.folderManager.trimFolderName(folderName);
        const words = trimmedName.split(' ');
        const label = words[words.length - 1];
        if (label.length < 2) {
          throw new Error(
            `Invalid folder name in life-events: '${trimmedName}'. Extracted label '${label}' must be at least 2 characters`
          );
        }
        lifeEventFolders.push({
          name: trimmedName,
          path: fullPath,
          type: FolderTypeEnum.LIFE_EVENT,
          label,
          companyName: undefined,
        });
      }
      await this.logger.logMain(
        `Found ${lifeEventFolders.length} life-event folders`
      );
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
    const cacheData: FolderCacheData = {
      timestamp: Date.now(),
      jobFolders,
      lifeEventFolders,
    };
    await FolderCache.getInstance().set(cacheData);
    await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Folder cache updated`);
  }

  private async mainMenu(): Promise<void> {
    while (true) {
      const choices = [
        { name: `${EMOJIS.MENU.WRITE_NOTES} Write notes`, value: MenuOptionEnum.WRITE_NOTES },
        { name: `${EMOJIS.MENU.CREATE_NOTE} Write a note`, value: MenuOptionEnum.CREATE_NOTE },
        { name: `${EMOJIS.MENU.REWRITE_NOTE} Rewrite a note`, value: MenuOptionEnum.REWRITE_NOTE },
      ];
      if (this.lastCreatedNotePath !== null) {
        choices.push({
          name: `${EMOJIS.ACTIONS.DELETE}  Delete last note`,
          value: MenuOptionEnum.DELETE_LAST_NOTE,
        });
      }
      choices.push(
        {
          name: `${EMOJIS.MENU.FOLDER} Delete all empty folders`,
          value: MenuOptionEnum.DELETE_EMPTY_FOLDER,
        },
        { name: `${EMOJIS.ACTIONS.EDIT}  Rename a folder`, value: MenuOptionEnum.RENAME_FOLDER }
      );
      choices.push({ name: `${EMOJIS.NAVIGATION.EXIT} Exit`, value: MenuOptionEnum.EXIT });
      const result = await selectWithEscape<string>({
        message: 'What would you like to do now? (ESC to exit)',
        loop: false,
        choices,
      });
      if (result.escaped) {
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        process.exit(0);
      }
      const action = result.value;
      await this.logger.logMain(`User selected: ${action}`);
      if (action === MenuOptionEnum.WRITE_NOTES) {
        await this.writeNotesFlow();
      } else if (action === MenuOptionEnum.EXIT) {
        this.displayFinalSummary();
        this.uiLogger.displayExit();
        process.exit(0);
      } else if (action === MenuOptionEnum.CREATE_NOTE) {
        await this.createNoteFlow();
      } else if (action === MenuOptionEnum.REWRITE_NOTE) {
        await this.rewriteNoteFlow();
      } else if (action === MenuOptionEnum.DELETE_LAST_NOTE) {
        await this.deleteLastNoteFlow();
      } else if (action === MenuOptionEnum.DELETE_EMPTY_FOLDER) {
        await this.deleteEmptyFolderFlow();
      } else if (action === MenuOptionEnum.RENAME_FOLDER) {
        await this.renameFolderFlow();
      }
    }
  }

  private async selectOrCreateFolder(): Promise<FolderMapping | null> {
    const cache = await FolderCache.getInstance().get();
    if (!cache) {
      this.uiLogger.displayWarning('Cache is empty. Please restart the script');
      return null;
    }
    const allFolders = [...cache.jobFolders, ...cache.lifeEventFolders];
    const folderInputResult = await inputWithEscape({
      message: 'Enter event/company name (ESC to go back):',
      validate: (input: string): boolean | string => {
        const trimmed = this.folderManager.trimFolderName(input);
        if (!trimmed) {
          return 'Folder name cannot be empty.';
        }
        if (trimmed.length < 2) {
          return 'Folder name must be at least 2 characters.';
        }
        return InputValidator.validateText(trimmed, false);
      },
    });
    if (folderInputResult.escaped) {
      this.uiLogger.displayGoBack();
      return null;
    }
    const folderInput = folderInputResult.value;
    const trimmedInput = this.folderManager.trimFolderName(folderInput);
    await this.logger.logMain(`Searching for folder: '${trimmedInput}'...`);
    const exactMatch = this.folderMatcher.findExactMatch(
      trimmedInput,
      allFolders
    );
    if (exactMatch) {
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Exact match found: '${exactMatch.name}'`);
      try {
        await fs.access(exactMatch.path);
      } catch {
        this.uiLogger.displayWarning('Folder was deleted externally');
        await this.logger.logMain(
          'Folder was deleted externally. Re-scanning folders...'
        );
        const ora = (await import('ora')).default;
        const spinner = ora({
          text: 'Re-scanning folders...',
          color: 'cyan',
        }).start();
        await FolderCache.getInstance().invalidate();
        await this.scanFolders();
        spinner.stop();
        spinner.clear();
        this.uiLogger.resetState('spinner');
        return null;
      }
      return exactMatch;
    }
    await this.logger.logMain(
      'No exact match found. Searching for similar folders...'
    );
    const fuzzyMatches = this.folderMatcher.searchFolders(
      trimmedInput,
      allFolders
    );
    await this.logger.logMain(`Found ${fuzzyMatches.length} similar folders`);
    if (fuzzyMatches.length === 0) {
      const shouldCreateResult = await confirmWithEscape({
        message: `Folder "${trimmedInput}" was not found. Would you like to create it?`,
        default: true,
      });
      if (shouldCreateResult.escaped) {
        await this.logger.logMain('User pressed ESC');
        this.uiLogger.displayError('Folder creation cancelled');
        return null;
      }
      const shouldCreate = shouldCreateResult.value;
      await this.logger.logMain(
        `User response to create folder: ${shouldCreate}`
      );
      if (shouldCreate) {
        return await this.createFolderFlow(trimmedInput, false);
      } else {
        await this.logger.logMain('User declined to create folder');
        this.uiLogger.displayError('Folder creation cancelled');
        return null;
      }
    }
    const choices = [
      ...fuzzyMatches.map((match) => ({
        name: `${match.folder.name} (${this.getFolderTypeDisplayName(match.folder.type)})`,
        value: match.folder,
      })),
      { name: `${EMOJIS.ACTIONS.ADD} Create new folder`, value: 'create_new' },
    ];
    const selectedFolderResult = await selectWithEscape<FolderMapping | string>(
      {
        message: 'Select a folder (ESC to go back):',
        loop: false,
        choices,
      }
    );
    if (selectedFolderResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      this.uiLogger.displayGoBack();
      return null;
    }
    const selectedFolder = selectedFolderResult.value;
    if (selectedFolder === 'create_new') {
      await this.logger.logMain(`User selected: ${EMOJIS.ACTIONS.ADD} Create new folder`);
      return await this.createFolderFlow(trimmedInput, false);
    }
    const folder = selectedFolder as FolderMapping;
    await this.logger.logMain(
      `User selected existing folder: '${folder.name}'`
    );
    try {
      await fs.access(folder.path);
    } catch {
      this.uiLogger.displayWarning('Folder was deleted externally');
      await this.logger.logMain(
        'Folder was deleted externally. Re-scanning folders...'
      );
      const ora = (await import('ora')).default;
      const spinner = ora({
        text: 'Re-scanning folders...',
        color: 'cyan',
      }).start();
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      spinner.stop();
      spinner.clear();
      this.uiLogger.resetState('spinner');
      return null;
    }
    return folder;
  }

  private async createNoteFlow(): Promise<void> {
    const selectedFolder = await this.selectOrCreateFolder();
    if (selectedFolder) {
      const noteCreated = await this.createNoteInFolder(selectedFolder);
      if (noteCreated) {
        await this.promptAndCreateContact();
      }
    }
  }

  private async writeNotesFlow(): Promise<void> {
    await this.logger.logMain('Starting write notes flow');
    let noteCount: number = 0;
    let successfulNoteCount: number = 0;
    const selectedFolder = await this.selectOrCreateFolder();
    if (!selectedFolder) {
      await this.logger.logMain(
        'Folder selection cancelled - exiting write notes flow'
      );
      return;
    }
    await this.logger.logMain(
      `Selected folder for batch notes: '${selectedFolder.name}'`
    );
    while (true) {
      try {
        await fs.access(selectedFolder.path);
      } catch {
        if (successfulNoteCount === 0) {
          this.uiLogger.displayWarning('Folder was deleted externally');
        } else {
          this.uiLogger.displayWarning(
            `Folder was deleted. Created ${successfulNoteCount} ${successfulNoteCount === 1 ? 'note' : 'notes'}`
          );
        }
        await this.logger.logMain(
          'Folder deleted during batch creation - exiting loop'
        );
        return;
      }
      try {
        const noteCreated = await this.createNoteInFolder(selectedFolder, {
          noteCount,
          allowCancel: true,
        });
        if (noteCreated) {
          noteCount++;
          successfulNoteCount++;
          await this.logger.logMain(
            `Note ${noteCount} created successfully in batch`
          );
        } else {
          await this.logger.logMain(
            `Note creation failed validation - continuing loop`
          );
        }
      } catch (error) {
        if (error instanceof EscapeSignal) {
          const formattedCount =
            FormatUtils.formatNumberWithLeadingZeros(successfulNoteCount);
          if (successfulNoteCount === 0) {
            this.uiLogger.displayInfo('No notes created');
          } else {
            this.uiLogger.displaySuccess(`Created ${formattedCount} notes`);
          }
          await this.logger.logMain(
            `User exited write notes loop after ${successfulNoteCount} successful notes`
          );
          if (successfulNoteCount > 0) {
            await this.promptAndCreateContact();
          }
          return;
        }
        if (
          error instanceof Error &&
          error.message.includes('Folder no longer exists')
        ) {
          const formattedCount =
            FormatUtils.formatNumberWithLeadingZeros(successfulNoteCount);
          if (successfulNoteCount === 0) {
            this.uiLogger.displayWarning('Folder was deleted');
          } else {
            this.uiLogger.displayWarning(
              `Folder was deleted. Created ${formattedCount} notes`
            );
          }
          await this.logger.logMain(
            'Folder deleted during note creation - exiting loop'
          );
          return;
        }
        await this.logger.logError(
          `Error during note creation: ${(error as Error).message}`
        );
        this.uiLogger.displayWarning(
          `Error creating note: ${(error as Error).message}`
        );
        const shouldContinueResult = await confirmWithEscape({
          message: 'Continue creating notes? (ESC to stop)',
          default: false,
        });
        if (shouldContinueResult.escaped || !shouldContinueResult.value) {
          await this.logger.logMain(
            `User stopped after error. Created ${successfulNoteCount} notes`
          );
          return;
        }
      }
    }
  }

  private async createFolderFlow(
    initialInput: string,
    createNoteAfter: boolean = true
  ): Promise<FolderMapping | null> {
    const folderTypeResult = await selectWithEscape<string>({
      message: 'Select folder type (ESC to go back):',
      loop: false,
      choices: [
        { name: 'Job Interview', value: 'job' },
        { name: 'Life Event', value: 'life' },
      ],
    });
    if (folderTypeResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      this.uiLogger.displayError(UI_CONSTANTS.MESSAGES.ESC_CANCELLED);
      return null;
    }
    const folderType = folderTypeResult.value;
    await this.logger.logMain(`User selected: '${folderType}'`);
    if (folderType === 'job') {
      return await this.createJobFolderFlow(initialInput, createNoteAfter);
    } else {
      return await this.createLifeEventFolderFlow(
        initialInput,
        createNoteAfter
      );
    }
  }

  private async createJobFolderFlow(
    initialInput: string,
    createNoteAfter: boolean = true
  ): Promise<FolderMapping | null> {
    const labelResult = await selectWithEscape<string>({
      message: 'Select label (ESC to go back):',
      loop: false,
      choices: [
        { name: 'Job', value: 'Job' },
        { name: 'HR', value: 'HR' },
      ],
    });
    if (labelResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      return null;
    }
    const label = labelResult.value;
    await this.logger.logMain(`User selected label: '${label}'`);
    const formattedCompany = TextUtils.formatCompanyToPascalCase(
      initialInput.trim()
    );
    await this.logger.logMain(
      `Using search input as company name: '${initialInput.trim()}' → '${formattedCompany}'`
    );
    const finalFolderName = `${label}_${formattedCompany}`;
    const basePath = SETTINGS.eventsJobsSync.companyFoldersPath;
    const exists = await this.folderManager.checkFolderExists(
      finalFolderName,
      basePath
    );
    if (exists) {
      this.uiLogger.displayWarning(
        'Folder already exists. Please choose a different name'
      );
      await this.logger.logMain(
        `${EMOJIS.STATUS.WARNING}  Folder already exists. Re-scanning and returning to menu.`
      );
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      return null;
    }
    const confirmResult = await confirmWithEscape({
      message: `About to create folder: '${finalFolderName}'. Proceed?`,
      default: true,
    });
    await this.logger.logMain('Awaiting user confirmation...');
    if (confirmResult.escaped || !confirmResult.value) {
      await this.logger.logMain('Folder creation cancelled by user');
      this.uiLogger.displayError('Folder creation cancelled');
      return null;
    }
    try {
      const folderPath = await this.folderManager.createFolder(
        basePath,
        finalFolderName
      );
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      this.stats.createdFolders++;
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Folder created: '${folderPath}'`);
      this.uiLogger.displaySuccess(`Folder created: ${finalFolderName}`);
      this.scriptState = ScriptState.FOLDER_SELECTED;
      const cache = await FolderCache.getInstance().get();
      const folder = cache?.jobFolders.find((f) => f.name === finalFolderName);
      if (folder) {
        if (createNoteAfter) {
          await this.createNoteInFolder(folder);
          return null;
        }
        return folder;
      }
      return null;
    } catch (error) {
      if ((error as any).code === 'EEXIST') {
        this.uiLogger.displayWarning(
          'Folder already exists. Please choose a different name'
        );
        await this.logger.logMain(`${EMOJIS.STATUS.WARNING}  Folder already exists (EEXIST)`);
        await FolderCache.getInstance().invalidate();
        await this.scanFolders();
      } else if ((error as any).code === 'ENOENT') {
        throw new Error(`Parent directory no longer exists: ${basePath}`);
      } else {
        throw error;
      }
      return null;
    }
  }

  private async createLifeEventFolderFlow(
    initialInput: string,
    createNoteAfter: boolean = true
  ): Promise<FolderMapping | null> {
    const words = initialInput.split(' ');
    const capitalizedWords = words.map((word) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    const formattedName = capitalizedWords.join(' ');
    const nameWords = formattedName.split(' ');
    if (!this.isAuthenticated) {
      const authService = new AuthService();
      await authService.authorize();
      this.isAuthenticated = true;
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Authentication successful`);
    }
    if (!this.cachedContactGroups || this.cachedContactGroups.length === 0) {
      await this.logger.logMain('Fetching contact groups...');
      this.cachedContactGroups = await this.fetchContactGroups();
      await this.logger.logMain(
        `${EMOJIS.STATUS.SUCCESS} Fetched ${this.cachedContactGroups.length} contact groups from Google Contacts`
      );
    } else {
      await this.logger.logMain(
        `Using cached contact groups (${this.cachedContactGroups.length} groups)`
      );
    }
    const googleLabels = this.cachedContactGroups.map((group) => group.name);
    const cache = await FolderCache.getInstance().get();
    const existingLifeEventLabels =
      cache?.lifeEventFolders.map((folder) => folder.label) || [];
    const allLabels = [...googleLabels, ...existingLifeEventLabels];
    const distinctLabels = Array.from(
      new Set(allLabels.map((label) => label.toLowerCase()))
    )
      .map((lowerLabel) => {
        return allLabels.find((label) => label.toLowerCase() === lowerLabel)!;
      })
      .sort((a, b) => a.localeCompare(b, 'en-US'));
    const choices = [
      ...distinctLabels.map((label) => ({ name: label, value: label })),
      { name: `${EMOJIS.ACTIONS.ADD} Create new label`, value: 'CREATE_NEW' },
      { name: `${EMOJIS.NAVIGATION.SKIP}  Skip (no label)`, value: 'SKIP' },
    ];
    const selectedLabelResult = await selectWithEscape<string>({
      message: 'Select label for folder organization (ESC to go back):',
      loop: true,
      choices,
    });
    if (selectedLabelResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      return null;
    }
    let finalLabel = selectedLabelResult.value;
    if (selectedLabelResult.value === 'CREATE_NEW') {
      const newLabelNameResult = await inputWithEscape({
        message: "Enter new label name (type 'cancel' to go back):",
        validate: (input: string): boolean | string => {
          const trimmed = input.trim();
          if (trimmed.toLowerCase() === 'cancel') {
            return true;
          }
          if (!trimmed) {
            return "Label name cannot be empty. Type 'cancel' to go back.";
          }
          if (trimmed.length < 2) {
            return 'Label name must be at least 2 characters.';
          }
          return InputValidator.validateText(trimmed, false);
        },
      });
      if (newLabelNameResult.escaped) {
        await this.logger.logMain('User pressed ESC');
        return null;
      }
      const newLabelName = newLabelNameResult.value;
      if (newLabelName.trim().toLowerCase() === 'cancel') {
        await this.logger.logMain('User cancelled label creation');
        return null;
      }
      const trimmedLabelName = newLabelName.trim();
      const existingLabel = this.cachedContactGroups.find(
        (group) => group.name.toLowerCase() === trimmedLabelName.toLowerCase()
      );
      if (existingLabel) {
        this.uiLogger.displayWarning(
          `Label '${trimmedLabelName}' already exists. Using existing label`
        );
        await this.logger.logMain(
          `Label '${trimmedLabelName}' already exists - using existing`
        );
        finalLabel = trimmedLabelName;
      } else {
        const shouldCreateInGoogleResult = await confirmWithEscape({
          message: `Create label '${trimmedLabelName}' in Google Contacts for future use?`,
          default: true,
        });
        if (shouldCreateInGoogleResult.escaped) {
          await this.logger.logMain('User pressed ESC');
          return null;
        }
        if (shouldCreateInGoogleResult.value) {
          const ora = (await import('ora')).default;
          const spinner = ora({
            text: `Creating label in Google Contacts: ${trimmedLabelName}...`,
            color: 'cyan',
          }).start();
          const newGroupResourceName =
            await this.contactEditor.createContactGroup(trimmedLabelName);
          spinner.stop();
          spinner.clear();
          this.uiLogger.resetState('spinner');
          this.cachedContactGroups.push({
            resourceName: newGroupResourceName,
            name: trimmedLabelName,
          });
          await this.logger.logMain(
            `${EMOJIS.STATUS.SUCCESS} Created label in Google Contacts: '${trimmedLabelName}'`
          );
          this.uiLogger.displaySuccess(
            `Label created in Google Contacts: ${trimmedLabelName}`
          );
        }
        finalLabel = trimmedLabelName;
      }
    } else if (selectedLabelResult.value === 'SKIP') {
      finalLabel = '';
      await this.logger.logMain('User skipped label selection');
    } else {
      finalLabel = selectedLabelResult.value;
    }
    if (finalLabel && finalLabel.length < 2) {
      this.uiLogger.displayWarning(
        'Label must be at least 2 characters. Please enter a different name'
      );
      await this.logger.logMain(
        'Label validation failed: less than 2 characters'
      );
      return null;
    }
    let finalFolderName = formattedName;
    if (finalLabel) {
      const labelAlreadyInName = nameWords.some(
        (word) => word.toLowerCase() === finalLabel.toLowerCase()
      );
      if (!labelAlreadyInName) {
        finalFolderName = `${formattedName} ${finalLabel}`;
      }
    }
    await this.logger.logMain(
      `User selected label: '${finalLabel}' for folder name '${finalFolderName}'`
    );
    const basePath = SETTINGS.eventsJobsSync.lifeEventsPath;
    const exists = await this.folderManager.checkFolderExists(
      finalFolderName,
      basePath
    );
    if (exists) {
      this.uiLogger.displayWarning(
        'Folder already exists. Please choose a different name'
      );
      await this.logger.logMain(
        `${EMOJIS.STATUS.WARNING}  Folder already exists. Re-scanning and returning to menu.`
      );
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      return null;
    }
    const confirmResult = await confirmWithEscape({
      message: `About to create folder: '${finalFolderName}'. Proceed?`,
      default: true,
    });
    await this.logger.logMain('Awaiting user confirmation...');
    if (confirmResult.escaped || !confirmResult.value) {
      await this.logger.logMain('Folder creation cancelled by user');
      this.uiLogger.displayError('Folder creation cancelled');
      return null;
    }
    try {
      const folderPath = await this.folderManager.createFolder(
        basePath,
        finalFolderName
      );
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      this.stats.createdFolders++;
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Folder created: '${folderPath}'`);
      this.uiLogger.displaySuccess(`Folder created: ${finalFolderName}`);
      this.scriptState = ScriptState.FOLDER_SELECTED;
      const cache = await FolderCache.getInstance().get();
      const folder = cache?.lifeEventFolders.find(
        (f) => f.name === finalFolderName
      );
      if (folder) {
        if (createNoteAfter) {
          await this.createNoteInFolder(folder);
          return null;
        }
        return folder;
      }
      return null;
    } catch (error) {
      if ((error as any).code === 'EEXIST') {
        this.uiLogger.displayWarning(
          'Folder already exists. Please choose a different name'
        );
        await this.logger.logMain(`${EMOJIS.STATUS.WARNING}  Folder already exists (EEXIST)`);
        await FolderCache.getInstance().invalidate();
        await this.scanFolders();
      } else if ((error as any).code === 'ENOENT') {
        throw new Error(`Parent directory no longer exists: ${basePath}`);
      } else {
        throw error;
      }
      return null;
    }
  }

  private async createNoteInFolder(
    folder: FolderMapping,
    options?: { noteCount?: number; allowCancel?: boolean }
  ): Promise<boolean> {
    let message: string = '';
    while (!message.trim()) {
      this.uiLogger.displayClipboard('Copy your message now and press <enter>');
      const readyResult = await inputWithEscape({
        message: 'Press Enter when ready (ESC to cancel)',
      });
      if (readyResult.escaped) {
        throw new EscapeSignal();
      }
      await this.logger.logMain('Reading from clipboard...');
      const ora = (await import('ora')).default;
      const spinner = ora({
        text: 'Reading from clipboard...',
        color: 'cyan',
      }).start();
      try {
        const result = await readFromClipboard();
        message = result.content;
      } catch (error) {
        spinner.stop();
        spinner.clear();
        this.uiLogger.resetState('spinner');
        throw error;
      }
      spinner.stop();
      spinner.clear();
      this.uiLogger.resetState('spinner');
      if (!message.trim()) {
        if (options?.allowCancel) {
          this.uiLogger.displayWarning('Clipboard is empty');
          await this.logger.logMain(`${EMOJIS.STATUS.WARNING}  Clipboard validation failed: empty`);
          const shouldRetryResult = await confirmWithEscape({
            message: 'Try again? (ESC to cancel)',
            default: true,
          });
          if (shouldRetryResult.escaped || !shouldRetryResult.value) {
            throw new EscapeSignal();
          }
        } else {
          this.uiLogger.displayWarning(
            'Clipboard is empty. Please copy your message first'
          );
          await this.logger.logMain(`${EMOJIS.STATUS.WARNING}  Clipboard validation failed: empty`);
        }
      }
    }
    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 1048576) {
      this.uiLogger.displayWarning(
        'Message cannot exceed 1MB (~1,048,576 characters)'
      );
      return false;
    }
    if (trimmedMessage.includes('\0')) {
      this.uiLogger.displayWarning(
        'Message cannot contain binary data (null bytes)'
      );
      return false;
    }
    await this.logger.logMain(`Creating note in folder: '${folder.path}'...`);
    try {
      const filePath = await this.noteWriter.writeNote(
        folder.path,
        trimmedMessage,
        new Date()
      );
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Note saved: '${filePath}'`);
      const fileName = basename(filePath);
      const basePath =
        folder.type === FolderTypeEnum.LIFE_EVENT
          ? SETTINGS.eventsJobsSync.lifeEventsPath
          : SETTINGS.eventsJobsSync.companyFoldersPath;
      const basePathName = basename(basePath);
      const relativePath = `${basePathName}/${folder.name}/${fileName}`;
      this.uiLogger.displaySuccess(`Note added: ${relativePath}`);
      await this.clearClipboardInternal();
      if (
        folder.type === FolderTypeEnum.JOB ||
        folder.type === FolderTypeEnum.HR
      ) {
        this.stats.jobNotes++;
      } else {
        this.stats.lifeEventNotes++;
      }
      this.lastCreatedNotePath = filePath;
      this.lastSelectedFolder = folder;
      this.scriptState = ScriptState.NOTE_CREATED;
      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Folder no longer exists: ${folder.path}`);
      }
      throw error;
    }
  }

  private async rewriteNoteFlow(): Promise<void> {
    const cache = await FolderCache.getInstance().get();
    if (!cache) {
      this.uiLogger.displayWarning('Cache is empty. Please restart the script');
      return;
    }
    const allFolders = [...cache.jobFolders, ...cache.lifeEventFolders];
    const selectedFolderResult = await selectWithEscape<FolderMapping>({
      message: 'Select folder (ESC to go back):',
      loop: false,
      choices: allFolders.map((f) => ({
        name: `${f.name} (${this.getFolderTypeDisplayName(f.type)})`,
        value: f,
      })),
    });
    if (selectedFolderResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      this.uiLogger.displayGoBack();
      return;
    }
    const selectedFolder = selectedFolderResult.value;
    await this.logger.logMain(`User selected folder: '${selectedFolder.name}'`);
    const notes = await this.noteWriter.listNotes(selectedFolder.path);
    if (notes.length === 0) {
      this.uiLogger.displayWarning('No notes found in this folder');
      await this.logger.logMain(
        `No notes found in folder: '${selectedFolder.path}'`
      );
      return;
    }
    const selectedNoteResult = await selectWithEscape<string>({
      message: 'Select note to rewrite (ESC to go back):',
      loop: false,
      choices: notes.map((note) => ({ name: note, value: note })),
    });
    if (selectedNoteResult.escaped) {
      await this.logger.logMain('User pressed ESC');
      this.uiLogger.displayGoBack();
      return;
    }
    const selectedNote = selectedNoteResult.value;
    await this.logger.logMain(`User selected note: '${selectedNote}'`);
    let newContent: string = '';
    while (!newContent.trim()) {
      this.uiLogger.displayClipboard(
        'Copy your new message now and press Enter'
      );
      const readyResult2 = await inputWithEscape({
        message: 'Press Enter when ready (ESC to cancel)',
      });
      if (readyResult2.escaped) {
        await this.logger.logMain('User pressed ESC');
        return;
      }
      await this.logger.logMain('Reading from clipboard...');
      const ora = (await import('ora')).default;
      const spinner = ora({
        text: 'Reading from clipboard...',
        color: 'cyan',
      }).start();
      try {
        const result = await readFromClipboard();
        newContent = result.content;
      } catch (error) {
        spinner.stop();
        spinner.clear();
        this.uiLogger.resetState('spinner');
        throw error;
      }
      spinner.stop();
      spinner.clear();
      this.uiLogger.resetState('spinner');
      if (!newContent.trim()) {
        this.uiLogger.displayWarning(
          'Clipboard is empty. Please copy your message first'
        );
        await this.logger.logMain(`${EMOJIS.STATUS.WARNING} Clipboard validation failed: empty`);
      }
    }
    const trimmedContent = newContent.trim();
    if (trimmedContent.length > 1048576) {
      this.uiLogger.displayWarning(
        'Message cannot exceed 1MB (~1,048,576 characters)'
      );
      return;
    }
    if (trimmedContent.includes('\0')) {
      this.uiLogger.displayWarning(
        'Message cannot contain binary data (null bytes)'
      );
      return;
    }
    const confirmResult = await confirmWithEscape({
      message: `About to overwrite '${selectedFolder.name}/${selectedNote}'. Proceed?`,
      default: false,
    });
    if (confirmResult.escaped || !confirmResult.value) {
      await this.logger.logMain('Note rewrite cancelled by user');
      this.uiLogger.displayInfo('Note rewrite cancelled');
      return;
    }
    const noteFilePath = join(selectedFolder.path, selectedNote);
    await this.noteWriter.rewriteNote(noteFilePath, trimmedContent);
    await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Note rewritten: '${noteFilePath}'`);
    this.uiLogger.displaySuccess(`Note rewritten: ${selectedNote}`);
    await this.clearClipboardInternal();
  }

  private async deleteLastNoteFlow(): Promise<void> {
    if (!this.lastCreatedNotePath) {
      this.uiLogger.displayWarning('No note has been created in this session');
      return;
    }
    const fileName = basename(this.lastCreatedNotePath);
    const folderName = this.lastSelectedFolder?.name || 'unknown';
    const confirmResult2 = await confirmWithEscape({
      message: `About to delete: '${folderName}/${fileName}'. Proceed?`,
      default: false,
    });
    await this.logger.logMain(
      `Awaiting confirmation to delete note: '${this.lastCreatedNotePath}'`
    );
    if (confirmResult2.escaped || !confirmResult2.value) {
      await this.logger.logMain('Note deletion cancelled by user');
      this.uiLogger.displayError('Note deletion cancelled');
      return;
    }
    try {
      await this.noteWriter.deleteNote(this.lastCreatedNotePath);
      if (this.lastSelectedFolder) {
        if (
          this.lastSelectedFolder.type === FolderTypeEnum.JOB ||
          this.lastSelectedFolder.type === FolderTypeEnum.HR
        ) {
          this.stats.jobNotes--;
        } else {
          this.stats.lifeEventNotes--;
        }
      }
      this.stats.deletedNotes++;
      await this.logger.logMain(
        `${EMOJIS.STATUS.SUCCESS} Note deleted: '${this.lastCreatedNotePath}'`
      );
      const folderName = this.lastSelectedFolder?.name || 'unknown';
      const fileName = basename(this.lastCreatedNotePath);
      this.uiLogger.displaySuccess(`Note deleted: ${folderName}/${fileName}`);
      this.lastCreatedNotePath = null;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.uiLogger.displayWarning(
          'Note file was already deleted externally'
        );
        await this.logger.logMain(
          `Note file not found (already deleted): '${this.lastCreatedNotePath}'`
        );
        this.lastCreatedNotePath = null;
      } else {
        throw error;
      }
    }
  }

  private async deleteEmptyFolderFlow(): Promise<void> {
    const cache = await FolderCache.getInstance().get();
    if (!cache) {
      this.uiLogger.displayWarning('Cache is empty. Please restart the script');
      return;
    }
    const allFolders = [...cache.jobFolders, ...cache.lifeEventFolders];
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Scanning for empty folders...',
      color: 'cyan',
    }).start();
    await this.logger.logMain('Scanning for empty folders...');
    const emptyFolders: FolderMapping[] = [];
    for (const folder of allFolders) {
      try {
        const isEmpty = await this.folderManager.isEmptyFolder(folder.path);
        if (isEmpty) {
          emptyFolders.push(folder);
        }
      } catch (error) {
        await this.logger.logMain(
          `Skipping folder (error reading): '${folder.path}' - ${(error as Error).message}`
        );
      }
    }
    spinner.stop();
    spinner.clear();
    this.uiLogger.resetState('spinner');
    if (emptyFolders.length === 0) {
      this.uiLogger.displaySuccess('No empty folders found');
      await this.logger.logMain('No empty folders found');
      return;
    }
    const formattedCount = FormatUtils.formatNumberWithLeadingZeros(
      emptyFolders.length
    );
    this.uiLogger.displayCleanup(`Found ${formattedCount} empty folders:`);
    await this.logger.logMain(`Found ${emptyFolders.length} empty folder(s)`);
    emptyFolders.forEach((folder) => {
      console.log(`- ${folder.name}`);
    });
    const confirmResult3 = await confirmWithEscape({
      message: `About to delete ${formattedCount} empty folders. Proceed?`,
      default: false,
    });
    await this.logger.logMain(
      `Awaiting confirmation to delete ${emptyFolders.length} empty folders`
    );
    if (confirmResult3.escaped || !confirmResult3.value) {
      await this.logger.logMain('Folder deletion cancelled by user');
      this.uiLogger.displayWarning('Folder deletion cancelled');
      return;
    }
    let deletedCount = 0;
    const skippedFolders: string[] = [];
    for (const folder of emptyFolders) {
      try {
        const isStillEmpty = await this.folderManager.isEmptyFolder(
          folder.path
        );
        if (!isStillEmpty) {
          skippedFolders.push(folder.name);
          await this.logger.logMain(
            `Skipped folder (no longer empty): '${folder.path}'`
          );
          continue;
        }
        await this.folderManager.deleteFolder(folder.path);
        deletedCount++;
        await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Folder deleted: '${folder.path}'`);
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          await this.logger.logMain(
            `Folder not found (already deleted): '${folder.path}'`
          );
        } else {
          await this.logger.logError(
            `Failed to delete folder: '${folder.path}' - ${(error as Error).message}`
          );
        }
      }
    }
    await FolderCache.getInstance().invalidate();
    await this.scanFolders();
    this.stats.deletedFolders += deletedCount;
    if (skippedFolders.length > 0) {
      this.uiLogger.displayWarning('Skipped (no longer empty):');
      skippedFolders.forEach((folderName) => {
        console.log(`- ${folderName}`);
      });
    }
    if (deletedCount === 0) {
      this.uiLogger.displayWarning('No folders were deleted');
      await this.logger.logMain(
        `Completed: deleted 0 folders, skipped ${skippedFolders.length} non-empty folders`
      );
    } else if (skippedFolders.length > 0) {
      const formattedDeleted =
        FormatUtils.formatNumberWithLeadingZeros(deletedCount);
      const formattedSkipped = FormatUtils.formatNumberWithLeadingZeros(
        skippedFolders.length
      );
      this.uiLogger.displaySuccess(
        `Successfully deleted ${formattedDeleted} folders, skipped ${formattedSkipped} non-empty folders`
      );
      await this.logger.logMain(
        `Completed: deleted ${deletedCount} empty folders, skipped ${skippedFolders.length} non-empty folders`
      );
    } else {
      const formattedDeleted =
        FormatUtils.formatNumberWithLeadingZeros(deletedCount);
      this.uiLogger.displaySuccess(
        `Successfully deleted ${formattedDeleted} folders`
      );
      await this.logger.logMain(
        `Completed: deleted ${deletedCount} empty folders`
      );
    }
  }

  private async renameFolderFlow(): Promise<void> {
    const cache = await FolderCache.getInstance().get();
    if (!cache) {
      this.uiLogger.displayWarning('Cache is empty. Please restart the script');
      return;
    }
    const allFolders = [...cache.jobFolders, ...cache.lifeEventFolders];
    const selectedFolderResult2 = await selectWithEscape<FolderMapping>({
      message: 'Select folder to rename (ESC to go back):',
      loop: false,
      choices: allFolders.map((f) => ({
        name: `${f.name} (${this.getFolderTypeDisplayName(f.type)})`,
        value: f,
      })),
    });
    if (selectedFolderResult2.escaped) {
      await this.logger.logMain('User pressed ESC');
      return;
    }
    const selectedFolder = selectedFolderResult2.value;
    await this.logger.logMain(`User selected folder: '${selectedFolder.name}'`);
    this.uiLogger.displayInfo(`Current name: ${selectedFolder.name}`);
    let newFolderName: string = '';
    if (
      selectedFolder.type === FolderTypeEnum.JOB ||
      selectedFolder.type === FolderTypeEnum.HR
    ) {
      const labelResult = await selectWithEscape<string>({
        message: 'Select new label (ESC to go back):',
        loop: false,
        choices: [
          { name: 'Job', value: 'Job' },
          { name: 'HR', value: 'HR' },
        ],
      });
      if (labelResult.escaped) {
        await this.logger.logMain('User pressed ESC');
        return;
      }
      const label = labelResult.value;
      const companyNameResult = await inputWithEscape({
        message: 'Enter new company name (ESC to cancel):',
        validate: (input: string): boolean | string => {
          if (!input.trim()) {
            return 'Company name cannot be empty.';
          }
          if (input.trim().length < 2) {
            return 'Company name must be at least 2 characters.';
          }
          const validation = InputValidator.validateText(input, false);
          if (validation !== true) {
            return validation;
          }
          const illegalCharsRegex = /[\/\\:*?"<>|]/;
          if (illegalCharsRegex.test(input)) {
            return 'Company name cannot contain: / \\ : * ? " < > |';
          }
          return true;
        },
      });
      if (companyNameResult.escaped) {
        await this.logger.logMain('User pressed ESC');
        return;
      }
      const companyName = companyNameResult.value;
      const formattedCompany = TextUtils.formatCompanyToPascalCase(
        companyName.trim()
      );
      newFolderName = `${label}_${formattedCompany}`;
    } else {
      const newNameResult = await inputWithEscape({
        message: 'Enter new folder name (ESC to cancel):',
        validate: (input: string): boolean | string => {
          const trimmed = this.folderManager.trimFolderName(input);
          if (!trimmed) {
            return 'Folder name cannot be empty.';
          }
          if (trimmed.length < 2) {
            return 'Folder name must be at least 2 characters.';
          }
          const validation = InputValidator.validateText(trimmed, false);
          if (validation !== true) {
            return validation;
          }
          const illegalCharsRegex = /[\/\\:*?"<>|]/;
          if (illegalCharsRegex.test(trimmed)) {
            return 'Folder name cannot contain: / \\ : * ? " < > |';
          }
          return true;
        },
      });
      if (newNameResult.escaped) {
        await this.logger.logMain('User pressed ESC');
        return;
      }
      const newName = newNameResult.value;
      const words = newName.split(' ');
      const capitalizedWords = words.map((word: string) => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1);
      });
      newFolderName = capitalizedWords.join(' ');
      const nameWords = newFolderName!.split(' ');
      const labelChoices = [
        ...(this.cachedContactGroups || [])
          .map((g) => g.name)
          .filter(
            (name) =>
              !nameWords.some((w) => w.toLowerCase() === name.toLowerCase())
          )
          .sort((a, b) => a.localeCompare(b, 'en-US'))
          .map((label) => ({ name: label, value: label })),
        { name: `${EMOJIS.NAVIGATION.SKIP}  Skip (no label change)`, value: 'SKIP' },
      ];
      const selectedLabelResult2 = await selectWithEscape<string>({
        message: 'Select label for folder (ESC to go back):',
        loop: false,
        choices: labelChoices,
      });
      if (selectedLabelResult2.escaped) {
        await this.logger.logMain('User pressed ESC');
        return;
      }
      const selectedLabel = selectedLabelResult2.value;
      if (selectedLabel.length < 2) {
        this.uiLogger.displayWarning(
          'Label must be at least 2 characters. Please enter a different name'
        );
        await this.logger.logMain(
          'Label validation failed: less than 2 characters'
        );
        return;
      }
    }
    const basePath =
      selectedFolder.type === FolderTypeEnum.LIFE_EVENT
        ? SETTINGS.eventsJobsSync.lifeEventsPath
        : SETTINGS.eventsJobsSync.companyFoldersPath;
    const exists = await this.folderManager.checkFolderExists(
      newFolderName,
      basePath
    );
    if (exists) {
      this.uiLogger.displayWarning(
        'A folder with this name already exists. Please choose a different name'
      );
      await this.logger.logMain('Folder rename failed: duplicate name exists');
      return;
    }
    const confirmResult4 = await confirmWithEscape({
      message: `Rename '${selectedFolder.name}' to '${newFolderName}'?`,
      default: true,
    });
    await this.logger.logMain('Awaiting confirmation to rename folder');
    if (confirmResult4.escaped || !confirmResult4.value) {
      await this.logger.logMain('Folder rename cancelled by user');
      this.uiLogger.displayInfo('Folder rename cancelled');
      return;
    }
    try {
      const newPath = join(basePath, newFolderName);
      await this.folderManager.renameFolder(selectedFolder.path, newPath);
      await FolderCache.getInstance().invalidate();
      await this.scanFolders();
      this.stats.renamedFolders++;
      await this.logger.logMain(
        `${EMOJIS.STATUS.SUCCESS} Folder renamed: '${selectedFolder.name}' → '${newFolderName}'`
      );
      this.uiLogger.displaySuccess('Folder renamed successfully');
    } catch (error) {
      if ((error as any).code === 'EEXIST') {
        this.uiLogger.displayWarning(
          'A folder with this name already exists. Please choose a different name'
        );
        await this.logger.logMain('Folder rename failed: EEXIST');
      } else if ((error as any).code === 'ENOENT') {
        this.uiLogger.displayWarning('Folder was deleted externally');
        await this.logger.logMain('Folder rename failed: ENOENT');
      } else {
        throw error;
      }
    }
  }

  private async promptAndCreateContact(): Promise<void> {
    if (!this.lastSelectedFolder) {
      await this.logger.logError(
        'No folder context available for contact creation'
      );
      this.uiLogger.displayWarning('No folder context available');
      return;
    }
    try {
      await fs.access(this.lastSelectedFolder.path);
      const folderName = this.lastSelectedFolder.name;
      const isJobOrHR =
        this.lastSelectedFolder.type === FolderTypeEnum.JOB ||
        this.lastSelectedFolder.type === FolderTypeEnum.HR;
      try {
        const parsedMetadata = this.folderManager.parseFolderName(
          folderName,
          isJobOrHR
        );
        if (
          parsedMetadata.label !== this.lastSelectedFolder.label ||
          parsedMetadata.companyName !== this.lastSelectedFolder.companyName
        ) {
          await this.logger.logError(
            `Folder metadata is stale - folder was renamed: '${this.lastSelectedFolder.path}'. ` +
              `Expected label: '${this.lastSelectedFolder.label}', company: '${this.lastSelectedFolder.companyName}'. ` +
              `Actual label: '${parsedMetadata.label}', company: '${parsedMetadata.companyName}'.`
          );
          this.uiLogger.displayWarning(
            'Folder context is stale (folder was renamed)'
          );
          this.uiLogger.displayInfo(
            'The folder name changed since the note was created'
          );
          this.uiLogger.displayInfo(
            'Cannot create contact. Please create a new note to refresh folder context'
          );
          this.lastSelectedFolder = null;
          return;
        }
      } catch (parseError) {
        await this.logger.logError(
          `Folder name format changed: '${folderName}'. Parse error: ${(parseError as Error).message}`
        );
        this.uiLogger.displayMultiLine([
          `${EMOJIS.STATUS.WARNING} Folder context is stale (folder format changed)`,
          'The folder name format changed since the note was created',
          'Cannot create contact. Please create a new note to refresh folder context',
        ]);
        this.lastSelectedFolder = null;
        return;
      }
    } catch {
      await this.logger.logError(
        `Folder context is stale - folder no longer exists: '${this.lastSelectedFolder.path}'`
      );
      this.uiLogger.displayMultiLine([
        `${EMOJIS.STATUS.WARNING} Folder context is stale (folder was renamed or deleted)`,
        'Cannot create contact. Please create a new note to refresh folder context',
      ]);
      this.lastSelectedFolder = null;
      return;
    }
    const folderDisplay = this.lastSelectedFolder.name;
    await this.logger.logMain(
      `Prompting contact creation for folder: '${folderDisplay}'`
    );
    const shouldAddContactResult = await confirmWithEscape({
      message: `Create a new contact for ${folderDisplay}?`,
      default: false,
    });
    if (shouldAddContactResult.escaped || !shouldAddContactResult.value) {
      await this.logger.logMain('User declined contact creation');
      return;
    }
    await this.logger.logMain('User confirmed contact creation');
    try {
      if (!this.isAuthenticated) {
        const authService = new AuthService();
        await authService.authorize();
        this.isAuthenticated = true;
        await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Authentication successful`);
      }
      if (!this.cachedContactGroups || this.cachedContactGroups.length === 0) {
        await this.logger.logMain('Fetching contact groups...');
        this.cachedContactGroups = await this.fetchContactGroups();
        await this.logger.logMain(
          `${EMOJIS.STATUS.SUCCESS} Fetched ${this.cachedContactGroups.length} contact groups from Google Contacts`
        );
      } else {
        await this.logger.logMain(
          `Using cached contact groups (${this.cachedContactGroups.length} groups)`
        );
      }
      let labelString = this.lastSelectedFolder.label;
      if (this.lastSelectedFolder.type === FolderTypeEnum.LIFE_EVENT) {
        const inferredLabel = this.labelResolver.inferLabelFromExisting(
          this.lastSelectedFolder.name,
          this.cachedContactGroups
        );
        if (inferredLabel) {
          labelString = inferredLabel;
          await this.logger.logMain(`Inferred label: '${inferredLabel}'`);
        }
      }
      let resourceName = '';
      if (!labelString || !labelString.trim()) {
        await this.logger.logMain(
          'No label from folder - user will select in wizard'
        );
        resourceName = '';
      } else {
        const isRequired =
          this.lastSelectedFolder.type === FolderTypeEnum.JOB ||
          this.lastSelectedFolder.type === FolderTypeEnum.HR;
        const result = this.labelResolver.resolveLabel(
          labelString,
          isRequired,
          this.cachedContactGroups
        );
        resourceName = result.resourceName;
        if (!resourceName && isRequired) {
          this.uiLogger.displayWarning(
            `Label '${labelString}' does not exist in your contacts`
          );
          const shouldCreateLabelResult = await confirmWithEscape({
            message: 'Would you like to create it now? (ESC to cancel)',
            default: true,
          });
          await this.logger.logMain(
            `Prompting user to create missing label: '${labelString}'`
          );
          if (
            shouldCreateLabelResult.escaped ||
            !shouldCreateLabelResult.value
          ) {
            await this.logger.logMain(
              'User declined label creation - cancelling contact creation'
            );
            this.uiLogger.displayError('Contact creation cancelled');
            return;
          }
          this.uiLogger.displayInfo(`Creating label: '${labelString}'`);
          resourceName = await this.labelResolver.createLabel(labelString);
          this.cachedContactGroups.push({
            resourceName,
            name: labelString,
          });
          await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Created new label: '${labelString}'`);
          this.uiLogger.displaySuccess('Label created successfully');
        }
      }
      const isJobOrHRFolder =
        this.lastSelectedFolder.type === FolderTypeEnum.JOB ||
        this.lastSelectedFolder.type === FolderTypeEnum.HR;
      const prePopulatedData: Partial<any> = {
        labelResourceNames: resourceName ? [resourceName] : [],
        company: this.lastSelectedFolder.companyName || '',
        skipLabelConfirmation: isJobOrHRFolder,
      };
      this.contactEditor.setApiLogging(true);
      this.contactEditor.setLogCallback(async (msg: string) => {
        await this.logger.logMain(msg);
      });
      const initialData =
        await this.contactEditor.collectInitialInput(prePopulatedData);
      const finalData = await this.contactEditor.showSummaryAndEdit(
        initialData,
        'Create'
      );
      if (finalData === null) {
        await this.logger.logMain('Contact creation cancelled by user');
        this.uiLogger.displayError('Contact creation cancelled');
        this.contactEditor.setApiLogging(false);
        return;
      }
      const currentDate = formatDateDDMMYYYY(new Date());
      const note = `Added by events & jobs sync script - Last update: ${currentDate}`;
      await this.contactEditor.createContact(finalData, note);
      this.stats.contacts++;
      await this.logger.logMain(`${EMOJIS.STATUS.SUCCESS} Contact created successfully`);
      this.uiLogger.displaySuccess('Contact created');
      this.contactEditor.setApiLogging(false);
    } catch (error) {
      await this.logger.logError(
        `Contact creation error: ${(error as Error).message}`
      );
      this.uiLogger.displayWarning(
        `Contact creation failed: ${(error as Error).message}`
      );
      this.uiLogger.displayInfo(
        'Note: The note was still created successfully'
      );
      this.uiLogger.displayInfo(
        'You can create a note in this folder again to retry contact creation'
      );
    }
  }

  private async fetchContactGroups(): Promise<ContactGroup[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const contactGroups: ContactGroup[] = [];
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.contactGroups.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken,
        });
      });
      await apiTracker.trackRead();
      const groups = response.data.contactGroups || [];
      contactGroups.push(
        ...groups
          .filter(
            (group) =>
              group.resourceName &&
              group.name &&
              group.groupType === 'USER_CONTACT_GROUP'
          )
          .map((group) => ({
            resourceName: group.resourceName!,
            name: group.name!,
          }))
      );
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return contactGroups.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
  }

  private displayFinalSummary(): void {
    const totalWidth = 56;
    const title = 'Events & Jobs Sync Summary';
    const line1 = `Job: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.jobNotes)} | Life: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.lifeEventNotes)} | Contacts: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.contacts)}`;
    const line2 = `Created: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.createdFolders)} | Deleted: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.deletedFolders)} | Renamed: ${FormatUtils.formatNumberWithLeadingZeros(this.stats.renamedFolders)}`;
    console.log('\n' + FormatUtils.padLineWithEquals(title, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line1, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line2, totalWidth));
    console.log('='.repeat(totalWidth));
  }
}
export const eventsJobsSyncScript: Script = {
  metadata: {
    name: 'Events & Jobs Sync',
    description: 'Create notes and contacts for job interviews and life events',
    version: '1.0.0',
    category: 'interactive',
    requiresAuth: false,
    estimatedDuration: '2-5 minutes',
    emoji: EMOJIS.SCRIPTS.EVENTS_JOBS,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(EventsJobsSyncScript);
    await script.run();
  },
};
