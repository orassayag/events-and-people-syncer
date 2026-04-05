import { TextUtils } from '../../utils';
import { FormatUtils } from '../../constants/formatUtils';
import { EMOJIS } from '../../constants';
import type { SyncableContact } from './contactSyncer';

export class ContactDisplay {
  static displayContact(
    syncableContact: SyncableContact,
    currentIndex: number,
    totalCount: number
  ): void {
    const { contact, reasons } = syncableContact;
    console.log(`\n${EMOJIS.DATA.REASON}  Reason: ${reasons.join(', ')}`);
    console.log(
      `${EMOJIS.DATA.INDEX} Contact Index: ${FormatUtils.formatNumberWithLeadingZeros(currentIndex)}/${FormatUtils.formatNumberWithLeadingZeros(totalCount)}`
    );
    console.log(`${EMOJIS.DATA.ID} Contact ID: ${contact.resourceName}\n`);
    const displayLabel = contact.label
      ? TextUtils.reverseHebrewText(contact.label)
      : '';
    const displayCompany = contact.company
      ? TextUtils.reverseHebrewText(contact.company)
      : '';
    const displayFirstName = contact.firstName
      ? TextUtils.reverseHebrewText(contact.firstName)
      : '';
    const displayLastName = contact.lastName
      ? TextUtils.reverseHebrewText(contact.lastName)
      : '';
    const fullName = `${displayFirstName} ${displayLastName}`.trim();
    const fullNameWithLabel = fullName
      ? `${fullName} ${displayLabel} ${displayCompany}`.trim()
      : '';
    console.log(`${EMOJIS.FIELDS.PERSON} Full name: ${fullNameWithLabel}`);
    console.log(`${EMOJIS.FIELDS.LABEL} Labels: ${displayLabel}`);
    console.log(`${EMOJIS.FIELDS.COMPANY} Company: ${displayCompany}`);
    const displayJobTitle = contact.jobTitle
      ? TextUtils.reverseHebrewText(contact.jobTitle)
      : '';
    console.log(`${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${displayJobTitle}`);
    if (contact.emails && contact.emails.length > 0) {
      const firstEmail = contact.emails[0];
      const displayEmail = TextUtils.reverseHebrewText(firstEmail.value);
      const displayEmailLabel = firstEmail.label
        ? TextUtils.reverseHebrewText(firstEmail.label)
        : '';
      const emailParts = [
        displayEmail,
        displayEmailLabel,
        displayCompany,
      ].filter((s) => s);
      console.log(`${EMOJIS.FIELDS.EMAIL} Email: ${emailParts.join(' ')}`);
    } else {
      console.log(`${EMOJIS.FIELDS.EMAIL} Email: `);
    }
    if (contact.phones && contact.phones.length > 0) {
      const firstPhone = contact.phones[0];
      const displayPhone = TextUtils.reverseHebrewText(firstPhone.number);
      const displayPhoneLabel = firstPhone.label
        ? TextUtils.reverseHebrewText(firstPhone.label)
        : '';
      const phoneParts = [
        displayPhone,
        displayPhoneLabel,
        displayCompany,
      ].filter((s) => s);
      console.log(`${EMOJIS.FIELDS.PHONE} Phone: ${phoneParts.join(' ')}`);
    } else {
      console.log(`${EMOJIS.FIELDS.PHONE} Phone: `);
    }
    const linkedInWebsite = contact.websites.find(
      (w) =>
        w.label.toLowerCase().includes('linkedin') ||
        w.url.toLowerCase().includes('linkedin.com')
    );
    if (linkedInWebsite) {
      const displayLinkedInUrl = linkedInWebsite.url;
      const displayLinkedInLabel = linkedInWebsite.label;
      console.log(
        `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${displayLinkedInUrl} ${displayLinkedInLabel}`
      );
    } else {
      console.log(`${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: `);
    }
    console.log('');
  }

  static displaySummary(
    added: number,
    updated: number,
    skipped: number,
    error: number
  ): void {
    const totalWidth = 56;
    const title = 'Contacts Sync Summary';
    const line1 = `Added: ${FormatUtils.formatNumberWithLeadingZeros(added)} | Updated: ${FormatUtils.formatNumberWithLeadingZeros(updated)}`;
    const line2 = `Skipped: ${FormatUtils.formatNumberWithLeadingZeros(skipped)} | Error: ${FormatUtils.formatNumberWithLeadingZeros(error)}`;
    console.log('\n' + FormatUtils.padLineWithEquals(title, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line1, totalWidth));
    console.log(FormatUtils.padLineWithEquals(line2, totalWidth));
    console.log('='.repeat(totalWidth));
  }
}
