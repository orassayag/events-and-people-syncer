import { initiate } from './settings';
import { AVAILABLE_SCRIPTS, listScripts } from './scripts';
import { initializeAuth } from './services/auth/initAuth';
import { Logger, LogCleanup } from './logging';

const uiLogger = new Logger('Runner');
const scriptName: string = process.argv[2];
const flags = process.argv.slice(3);
const noCacheFlag = flags.includes('--no-cache') || flags.includes('-no-cache');

if (noCacheFlag) {
  process.env.NO_CACHE = 'true';
}

if (!scriptName || scriptName === '--list' || scriptName === 'list') {
  listScripts();
  process.exit(0);
}

if (!AVAILABLE_SCRIPTS[scriptName]) {
  uiLogger.error(`Script "${scriptName}" not found`);
  console.error(`Error: Script "${scriptName}" not found`);
  console.error('Run "pnpm script:list" to see available scripts');
  process.exit(1);
}

async function run(): Promise<void> {
  try {
    uiLogger.info(`Runner starting script: ${scriptName}`, { flags });
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
    const script = AVAILABLE_SCRIPTS[scriptName];
    uiLogger.info(`Executing script: ${scriptName}`, {
      name: script.metadata.name,
      category: script.metadata.category,
    });
    await script.run();
    uiLogger.info(`Script finished: ${scriptName}`);
  } catch (error) {
    uiLogger.error(
      `Fatal error in runner for script: ${scriptName}`,
      error instanceof Error ? error : new Error(String(error))
    );
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

run().catch((error) => {
  uiLogger.error(
    'Unhandled error in runner',
    error instanceof Error ? error : new Error(String(error))
  );
  process.exit(1);
});
