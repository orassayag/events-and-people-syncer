import { google, Auth } from 'googleapis';
import inquirer from 'inquirer';
import Fuse from 'fuse.js';
import type { ContactData } from '../types.js';
import { ApiTracker } from './apiTracker.js';
import { ContactCache } from '../utils/contactCache.js';
import { SETTINGS } from '../settings.js';

type OAuth2Client = Auth.OAuth2Client;

export type SimilarityType = 'Full Name' | 'Email' | 'Phone' | 'LinkedIn';

export interface DuplicateMatch {
  contact: ContactData;
  similarityType: SimilarityType;
}

export class DuplicateDetector {
  private readonly FUZZY_THRESHOLD = 0.2;

  constructor(private auth: OAuth2Client) {}

  async checkDuplicateName(firstName: string, lastName: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const contactsWithFullName = contacts.map(contact => ({
      ...contact,
      fullName: `${contact.firstName} ${contact.lastName}`.trim()
    }));
    const searchName = `${firstName} ${lastName}`.trim();
    const fuse = new Fuse(contactsWithFullName, {
      keys: ['fullName'],
      threshold: this.FUZZY_THRESHOLD,
      ignoreLocation: true,
    });
    const results = fuse.search(searchName);
    return results.map(result => ({
      contact: result.item,
      similarityType: 'Full Name' as SimilarityType,
    }));
  }

  async checkDuplicateEmail(email: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    for (const contact of contacts) {
      for (const contactEmail of contact.emails) {
        if (contactEmail.value.toLowerCase() === email.toLowerCase()) {
          matches.push({
            contact,
            similarityType: 'Email',
          });
          break;
        }
      }
    }
    return matches;
  }

  async checkDuplicatePhone(phone: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    const normalizedPhone = phone.replace(/[\s\-()#*]/g, '');
    for (const contact of contacts) {
      for (const contactPhone of contact.phones) {
        const normalizedContactPhone = contactPhone.number.replace(/[\s\-()#*]/g, '');
        if (normalizedContactPhone === normalizedPhone) {
          matches.push({
            contact,
            similarityType: 'Phone',
          });
          break;
        }
      }
    }
    return matches;
  }

  async checkDuplicateLinkedInUrl(url: string): Promise<DuplicateMatch[]> {
    const contacts = await this.fetchAllContacts();
    const matches: DuplicateMatch[] = [];
    const normalizedUrl = url.toLowerCase().trim();
    for (const contact of contacts) {
      for (const website of contact.websites) {
        const normalizedWebsiteUrl = website.url.toLowerCase().trim();
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

  async promptForDuplicateContinue(duplicates: DuplicateMatch[]): Promise<boolean> {
    if (duplicates.length === 0) {
      return true;
    }
    console.log(`\n===⚠️  Found ${duplicates.length} similar contact(s):===\n`);
    for (let i = 0; i < duplicates.length; i++) {
      const { contact, similarityType } = duplicates[i];
      const matchNumber = (i + 1).toString().padStart(3, '0');
      console.log(`===Match ${matchNumber}:===`);
      console.log(`-Similarity Type: ${similarityType}`);
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      console.log(`-Full Name: ${fullName}`);
      if (contact.label) {
        console.log(`-Labels: ${contact.label}`);
      }
      if (contact.company) {
        console.log(`-Company Name: ${contact.company}`);
      }
      if (contact.emails.length === 1) {
        console.log(`-Email: ${contact.emails[0].value}`);
      } else if (contact.emails.length > 1) {
        const emailList = contact.emails.map(e => e.value).join(', ');
        console.log(`-Emails: ${emailList}`);
      }
      if (contact.phones.length === 1) {
        console.log(`-Phone: ${contact.phones[0].number}`);
      } else if (contact.phones.length > 1) {
        const phoneList = contact.phones.map(p => p.number).join(', ');
        console.log(`-Phones: ${phoneList}`);
      }
      const linkedInWebsite = contact.websites.find(w => w.label.toLowerCase().includes('linkedin'));
      if (linkedInWebsite) {
        console.log(`-LinkedIn URL: ${linkedInWebsite.url} LinkedIn`);
      }
      if (contact.etag) {
        console.log(`-ETag: ${contact.etag}`);
      }
      console.log('');
    }
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue anyway?',
        default: false,
      },
    ]);
    return proceed;
  }

  private async fetchAllContacts(): Promise<ContactData[]> {
    const cache = ContactCache.getInstance();
    const cached = cache.get();
    if (cached) {
      return cached;
    }
    const contacts = await this.fetchContactsFromAPI();
    cache.set(contacts);
    return contacts;
  }

  private async fetchContactsFromAPI(): Promise<ContactData[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    let contactGroupsPageToken: string | undefined;
    const groupIdToName: Record<string, string> = {};
    do {
      const contactGroupsResponse = await service.contactGroups.list({
        pageSize: SETTINGS.API_PAGE_SIZE,
        pageToken: contactGroupsPageToken,
      });
      await apiTracker.trackRead();
      const contactGroups = contactGroupsResponse.data.contactGroups || [];
      contactGroups.forEach((group) => {
        if (group.resourceName && group.name && group.groupType === 'USER_CONTACT_GROUP') {
          groupIdToName[group.resourceName] = group.name;
        }
      });
      contactGroupsPageToken = contactGroupsResponse.data.nextPageToken || undefined;
    } while (contactGroupsPageToken);
    const contacts: ContactData[] = [];
    let pageToken: string | undefined;
    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: SETTINGS.API_PAGE_SIZE,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships',
        pageToken,
      });
      await apiTracker.trackRead();
      const connections = response.data.connections || [];
      for (const person of connections) {
        const names = person.names?.[0];
        const firstName = names?.givenName || '';
        const lastName = names?.familyName || '';
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
        const contactGroupMemberships = (person.memberships || []).filter(m => m.contactGroupMembership?.contactGroupResourceName).map(m => {
          const groupResourceName = m.contactGroupMembership?.contactGroupResourceName;
          if (!groupResourceName) {
            return '';
          }
          return groupIdToName[groupResourceName] || '';
        }).filter(name => name);
        const label = contactGroupMemberships.join(' | ');
        contacts.push({
          label,
          firstName,
          lastName,
          company: person.organizations?.[0]?.name || '',
          jobTitle: person.organizations?.[0]?.title || '',
          emails,
          phones,
          websites,
        });
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return contacts;
  }

  clearCache(): void {
    ContactCache.getInstance().invalidate();
  }
}
