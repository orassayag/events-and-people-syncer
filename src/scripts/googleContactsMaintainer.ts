import { injectable, inject } from 'inversify';
import { google } from 'googleapis';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  OAuth2Client,
  Script,
  ContactData,
  TokenData,
  MaintainerException,
  MaintainerReportItem,
  OtherContactEntry,
} from '../types';
import { MaintainerIssueType } from '../types';
import { Logger, SyncLogger } from '../logging';
import { AuthService } from '../services/auth';
import { RegexPatterns } from '../regex';
import { calculateFormattedCompany } from '../utils/companyFormatter';
import { TextUtils } from '../utils/textUtils';
import { SyncStatusBar } from '../flow/syncStatusBar';
import { FormatUtils } from '../constants';

import { OtherContactsFetcher } from '../services/otherContacts';

@injectable()
export class GoogleContactsMaintainerScript implements Script {
  private readonly logger: SyncLogger;
  private readonly uiLogger: Logger;
  private readonly desktopPath: string;
  private readonly reportFileName: string = 'SCAN_CONTACTS_REPORT.txt';
  private readonly exceptionsFile: string;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(OtherContactsFetcher)
    private otherContactsFetcher: OtherContactsFetcher
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
    const isAuto = process.argv.some((arg) =>
      ['--auto', 'AUTO', 'auto'].includes(arg)
    );
    const reportPath = join(this.desktopPath, this.reportFileName);

    this.uiLogger.display('Google Contacts Maintainer');
    await this.logger.initialize();

    try {
      if (isAuto) {
        this.uiLogger.displayInfo(
          'Automatic run detected. Refreshing token...'
        );
        await this.refreshToken();
      }

      await this.validateAuth();
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

      const exceptions = this.loadExceptions();
      this.uiLogger.displayInfo(`Loaded ${exceptions.length} exceptions.`);

      const reportItems = this.scanContacts(
        contacts,
        exceptions,
        allLabels,
        otherContacts
      );

      if (reportItems.length === 0) {
        this.uiLogger.displaySuccess('No issues found in contacts!');
        if (existsSync(reportPath)) {
          unlinkSync(reportPath);
          this.uiLogger.displayInfo('Previous report file removed.');
        }
        return;
      }

      this.generateReport(reportItems, reportPath);
      this.uiLogger.displaySuccess(
        `Scan complete. ${reportItems.length} contacts have issues.`
      );
      this.uiLogger.displaySuccess(`Report saved to: ${reportPath}`);
    } catch (error) {
      this.uiLogger.error('Script failed', error as Error);
      await this.logger.logError(`Script failed: ${(error as Error).message}`);
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      const { credentials } = await this.auth.refreshAccessToken();
      this.auth.setCredentials(credentials);
      const authService = new AuthService();
      await authService.saveToken(credentials as TokenData);
      this.uiLogger.displayInfo('Token refreshed successfully.');
    } catch (error) {
      this.uiLogger.error('Failed to refresh token', error as Error);
      throw error;
    }
  }

  private async validateAuth(): Promise<void> {
    const authService = new AuthService();
    await authService.authorize();
  }

  private checkHebrew(text: string | undefined): boolean {
    return !!text && RegexPatterns.HEBREW.test(text);
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

    contacts.forEach((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
      if (fullName) {
        if (!nameMap.has(fullName)) nameMap.set(fullName, []);
        nameMap.get(fullName)!.push(c.resourceName!);
      }

      c.phones.forEach((p) => {
        const num = p.number.replace(/\D/g, '');
        if (num) {
          if (!phoneMap.has(num)) phoneMap.set(num, []);
          phoneMap.get(num)!.push(c.resourceName!);
        }
      });

      c.emails.forEach((e) => {
        const email = e.value.toLowerCase().trim();
        if (email) {
          if (!emailMap.has(email)) emailMap.set(email, []);
          emailMap.get(email)!.push(c.resourceName!);
        }
      });

      c.websites.forEach((w) => {
        const url = w.url.toLowerCase().trim();
        if (url) {
          if (!urlMap.has(url)) urlMap.set(url, []);
          urlMap.get(url)!.push(c.resourceName!);
        }
      });
    });

    for (const contact of contacts) {
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
          { value: string; otherContactIds: string[] }[]
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

      // 4.2 Empty name
      if (
        !fullName ||
        fullNameLower === 'undefined' ||
        fullNameLower === 'null' ||
        !fullName.trim()
      ) {
        issues.push(MaintainerIssueType.EMPTY_NAME);
      } else {
        // 4.2.1 Invalid Name logic - handle labels and company suffixes
        let baseName = fullName;

        // Find if the name contains any label from allLabels
        // We look for the label in the name, usually preceded by a space
        const sortedLabels = [...allLabels].sort((a, b) => b.length - a.length); // Longest first to avoid partial matches
        for (const label of sortedLabels) {
          if (label.length < 2) continue; // Skip too short labels
          const labelIndex = fullName.indexOf(` ${label}`);
          if (labelIndex !== -1) {
            baseName = fullName.substring(0, labelIndex).trim();
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
            issues.push(MaintainerIssueType.INVALID_NAME);
            customMessages[MaintainerIssueType.INVALID_NAME] =
              `INVALID NAME - SHOULD BE: ${cleanedBaseName}`;
          }
        }

        // 4.2.2 INVALID CONTACT - Name logic
        const lastNameWords = lastName.split(' ');
        let cleanedLastNameForContactVal = lastName;
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
          issues.push(MaintainerIssueType.INVALID_CONTACT_NAME);
          customMessages[MaintainerIssueType.INVALID_CONTACT_NAME] =
            `INVALID CONTACT - Name: ${formattedFullNameVal}`;
        }
      }

      // 4.3 Duplicate contacts
      if (fullNameLower && (nameMap.get(fullNameLower)?.length || 0) > 1) {
        issues.push(MaintainerIssueType.DUPLICATE_CONTACTS);
      }

      // 4.4 Missing/Wrong label
      const activeLabels = contact.label
        .split(' | ')
        .filter((l) => l && !l.toLowerCase().startsWith('imported'));

      const isHrOrJob = activeLabels.some(
        (l) => l === 'HR' || l === 'Job' || l === 'LinkedIn'
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

          // 3. Check for global prefix +972 or 972
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
      });

      // 4.7, 4.8, 4.13, 4.14 URL
      contact.websites.forEach((w) => {
        const label = (w.label || '').trim();
        const labelLower = label.toLowerCase();
        const url = w.url.toLowerCase().trim();

        if (!label || labelLower === 'undefined' || labelLower === 'null') {
          issues.push(MaintainerIssueType.MISSING_URL_LABEL);
        } else {
          if (['profile', 'blog', 'home page', 'work'].includes(labelLower)) {
            issues.push(MaintainerIssueType.INVALID_URL_LABEL);
          }
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
      const phoneNumbers = contact.phones.map((p) =>
        p.number.replace(/\D/g, '')
      );
      const phoneCounts = phoneNumbers.reduce(
        (acc, num) => {
          acc[num] = (acc[num] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicatePhones = Object.keys(phoneCounts).filter(
        (num) => phoneCounts[num] > 1
      );
      if (singleDuplicatePhones.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_PHONE_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_PHONE_SINGLE] =
          singleDuplicatePhones.map((num) => ({
            value:
              contact.phones.find((p) => p.number.replace(/\D/g, '') === num)
                ?.number || num,
            otherContactIds: [],
          }));
      }

      const globalDuplicatePhones = phoneNumbers.filter(
        (num) => (phoneMap.get(num)?.length || 0) > 1
      );
      const uniqueGlobalDuplicatePhones = [...new Set(globalDuplicatePhones)];
      if (uniqueGlobalDuplicatePhones.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_PHONE_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_PHONE_GLOBAL] =
          uniqueGlobalDuplicatePhones.map((num) => ({
            value:
              contact.phones.find((p) => p.number.replace(/\D/g, '') === num)
                ?.number || num,
            otherContactIds: (phoneMap.get(num) || []).filter(
              (id) => id !== contact.resourceName
            ),
          }));
      }

      // 4.10 Duplicate email (Global/Single)
      const emails = contact.emails.map((e) => e.value.toLowerCase().trim());
      const emailCounts = emails.reduce(
        (acc, email) => {
          acc[email] = (acc[email] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicateEmails = Object.keys(emailCounts).filter(
        (email) => emailCounts[email] > 1
      );
      if (singleDuplicateEmails.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_EMAIL_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_EMAIL_SINGLE] =
          singleDuplicateEmails.map((email) => ({
            value:
              contact.emails.find((e) => e.value.toLowerCase().trim() === email)
                ?.value || email,
            otherContactIds: [],
          }));
      }

      const globalDuplicateEmails = emails.filter(
        (email) => (emailMap.get(email)?.length || 0) > 1
      );
      const uniqueGlobalDuplicateEmails = [...new Set(globalDuplicateEmails)];
      if (uniqueGlobalDuplicateEmails.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_EMAIL_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_EMAIL_GLOBAL] =
          uniqueGlobalDuplicateEmails.map((email) => ({
            value:
              contact.emails.find((e) => e.value.toLowerCase().trim() === email)
                ?.value || email,
            otherContactIds: (emailMap.get(email) || []).filter(
              (id) => id !== contact.resourceName
            ),
          }));
      }

      // 4.11 Duplicate URL (Global/Single)
      const urls = contact.websites.map((w) => w.url.toLowerCase().trim());
      const urlCounts = urls.reduce(
        (acc, url) => {
          acc[url] = (acc[url] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const singleDuplicateUrls = Object.keys(urlCounts).filter(
        (url) => urlCounts[url] > 1
      );
      if (singleDuplicateUrls.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_URL_SINGLE);
        duplicateDetails[MaintainerIssueType.DUPLICATE_URL_SINGLE] =
          singleDuplicateUrls.map((url) => ({
            value:
              contact.websites.find((w) => w.url.toLowerCase().trim() === url)
                ?.url || url,
            otherContactIds: [],
          }));
      }

      const globalDuplicateUrls = urls.filter(
        (url) => (urlMap.get(url)?.length || 0) > 1
      );
      const uniqueGlobalDuplicateUrls = [...new Set(globalDuplicateUrls)];
      if (uniqueGlobalDuplicateUrls.length > 0) {
        issues.push(MaintainerIssueType.DUPLICATE_URL_GLOBAL);
        duplicateDetails[MaintainerIssueType.DUPLICATE_URL_GLOBAL] =
          uniqueGlobalDuplicateUrls.map((url) => ({
            value:
              contact.websites.find((w) => w.url.toLowerCase().trim() === url)
                ?.url || url,
            otherContactIds: (urlMap.get(url) || []).filter(
              (id) => id !== contact.resourceName
            ),
          }));
      }

      // 4.12 Missing URL for HR/Job label
      const hasHrOrJobLabel = activeLabels.some(
        (l) => l === 'HR' || l === 'Job'
      );
      const hasProperName = firstName.length > 1 && lastName.length > 1;
      const hasLinkedInUrl = contact.websites.some(
        (w) => w.label === 'LinkedIn'
      );
      // and the family name not equal to the label name
      const familyNameNotLabel = !activeLabels.includes(lastName);

      if (
        hasHrOrJobLabel &&
        !hasLinkedInUrl &&
        hasProperName &&
        familyNameNotLabel
      ) {
        issues.push(MaintainerIssueType.MISSING_REQUIRED_URL_FOR_HR_JOB_LABEL);
      }

      // 4.15 Company name refactoring
      const currentCompany = contact.company || '';
      // Check last name too as per rule
      const lastNameParts = lastName.split(' ');
      const companyInLastName =
        lastNameParts.length > 2 ? lastNameParts.slice(2).join(' ') : '';

      const companyToTest = currentCompany || companyInLastName;
      if (companyToTest && (isHrOrJob || activeLabels.includes('LinkedIn'))) {
        const suggested = calculateFormattedCompany(
          companyToTest,
          undefined,
          firstName,
          lastName
        );
        // Suggested starts with "LinkedIn "
        let suggestedClean = suggested.startsWith('LinkedIn ')
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

      // 4.15.2 INVALID CONTACT - Company logic
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
            `INVALID CONTACT - Company: ${suggestedCompanyClean}`;
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

      if (issues.length > 0) {
        reportItems.push({
          contact: {
            ...contact,
            fullName,
            biography: contact.biography || '',
          },
          issues: [...new Set(issues)],
          customIssueMessages: customMessages,
          duplicateDetails: duplicateDetails,
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

  private generateReport(
    items: MaintainerReportItem[],
    reportPath: string
  ): void {
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
    report += `==========================\n`;

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

        // Add colon for duplicate issues to match requested format
        if (issue.startsWith('DUPLICATE') && !issue.includes('CONTACTS')) {
          message = message.endsWith(':') ? message : `${message}:`;
        }

        report += message.startsWith('-') ? `${message}\n` : `-${message}\n`;

        if (item.duplicateDetails?.[issue]) {
          const details = item.duplicateDetails[issue]!;
          const label = issue.includes('EMAIL')
            ? 'Email'
            : issue.includes('PHONE')
              ? 'Phone'
              : 'URL';

          details.forEach((detail) => {
            report += `${label}: ${detail.value}\n`;
            detail.otherContactIds.forEach((id) => {
              const otherResourceId = id.split('/').pop() || '';
              report += `Duplicate for Id: https://contacts.google.com/person/${otherResourceId}\n`;
            });
          });
        }
      });
    });
    report += '=======================\n';

    writeFileSync(reportPath, report, 'utf-8');
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
