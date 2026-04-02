import { google, Auth } from 'googleapis';
import ora from 'ora';
import type { ContactData } from '../types.js';
import { ApiTracker } from './apiTracker.js';
import { TextUtils } from '../utils/index.js';
import { SETTINGS } from '../settings.js';

type OAuth2Client = Auth.OAuth2Client;

export class ContactReader {
  constructor(private auth: OAuth2Client) {}

  async displayContacts(): Promise<void> {
    const spinner = ora('Fetching contacts from Google People API...').start();
    try {
      const contacts = await this.readContacts((current: number) => {
        spinner.text = `Fetching contacts... ${current}`;
      });
      const total = contacts.length;
      spinner.succeed(`Found ${total.toLocaleString('en-US')} contacts`);
      this.displayContactList(contacts);
    } catch (error) {
      spinner.fail('Failed to fetch contacts');
      throw error;
    }
  }

  private async readContacts(onProgress?: (current: number) => void): Promise<ContactData[]> {
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
        const organizations = person.organizations?.[0];
        const company = organizations?.name || '';
        const jobTitle = organizations?.title || '';
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
          company,
          jobTitle,
          emails,
          phones,
          websites,
        });
      }
      onProgress?.(contacts.length);
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    contacts.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase().trim();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase().trim();
      return nameA.localeCompare(nameB, 'en-US');
    });
    return contacts;
  }

  private displayContactList(contacts: ContactData[]): void {
    const total = contacts.length;
    const displayCount = Math.min(SETTINGS.TOP_CONTACTS_DISPLAY, total);
    if (total > SETTINGS.TOP_CONTACTS_DISPLAY) {
      console.log(`Showing ${displayCount} of ${total.toLocaleString('en-US')} contacts\n`);
    }
    for (let i = 0; i < displayCount; i++) {
      this.displayContact(contacts[i], i, total);
    }
  }

  private displayContact(contact: ContactData, index: number, total: number): void {
    const isVerbose = process.env.VERBOSE_MODE === 'true';
    if (isVerbose) {
      console.log(`Person ${index + 1} of ${total}`);
      console.log(`Labels: ${contact.label || 'none'}`);
      console.log(`Company: ${contact.company || 'none'}`);
      console.log(`First Name: ${contact.firstName || 'none'}`);
      console.log(`Last Name: ${contact.lastName || 'none'}`);
      console.log(`Job Title: ${contact.jobTitle || 'none'}`);
      if (contact.emails.length > 0) {
        console.log('Emails:');
        contact.emails.forEach((email) => {
          console.log(`  ${email.value} (${email.label || 'none'})`);
        });
      } else {
        console.log('Emails: none');
      }
      if (contact.phones.length > 0) {
        console.log('Phones:');
        contact.phones.forEach((phone) => {
          console.log(`  ${phone.number} (${phone.label || 'none'})`);
        });
      } else {
        console.log('Phones: none');
      }
      if (contact.websites.length > 0) {
        console.log('LinkedIn URLs:');
        contact.websites.forEach((website) => {
          console.log(`  ${website.url} (${website.label || 'none'})`);
        });
      } else {
        console.log('LinkedIn URLs: none');
      }
      console.log('');
    } else {
      const personNum = TextUtils.formatNumberWithLeadingZeros(index + 1);
      const totalNum = TextUtils.formatNumberWithLeadingZeros(total);
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const compositeSuffix = [contact.label, contact.company].filter((s) => s).join(' ');
      console.log(`===Person ${personNum}/${totalNum}===`);
      console.log(`-Labels: ${TextUtils.reverseHebrewText(contact.label || '')}`);
      console.log(`-Company: ${TextUtils.reverseHebrewText(contact.company || '')}`);
      if (compositeSuffix) {
        console.log(`-Full name: ${TextUtils.reverseHebrewText(fullName)} ${TextUtils.reverseHebrewText(compositeSuffix)}`);
      } else {
        console.log(`-Full name: ${TextUtils.reverseHebrewText(fullName)}`);
      }
      console.log(`-Job Title: ${TextUtils.reverseHebrewText(contact.jobTitle || '')}`);
      if (contact.emails.length === 1) {
        const emailLabel = contact.emails[0].label || contact.label || contact.company;
        console.log(`-Email: ${contact.emails[0].value} ${TextUtils.reverseHebrewText(emailLabel)}`);
      } else if (contact.emails.length > 1) {
        console.log('-Emails:');
        contact.emails.forEach((email) => {
          const emailLabel = email.label || contact.label || contact.company;
          console.log(`-${email.value} ${TextUtils.reverseHebrewText(emailLabel)}`);
        });
      } else {
        console.log('-Email:');
      }
      if (contact.phones.length === 1) {
        const phoneLabel = contact.phones[0].label || contact.label || contact.company;
        console.log(`-Phone: ${contact.phones[0].number} ${TextUtils.reverseHebrewText(phoneLabel)}`);
      } else if (contact.phones.length > 1) {
        console.log('-Phones:');
        contact.phones.forEach((phone) => {
          const phoneLabel = phone.label || contact.label || contact.company;
          console.log(`-${phone.number} ${TextUtils.reverseHebrewText(phoneLabel)}`);
        });
      } else {
        console.log('-Phone:');
      }
      if (contact.websites.length === 1) {
        const urlLabel = contact.websites[0].label || contact.label || contact.company;
        console.log(`-LinkedIn URL: ${TextUtils.reverseHebrewText(contact.websites[0].url)} ${TextUtils.reverseHebrewText(urlLabel)}`);
      } else if (contact.websites.length > 1) {
        console.log('-LinkedIn URL:');
        contact.websites.forEach((website) => {
          const urlLabel = website.label || contact.label || contact.company;
          console.log(`-${TextUtils.reverseHebrewText(website.url)} ${TextUtils.reverseHebrewText(urlLabel)}`);
        });
      } else {
        console.log('-LinkedIn URL:');
      }
      console.log('================\n');
    }
  }
}
