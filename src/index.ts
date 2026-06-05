import { selectWithEscape, confirmWithEscape } from './utils';
import { initiate } from './settings';
import { AVAILABLE_SCRIPTS } from './scripts';
import type { Script } from './types/script';
import { Logger, LogCleanup } from './logging';
import { initializeAuth } from './services/auth/initAuth';
import { EMOJIS } from './constants';
import { SETTINGS } from './settings';

const uiLogger = new Logger('Main');

process.removeAllListeners('warning');

process.on('uncaughtException', (error) => {
  const errorString = String(error);
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (
    errorString.includes('ERR_USE_AFTER_CLOSE') ||
    errorCode === 'ERR_USE_AFTER_CLOSE'
  ) {
    return;
  }
  uiLogger.error(
    'Fatal uncaught exception',
    error instanceof Error ? error : new Error(errorString)
  );
  console.error(`${EMOJIS.STATUS.ERROR} Fatal error:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const errorString = String(reason);
  const error = reason as any;
  if (
    errorString.includes('ERR_USE_AFTER_CLOSE') ||
    error?.code === 'ERR_USE_AFTER_CLOSE'
  ) {
    return;
  }
  uiLogger.error(
    'Unhandled rejection',
    error instanceof Error ? error : new Error(errorString)
  );
  console.error(`${EMOJIS.STATUS.ERROR} Unhandled rejection:`, reason);
  process.exit(1);
});

const flags = process.argv.slice(2);
const noCacheFlag =
  flags.includes('--no-cache') ||
  flags.includes('-no-cache') ||
  flags.includes('no-cache');

if (noCacheFlag) {
  process.env.NO_CACHE = 'true';
}

async function main(): Promise<void> {
  uiLogger.info('Application starting...', { flags });
  try {
    await LogCleanup.cleanOldLogs();
  } catch (error) {
    uiLogger.warn('Failed to clean old logs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  initiate();
  uiLogger.debug('Settings initiated');
  await initializeAuth();
  uiLogger.debug('Authentication initialized');
  const skipPrompt = flags.some((f) =>
    ['--yes', '-y', '--auto', 'AUTO', 'auto', '-auto'].includes(f)
  );
  if (SETTINGS.dryMode && !skipPrompt) {
    uiLogger.info('Running in DRY MODE - awaiting user confirmation');
    console.log('');
    console.log(`${EMOJIS.STATUS.WARNING}  You are running in DRY MODE`);
    console.log('');
    console.log('  No write actions to the Google API will be executed.');
    console.log(
      '  All write operations will be logged with [DRY-MODE] prefix.'
    );
    console.log('  Mock contacts will be tracked for duplicate detection.');
    console.log('');
    console.log('  To enable writes, use the :live script:');
    console.log('  • pnpm run start:live');
    console.log('');
    console.log('  Note: Dry-mode applies regardless of environment setting.');
    console.log(
      '  By confirming, you acknowledge the system will NOT make real API writes.'
    );
    console.log('');
    const proceedResult = await confirmWithEscape({
      message: 'Proceed in dry mode?',
      default: true,
    });
    if (proceedResult.escaped || !proceedResult.value) {
      uiLogger.info('Dry mode execution cancelled by user');
      console.log('Operation cancelled.');
      process.exit(0);
    }
    uiLogger.info('Dry mode execution confirmed by user');
    console.log('');
  } else if (SETTINGS.dryMode && skipPrompt) {
    uiLogger.info('Running in DRY MODE (auto-confirmed)');
    console.log(
      `${EMOJIS.STATUS.WARNING} Running in DRY MODE (prompt skipped via flag)`
    );
    console.log('');
  }
  let continueRunning: boolean = true;
  while (continueRunning) {
    const noCacheMode = process.env.NO_CACHE === 'true';
    const header = noCacheMode
      ? 'Events & People Syncer (no cache mode)'
      : 'Events & People Syncer';
    uiLogger.display(header);
    const scriptOrder = [
      'contacts-sync',
      'google-contacts-maintainer',
      'google-contacts-excluder',
      'google-contacts-mapper',
      'events-jobs-sync',
      'linkedin-sync',
      'linkedin-matcher',
      'linkedin-exporter',
      'hibob-sync',
      'other-contacts-sync',
      'sms-whatsapp-sync',
      'sync-phones',
      'delete-empty-contacts',
      'statistics',
      'clear-cache',
      'clear-logs',
    ];
    const maxNameLength = Math.max(
      ...Object.values(AVAILABLE_SCRIPTS).map((s) => s.metadata.name.length)
    );
    const scriptChoices = Object.entries(AVAILABLE_SCRIPTS)
      .map(([key, script]) => ({
        name: `${script.metadata.emoji || EMOJIS.SCRIPTS.DEFAULT} ${script.metadata.name.padEnd(maxNameLength)} - ${script.metadata.description}`,
        value: key,
      }))
      .sort((a, b) => {
        const indexA = scriptOrder.indexOf(a.value);
        const indexB = scriptOrder.indexOf(b.value);
        return indexA - indexB;
      });
    scriptChoices.push({
      name: `${EMOJIS.NAVIGATION.EXIT} Exit`,
      value: 'exit',
    });

    let choice: string;
    const isAuto = flags.some((f) =>
      ['--auto', 'AUTO', 'auto', '-auto'].includes(f)
    );

    if (isAuto) {
      uiLogger.info('Auto-mode detected, selecting Google Contacts Maintainer');
      uiLogger.displayInfo('Auto-selecting Google Contacts Maintainer...');
      choice = 'google-contacts-maintainer';
      continueRunning = false;
    } else {
      uiLogger.debug('Awaiting user script selection');
      const result = await selectWithEscape<string>({
        message: 'Select a script to run (ESC to exit):',
        loop: false,
        choices: scriptChoices,
        pageSize: scriptChoices.length,
      });

      if (result.escaped) {
        uiLogger.info('Script selection escaped by user');
        uiLogger.displayExit();
        continueRunning = false;
        break;
      }

      choice = result.value;
      uiLogger.info('Script selected', { choice });

      if (choice === 'exit') {
        uiLogger.info('Exit selected by user');
        uiLogger.displayExit();
        continueRunning = false;
        break;
      }
    }

    try {
      const script: Script = AVAILABLE_SCRIPTS[choice];
      uiLogger.info(`Starting script execution: ${choice}`, {
        scriptName: script.metadata.name,
        category: script.metadata.category,
      });
      await script.run();
      uiLogger.info(`Finished script execution: ${choice}`);
    } catch (error) {
      uiLogger.error(
        `Error during script execution: ${choice}`,
        error instanceof Error ? error : new Error(String(error))
      );
      if (error instanceof Error) {
        console.error(`${EMOJIS.STATUS.ERROR} Error:`, error.message);
      } else {
        console.error(`${EMOJIS.STATUS.ERROR} An unknown error occurred`);
      }
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(`${EMOJIS.STATUS.ERROR} Fatal error:`, error);
  process.exit(1);
});
