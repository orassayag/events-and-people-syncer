import { google } from 'googleapis';
import { injectable, inject } from 'inversify';
import type { OAuth2Client, ContactData } from '../../types';
import { HibobContact, SyncStatusType, SyncResult } from '../../types';
import { SETTINGS } from '../../settings';
import { ApiTracker } from '../api';
import { emailSchema } from '../../entities';
import { Logger } from '../../logging';
import { retryWithBackoff, formatDateTimeDDMMYYYY_HHMMSS, DryModeChecker, DryModeMocks } from '../../utils';
import {
  buildNewContactNote,
  determineNoteUpdate,
} from '../linkedin/noteParser';
import { ContactCache } from '../../cache';
import { DuplicateDetector } from '../contacts';

@injectable()
export class HibobContactSyncer {
  private readonly writeDelayMs: number;
  private logger: Logger = new Logger('HibobContactSyncer');
  private duplicateDetector: DuplicateDetector;

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) duplicateDetector: DuplicateDetector
  ) {
    this.duplicateDetector = duplicateDetector;
    this.writeDelayMs = SETTINGS.hibob.writeDelayMs;
  }

  async addContact(
    contact: HibobContact,
    labelResourceName: string,
    labelValue: string
  ): Promise<SyncResult> {
    try {
      const apiTracker: ApiTracker = ApiTracker.getInstance();
      const lastNameValue: string = [contact.lastName, labelValue]
        .filter((s: string | undefined) => s)
        .join(' ')
        .trim();
      const requestBody: any = {};
      if (contact.firstName || lastNameValue) {
        requestBody.names = [
          {
            givenName: contact.firstName.trim() || undefined,
            familyName: lastNameValue || undefined,
          },
        ];
      }
      const validEmails: string[] = [];
      if (contact.email) {
        try {
          emailSchema.parse(contact.email);
          validEmails.push(contact.email.trim());
        } catch {
          this.logger.debug(`Invalid email skipped: ${contact.email}`);
        }
      }
      if (validEmails.length > 0) {
        requestBody.emailAddresses = validEmails.map((email: string) => ({
          value: email,
          type: labelValue,
        }));
      }
      if (labelValue) {
        requestBody.organizations = [
          {
            name: labelValue,
            type: 'work',
          },
        ];
      }
      if (labelResourceName) {
        requestBody.memberships = [
          {
            contactGroupMembership: {
              contactGroupResourceName: labelResourceName,
            },
          },
        ];
      }
      requestBody.biographies = [
        {
          value: buildNewContactNote(new Date(), 'HiBob'),
          contentType: 'TEXT_PLAIN',
        },
      ];
      if (Object.keys(requestBody).length === 0) {
        return { status: SyncStatusType.SKIPPED };
      }
      if (SETTINGS.dryMode) {
        const contactDetails =
          `Contact: ${contact.firstName} ${contact.lastName}` +
          (contact.email ? ` (${contact.email})` : '') +
          ` - Label: ${labelValue}`;
        DryModeChecker.logApiCall(
          'service.people.createContact()',
          contactDetails,
          this.logger
        );
        const mockResponse = DryModeMocks.createContactResponse(
          contact.firstName,
          contact.lastName || ''
        );
        const newContact: ContactData = {
          label: labelValue,
          firstName: contact.firstName,
          lastName: contact.lastName || '',
          company: '',
          jobTitle: '',
          emails: contact.email
            ? [{ value: contact.email, label: labelValue }]
            : [],
          phones: [],
          websites: [],
          resourceName: mockResponse.resourceName,
          biography: '',
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
    labelResourceName: string
  ): Promise<SyncResult> {
    try {
      const service = google.people({ version: 'v1', auth: this.auth });
      const apiTracker: ApiTracker = ApiTracker.getInstance();
      const personResponse = await retryWithBackoff(async () => {
        return await service.people.get({
          resourceName,
          personFields: 'memberships',
        });
      });
      await apiTracker.trackRead();
      const existingMemberships = personResponse.data.memberships || [];
      const existingGroupResourceNames = existingMemberships
        .filter((m: any) => m.contactGroupMembership?.contactGroupResourceName)
        .map((m: any) => m.contactGroupMembership.contactGroupResourceName);
      if (existingGroupResourceNames.includes(labelResourceName)) {
        return { status: SyncStatusType.UP_TO_DATE };
      }
      if (SETTINGS.dryMode) {
        DryModeChecker.logApiCall(
          'service.people.updateContact()',
          `${resourceName}: Add membership ${labelResourceName}`,
          this.logger
        );
        await apiTracker.trackWrite();
        await this.delay(this.writeDelayMs);
        await ContactCache.getInstance().invalidate();
        return { status: SyncStatusType.UPDATED };
      }
      const cache: ContactCache = ContactCache.getInstance();
      const cachedContact: ContactData | null =
        await cache.getByResourceName(resourceName);
      let existingBiography: string = '';
      let existingEtag: string = '';
      if (
        cachedContact &&
        cachedContact.biography !== undefined &&
        cachedContact.etag
      ) {
        this.logger.debug('Using cached contact data (no API call needed)');
        existingBiography = cachedContact.biography || '';
        existingEtag = cachedContact.etag;
      } else {
        this.logger.debug(
          'Cache miss or incomplete - fetching full contact data'
        );
        const personResponse = await retryWithBackoff(async () => {
          return await service.people.get({
            resourceName,
            personFields: 'names,emailAddresses,organizations,biographies',
          });
        });
        await apiTracker.trackRead();
        existingBiography = personResponse.data.biographies?.[0]?.value || '';
        existingEtag = personResponse.data.etag || '';
      }
      const updatedMemberships = [
        ...existingMemberships,
        {
          contactGroupMembership: {
            contactGroupResourceName: labelResourceName,
          },
        },
      ];
      const requestBody: any = {
        etag: existingEtag,
        memberships: updatedMemberships,
      };
      const updateMask: string[] = ['memberships'];
      const currentDate: string = formatDateTimeDDMMYYYY_HHMMSS(new Date());
      const noteUpdate = determineNoteUpdate(
        existingBiography,
        currentDate,
        'HiBob'
      );
      if (noteUpdate.shouldUpdate) {
        requestBody.biographies = [
          {
            value: noteUpdate.newNoteValue,
            contentType: 'TEXT_PLAIN',
          },
        ];
        updateMask.push('biographies');
        this.logger.debug(
          `Note will be updated: "${existingBiography}" -> "${noteUpdate.newNoteValue}"`
        );
      }
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
      return { status: SyncStatusType.UPDATED };
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
