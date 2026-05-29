import { injectable, inject } from 'inversify';
import { google } from 'googleapis';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  promises as fs,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { SETTINGS } from '../settings';
import type {
  OAuth2Client,
  Script,
  ContactData,
  MaintainerException,
  MaintainerReportItem,
  OtherContactEntry,
} from '../types';
import { MaintainerIssueType } from '../types';
import { Logger, SyncLogger } from '../logging';
import { RegexPatterns } from '../regex';
import { calculateFormattedCompany } from '../utils/companyFormatter';
import { TextUtils } from '../utils/textUtils';
import { SyncStatusBar } from '../flow/syncStatusBar';
import { FormatUtils } from '../constants';
import { UrlNormalizer } from '../services/linkedin/urlNormalizer';
import { PhoneNormalizer } from '../services/contacts/phoneNormalizer';
import { OtherContactsFetcher } from '../services/otherContacts';

@injectable()
export class GoogleContactsMaintainerScript implements Script {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private readonly desktopPath: string;
  private readonly reportFileName: string = 'SCAN_CONTACTS_REPORT.txt';
  private readonly exceptionsFile: string;
  private readonly REQUIRED_URL_LABELS = [
    'HR',
    'Job',
    'MCPD',
    'LinkedIn',
    'Novo',
    'Tennis',
    'OSR',
    'AnyClip',
    'Perspective',
    'Yotpo',
    'JUMBOmail',
    'Netbiz',
    'MCP Group',
    'John Bryce',
    'GitHub',
    'Clawders',
    'Append',
    'Alexbot',
    'Ai Agents',
    'Eyefeelit',
    'JVP',
    'Mamash',
    'Melon',
    'Vim',
  ];

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(OtherContactsFetcher)
    private otherContactsFetcher: OtherContactsFetcher,
    @inject(PhoneNormalizer) private phoneNormalizer: PhoneNormalizer
  ) {
    this.logger = new SyncLogger('google-contacts-maintainer');
    this.uiLogger = new Logger('GoogleContactsMaintainer');
    this.desktopPath = join(homedir(), 'Desktop');
    this.exceptionsFile = join(process.cwd(), 'maintainer-exceptions.json');
  }

  get metadata(): {
    name: string;
    description: string;
    version: string;
    category: 'maintenance';
    requiresAuth: boolean;
    emoji: string;
  } {
    return {
      name: 'Google Contacts Maintainer',
      description: 'Scan and report issues in Google Contacts',
      version: '2.0.0',
      category: 'maintenance',
      requiresAuth: true,
      emoji: '🔍',
    };
  }

  async run(): Promise<void> {
    const reportPath = join(this.desktopPath, this.reportFileName);

    this.uiLogger.display('Google Contacts Maintainer');
    await this.logger.initialize();

    try {
      this.uiLogger.displayInfo('Fetching all Google contacts...');

      const { contacts, allLabels } = await this.fetchAllContacts();
      this.uiLogger.displayInfo(
        `Fetched ${contacts.length} contacts and ${allLabels.length} labels.`
      );

      this.uiLogger.displayInfo('Fetching "Other contacts"...');
      const otherContacts =
        await this.otherContactsFetcher.fetchOtherContacts();
      this.uiLogger.displayInfo(
        `Fetched ${otherContacts.length} "Other contacts".`
      );

      this.uiLogger.display('===Backup contacts===');
      let backupStats = { contactCount: 0, otherContactCount: 0, fileCount: 0 };
      try {
        backupStats = await this.backupContacts(
          contacts,
          allLabels,
          otherContacts
        );
      } catch (backupError) {
        this.uiLogger.warn(
          'Backup failed, but continuing with report generation',
          { error: (backupError as Error).message }
        );
      }

      const exceptions = this.loadExceptions();
      this.uiLogger.displayInfo(`Loaded ${exceptions.length} exceptions.`);

      this.uiLogger.display('===Creating the report===');
      const reportItems = this.scanContacts(
        contacts,
        exceptions,
        allLabels,
        otherContacts
      );

      if (reportItems.length === 0) {
        this.uiLogger.displaySuccess('No issues found in contacts!');
        if (existsSync(reportPath)) {
          await this.safeUnlink(reportPath);
          this.uiLogger.displayInfo('Previous report file removed.');
        }
        return;
      }

      await this.generateReport(reportItems, reportPath, backupStats);
      this.uiLogger.displaySuccess(
        `Scan complete. ${reportItems.length} contacts have issues.`
      );
      this.uiLogger.displaySuccess(`Report saved to: ${reportPath}`);
    } catch (error) {
      this.uiLogger.error('Script failed', error as Error);
      await this.logger.logError(`Script failed: ${(error as Error).message}`);
    }
  }

  private checkHebrew(text: string | undefined): boolean {
    return !!text && RegexPatterns.HEBREW.test(text);
  }

  private getLinkedInUrl(contact: ContactData): string | undefined {
    const linkedinWebsite = contact.websites.find(
      (w) =>
        w.label.toLowerCase().includes('linkedin') ||
        w.url.toLowerCase().includes('linkedin.com')
    );
    return linkedinWebsite
      ? UrlNormalizer.normalizeLinkedInUrl(linkedinWebsite.url)
      : undefined;
  }

  private async fetchAllContacts(): Promise<{
    contacts: ContactData[];
    allLabels: string[];
  }> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const contacts: ContactData[] = [];
    const allLabelsSet = new Set<string>();
    let pageToken: string | undefined;

    const statusBar = new SyncStatusBar();
    statusBar.startFetchPhase();

    const groupIdToName: Record<string, string> = {};
    let groupPageToken: string | undefined;
    do {
      const groupResponse = await service.contactGroups.list({
        pageSize: 1000,
        pageToken: groupPageToken,
      });
      const groups = groupResponse.data.contactGroups || [];
      groups.forEach((g) => {
        if (g.resourceName && g.name) {
          groupIdToName[g.resourceName] = g.name;
          allLabelsSet.add(g.name);
        }
      });
      groupPageToken = groupResponse.data.nextPageToken || undefined;
    } while (groupPageToken);

    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields:
          'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies,metadata',
        pageToken,
      });

      const connections = response.data.connections || [];
      for (const person of connections) {
        const names = person.names?.[0];
        const firstName = names?.givenName || '';
        const lastName = names?.familyName || '';
        const emails = (person.emailAddresses || []).map((e) => ({
          value: e.value || '',
          label: e.type || e.formattedType || '',
        }));
        const phones = (person.phoneNumbers || []).map((p) => ({
          number: p.value || '',
          label: p.type || p.formattedType || '',
        }));
        const websites = (person.urls || []).map((u) => ({
          url: u.value || '',
          label: u.type || u.formattedType || '',
        }));
        const memberships = (person.memberships || [])
          .map(
            (m) =>
              groupIdToName[
                m.contactGroupMembership?.contactGroupResourceName || ''
              ] || ''
          )
          .filter((name) => name && !name.startsWith('systemGroups/'));

        contacts.push({
          firstName,
          lastName,
          company: person.organizations?.[0]?.name || '',
          jobTitle: person.organizations?.[0]?.title || '',
          emails,
          phones,
          websites,
          label: memberships.join(' | '),
          labels: memberships,
          biography: person.biographies?.[0]?.value || '',
          resourceName: person.resourceName || undefined,
          etag: person.etag || '',
        });
        statusBar.updateFetchProgress(contacts.length);
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    statusBar.completeFetch(contacts.length);
    return { contacts, allLabels: Array.from(allLabelsSet) };
  }

  private async safeUnlink(path: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      try {
        if (existsSync(path)) {
          await fs.unlink(path);
        }
        return;
      } catch (error: any) {
        if (i < 9 && (error.code === 'EPERM' || error.code === 'EBUSY')) {
          this.uiLogger.debug(
            `Retrying unlink of ${path} due to ${error.code} (attempt ${i + 1}/10)`
          );
          await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
  }

  private async safeWriteFile(path: string, content: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      try {
        await fs.writeFile(path, content, 'utf-8');
        return;
      } catch (error: any) {
        if (i < 9 && (error.code === 'EPERM' || error.code === 'EBUSY')) {
          this.uiLogger.debug(
            `Retrying write to ${path} due to ${error.code} (attempt ${i + 1}/10)`
          );
          await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
  }

  private async backupContacts(
    contacts: ContactData[],
    allLabels: string[],
    otherContacts: OtherContactEntry[]
  ): Promise<{
    contactCount: number;
    otherContactCount: number;
    fileCount: number;
  }> {
    const backupPath = SETTINGS.backup.contactsPath;

    if (!existsSync(backupPath)) {
      mkdirSync(backupPath, { recursive: true });
    } else {
      // Delete all JSON files in the backup folder before writing new ones
      const files = readdirSync(backupPath);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.json')) {
          await this.safeUnlink(join(backupPath, file));
        }
      }
    }

    // Sort contacts alphabetically
    const sortedContacts = [...contacts].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.trim().toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const transformedContacts = sortedContacts.map((c, index) => {
      const id = c.resourceName?.split('/').pop() || '';
      return {
        id_internal: FormatUtils.formatNumberWithLeadingZeros(index + 1, 6),
        id_external: id,
        labels: (c.labels || []).filter((l) => l !== 'myContacts'),
        first_name: c.firstName,
        last_name: c.lastName,
        company: c.company,
        job_title: c.jobTitle,
        emails: c.emails.map((e) => ({ value: e.value, label: e.label })),
        phones: c.phones.map((p) => ({ value: p.number, label: p.label })),
        websites: c.websites.map((w) => ({ value: w.url, label: w.label })),
        notes: c.biography || '',
      };
    });

    // Chunk by 1000
    const chunkSize = 1000;
    const contactChunks: any[][] = [];
    for (let i = 0; i < transformedContacts.length; i += chunkSize) {
      contactChunks.push(transformedContacts.slice(i, i + chunkSize));
    }

    let fileCount = 0;
    for (let i = 0; i < contactChunks.length; i++) {
      const fileName = `contacts_${String(i + 1).padStart(2, '0')}.json`;
      await this.safeWriteFile(
        join(backupPath, fileName),
        JSON.stringify(contactChunks[i], null, 2)
      );
      fileCount++;
    }

    // Backup "Other contacts"
    const sortedOther = [...otherContacts].sort((a, b) =>
      (a.displayName || '').localeCompare(b.displayName || '')
    );

    const transformedOther = sortedOther.map((o, index) => {
      const id = o.resourceName?.split('/').pop() || '';
      return {
        id: FormatUtils.formatNumberWithLeadingZeros(index + 1, 6),
        id_external: id,
        name: o.displayName || '',
        email: o.emails?.[0] || '',
      };
    });

    const otherChunks: any[][] = [];
    for (let i = 0; i < transformedOther.length; i += chunkSize) {
      otherChunks.push(transformedOther.slice(i, i + chunkSize));
    }

    for (let i = 0; i < otherChunks.length; i++) {
      const fileName = `other_contacts_${String(i + 1).padStart(2, '0')}.json`;
      await this.safeWriteFile(
        join(backupPath, fileName),
        JSON.stringify(otherChunks[i], null, 2)
      );
      fileCount++;
    }

    // Backup labels
    const excludedLabels = [
      'starred',
      'friends',
      'family',
      'coworkers',
      'myContacts',
      'chatBuddies',
      'all',
      'blocked',
    ].map((l) => l.toLowerCase());

    const filteredLabels = allLabels
      .filter((l) => !excludedLabels.includes(l.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    await this.safeWriteFile(
      join(backupPath, 'labels.json'),
      JSON.stringify(filteredLabels, null, 2)
    );
    fileCount++;

    return {
      contactCount: contacts.length,
      otherContactCount: otherContacts.length,
      fileCount,
    };
  }

  private loadExceptions(): MaintainerException[] {
    if (existsSync(this.exceptionsFile)) {
      try {
        const content = readFileSync(this.exceptionsFile, 'utf-8');
        return JSON.parse(content);
      } catch {
        return [];
      }
    }
    return [];
  }

  private extractDataFromNotes(notes: string): {
    emails: string[];
    phones: string[];
  } {
    const emails: string[] = [];
    const phones: string[] = [];

    if (!notes) return { emails, phones };

    // Extract Emails
    // Pattern: Emails: email1, email2
    const emailMatches = notes.matchAll(/Emails:\s*([^\r\n]+)/gi);
    for (const match of emailMatches) {
      const emailList = match[1].split(',').map((e) => e.trim().toLowerCase());
      emails.push(...emailList.filter((e) => e && e !== 'null'));
    }

    // Extract PhoneNumbers
    // Pattern: PhoneNumbers: phone1, phone2
    const phoneMatches = notes.matchAll(/PhoneNumbers:\s*([^\r\n]+)/gi);
    for (const match of phoneMatches) {
      const phoneList = match[1].split(',').map((p) => p.trim());
      phones.push(...phoneList.filter((p) => p && p !== 'null'));
    }

    return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
  }

  private scanContacts(
    contacts: ContactData[],
    exceptions: MaintainerException[],
    allLabels: string[],
    otherContacts: OtherContactEntry[] = []
  ): MaintainerReportItem[] {
    const reportItems: MaintainerReportItem[] = [];

    // Global maps for duplicate detection
    const phoneMap = new Map<string, string[]>();
    const emailMap = new Map<string, string[]>();
    const urlMap = new Map<string, string[]>();
    const nameMap = new Map<string, string[]>();
    const resourceToNameMap = new Map<string, string>();

    contacts.forEach((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.trim();
      if (c.resourceName) {
        resourceToNameMap.set(c.resourceName, fullName || 'Unknown Name');
      }
      const fullNameLower = fullName.toLowerCase();
      if (fullNameLower) {
        if (!nameMap.has(fullNameLower)) nameMap.set(fullNameLower, []);
        nameMap.get(fullNameLower)!.push(c.resourceName!);
      }

      c.phones.forEach((p) => {
        const variations = this.phoneNormalizer.getAllNormalizedVariations(
          p.number
        );
        variations.forEach((v) => {
          if (!v) return; // Skip empty variations (prevents non-numeric phone collisions)
          if (!phoneMap.has(v)) phoneMap.set(v, []);
          phoneMap.get(v)!.push(c.resourceName!);
        });
      });

      c.emails.forEach((e) => {
        const email = e.value.trim();
        if (email) {
          if (!emailMap.has(email)) emailMap.set(email, []);
          emailMap.get(email)!.push(c.resourceName!);
        }
      });

      c.websites.forEach((w) => {
        const url = w.url.trim();
        if (url) {
          if (!urlMap.has(url)) urlMap.set(url, []);
          urlMap.get(url)!.push(c.resourceName!);
        }
      });
    });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const firstName = contact.firstName || '';
      const lastName = contact.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const fullNameLower = fullName.toLowerCase();

      // Check exceptions
      if (
        exceptions.some((e) => {
          if (e.name && fullName === e.name) return true;
          if (e.url && contact.websites.some((w) => w.url === e.url))
            return true;
          return false;
        })
      ) {
        continue;
      }

      const issues: MaintainerIssueType[] = [];
      const customMessages: Partial<Record<MaintainerIssueType, string>> = {};
      const duplicateDetails: Partial<
        Record<
          MaintainerIssueType,
          { value: string; otherContacts: { id: string; name: string }[] }[]
        >
      > = {};

      // 4.1 Hebrew contact
      const hasHebrew = [
        firstName,
        lastName,
        contact.company,
        contact.jobTitle,
        contact.label,
      ].some((f) => this.checkHebrew(f));
      if (hasHebrew) issues.push(MaintainerIssueType.CONTAINS_HEBREW);

      // 4.2 Empty name / Empty contact
      const isNameEmpty =
        !fullName ||
        fullNameLower === 'undefined' ||
        fullNameLower === 'null' ||
        !fullName.trim();

      if (isNameEmpty) {
        issues.push(MaintainerIssueType.EMPTY_NAME);

        // In case a contact don't have anything - No name, no email, no phone - write in the reasons: -EMPTY CONTACT
        if (contact.emails.length === 0 && contact.phones.length === 0) {
          issues.push(MaintainerIssueType.EMPTY_CONTACT);
        }
      } else {
        // Check for all lowercase or all uppercase name
        const isAllLower =
          fullName === fullName.toLowerCase() &&
          fullName !== fullName.toUpperCase();
        const isAllUpper =
          fullName === fullName.toUpperCase() &&
          fullName !== fullName.toLowerCase();

        if (isAllLower) issues.push(MaintainerIssueType.LOWER_CASE_NAME);
        if (isAllUpper) issues.push(MaintainerIssueType.UPPER_CASE_NAME);

        // 4.2.1 Invalid Name logic - handle labels and company suffixes
        let baseName = fullName;
        let detectedLabel = '';

        // Find if the name contains any label from allLabels
        // We look for the label in the name, usually preceded by a space
        const sortedLabels = [...allLabels].sort((a, b) => b.length - a.length); // Longest first to avoid partial matches
        for (const label of sortedLabels) {
          if (label.length < 2) continue; // Skip too short labels
          // Use regex for whole word match to avoid partial matches like "Job" in "JobInfo"
          const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const labelRegex = new RegExp(`\\s+${escapedLabel}\\b`, 'i');
          const match = fullName.match(labelRegex);
          if (match && match.index !== undefined) {
            baseName = fullName.substring(0, match.index).trim();
            detectedLabel = label;
            break;
          }
        }

        const cleanedBaseName = TextUtils.cleanName(baseName);
        if (cleanedBaseName !== baseName && cleanedBaseName) {
          // Rule: Skip if contact has "Life" or "Customer Service" label
          const activeLabels = contact.label
            .split(' | ')
            .filter((l) => l && !l.toLowerCase().startsWith('imported'));
          const skipLabels = ['Life', 'Customer Service'];
          const shouldSkip = activeLabels.some((l) => skipLabels.includes(l));

          // Rule: Skip if OSR convention matches
          const isOSR =
            activeLabels.includes('Job') &&
            contact.company === 'OSR' &&
            fullName.endsWith('OSR Job OSR');

          if (!shouldSkip && !isOSR) {
            const hasHidden = TextUtils.hasHiddenUnicode(fullName);
            const suggestedFullName = detectedLabel
              ? `${cleanedBaseName} ${detectedLabel}`
              : cleanedBaseName;

            if (hasHidden) {
              issues.push(
                MaintainerIssueType.CONTAINS_HIDDEN_UNICODE_CHARACTER
              );
              customMessages[
                MaintainerIssueType.CONTAINS_HIDDEN_UNICODE_CHARACTER
              ] =
                `CONTAINS_HIDDEN_UNICODE_CHARACTER - SHOULD BE: ${suggestedFullName}`;
            } else {
              issues.push(MaintainerIssueType.INVALID_NAME);
              customMessages[MaintainerIssueType.INVALID_NAME] =
                `INVALID NAME - SHOULD BE: ${suggestedFullName}`;
            }
          }
        }

        // 4.2.2 INVALID CONTACT - Name logic
        const lastNameWords = lastName.split(' ');
        let cleanedLastNameForContactVal = lastName;
        let detectedLastNameLabel = '';
        const sortedLabelsForNameVal = [...allLabels].sort(
          (a, b) => b.length - a.length
        );

        for (let i = 0; i < lastNameWords.length; i++) {
          const word = lastNameWords[i].toLowerCase();
          const hasMatch = sortedLabelsForNameVal.some(
            (l) => l.toLowerCase() === word
          );
          if (hasMatch) {
            cleanedLastNameForContactVal = lastNameWords.slice(0, i).join(' ');
            detectedLastNameLabel = lastNameWords.slice(i).join(' ');
            break;
          }
        }

        const cleanedFullNameForVal =
          `${firstName} ${cleanedLastNameForContactVal}`.trim();
        const formattedFullNameVal = TextUtils.cleanName(cleanedFullNameForVal);

        if (
          formattedFullNameVal !== cleanedFullNameForVal &&
          formattedFullNameVal
        ) {
          const hasHidden = TextUtils.hasHiddenUnicode(fullName);
          const suggestedFullName = detectedLastNameLabel
            ? `${formattedFullNameVal} ${detectedLastNameLabel}`
            : formattedFullNameVal;

          if (hasHidden) {
            // If we already added CONTAINS_HIDDEN_UNICODE_CHARACTER in 4.2.1, we don't need to add it again
            if (
              !issues.includes(
                MaintainerIssueType.CONTAINS_HIDDEN_UNICODE_CHARACTER
              )
            ) {
              issues.push(
                MaintainerIssueType.CONTAINS_HIDDEN_UNICODE_CHARACTER
              );
              customMessages[
                MaintainerIssueType.CONTAINS_HIDDEN_UNICODE_CHARACTER
              ] =
                `CONTAINS_HIDDEN_UNICODE_CHARACTER - SHOULD BE: ${suggestedFullName}`;
            }
          } else {
            issues.push(MaintainerIssueType.INVALID_CONTACT_NAME);
            customMessages[MaintainerIssueType.INVALID_CONTACT_NAME] =
              `INVALID CONTACT - Name: ${cleanedFullNameForVal} | SHOULD BE: ${suggestedFullName}`;
          }
        }
      }

      // 4.3 Duplicate contacts
      if (fullNameLower && (nameMap.get(fullNameLower)?.length || 0) > 1) {
        issues.push(MaintainerIssueType.DUPLICATE_CONTACTS);
      }

      // POSSIBLE DUPLICATE CONTACT
      for (let j = i + 1; j < contacts.length; j++) {
        const other = contacts[j];
        const otherFirstName = other.firstName || '';
        const otherLastName = other.lastName || '';
        const otherFullName = `${otherFirstName} ${otherLastName}`.trim();
        const otherFullNameLower = otherFullName.toLowerCase();

        if (fullNameLower && otherFullNameLower) {
          const namesEqual = fullNameLower === otherFullNameLower;
          const li1 = this.getLinkedInUrl(contact);
          const li2 = this.getLinkedInUrl(other);
          const sameLinkedIn = li1 && li2 && li1 === li2;
          const differentLinkedIn = li1 && li2 && li1 !== li2;

          let isPossibleDuplicate = false;

          if (namesEqual) {
            // If the names are EQUAL EXACTLY - AND - both of them have the same LinkedIn URL, ONLY then, its possible duplicate.
            if (sameLinkedIn) {
              isPossibleDuplicate = true;
            }
          } else {
            // Keep the rest of the logic of "POSSIBLE DUPLICATE CONTACT" the same.
            const words1 = fullNameLower
              .split(/\s+/)
              .filter((w) => w.length > 0)
              .slice(0, 2);
            const words2 = otherFullNameLower
              .split(/\s+/)
              .filter((w) => w.length > 0)
              .slice(0, 2);

            if (words1.length === 2 && words2.length === 2) {
              const nameMatch =
                words1.every((w) => words2.includes(w)) &&
                words2.every((w) => words1.includes(w));

              if (nameMatch && !differentLinkedIn) {
                isPossibleDuplicate = true;
              }
            }
          }

          if (isPossibleDuplicate) {
            issues.push(MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT);
            const thisResourceId = contact.resourceName?.split('/').pop() || '';
            const otherResourceId = other.resourceName?.split('/').pop() || '';
            const thisUrl = `https://contacts.google.com/person/${thisResourceId}`;
            const otherUrl = `https://contacts.google.com/person/${otherResourceId}`;

            const msg = `POSSIBLE DUPLICATE CONTACT:\n-${fullName} ${thisUrl}\n-${otherFullName} ${otherUrl}`;

            if (
              !customMessages[MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT]
            ) {
              customMessages[MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT] =
                msg;
            } else {
              customMessages[MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT] +=
                `\n-${msg}`;
            }
          }
        }
      }

      // 4.4 Missing/Wrong label
      const activeLabels = contact.label
        .split(' | ')
        .filter((l) => l && !l.toLowerCase().startsWith('imported'));

      const isHrOrJob = activeLabels.some((l) =>
        this.REQUIRED_URL_LABELS.includes(l)
      );

      const hasLabelInName = activeLabels.some(
        (l) => lastName.includes(l) || firstName.includes(l)
      );

      if (activeLabels.length === 0) {
        issues.push(MaintainerIssueType.MISSING_LABEL);
      } else {
        // NEED TO BE FIXED: Labels: HR, Contact: Avi Cohen (No HR label attached after the end of the last name)
        if (isHrOrJob && !hasLabelInName) {
          issues.push(MaintainerIssueType.WRONG_LABEL);
        }
      }

      if (activeLabels.length > 0 && !hasLabelInName) {
        issues.push(MaintainerIssueType.MISSING_LABEL);
      }

      // New Label Validations
      const hasSQLink = activeLabels.some(
        (l) => l === 'SQLink' || l === 'SQLLink'
      );
      const hasGotfriends = activeLabels.some((l) => l === 'Gotfriends');

      // 4.4.1 Twitter Label
      if (activeLabels.includes('Twitter')) {
        issues.push(MaintainerIssueType.INVALID_LABEL);
        customMessages[MaintainerIssueType.INVALID_LABEL] =
          'INVALID LABEL - SHOULD BE: Twitter X.ai';
      }

      // 4.4.2 SQLLink Validation
      if (activeLabels.includes('SQLLink')) {
        issues.push(MaintainerIssueType.INVALID_LABEL_NAME);
        customMessages[MaintainerIssueType.INVALID_LABEL_NAME] =
          'SQLLink is INVALID LABEL NAME - SHOULD BE: SQLink';
      }

      // 4.4.3 Mixed Labels (SQLink and Gotfriends)
      const hasMixedLabels =
        (hasSQLink && hasGotfriends) ||
        activeLabels.some(
          (l) =>
            (l.includes('SQLink') || l.includes('SQLLink')) &&
            l.includes('Gotfriends')
        );

      if (hasMixedLabels) {
        issues.push(MaintainerIssueType.INVALID_MIXED_LABELED);
      }

      // 4.5 & 4.6 Phones/Emails labels
      contact.phones.forEach((p) => {
        const label = (p.label || '').trim().toLowerCase();
        if (!label || label === 'undefined' || label === 'null') {
          issues.push(MaintainerIssueType.MISSING_PHONE_EMAIL_LABEL);
        } else if (
          [
            'home',
            'work',
            'other',
            'mobile',
            'main',
            'home fax',
            'work fax',
            'google voice',
            'pager',
          ].includes(label)
        ) {
          issues.push(MaintainerIssueType.INVALID_PHONE_EMAIL_LABEL);
        }

        // 4.5.1 Phone label matching company name
        if (contact.company && label !== contact.company.toLowerCase()) {
          issues.push(
            MaintainerIssueType.PHONE_LABEL_NOT_MATCH_TO_COMPANY_NAME
          );
        }

        // Phone number validation
        const phone = p.number;
        if (phone) {
          // 1. Check for Hebrew
          if (this.checkHebrew(phone)) {
            if (!issues.includes(MaintainerIssueType.CONTAINS_HEBREW)) {
              issues.push(MaintainerIssueType.CONTAINS_HEBREW);
            }
          }

          // 2. Check for separators if it contains numbers
          const hasNumbers = /\d/.test(phone);
          const hasSeparators = phone.includes('-');

          if (hasNumbers && hasSeparators) {
            issues.push(MaintainerIssueType.PHONE_CONTAINS_SEPARATORS);
            const msg = `PHONE CONTAINS SEPARATORS - ${phone}`;
            if (
              !customMessages[MaintainerIssueType.PHONE_CONTAINS_SEPARATORS]
            ) {
              customMessages[MaintainerIssueType.PHONE_CONTAINS_SEPARATORS] =
                msg;
            } else {
              customMessages[MaintainerIssueType.PHONE_CONTAINS_SEPARATORS] +=
                `\n-${msg}`;
            }
          }

          // 3. Check for spaces if it contains only numbers and spaces
          const hasSpaces = phone.includes(' ');
          const hasLetters = /[a-zA-Z]/.test(phone);
          const cleanedPhone = phone.replace(/\s/g, '');
          const isOnlyNumbersAndSpaces =
            /^\+?\d+$/.test(cleanedPhone) && hasSpaces && !hasLetters;

          if (isOnlyNumbersAndSpaces) {
            issues.push(MaintainerIssueType.PHONE_CONTAIN_SPACES);
            const msg = `PHONE_CONTAIN_SPACES: ${phone}`;
            if (!customMessages[MaintainerIssueType.PHONE_CONTAIN_SPACES]) {
              customMessages[MaintainerIssueType.PHONE_CONTAIN_SPACES] = msg;
            } else {
              customMessages[MaintainerIssueType.PHONE_CONTAIN_SPACES] +=
                `\n-${msg}`;
            }
          }

          // 4. Check for global prefix +972 or 972
          if (phone.startsWith('+972') || phone.startsWith('972')) {
            if (!issues.includes(MaintainerIssueType.PHONE_GLOBAL_PREFIX)) {
              issues.push(MaintainerIssueType.PHONE_GLOBAL_PREFIX);
            }
          }
        }
      });

      contact.emails.forEach((e) => {
        const label = (e.label || '').trim().toLowerCase();
        if (!label || label === 'undefined' || label === 'null') {
          issues.push(MaintainerIssueType.MISSING_PHONE_EMAIL_LABEL);
        } else if (
          [
            'home',
            'work',
            'other',
            'mobile',
            'main',
            'home fax',
            'work fax',
            'google voice',
            'pager',
          ].includes(label)
        ) {
          issues.push(MaintainerIssueType.INVALID_PHONE_EMAIL_LABEL);
        }

        // 4.6.1 Email label matching company name
        if (contact.company && label !== contact.company.toLowerCase()) {
          issues.push(
            MaintainerIssueType.EMAIL_LABEL_NOT_MATCH_TO_COMPANY_NAME
          );
        }
      });

      // 4.7, 4.8, 4.13, 4.14 URL
      contact.websites.forEach((w) => {
        const label = (w.label || '').trim();
        const labelLower = label.toLowerCase();
        const url = w.url.toLowerCase().trim();

        if (!label || labelLower === 'undefined' || labelLower === 'null') {
          issues.push(MaintainerIssueType.MISSING_URL_LABEL);
        } else {
          if (label !== 'LinkedIn') {
            issues.push(MaintainerIssueType.INVALID_URL_LABEL);
          }
        }

        if (
          !url.includes('linkedin.com/in') ||
          url.includes('https://www.linkedin.com')
        ) {
          issues.push(MaintainerIssueType.INVALID_URL);
        }
      });

      // 4.9 Duplicate phone (Global/Single)
      const phoneValues = contact.phones.map((p) => p.number.trim());
      const phoneCounts = phoneValues.reduce(
        (acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicatePhones = Object.keys(phoneCounts).filter(
        (val) => phoneCounts[val] > 1
      );
      if (singleDuplicatePhones.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_PHONE_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_PHONE_SINGLE] =
          singleDuplicatePhones.map((val) => ({
            value: val,
            otherContacts: [],
          }));
      }

      const globalDuplicatePhones = phoneValues.filter(
        (val) => (phoneMap.get(val)?.length || 0) > 1
      );
      const uniqueGlobalDuplicatePhones = [...new Set(globalDuplicatePhones)];
      if (uniqueGlobalDuplicatePhones.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_PHONE_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_PHONE_GLOBAL] =
          uniqueGlobalDuplicatePhones.map((val) => ({
            value: val,
            otherContacts: (phoneMap.get(val) || [])
              .filter((id) => id !== contact.resourceName)
              .map((id) => ({
                id,
                name: resourceToNameMap.get(id) || 'Unknown',
              })),
          }));
      }

      // 4.10 Duplicate email (Global/Single)
      const emailValues = contact.emails.map((e) => e.value.trim());
      const emailCounts = emailValues.reduce(
        (acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicateEmails = Object.keys(emailCounts).filter(
        (val) => emailCounts[val] > 1
      );
      if (singleDuplicateEmails.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_EMAIL_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_EMAIL_SINGLE] =
          singleDuplicateEmails.map((val) => ({
            value: val,
            otherContacts: [],
          }));
      }

      const globalDuplicateEmails = emailValues.filter(
        (val) => (emailMap.get(val)?.length || 0) > 1
      );
      const uniqueGlobalDuplicateEmails = [...new Set(globalDuplicateEmails)];
      if (uniqueGlobalDuplicateEmails.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_EMAIL_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_EMAIL_GLOBAL] =
          uniqueGlobalDuplicateEmails.map((val) => ({
            value: val,
            otherContacts: (emailMap.get(val) || [])
              .filter((id) => id !== contact.resourceName)
              .map((id) => ({
                id,
                name: resourceToNameMap.get(id) || 'Unknown',
              })),
          }));
      }

      // 4.11 Duplicate URL (Global/Single)
      const urlValues = contact.websites.map((w) => w.url.trim());
      const urlCounts = urlValues.reduce(
        (acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicateUrls = Object.keys(urlCounts).filter(
        (val) => urlCounts[val] > 1
      );
      if (singleDuplicateUrls.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_URL_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_URL_SINGLE] =
          singleDuplicateUrls.map((val) => ({
            value: val,
            otherContacts: [],
          }));
      }

      const globalDuplicateUrls = urlValues.filter(
        (val) => (urlMap.get(val)?.length || 0) > 1
      );
      const uniqueGlobalDuplicateUrls = [...new Set(globalDuplicateUrls)];
      if (uniqueGlobalDuplicateUrls.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_URL_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_URL_GLOBAL] =
          uniqueGlobalDuplicateUrls.map((val) => ({
            value: val,
            otherContacts: (urlMap.get(val) || [])
              .filter((id) => id !== contact.resourceName)
              .map((id) => ({
                id,
                name: resourceToNameMap.get(id) || 'Unknown',
              })),
          }));
      }

      // 4.15 Company name refactoring
      const currentCompany = contact.company || '';
      // Check last name too as per rule
      const lastNameParts = lastName.split(' ');
      let companyInLastName = '';

      // Find if last name contains a label (HR/Job/LinkedIn) and extract everything after it
      const labelIndex = lastNameParts.findIndex(
        (p) => p === 'HR' || p === 'Job' || p === 'LinkedIn'
      );
      if (labelIndex !== -1 && labelIndex < lastNameParts.length - 1) {
        companyInLastName = lastNameParts.slice(labelIndex + 1).join(' ');
      } else if (lastNameParts.length > 2) {
        // Fallback to legacy logic: everything after the first two words
        companyInLastName = lastNameParts.slice(2).join(' ');
      }

      const companyToTest = currentCompany || companyInLastName;
      let suggestedClean = '';

      if (companyToTest && (isHrOrJob || activeLabels.includes('LinkedIn'))) {
        const suggested = calculateFormattedCompany(
          companyToTest,
          undefined,
          firstName,
          lastName
        );
        // Suggested starts with "LinkedIn "
        suggestedClean = suggested.startsWith('LinkedIn ')
          ? suggested.substring(9)
          : suggested;

        // Use the contact's own label if it's HR or Job
        const specialLabel = activeLabels.find(
          (l) => l === 'HR' || l === 'Job'
        );
        const prefix = specialLabel || 'LinkedIn';

        // If the suggested company is not just the prefix itself
        if (suggestedClean && suggestedClean !== 'LinkedIn') {
          const finalSuggested = `${prefix} ${suggestedClean}`;

          // CRITICAL FIX: Check if the full name already contains the correct suffix or if the current company matches
          const currentSuffix = `${prefix} ${companyToTest}`;
          const isAlreadyCorrect =
            fullName.endsWith(finalSuggested) ||
            (fullName.endsWith(currentSuffix) &&
              currentSuffix === finalSuggested) ||
            (currentCompany === suggestedClean && fullName.includes(prefix));

          if (
            !isAlreadyCorrect &&
            suggestedClean !== companyToTest &&
            companyToTest !== 'LinkedIn'
          ) {
            issues.push(MaintainerIssueType.OUTDATED_COMPANY_NAME);
            customMessages[MaintainerIssueType.OUTDATED_COMPANY_NAME] =
              `OUTDATED COMPANY NAME - SHOULD BE: ${finalSuggested}`;
          }
        }
      }

      // 4.12 Missing URL for specific labels
      const hasProperName = firstName.length > 1 && lastName.length > 1;
      const hasLinkedInUrl = contact.websites.some(
        (w) =>
          w.label === 'LinkedIn' ||
          w.url.toLowerCase().includes('linkedin.com/in')
      );
      // and the family name not equal to the label name
      const familyNameNotLabel = !activeLabels.includes(lastName);

      if (!hasLinkedInUrl && hasProperName && familyNameNotLabel) {
        activeLabels.forEach((label) => {
          if (this.REQUIRED_URL_LABELS.includes(label)) {
            if (
              !issues.includes(
                MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL
              )
            ) {
              issues.push(MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL);
              customMessages[
                MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL
              ] = '';
            }

            const msg = `-${MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL.replace(
              '#LABEL#',
              label
            )}`;
            const currentMsg =
              customMessages[
                MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL
              ] || '';
            if (!currentMsg.includes(label)) {
              customMessages[
                MaintainerIssueType.MISSING_REQUIRED_URL_FOR_LABEL
              ] = currentMsg ? `${currentMsg}\n${msg}` : msg;
            }
          }
        });
      }

      // 4.15.2 INVALID CONTACT - Company logic
      const hasRelevantLabel = isHrOrJob || activeLabels.includes('LinkedIn');

      if (hasRelevantLabel) {
        const companyWords = currentCompany.split(' ');
        let cleanedCompanyForVal = currentCompany;
        const sortedLabelsForCompanyVal = [...allLabels].sort(
          (a, b) => b.length - a.length
        );

        // Skip if company name equals a label
        const isCompanyLabelMatch = allLabels.some(
          (l) => l.toLowerCase() === currentCompany.toLowerCase()
        );

        if (!isCompanyLabelMatch) {
          for (let i = 0; i < companyWords.length; i++) {
            const word = companyWords[i].toLowerCase();
            const hasMatch = sortedLabelsForCompanyVal.some(
              (l) => l.toLowerCase() === word
            );
            if (hasMatch) {
              cleanedCompanyForVal = companyWords.slice(0, i).join(' ');
              break;
            }
          }

          const formattedCompanyVal = calculateFormattedCompany(
            cleanedCompanyForVal,
            undefined,
            firstName,
            lastName
          );

          const suggestedCompanyClean = formattedCompanyVal.startsWith(
            'LinkedIn '
          )
            ? formattedCompanyVal.substring(9)
            : formattedCompanyVal === 'LinkedIn'
              ? ''
              : formattedCompanyVal;

          if (
            suggestedCompanyClean !== cleanedCompanyForVal &&
            suggestedCompanyClean
          ) {
            issues.push(MaintainerIssueType.INVALID_CONTACT_COMPANY);
            customMessages[MaintainerIssueType.INVALID_CONTACT_COMPANY] =
              `INVALID CONTACT - Company: ${cleanedCompanyForVal} | SHOULD BE: ${suggestedCompanyClean}`;
          }
        }
      }

      // 4.16 Notes contains break lines
      if (
        contact.biography &&
        (contact.biography.includes('\n\n') ||
          contact.biography.includes('\r\n\r\n'))
      ) {
        issues.push(MaintainerIssueType.NOTES_CONTAINS_BREAK_LINES);
      }

      // 4.17 Trailing white space
      const fieldsWithSpaces: string[] = [];
      if (firstName !== firstName.trim()) fieldsWithSpaces.push('First Name');
      if (lastName !== lastName.trim()) fieldsWithSpaces.push('Last Name');
      if (contact.company !== contact.company.trim())
        fieldsWithSpaces.push('Company');
      if (contact.jobTitle !== contact.jobTitle.trim())
        fieldsWithSpaces.push('Job Title');

      contact.phones.forEach((p) => {
        if (p.number && p.number !== p.number.trim())
          fieldsWithSpaces.push('Phone Number');
        if (p.label && p.label !== p.label.trim())
          fieldsWithSpaces.push('Phone Label');
      });
      contact.emails.forEach((e) => {
        if (e.value && e.value !== e.value.trim())
          fieldsWithSpaces.push('Email');
        if (e.label && e.label !== e.label.trim())
          fieldsWithSpaces.push('Email Label');
      });
      contact.websites.forEach((w) => {
        if (w.url && w.url !== w.url.trim()) fieldsWithSpaces.push('URL');
        if (w.label && w.label !== w.label.trim())
          fieldsWithSpaces.push('URL Label');
      });

      if (fieldsWithSpaces.length > 0) {
        const uniqueFields = [...new Set(fieldsWithSpaces)];
        issues.push(MaintainerIssueType.CONTAINS_WHITE_SPACES);
        customMessages[MaintainerIssueType.CONTAINS_WHITE_SPACES] =
          `CONTAINS WHITE SPACES IN FIELDS: ${uniqueFields.join(', ')}`;
      }

      // 4.18 Multiple spaces in field
      const fieldsWithMultipleSpaces: string[] = [];
      const multiSpaceRegex = /  +/; // Matches 2 or more spaces

      if (multiSpaceRegex.test(firstName))
        fieldsWithMultipleSpaces.push('First Name');
      if (multiSpaceRegex.test(lastName))
        fieldsWithMultipleSpaces.push('Last Name');
      if (multiSpaceRegex.test(contact.company))
        fieldsWithMultipleSpaces.push('Company');
      if (multiSpaceRegex.test(contact.jobTitle))
        fieldsWithMultipleSpaces.push('Job Title');

      if (fieldsWithMultipleSpaces.length > 0) {
        const uniqueFields = [...new Set(fieldsWithMultipleSpaces)];
        issues.push(MaintainerIssueType.CONTAINS_MULTIPLE_SPACES);
        customMessages[MaintainerIssueType.CONTAINS_MULTIPLE_SPACES] =
          `CONTAINS MULTIPLE SPACES IN FIELD: ${uniqueFields.join(', ')}`;
      }

      // New Sub-Label Validations (Date, Tattoo, etc.)
      const baseLabels = ['Date', 'Tattoo'];

      baseLabels.forEach((baseLabel) => {
        const checkFields = [
          contact.company,
          lastName,
          ...contact.phones.map((p) => p.label),
          ...contact.emails.map((e) => e.label),
        ].filter((f) => !!f);

        for (const field of checkFields) {
          const words = field.split(/[\s-]+/);
          const baseLabelIndex = words.indexOf(baseLabel);

          if (baseLabelIndex !== -1) {
            const isLastWord = baseLabelIndex === words.length - 1;

            if (isLastWord) {
              // Case 1: MISSING SUB-LABEL (At the end or stand alone)
              if (!issues.includes(MaintainerIssueType.MISSING_SUB_LABEL)) {
                issues.push(MaintainerIssueType.MISSING_SUB_LABEL);
                customMessages[MaintainerIssueType.MISSING_SUB_LABEL] =
                  MaintainerIssueType.MISSING_SUB_LABEL.replace(
                    '#LABEL#',
                    baseLabel
                  );
              }
              if (
                !issues.includes(
                  MaintainerIssueType.INVALID_ORDER_FOR_SUB_LABEL
                )
              ) {
                issues.push(MaintainerIssueType.INVALID_ORDER_FOR_SUB_LABEL);
              }
              break;
            } else {
              // Case 2: Has something after it (Sub-Label) - Verify if labels are present
              const subLabel = words[baseLabelIndex + 1];
              const missingLabels: string[] = [];

              if (!activeLabels.includes(baseLabel))
                missingLabels.push(baseLabel);
              if (!activeLabels.includes(subLabel))
                missingLabels.push(subLabel);

              if (missingLabels.length > 0) {
                if (!issues.includes(MaintainerIssueType.MISSING_SUB_LABEL)) {
                  issues.push(MaintainerIssueType.MISSING_SUB_LABEL);
                  customMessages[MaintainerIssueType.MISSING_SUB_LABEL] = '';
                }

                missingLabels.forEach((label) => {
                  const msg = MaintainerIssueType.MISSING_SUB_LABEL.replace(
                    '#LABEL#',
                    label
                  );
                  const currentMsg =
                    customMessages[MaintainerIssueType.MISSING_SUB_LABEL] || '';
                  if (!currentMsg.includes(label)) {
                    customMessages[MaintainerIssueType.MISSING_SUB_LABEL] =
                      currentMsg ? `${currentMsg}\n-${msg}` : msg;
                  }
                });
              }
            }
          }
        }
      });

      // POSSIBLE DUPLICATE CONTACTS BY NOTES
      const extracted = this.extractDataFromNotes(contact.biography || '');
      const noteDuplicateMessages: string[] = [];

      extracted.emails.forEach((email) => {
        const matches = (emailMap.get(email) || []).filter(
          (id) => id !== contact.resourceName
        );
        if (matches.length > 0) {
          if (
            !issues.includes(
              MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES
            )
          ) {
            issues.push(
              MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES
            );
          }
          let msg = `-POSSIBLE DUPLICATE CONTACTS BY NOTES - Email: ${email}`;
          matches.forEach((id) => {
            const matchContact = contacts.find((c) => c.resourceName === id);
            const name = matchContact
              ? `${matchContact.firstName} ${matchContact.lastName}`.trim() ||
                'Unknown'
              : 'Unknown';
            const resourceId = id.split('/').pop() || '';
            msg += `\n-${name} https://contacts.google.com/person/${resourceId}`;
          });
          noteDuplicateMessages.push(msg);
        }
      });

      extracted.phones.forEach((phone) => {
        const variations =
          this.phoneNormalizer.getAllNormalizedVariations(phone);
        const allMatches: string[] = [];
        variations.forEach((v) => {
          if (!v) return;
          const matches = (phoneMap.get(v) || []).filter(
            (id) => id !== contact.resourceName
          );
          allMatches.push(...matches);
        });

        const uniqueMatches = [...new Set(allMatches)];

        if (uniqueMatches.length > 0) {
          if (
            !issues.includes(
              MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES
            )
          ) {
            issues.push(
              MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES
            );
          }
          let msg = `-POSSIBLE DUPLICATE CONTACTS BY NOTES - Phone: ${phone}`;
          uniqueMatches.forEach((id) => {
            const matchContact = contacts.find((c) => c.resourceName === id);
            const name = matchContact
              ? `${matchContact.firstName} ${matchContact.lastName}`.trim() ||
                'Unknown'
              : 'Unknown';
            const resourceId = id.split('/').pop() || '';
            msg += `\n-${name} https://contacts.google.com/person/${resourceId}`;
          });
          noteDuplicateMessages.push(msg);
        }
      });

      if (noteDuplicateMessages.length > 0) {
        customMessages[
          MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES
        ] = noteDuplicateMessages.join('\n');
      }

      if (issues.length > 0) {
        reportItems.push({
          contact: {
            ...contact,
            fullName,
            biography: contact.biography || '',
          },
          issues: [...new Set(issues)],
          customIssueMessages: customMessages,
          duplicateDetails:
            duplicateDetails as MaintainerReportItem['duplicateDetails'],
        });
      }
    }

    // Add other contacts to the report
    for (const other of otherContacts) {
      reportItems.push({
        contact: {
          firstName: '',
          lastName: '',
          fullName: other.displayName || 'Unknown Name',
          label: '',
          phones: other.phones.map((p) => ({ number: p, label: '' })),
          emails: other.emails.map((e) => ({ value: e, label: '' })),
          websites: [],
          company: '',
          jobTitle: '',
          biography: '',
          resourceName: other.resourceName,
        },
        issues: [MaintainerIssueType.OTHER_CONTACT],
      });
    }

    return reportItems;
  }

  private async generateReport(
    items: MaintainerReportItem[],
    reportPath: string,
    backupStats: {
      contactCount: number;
      otherContactCount: number;
      fileCount: number;
    }
  ): Promise<void> {
    const issueOrder = Object.values(MaintainerIssueType);

    // Sort items based on the order of 4.x points (which is the order in MaintainerIssueType)
    items.sort((a, b) => {
      const getMinIndex = (issueList: MaintainerIssueType[]): number => {
        const indices = issueList.map((issue) => issueOrder.indexOf(issue));
        return Math.min(...indices);
      };
      return getMinIndex(a.issues) - getMinIndex(b.issues);
    });

    let report = `SCAN_CONTACTS_REPORT\n`;
    report += `Date: ${new Date().toLocaleString()}\n`;
    report += `==========================\n\n`;

    report += `ISSUES REPORT:\n`;
    report += `=======================\n`;
    const totalIssues = items.reduce(
      (sum, item) => sum + item.issues.length,
      0
    );
    const contactsToFixPercentage = FormatUtils.calculatePercentage(
      items.length,
      backupStats.contactCount
    );
    report += `Contacts to Fix: ${new Intl.NumberFormat('en-US').format(items.length)} (${contactsToFixPercentage})\n`;
    report += `Issues to fix:   ${new Intl.NumberFormat('en-US').format(totalIssues)}\n`;
    report += `Total contacts:  ${new Intl.NumberFormat('en-US').format(backupStats.contactCount)}\n`;
    report += `=======================\n`;

    items.forEach((item, index) => {
      const indexDisplay = FormatUtils.formatNumberWithLeadingZeros(
        index + 1,
        6
      );
      const resourceId = item.contact.resourceName?.split('/').pop() || '';
      const contactUrl = resourceId
        ? `https://contacts.google.com/person/${resourceId}`
        : '';

      if (index > 0) {
        report += '=======================\n';
      }
      report += `Index: ${indexDisplay}\n`;
      report += `Full name: ${item.contact.fullName}\n`;

      // Point 1: If name is empty, display data we DO have
      if (
        item.issues.includes(MaintainerIssueType.EMPTY_NAME) ||
        item.issues.includes(MaintainerIssueType.OTHER_CONTACT)
      ) {
        if (item.contact.emails.length > 0) {
          report += `Email: ${item.contact.emails.map((e) => e.value).join(', ')}\n`;
        }
        if (
          item.issues.includes(MaintainerIssueType.EMPTY_NAME) &&
          item.contact.biography
        ) {
          report += `Notes: \n${item.contact.biography}\n`;
        }
      }

      if (contactUrl) {
        report += `Link: ${contactUrl}\n`;
      }

      report += `Reasons:\n`;

      item.issues.forEach((issue) => {
        let message = item.customIssueMessages?.[issue] || `-${issue}`;

        const isDuplicateIssue =
          issue.startsWith('DUPLICATE') && !issue.includes('CONTACTS');

        if (isDuplicateIssue && item.duplicateDetails?.[issue]) {
          const details = item.duplicateDetails[issue]!;
          details.forEach((detail) => {
            let detailMessage = message.startsWith('-')
              ? `${message}`
              : `-${message}`;
            if (!detailMessage.endsWith(':')) detailMessage += ':';
            report += `${detailMessage} ${detail.value}\n`;

            if (issue.endsWith('GLOBAL')) {
              detail.otherContacts.forEach((other) => {
                const otherResourceId = other.id.split('/').pop() || '';
                report += `-In ${other.name} https://contacts.google.com/person/${otherResourceId}\n`;
              });
            }
          });
        } else {
          report += message.startsWith('-') ? `${message}\n` : `-${message}\n`;
        }
      });
    });
    report += '=======================\n\n';

    report += `BACKUP REPORT:\n`;
    report += `=======================\n`;
    report += `Contacts:       ${FormatUtils.formatNumberWithLeadingZeros(backupStats.contactCount, 6)}\n`;
    report += `Other Contacts: ${FormatUtils.formatNumberWithLeadingZeros(backupStats.otherContactCount, 6)}\n`;
    report += `Files:          ${backupStats.fileCount}\n`;
    report += `=======================\n`;

    await this.safeWriteFile(reportPath, report);
  }
}

export const googleContactsMaintainerScript: Script = {
  metadata: {
    name: 'Google Contacts Maintainer',
    description: 'Scan and report issues in Google Contacts',
    version: '2.0.0',
    category: 'maintenance',
    requiresAuth: true,
    emoji: '🔍',
  },
  run: async (): Promise<void> => {
    const { container } = await import('../di/container');
    const script = container.get(GoogleContactsMaintainerScript);
    await script.run();
  },
};
