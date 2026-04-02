import { google } from 'googleapis';
import { injectable, inject } from 'inversify';
import type { OAuth2Client, OtherContactEntry } from '../../types';
import { ApiTracker } from '../api';
import { SETTINGS } from '../../settings';
import { retryWithBackoff } from '../../utils';

@injectable()
export class OtherContactsFetcher {
  constructor(@inject('OAuth2Client') private auth: OAuth2Client) {}

  async fetchOtherContacts(
    onProgress?: (fetched: number, total: number) => void
  ): Promise<OtherContactEntry[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const entries: OtherContactEntry[] = [];
    let pageToken: string | undefined;
    let totalSize: number | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.otherContacts.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken,
          readMask: 'names,emailAddresses,phoneNumbers,metadata',
        });
      });
      await apiTracker.trackRead();
      if (totalSize === undefined && response.data.totalSize) {
        totalSize = response.data.totalSize;
      }
      const otherContacts = response.data.otherContacts || [];
      for (const person of otherContacts) {
        const emails = (person.emailAddresses || [])
          .map((e) => e.value)
          .filter((v): v is string => !!v);
        const phones = (person.phoneNumbers || [])
          .map((p) => p.value)
          .filter((v): v is string => !!v);
        const displayName = person.names?.[0]?.displayName?.trim() || undefined;
        const resourceName = person.resourceName;
        if (resourceName) {
          entries.push({
            emails,
            phones,
            resourceName,
            displayName,
          });
        }
      }
      if (onProgress && totalSize) {
        onProgress(entries.length, totalSize);
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return entries;
  }
}
