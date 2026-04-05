import { google } from 'googleapis';
import ora from 'ora';
import { injectable, inject } from 'inversify';
import type { ContactData, OAuth2Client, EditableContactData, SyncableContact, ContactGroup } from '../../types';
import { RegexPatterns } from '../../regex';
import { ApiTracker } from '../api';
import { SETTINGS } from '../../settings';
import { retryWithBackoff, formatDateTimeDDMMYYYY_HHMMSS, DryModeChecker, DryModeMocks } from '../../utils';
import { Logger } from '../../logging';
import { determineSyncNoteUpdate } from '../linkedin/noteParser';
import { ContactCache } from '../../cache';
import { FormatUtils } from '../../constants';

export { SyncableContact };

@injectable()
export class ContactSyncer {
  private readonly logger: Logger;
  private readonly MAX_CONTACTS = 50000;
  private allContacts: ContactData[] | null = null;

  constructor(@inject('OAuth2Client') private auth: OAuth2Client) {
    this.logger = new Logger('ContactSyncer');
  }

  async fetchContactsForSyncing(uiLogger: Logger): Promise<SyncableContact[]> {
    const spinner = ora('Fetching contacts...').start();
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
    let skippedCount = 0;
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.people.connections.list({
          resourceName: 'people/me',
          pageSize: SETTINGS.api.pageSize,
          personFields:
            'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies',
          pageToken,
        });
      });
      await apiTracker.trackRead();
      const connections = response.data.connections || [];
      spinner.text = `Fetching contacts: ${contacts.length.toLocaleString()} contacts fetched...`;
      for (const person of connections) {
        const resourceName: string | undefined =
          person.resourceName ?? undefined;
        if (!resourceName) {
          skippedCount++;
          this.logger.warn('Skipping contact without resourceName');
          continue;
        }
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
        const note: string = person.biographies?.[0]?.value || '';
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
          resourceName,
          biography: note,
          etag,
          note,
        });
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    if (contacts.length > this.MAX_CONTACTS) {
      spinner.fail();
      uiLogger.resetState('spinner');
      throw new Error(
        `Too many contacts: ${contacts.length}. Maximum supported: ${this.MAX_CONTACTS}`
      );
    }
    const validCount = contacts.length;
    const formattedCount = FormatUtils.formatNumberWithLeadingZeros(validCount);
    spinner.succeed(
      `Fetched ${formattedCount} contacts${skippedCount > 0 ? ` (${skippedCount} skipped: missing ID)` : ''}`
    );
    uiLogger.resetState('spinner');
    this.allContacts = contacts;
    const filteredContacts = this.filterContacts(contacts);
    const syncableContacts = this.categorizeContacts(filteredContacts);
    return syncableContacts;
  }

  getContactsBreakdown(): {
    syncerCount: number;
    syncCount: number;
    noNoteCount: number;
  } {
    if (!this.allContacts) {
      return { syncerCount: 0, syncCount: 0, noNoteCount: 0 };
    }
    let syncerCount = 0;
    let syncCount = 0;
    let noNoteCount = 0;
    for (const contact of this.allContacts) {
      const note = contact.note || '';
      if (
        RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(note)
      ) {
        syncerCount++;
      } else if (
        RegexPatterns.SYNC_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNC_UPDATED_NOTE.test(note)
      ) {
        syncCount++;
      } else {
        noNoteCount++;
      }
    }
    return { syncerCount, syncCount, noNoteCount };
  }

  private filterContacts(contacts: ContactData[]): ContactData[] {
    return contacts.filter((contact) => {
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      if (hasUnknownLabel) {
        return true;
      }
      const note = contact.note || '';
      return !(
        RegexPatterns.SYNCER_ADDED_NOTE.test(note) ||
        RegexPatterns.SYNCER_UPDATED_NOTE.test(note) ||
        RegexPatterns.SYNC_ADDED_NOTE.test(note)
      );
    });
  }

  private categorizeContacts(contacts: ContactData[]): SyncableContact[] {
    const syncableContacts: SyncableContact[] = [];
    for (const contact of contacts) {
      const reasons: string[] = [];
      let priorityLevel: 1 | 2 | 3 | 4 = 4;
      const hasHebrew = this.checkHebrewInAllFields(contact);
      const noLabel = !contact.label || contact.label.trim() === '';
      const labelParts =
        contact.label?.split(' | ').map((l) => l.trim().toLowerCase()) || [];
      const hasUnknownLabel = labelParts.includes('unknown');
      const noCompany = !contact.company || contact.company.trim() === '';
      const missingOther = this.checkMissingFields(contact);
      if (hasHebrew) {
        reasons.push('Contains Hebrew');
        priorityLevel = 1;
        if (noLabel || hasUnknownLabel) reasons.push('Missing label');
        if (noCompany) reasons.push('Missing company');
      } else if (noLabel || hasUnknownLabel) {
        reasons.push('Missing label');
        priorityLevel = 2;
        if (noCompany) reasons.push('Missing company');
      } else if (noCompany) {
        reasons.push('Missing company');
        priorityLevel = 3;
      }
      if (missingOther.length > 0) {
        reasons.push(...missingOther);
      }
      if (reasons.length > 0 && contact.resourceName) {
        syncableContacts.push({
          contact,
          priorityLevel,
          reasons,
          resourceName: contact.resourceName,
        });
      }
    }
    return syncableContacts.sort((a, b) => a.priorityLevel - b.priorityLevel);
  }

  private checkHebrewInAllFields(contact: ContactData): boolean {
    const fieldsToCheck = [
      contact.firstName,
      contact.lastName,
      contact.company,
      contact.jobTitle,
      contact.label,
      contact.note || '',
      ...contact.emails.map((e) => e.value),
      ...contact.phones.map((p) => p.number),
    ];
    return fieldsToCheck.some(
      (field) => field && RegexPatterns.HEBREW.test(field)
    );
  }

  private checkMissingFields(contact: ContactData): string[] {
    const missing: string[] = [];
    if (this.isArrayFieldMissing(contact.emails, (e) => e.value)) {
      missing.push('Missing email');
    }
    if (this.isArrayFieldMissing(contact.phones, (p) => p.number)) {
      missing.push('Missing phone');
    }
    const hasLinkedIn = contact.websites.some((w) =>
      w.label.toLowerCase().includes('linkedin')
    );
    if (!hasLinkedIn) {
      missing.push('Missing LinkedIn URL');
    }
    if (this.isMissingField(contact.jobTitle)) {
      missing.push('Missing job title');
    }
    if (this.isMissingField(contact.firstName)) {
      missing.push('Missing first name');
    }
    if (this.isMissingField(contact.lastName)) {
      missing.push('Missing last name');
    }
    return missing;
  }

  private isMissingField(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim() === '';
  }

  private isArrayFieldMissing<T>(
    array: T[] | undefined,
    valueExtractor: (item: T) => string
  ): boolean {
    return (
      !array ||
      array.length === 0 ||
      array.every((item) => this.isMissingField(valueExtractor(item)))
    );
  }

  async fetchContactGroups(): Promise<ContactGroup[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const groups: ContactGroup[] = [];
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.contactGroups.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken,
        });
      });
      await apiTracker.trackRead();
      const contactGroups = response.data.contactGroups || [];
      for (const group of contactGroups) {
        if (
          group.resourceName &&
          group.name &&
          group.groupType === 'USER_CONTACT_GROUP'
        ) {
          groups.push({
            resourceName: group.resourceName,
            name: group.name,
          });
        }
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return groups;
  }

  async createContactGroup(groupName: string): Promise<string> {
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${groupName}`;
      DryModeChecker.logApiCall(
        'service.contactGroups.create()',
        `Group: ${prefixedName}`,
        this.logger
      );
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      const apiTracker: ApiTracker = ApiTracker.getInstance();
      await apiTracker.trackWrite();
      return mockResourceName;
    }
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const response = await retryWithBackoff(async () => {
      return await service.contactGroups.create({
        requestBody: {
          contactGroup: {
            name: groupName,
          },
        },
      });
    });
    await apiTracker.trackWrite();
    return response.data.resourceName || '';
  }

  async updateContact(
    resourceName: string,
    originalData: ContactData,
    updatedData: EditableContactData,
    uiLogger: Logger
  ): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    const existingContact = await retryWithBackoff(async () => {
      return await service.people.get({
        resourceName,
        personFields:
          'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies',
      });
    });
    await apiTracker.trackRead();
    const updateMask: string[] = [];
    const requestBody: any = { etag: existingContact.data.etag };
    const originalFirstName = originalData.firstName;
    const originalLastName = this.extractBaseLastName(
      originalData.lastName,
      originalData.label,
      originalData.company
    );
    const originalCompany = originalData.company;
    const originalJobTitle = originalData.jobTitle;
    const originalEmails = originalData.emails.map((e) => e.value);
    const originalPhones = originalData.phones.map((p) => p.number);
    const originalLinkedInUrl = originalData.websites.find((w) =>
      w.label.toLowerCase().includes('linkedin')
    )?.url;
    const firstNameChanged = updatedData.firstName !== originalFirstName;
    const lastNameChanged = updatedData.lastName !== originalLastName;
    const companyChanged = updatedData.company !== originalCompany;
    const jobTitleChanged = updatedData.jobTitle !== originalJobTitle;
    const emailsChanged =
      JSON.stringify(updatedData.emails.sort()) !==
      JSON.stringify(originalEmails.sort());
    const phonesChanged =
      JSON.stringify(updatedData.phones.sort()) !==
      JSON.stringify(originalPhones.sort());
    const linkedInChanged = updatedData.linkedInUrl !== originalLinkedInUrl;
    const allGroups = await this.fetchContactGroups();
    const selectedLabelNames = updatedData.labelResourceNames.map(
      (resourceName) => {
        const group = allGroups.find((g) => g.resourceName === resourceName);
        return group ? group.name : resourceName;
      }
    );
    const firstLabelName =
      selectedLabelNames.length > 0 ? selectedLabelNames[0] : '';
    const formattedCompany = this.formatCompanyToPascalCase(
      updatedData.company || ''
    );
    const compositeSuffix = [firstLabelName, formattedCompany]
      .filter((s) => s)
      .join(' ');
    const finalLastNameValue = [updatedData.lastName, compositeSuffix]
      .filter((s) => s)
      .join(' ');
    if (firstNameChanged || lastNameChanged || companyChanged) {
      requestBody.names = [
        {
          givenName: updatedData.firstName || undefined,
          familyName: finalLastNameValue || undefined,
        },
      ];
      updateMask.push('names');
    }
    if (emailsChanged || companyChanged) {
      requestBody.emailAddresses = updatedData.emails.map((email) => ({
        value: email,
        type: compositeSuffix || 'other',
      }));
      updateMask.push('emailAddresses');
    }
    if (phonesChanged || companyChanged) {
      requestBody.phoneNumbers = updatedData.phones.map((phone) => ({
        value: phone,
        type: compositeSuffix || 'other',
      }));
      updateMask.push('phoneNumbers');
    }
    if (companyChanged || jobTitleChanged) {
      if (formattedCompany || updatedData.jobTitle) {
        requestBody.organizations = [
          {
            name: formattedCompany || undefined,
            title: updatedData.jobTitle || undefined,
            type: 'work',
          },
        ];
      } else {
        requestBody.organizations = [];
      }
      updateMask.push('organizations');
    }
    if (linkedInChanged) {
      if (updatedData.linkedInUrl) {
        requestBody.urls = [
          {
            value: updatedData.linkedInUrl,
            type: 'LinkedIn',
          },
        ];
      } else {
        requestBody.urls = [];
      }
      updateMask.push('urls');
    }
    const systemMemberships = (existingContact.data.memberships || []).filter(
      (m) => {
        const rn = m.contactGroupMembership?.contactGroupResourceName;
        return !rn || !rn.startsWith('contactGroups/');
      }
    );
    const existingUserMemberships = (existingContact.data.memberships || [])
      .filter((m) => {
        const rn = m.contactGroupMembership?.contactGroupResourceName;
        return rn && rn.startsWith('contactGroups/');
      })
      .map((m) => m.contactGroupMembership?.contactGroupResourceName)
      .filter((rn): rn is string => !!rn)
      .sort();
    const newUserMembershipsResourceNames = updatedData.labelResourceNames
      .slice()
      .sort();
    const membershipsChanged =
      JSON.stringify(existingUserMemberships) !==
      JSON.stringify(newUserMembershipsResourceNames);
    if (membershipsChanged) {
      const newUserMemberships = updatedData.labelResourceNames.map((rn) => ({
        contactGroupMembership: { contactGroupResourceName: rn },
      }));
      requestBody.memberships = [...systemMemberships, ...newUserMemberships];
      updateMask.push('memberships');
    }
    if (updateMask.length === 0) {
      this.logger.info('No fields changed, skipping update');
      return;
    }
    if (SETTINGS.dryMode) {
      const changes = updateMask
        .map((field) => field.charAt(0).toUpperCase() + field.slice(1))
        .join(', ');
      DryModeChecker.logApiCall(
        'service.people.updateContact()',
        `${resourceName}: Updated fields [${changes}]`,
        this.logger
      );
      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      uiLogger.displaySuccess('[DRY MODE] Contact updated successfully');
      return;
    }
    const currentTimestamp = formatDateTimeDDMMYYYY_HHMMSS(new Date());
    const existingNote = existingContact.data.biographies?.[0]?.value || '';
    const noteUpdate = determineSyncNoteUpdate(existingNote, currentTimestamp);
    if (noteUpdate.shouldUpdate) {
      requestBody.biographies = [
        {
          value: noteUpdate.newNoteValue,
          contentType: 'TEXT_PLAIN',
        },
      ];
      updateMask.push('biographies');
      this.logger.debug(
        `Note will be updated: "${existingNote}" -> "${noteUpdate.newNoteValue}"`
      );
    }
    const spinner = ora('Updating contact...').start();
    await retryWithBackoff(async () => {
      return await service.people.updateContact({
        resourceName,
        updatePersonFields: updateMask.join(','),
        requestBody,
      });
    });
    await apiTracker.trackWrite();
    spinner.stop();
    uiLogger.resetState('spinner');
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
    uiLogger.displaySuccess('Contact updated successfully');
  }

  private extractBaseLastName(
    lastName: string,
    label?: string,
    company?: string
  ): string {
    if (!lastName) return '';
    const trimmed = lastName.trim();
    const labelParts = label ? label.split(' | ') : [];
    const firstLabel = labelParts.length > 0 ? labelParts[0].trim() : '';
    const formattedCompany = company
      ? this.formatCompanyToPascalCase(company)
      : '';
    const suffixParts = [firstLabel, formattedCompany].filter((s) => s);
    if (suffixParts.length === 0) {
      return trimmed;
    }
    const suffix = suffixParts.join(' ');
    if (trimmed.endsWith(' ' + suffix)) {
      return trimmed.substring(0, trimmed.length - suffix.length - 1).trim();
    }
    return trimmed;
  }

  private formatCompanyToPascalCase(company: string): string {
    if (!company || !company.trim()) {
      return '';
    }
    const words = company.trim().split(/\s+/);
    const pascalCaseWords = words.map((word: string) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    return pascalCaseWords.join('');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
