import { initiate } from './settings';
import { AVAILABLE_SCRIPTS, listScripts } from './scripts';
import { initializeAuth } from './services/auth/initAuth';

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
  console.error(`Error: Script "${scriptName}" not found`);
  console.error('Run "pnpm script:list" to see available scripts');
  process.exit(1);
}

initiate();
await initializeAuth();
const script = AVAILABLE_SCRIPTS[scriptName];
await script.run();
