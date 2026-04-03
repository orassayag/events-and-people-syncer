import {
  selectWithEscape,
  confirmWithEscape,
} from './utils';
import { initiate } from './settings';
import { AVAILABLE_SCRIPTS } from './scripts';
import type { Script } from './types/script';
import { Logger } from './logging';
import { initializeAuth } from './services/auth/initAuth';
import { EMOJIS } from './constants';
import { SETTINGS } from './settings';

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

const uiLogger = new Logger('Main');

async function main(): Promise<void> {
  initiate();
  await initializeAuth();
  const flags = process.argv.slice(2);
  const skipPrompt = flags.includes('--yes') || flags.includes('-y');
  if (SETTINGS.dryMode && !skipPrompt) {
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
      console.log('Operation cancelled.');
      process.exit(0);
    }
    console.log('');
  } else if (SETTINGS.dryMode && skipPrompt) {
    console.log(
      `${EMOJIS.STATUS.WARNING} Running in DRY MODE (prompt skipped with --yes flag)`
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
      'events-jobs-sync',
      'linkedin-sync',
      'hibob-sync',
      'other-contacts-sync',
      'sms-whatsapp-sync',
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
    const result = await selectWithEscape<string>({
      message: 'Select a script to run (ESC to exit):',
      loop: false,
      choices: scriptChoices,
      pageSize: scriptChoices.length,
    });
    if (result.escaped) {
      uiLogger.displayExit();
      continueRunning = false;
      break;
    }
    const choice = result.value;
    if (choice === 'exit') {
      uiLogger.displayExit();
      continueRunning = false;
      break;
    }
    try {
      const script: Script = AVAILABLE_SCRIPTS[choice];
      await script.run();
    } catch (error) {
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
