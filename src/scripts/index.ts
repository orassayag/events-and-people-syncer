import type { Script } from '../types/script';
import { hibobSyncScript } from './hibobSync';
import { linkedInSyncScript } from './linkedinSync';
import { linkedInMatcherScript } from './linkedinMatcher';
import { linkedInExporterScript } from './linkedinExporter';
import { contactsSyncScript } from './contactsSync';
import { eventsJobsSyncScript } from './eventsJobsSync';
import { otherContactsSyncScript } from './otherContactsSync';
import { smsWhatsappSyncScript } from './smsWhatsappSync';
import { syncPhonesScript } from './syncPhones';
import { deleteEmptyContactsScript } from './deleteEmptyContacts';
import { fixEmptyContactsScript } from './fixEmptyContacts';
import { googleContactsMaintainerScript } from './googleContactsMaintainer';
import { googleContactsExcluderScript } from './googleContactsExcluder';
import { googleContactsMapperScript } from './googleContactsMapper';
import { statisticsScript } from './statistics';
import { clearCacheScript } from './clearCache';
import { clearLogsScript } from './clearLogs';

export { LinkedInSyncScript } from './linkedinSync';
export { LinkedInMatcherScript } from './linkedinMatcher';
export { LinkedInExporterScript } from './linkedinExporter';
export { HibobSyncScript } from './hibobSync';
export { ContactsSyncScript } from './contactsSync';
export { EventsJobsSyncScript } from './eventsJobsSync';
export { StatisticsScript } from './statistics';
export { ClearCacheScript } from './clearCache';
export { ClearLogsScript } from './clearLogs';
export { SmsWhatsappSyncScript } from './smsWhatsappSync';
export { SyncPhonesScript } from './syncPhones';
export { DeleteEmptyContactsScript } from './deleteEmptyContacts';
export { FixEmptyContactsScript } from './fixEmptyContacts';
export { OtherContactsSyncScript } from './otherContactsSync';
export { GoogleContactsMaintainerScript } from './googleContactsMaintainer';
export { GoogleContactsExcluderScript } from './googleContactsExcluder';
export { GoogleContactsMapperScript } from './googleContactsMapper';

export const AVAILABLE_SCRIPTS: Record<string, Script> = {
  'hibob-sync': hibobSyncScript,
  'linkedin-sync': linkedInSyncScript,
  'linkedin-matcher': linkedInMatcherScript,
  'linkedin-exporter': linkedInExporterScript,
  'contacts-sync': contactsSyncScript,
  'events-jobs-sync': eventsJobsSyncScript,
  'other-contacts-sync': otherContactsSyncScript,
  'sms-whatsapp-sync': smsWhatsappSyncScript,
  'sync-phones': syncPhonesScript,
  'delete-empty-contacts': deleteEmptyContactsScript,
  'fix-empty-contacts': fixEmptyContactsScript,
  'google-contacts-maintainer': googleContactsMaintainerScript,
  'google-contacts-excluder': googleContactsExcluderScript,
  'google-contacts-mapper': googleContactsMapperScript,
  statistics: statisticsScript,
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
