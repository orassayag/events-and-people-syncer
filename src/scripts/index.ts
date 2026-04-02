import type { Script } from '../types/script';
import { hibobSyncScript } from './hibobSync';
import { linkedInSyncScript } from './linkedinSync';
import { contactsSyncScript } from './contactsSync';
import { eventsJobsSyncScript } from './eventsJobsSync';
import { otherContactsSyncScript } from './otherContactsSync';
import { smsWhatsappSyncScript } from './smsWhatsappSync';
import { statisticsScript } from './statistics';
import { clearCacheScript } from './clearCache';
import { clearLogsScript } from './clearLogs';

export { LinkedInSyncScript } from './linkedinSync';
export { HibobSyncScript } from './hibobSync';
export { ContactsSyncScript } from './contactsSync';
export { EventsJobsSyncScript } from './eventsJobsSync';
export { StatisticsScript } from './statistics';
export { ClearCacheScript } from './clearCache';
export { ClearLogsScript } from './clearLogs';
export { SmsWhatsappSyncScript } from './smsWhatsappSync';
export { OtherContactsSyncScript } from './otherContactsSync';

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  'hibob-sync': hibobSyncScript,
  'linkedin-sync': linkedInSyncScript,
  'contacts-sync': contactsSyncScript,
  'events-jobs-sync': eventsJobsSyncScript,
  'other-contacts-sync': otherContactsSyncScript,
  'sms-whatsapp-sync': smsWhatsappSyncScript,
  'statistics': statisticsScript,
  'clear-cache': clearCacheScript,
  'clear-logs': clearLogsScript,
};

export function listScripts(): void {
  console.log('\nAvailable Scripts:\n');
  Object.entries(AVAILABLE_SCRIPTS).forEach(([key, script]) => {
    const { metadata } = script;
    console.log(`  ${key}`);
    console.log(`    Name: ${metadata.name}`);
    console.log(`    Description: ${metadata.description}`);
    console.log(`    Category: ${metadata.category}`);
    console.log(`    Duration: ${metadata.estimatedDuration || 'Unknown'}\n`);
  });
}
