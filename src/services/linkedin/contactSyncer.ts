import { google } from 'googleapis';
import { injectable, inject } from 'inversify';
import type { OAuth2Client, ContactData, ContactGroupMap } from '../../types';
import { LinkedInConnection, SyncStatusType, SyncResult, UpdateDetails } from '../../types';
import { SETTINGS } from '../../settings';
import { ApiTracker } from '../api';
import { emailSchema } from '../../entities';
import { Logger } from '../../logging';
import { retryWithBackoff, calculateFormattedCompany, formatDateTimeDDMMYYYY_HHMMSS, DryModeChecker, DryModeMocks } from '../../utils';
import { buildNewContactNote, determineNoteUpdate } from './noteParser';
import { ContactCache } from '../../cache';
import { DuplicateDetector } from '../contacts';

@injectable()
export class ContactSyncer {
  private groupMap: ContactGroupMap = {};
  private readonly writeDelayMs: number;
  private logger: Logger = new Logger('ContactSyncer');
  private duplicateDetector: DuplicateDetector;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) duplicateDetector: DuplicateDetector
  ) {
    this.duplicateDetector = duplicateDetector;
    this.writeDelayMs = SETTINGS.linkedin.writeDelayMs;
  }

  async initialize(): Promise<void> {
    await this.loadContactGroups();
  }

  async addContact(
    connection: LinkedInConnection,
    label: string,
    scriptName: string = 'LinkedIn'
  ): Promise<SyncResult> {
    try {
      const apiTracker: ApiTracker = ApiTracker.getInstance();
      const groupResourceName: string = await this.ensureGroupExists(label);
      const formattedCompany: string = calculateFormattedCompany(
        connection.company,
        2
      );
      const emailLabel: string = `${label} ${formattedCompany}`.trim();
      const lastNameValue: string = [
        connection.lastName,
        label,
        formattedCompany,
      ]
        .filter((s: string) => s)
        .join(' ')
        .trim();
      const requestBody: any = {};
      if (connection.firstName || lastNameValue) {
        requestBody.names = [
          {
            givenName: connection.firstName.trim() || undefined,
            familyName: lastNameValue || undefined,
          },
        ];
      }
      const validEmails: string[] = [];
      if (connection.email) {
        try {
          emailSchema.parse(connection.email);
          validEmails.push(connection.email.trim());
        } catch {
          this.logger.debug(`Invalid email skipped: ${connection.email}`);
        }
      }
      if (validEmails.length > 0) {
        requestBody.emailAddresses = validEmails.map((email: string) => ({
          value: email,
          type: emailLabel,
        }));
      }
      if (formattedCompany || connection.position) {
        requestBody.organizations = [
          {
            name: formattedCompany || undefined,
            title: connection.position.trim() || undefined,
            type: 'work',
          },
        ];
      }
      if (connection.url) {
        requestBody.urls = [
          {
            value: connection.url.trim(),
            type: 'LinkedIn',
          },
        ];
      }
      if (groupResourceName) {
        requestBody.memberships = [
          {
            contactGroupMembership: {
              contactGroupResourceName: groupResourceName,
            },
          },
        ];
      }
      requestBody.biographies = [
        {
          value: buildNewContactNote(new Date(), scriptName),
          contentType: 'TEXT_PLAIN',
        },
      ];
      if (Object.keys(requestBody).length === 0) {
        return { status: SyncStatusType.SKIPPED };
      }
      if (SETTINGS.dryMode) {
        const contactDetails =
          `Contact: ${connection.firstName} ${connection.lastName}` +
          (connection.email ? ` (${connection.email})` : '') +
          ` - Label: ${label}`;
        DryModeChecker.logApiCall(
          'service.people.createContact()',
          contactDetails,
          this.logger
        );
        const mockResponse = DryModeMocks.createContactResponse(
          connection.firstName,
          connection.lastName
        );
        const compositeSuffix = [label, formattedCompany]
          .filter((s) => s)
          .join(' ');
        const newContact: ContactData = {
          label: label,
          firstName: connection.firstName,
          lastName: connection.lastName,
          company: formattedCompany,
          jobTitle: connection.position,
          emails: connection.email
            ? [{ value: connection.email, label: compositeSuffix }]
            : [],
          phones: [],
          websites: connection.url
            ? [{ url: connection.url, label: 'LinkedIn' }]
            : [],
          resourceName: mockResponse.resourceName,
          biography: buildNewContactNote(new Date(), scriptName),
          etag: mockResponse.etag,
        };
        try {
          this.duplicateDetector.addRecentlyModifiedContact(newContact);
        } catch (error: unknown) {
          this.logger.debug(
            'Failed to add mock contact to duplicate detector',
            {
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          );
        }
        await apiTracker.trackWrite();
        await this.delay(this.writeDelayMs);
        return { status: SyncStatusType.NEW };
      }
      const service = google.people({ version: 'v1', auth: this.auth });
      await retryWithBackoff(async () => {
        await service.people.createContact({ requestBody });
      });
      await apiTracker.trackWrite();
      await this.delay(this.writeDelayMs);
      return { status: SyncStatusType.NEW };
    } catch (error: unknown) {
      this.logger.debug(
        `Error adding contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
      return {
        status: SyncStatusType.ERROR,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  async updateContact(
    resourceName: string,
    connection: LinkedInConnection,
    label: string,
    scriptName: string = 'LinkedIn'
  ): Promise<SyncResult> {
    try {
      const service = google.people({ version: 'v1', auth: this.auth });
      const apiTracker: ApiTracker = ApiTracker.getInstance();
      const cache: ContactCache = ContactCache.getInstance();
      const cachedContact: ContactData | null =
        await cache.getByResourceName(resourceName);
      let existingData: any;
      let existingBiography: string = '';
      let existingEtag: string = '';
      if (
        cachedContact &&
        cachedContact.biography !== undefined &&
        cachedContact.etag
      ) {
        this.logger.debug('Using cached contact data (no API call needed)');
        existingData = {
          names:
            cachedContact.firstName || cachedContact.lastName
              ? [
                  {
                    givenName: cachedContact.firstName,
                    familyName: cachedContact.lastName,
                  },
                ]
              : undefined,
          organizations:
            cachedContact.company || cachedContact.jobTitle
              ? [
                  {
                    name: cachedContact.company,
                    title: cachedContact.jobTitle,
                  },
                ]
              : undefined,
          emailAddresses: cachedContact.emails,
          urls: cachedContact.websites.map((w) => ({
            value: w.url,
            type: w.label,
          })),
          biographies: cachedContact.biography
            ? [
                {
                  value: cachedContact.biography,
                },
              ]
            : undefined,
          etag: cachedContact.etag,
        };
        existingBiography = cachedContact.biography || '';
        existingEtag = cachedContact.etag;
      } else {
        this.logger.debug('Cache miss - fetching contact from API');
        const existingContact = await retryWithBackoff(async () => {
          return await service.people.get({
            resourceName,
            personFields: 'names,emailAddresses,urls,organizations,biographies',
          });
        });
        await apiTracker.trackRead();
        existingData = existingContact.data;
        existingBiography = existingData.biographies?.[0]?.value?.trim() || '';
        existingEtag = existingData.etag || '';
      }
      const formattedCompany: string = calculateFormattedCompany(
        connection.company,
        2
      );
      const emailLabel: string = `${label} ${formattedCompany}`.trim();
      const lastNameValue: string = [
        connection.lastName,
        label,
        formattedCompany,
      ]
        .filter((s: string) => s)
        .join(' ')
        .trim();
      const currentLastName: string = (
        existingData.names?.[0]?.familyName || ''
      ).trim();
      const currentJobTitle: string = (
        existingData.organizations?.[0]?.title || ''
      ).trim();
      let hasChanges: boolean = false;
      const updateMask: string[] = [];
      const requestBody: any = {};
      const updateDetails: UpdateDetails = {};
      if (currentLastName !== lastNameValue) {
        requestBody.names = [
          {
            givenName:
              existingData.names?.[0]?.givenName || connection.firstName.trim(),
            familyName: lastNameValue,
          },
        ];
        updateMask.push('names');
        hasChanges = true;
        updateDetails.lastName = {
          from: currentLastName || '(empty)',
          to: lastNameValue,
        };
      }
      if (
        connection.position &&
        currentJobTitle !== connection.position.trim()
      ) {
        requestBody.organizations = [
          {
            name: existingData.organizations?.[0]?.name || formattedCompany,
            title: connection.position.trim(),
            type: 'work',
          },
        ];
        updateMask.push('organizations');
        hasChanges = true;
        updateDetails.jobTitle = {
          from: currentJobTitle || '(empty)',
          to: connection.position.trim(),
        };
      }
      const existingEmails: string[] = (existingData.emailAddresses || []).map(
        (e: any) => e.value?.toLowerCase() || ''
      );
      const newEmail: string = connection.email.trim();
      if (newEmail && !existingEmails.includes(newEmail.toLowerCase())) {
        try {
          emailSchema.parse(newEmail);
          const updatedEmails = [
            ...(existingData.emailAddresses || []),
            {
              value: newEmail,
              type: emailLabel,
            },
          ];
          requestBody.emailAddresses = updatedEmails;
          updateMask.push('emailAddresses');
          hasChanges = true;
          updateDetails.emailAdded = newEmail;
        } catch {
          this.logger.debug(`Invalid email skipped: ${newEmail}`);
        }
      }
      const existingUrls: any[] = existingData.urls || [];
      const linkedInUrls: any[] = existingUrls.filter((u: any) =>
        (u.value || '').toLowerCase().includes('linkedin')
      );
      if (linkedInUrls.length === 0 && connection.url) {
        const updatedUrls = [
          ...existingUrls,
          {
            value: connection.url.trim(),
            type: 'LinkedIn',
          },
        ];
        requestBody.urls = updatedUrls;
        updateMask.push('urls');
        hasChanges = true;
        updateDetails.linkedInUrlAdded = true;
      } else if (linkedInUrls.length > 0) {
        let urlsChanged: boolean = false;
        const updatedUrls = existingUrls.map((u: any) => {
          if (
            (u.value || '').toLowerCase().includes('linkedin') &&
            u.type !== 'LinkedIn'
          ) {
            urlsChanged = true;
            return { ...u, type: 'LinkedIn' };
          }
          return u;
        });
        if (urlsChanged) {
          requestBody.urls = updatedUrls;
          updateMask.push('urls');
          hasChanges = true;
          updateDetails.linkedInUrlLabelFixed = true;
        }
      }
      if (!hasChanges) {
        return { status: SyncStatusType.UP_TO_DATE };
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
        await this.delay(this.writeDelayMs);
        await ContactCache.getInstance().invalidate();
        return { status: SyncStatusType.UPDATED, updateDetails };
      }
      const currentDate: string = formatDateTimeDDMMYYYY_HHMMSS(new Date());
      const noteUpdate = determineNoteUpdate(
        existingBiography,
        currentDate,
        scriptName
      );
      if (noteUpdate.shouldUpdate) {
        requestBody.biographies = [
          {
            value: noteUpdate.newNoteValue,
            contentType: 'TEXT_PLAIN',
          },
        ];
        updateMask.push('biographies');
        updateDetails.noteUpdated = {
          from: existingBiography || '(empty)',
          to: noteUpdate.newNoteValue,
        };
        this.logger.debug(
          `Note will be updated: "${existingBiography}" -> "${noteUpdate.newNoteValue}"`
        );
      }
      requestBody.etag = existingEtag;
      await retryWithBackoff(async () => {
        await service.people.updateContact({
          resourceName,
          updatePersonFields: updateMask.join(','),
          requestBody,
        });
      });
      await apiTracker.trackWrite();
      await this.delay(this.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return { status: SyncStatusType.UPDATED, updateDetails };
    } catch (error: unknown) {
      this.logger.debug(
        `Error updating contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
      return {
        status: SyncStatusType.ERROR,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  private async loadContactGroups(): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker: ApiTracker = ApiTracker.getInstance();
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.contactGroups.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken,
        });
      });
      await apiTracker.trackRead();
      const groups = response.data.contactGroups || [];
      for (const group of groups) {
        if (
          group.resourceName &&
          group.name &&
          group.groupType === 'USER_CONTACT_GROUP'
        ) {
          this.groupMap[group.name] = group.resourceName;
        }
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
  }

  private async ensureGroupExists(groupName: string): Promise<string> {
    if (this.groupMap[groupName]) {
      return this.groupMap[groupName];
    }
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
      this.groupMap[groupName] = mockResourceName;
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
    await this.loadContactGroups();
    const resourceName: string = response.data.resourceName || '';
    return resourceName;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
