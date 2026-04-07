import { google } from 'googleapis';
import { confirmWithEscape, selectWithEscape, retryWithBackoff, formatMixedHebrewEnglish } from '../../utils';
import Fuse from 'fuse.js';
import { injectable, inject } from 'inversify';
import type { ContactData, OAuth2Client, SimilarityType, DuplicateMatch, DuplicatePromptResult } from '../../types';
import { ApiTracker } from '../api';
import { ContactCache } from '../../cache';
import { SETTINGS } from '../../settings';
import { UrlNormalizer } from '../linkedin/urlNormalizer';
import { PhoneNormalizer } from './phoneNormalizer';
import { Logger } from '../../logging';

export { SimilarityType, DuplicateMatch };

@injectable()
export class DuplicateDetector {
  private recentlyModifiedContacts: ContactData[] = [];
  private logApiStats: boolean = false;
  private logCallback?: (message: string) => Promise<void>;
  private uiLogger?: Logger;

  constructor(@inject('OAuth2Client') private auth: OAuth2Client) {}

  setApiLogging(enabled: boolean): void {
    this.logApiStats = enabled;
  }

  setUiLogger(logger: Logger): void {
    this.uiLogger = logger;
  }

  setLogCallback(callback: (message: string) => Promise<void>): void {
    this.logCallback = callback;
  }

  private async log(message: string): Promise<void> {
    if (this.logCallback) {
      await this.logCallback(message);
    }
  }

  private levenshteinDistance(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) =>
        i === 0 ? j : j === 0 ? i : 0
      )
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  private tokenExistsInName(token: string, candidateWords: string[]): boolean {
    if (token.length >= 4) {
      return candidateWords.some(
        (word) => this.levenshteinDistance(word, token) <= 1
      );
    }
    return candidateWords.some((word) => word === token);
  }

  private extractCleanLastName(contact: ContactData): string {
    let cleanLastName = contact.lastName;
    if (!cleanLastName) {
      return '';
    }
    const suffixParts: string[] = [];
    let firstLabel = '';
    if (contact.label) {
      const labels = contact.label.split(' | ');
      if (labels.length > 0 && labels[0]) {
        firstLabel = labels[0];
        suffixParts.push(firstLabel);
      }
    }
    if (contact.company) {
      suffixParts.push(contact.company);
    }
    if (suffixParts.length > 0) {
      const suffix = suffixParts.join(' ');
      if (cleanLastName.endsWith(` ${suffix}`)) {
        cleanLastName = cleanLastName.slice(0, -(suffix.length + 1));
        return cleanLastName.trim();
      }
    }
    if (firstLabel) {
      const words = cleanLastName.split(' ');
      const labelIndex = words.findIndex((word) => word === firstLabel);
      if (labelIndex > 0) {
        cleanLastName = words.slice(0, labelIndex).join(' ');
        return cleanLastName.trim();
      }
    }
    return cleanLastName.trim();
  }

  async checkDuplicateName(
    firstName: string,
    lastName: string
  ): Promise<DuplicateMatch[]> {
    const contacts: ContactData[] = await this.fetchAllContacts();
    const contactsWithFullName = contacts.map((contact: ContactData) => ({
      ...contact,
      fullName:
        `${contact.firstName} ${this.extractCleanLastName(contact)}`.trim(),
    }));
    const searchName: string = `${firstName} ${lastName}`.trim();
    const searchTokens = searchName
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const candidates = contactsWithFullName.filter((contact) => {
      const candidateWords = contact.fullName.toLowerCase().split(/\s+/);
      return searchTokens.some((token) =>
        this.tokenExistsInName(token, candidateWords)
      );
    });
    const fuse = new Fuse(candidates, {
      keys: ['fullName'],
      threshold: 0.25,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 3,
    });
    const results = fuse.search(searchName);
    return results.map((result) => ({
      contact: result.item,
      similarityType: 'Full Name' as SimilarityType,
      score: result.score,
    }));
  }

  async checkDuplicateEmail(email: string): Promise<DuplicateMatch[]> {
    const cache: ContactCache = ContactCache.getInstance();
    const indexedMatches: ContactData[] = await cache.getByEmail(email);
    if (indexedMatches.length > 0) {
      return indexedMatches.map((contact) => ({
        contact,
        similarityType: 'Email' as SimilarityType,
      }));
    }
    const contacts: ContactData[] = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (contactEmail.value === email) {
          matches.push({ contact, similarityType: 'Email' });
          break;
        }
      }
    }
    return matches;
  }

  async checkDuplicatePhone(phone: string): Promise<DuplicateMatch[]> {
    const cache: ContactCache = ContactCache.getInstance();
    const indexedMatches: ContactData[] =
      await cache.getByNormalizedPhone(phone);
    if (indexedMatches.length > 0) {
      return indexedMatches.map((contact) => ({
        contact,
        similarityType: 'Phone' as SimilarityType,
      }));
    }
    const contacts: ContactData[] = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    for (const contact of contacts) {
      for (const contactPhone of contact.phones) {
        if (PhoneNormalizer.phonesMatch(phone, contactPhone.number)) {
          matches.push({ contact, similarityType: 'Phone' });
          break;
        }
      }
    }
    return matches;
  }

  async checkDuplicateLinkedInUrl(url: string): Promise<DuplicateMatch[]> {
    const cache: ContactCache = ContactCache.getInstance();
    const indexedMatch: ContactData | null = await cache.getByLinkedInSlug(url);
    if (indexedMatch) {
      return [
        {
          contact: indexedMatch,
          similarityType: 'LinkedIn' as SimilarityType,
        },
      ];
    }
    const contacts: ContactData[] = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    const normalizedUrl: string = UrlNormalizer.normalizeLinkedInUrl(url);
    for (const contact of contacts) {
      for (const website of contact.websites) {
        const normalizedWebsiteUrl: string = UrlNormalizer.normalizeLinkedInUrl(
          website.url
        );
        if (normalizedWebsiteUrl === normalizedUrl) {
          matches.push({
            contact,
            similarityType: 'LinkedIn' as SimilarityType,
          });
          break;
        }
      }
    }
    return matches;
  }

  async promptForDuplicateContinue(
    duplicates: DuplicateMatch[],
    uiLogger: Logger
  ): Promise<boolean> {
    if (duplicates.length === 0) {
      return true;
    }
    const paddedCount: string = duplicates.length.toString().padStart(3, '0');
    uiLogger.displayWarning(`Found ${paddedCount} similar contacts:`);
    for (let i: number = 0; i < duplicates.length; i++) {
      const { contact, similarityType } = duplicates[i];
      const matchNumber: string = (i + 1).toString().padStart(3, '0');
      console.log(`===Match ${matchNumber}:===`);
      console.log(`-Similarity Type: ${similarityType}`);
      const firstName: string = formatMixedHebrewEnglish(contact.firstName);
      const lastName: string = formatMixedHebrewEnglish(contact.lastName);
      const fullName: string = `${firstName} ${lastName}`.trim();
      console.log(`-Full Name: ${fullName}`);
      if (contact.label) {
        const formattedLabel: string = formatMixedHebrewEnglish(contact.label);
        console.log(`-Labels: ${formattedLabel}`);
      }
      if (contact.company) {
        const formattedCompany: string = formatMixedHebrewEnglish(
          contact.company
        );
        console.log(`-Company Name: ${formattedCompany}`);
      }
      if (contact.emails.length === 1) {
        console.log(`-Email: ${contact.emails[0].value}`);
      } else if (contact.emails.length > 1) {
        const emailList: string = contact.emails.map((e) => e.value).join(', ');
        console.log(`-Emails: ${emailList}`);
      }
      if (contact.phones.length === 1) {
        console.log(`-Phone: ${contact.phones[0].number}`);
      } else if (contact.phones.length > 1) {
        const phoneList: string = contact.phones
          .map((p) => p.number)
          .join(', ');
        console.log(`-Phones: ${phoneList}`);
      }
      const linkedInWebsite = contact.websites.find((w) =>
        w.label.toLowerCase().includes('linkedin')
      );
      if (linkedInWebsite) {
        console.log(`-LinkedIn URL: ${linkedInWebsite.url} LinkedIn`);
      }
      if (contact.etag) {
        console.log(`-ETag: ${contact.etag}`);
      }
      console.log('');
    }
    await this.log('? Continue anyway? (y/N)');
    const result = await confirmWithEscape({
      message: 'Continue anyway?',
      default: false,
    });
    if (result.escaped) {
      await this.log('User pressed ESC');
      return false;
    }
    const proceed = result.value;
    await this.log(`User answered: ${proceed ? 'Yes' : 'No'}`);
    return proceed;
  }

  async promptDuplicateSelectOrCreate(
    duplicates: DuplicateMatch[],
    uiLogger: Logger
  ): Promise<DuplicatePromptResult | null> {
    if (duplicates.length === 0) {
      return { action: 'create_new' };
    }

    const paddedCount = duplicates.length.toString().padStart(3, '0');
    uiLogger.displayWarning(`Found ${paddedCount} similar contacts:`);
    for (let i = 0; i < duplicates.length; i++) {
      const { contact, similarityType } = duplicates[i];
      const matchNumber = (i + 1).toString().padStart(3, '0');
      console.log(`===Match ${matchNumber}:===`);
      console.log(`-Similarity Type: ${similarityType}`);
      const firstName = formatMixedHebrewEnglish(contact.firstName);
      const lastName = formatMixedHebrewEnglish(contact.lastName);
      console.log(`-Full Name: ${`${firstName} ${lastName}`.trim()}`);
      if (contact.label) console.log(`-Labels: ${formatMixedHebrewEnglish(contact.label)}`);
      if (contact.company) console.log(`-Company Name: ${formatMixedHebrewEnglish(contact.company)}`);
      if (contact.emails.length === 1) console.log(`-Email: ${contact.emails[0].value}`);
      else if (contact.emails.length > 1) console.log(`-Emails: ${contact.emails.map(e => e.value).join(', ')}`);
      if (contact.phones.length === 1) console.log(`-Phone: ${contact.phones[0].number}`);
      else if (contact.phones.length > 1) console.log(`-Phones: ${contact.phones.map(p => p.number).join(', ')}`);
      const linkedin = contact.websites.find(w => w.label.toLowerCase().includes('linkedin'));
      if (linkedin) console.log(`-LinkedIn URL: ${linkedin.url} LinkedIn`);
      if (contact.etag) console.log(`-ETag: ${contact.etag}`);
      console.log('');
    }

    const choices = [
      { name: '➕ Create a new contact', value: 'create_new' },
      ...duplicates.map((match, i) => {
        const first = formatMixedHebrewEnglish(match.contact.firstName);
        const last = formatMixedHebrewEnglish(match.contact.lastName);
        const email = match.contact.emails[0]?.value ? ` (${match.contact.emails[0].value})` : '';
        return {
          name: `🔍 ${`${first} ${last}`.trim()}${email}`,
          value: `existing_${i}`,
        };
      }),
    ];

    await this.log('? Select an action:');
    const result = await selectWithEscape<string>({
      message: 'Select an action:',
      loop: false,
      choices,
    });

    if (result.escaped) {
      await this.log('User pressed ESC');
      return null;
    }

    if (result.value === 'create_new') {
      await this.log('User selected: Create a new contact');
      return { action: 'create_new' };
    }

    const index = parseInt(result.value.replace('existing_', ''), 10);
    const selected = duplicates[index].contact;
    await this.log(`User selected existing contact: ${selected.firstName} ${selected.lastName}`);
    return { action: 'use_existing', contact: selected };
  }

  private async fetchAllContacts(
    onProgress?: (count: number) => void
  ): Promise<ContactData[]> {
    const cache: ContactCache = ContactCache.getInstance();
    const cached: ContactData[] | null = await cache.get();
    const apiContacts: ContactData[] =
      cached || (await this.fetchContactsFromAPI(onProgress));
    if (!cached) {
      await cache.set(apiContacts);
    }
    const allContacts = [...this.recentlyModifiedContacts, ...apiContacts];
    return allContacts;
  }

  private async fetchContactsFromAPI(
    onProgress?: (count: number) => void
  ): Promise<ContactData[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    let contactGroupsPageToken: string | undefined;
    const groupIdToName: Record<string, string> = {};
    do {
      const contactGroupsResponse = await retryWithBackoff(async () => {
        return await service.contactGroups.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken: contactGroupsPageToken,
        });
      });
      await apiTracker.trackRead();
      if (this.logApiStats) {
        await apiTracker.logStats(this.uiLogger);
      }
      const contactGroups = contactGroupsResponse.data.contactGroups || [];
      contactGroups.forEach((group) => {
        if (
          group.resourceName &&
          group.name &&
          group.groupType === 'USER_CONTACT_GROUP'
        ) {
          groupIdToName[group.resourceName] = group.name;
        }
      });
      contactGroupsPageToken =
        contactGroupsResponse.data.nextPageToken || undefined;
    } while (contactGroupsPageToken);
    const contacts: ContactData[] = [];
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.people.connections.list({
          resourceName: 'people/me',
          pageSize: SETTINGS.api.pageSize,
          personFields:
            'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies,metadata',
          pageToken,
        });
      });
      await apiTracker.trackRead();
      if (this.logApiStats) {
        await apiTracker.logStats(this.uiLogger);
      }
      const connections = response.data.connections || [];
      for (const person of connections) {
        const resourceName: string | undefined =
          person.resourceName ?? undefined;
        const names = person.names?.[0];
        const firstName: string = names?.givenName || '';
        const lastName: string = names?.familyName || '';
        const emails = (person.emailAddresses || []).map((email) => ({
          value: email.value || '',
          label: email.type || email.formattedType || '',
        }));
        const phones = (person.phoneNumbers || []).map((phone) => ({
          number: phone.value || '',
          label: phone.type || phone.formattedType || '',
        }));
        const websites = (person.urls || []).map((url) => ({
          url: url.value || '',
          label: url.type || url.formattedType || '',
        }));
        const contactGroupMemberships = (person.memberships || [])
          .filter((m) => m.contactGroupMembership?.contactGroupResourceName)
          .map((m) => {
            const groupResourceName: string | null | undefined =
              m.contactGroupMembership?.contactGroupResourceName;
            if (!groupResourceName) {
              return '';
            }
            return groupIdToName[groupResourceName] || '';
          })
          .filter((name: string) => name);
        const label: string = contactGroupMemberships.join(' | ');
        const biography: string = person.biographies?.[0]?.value || '';
        const etag: string = person.etag || '';
        contacts.push({
          label,
          firstName,
          lastName,
          company: person.organizations?.[0]?.name || '',
          jobTitle: person.organizations?.[0]?.title || '',
          emails,
          phones,
          websites,
          resourceName: resourceName || undefined,
          biography,
          etag,
        });
      }
      if (onProgress) {
        onProgress(contacts.length);
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return contacts;
  }

  async clearCache(): Promise<void> {
    await ContactCache.getInstance().invalidate();
    this.recentlyModifiedContacts = [];
  }

  addRecentlyModifiedContact(contact: ContactData): void {
    this.recentlyModifiedContacts.push(contact);
  }

  async ensureCachePopulated(): Promise<void> {
    const cache = ContactCache.getInstance();
    const cached = await cache.get();
    if (cached !== null) {
      return;
    }
    await this.checkDuplicateEmail('cache-population-trigger@internal');
  }
}
