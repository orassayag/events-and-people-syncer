import { EMOJIS } from '../constants';
import { LinkedInConnection, UpdateDetails, HibobContact } from '../types';
import { calculateFormattedCompany } from '../utils';

export class LogFormatter {
  static formatContactBlock(
    type: 'ADD' | 'UPDATE',
    contact: LinkedInConnection | HibobContact,
    label: string,
    updateDetails?: UpdateDetails
  ): string {
    const lines: string[] = [];
    lines.push(`===${type} CONTACT START===`);

    const isLinkedIn = contact.type === 'linkedin';
    const formattedCompany = isLinkedIn ? calculateFormattedCompany((contact as LinkedInConnection).company, 2) : '';
    
    // Logic matching the syncer's lastNameValue
    const getEnrichedFullName = (firstName: string, lastName: string | undefined, lbl: string, company: string) => {
        const lastNameParts = [lastName, lbl];
        if (company) lastNameParts.push(company);
        const enrichedLastName = lastNameParts.filter(s => s).join(' ').trim();
        return `${firstName} ${enrichedLastName}`.trim();
    };

    const currentFullName = getEnrichedFullName(contact.firstName, contact.lastName, label, formattedCompany);
    
    let fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName}`;
    if (type === 'UPDATE' && updateDetails?.lastName) {
      const oldFullName = `${contact.firstName} ${updateDetails.lastName.from}`;
      // In updateDetails.lastName.to, the label and company are already included because of how lastNameValue is calculated in updateContact
      fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName} (${oldFullName} => ${currentFullName})`;
    }
    lines.push(fullNameStr);

    lines.push(`${EMOJIS.FIELDS.LABEL}  Labels: ${label}`);

    const companyDisplay = isLinkedIn ? (formattedCompany || (contact as LinkedInConnection).company || '(none)') : label;
    lines.push(`${EMOJIS.FIELDS.COMPANY} Company: ${companyDisplay}`);

    const jobTitle = isLinkedIn ? (contact as LinkedInConnection).position : '(none)';
    let jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${jobTitle}`;
    if (type === 'UPDATE' && updateDetails?.jobTitle) {
        jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${updateDetails.jobTitle.to} (${updateDetails.jobTitle.from} => ${updateDetails.jobTitle.to})`;
    }
    lines.push(jobTitleStr);

    let email = contact.email || '(none)';
    let emailStr = `${EMOJIS.FIELDS.EMAIL} Email: ${email}`;
    if (type === 'UPDATE' && updateDetails?.emailAdded) {
        emailStr = `${EMOJIS.FIELDS.EMAIL} Email: ${updateDetails.emailAdded} (Added)`;
    }
    lines.push(emailStr);

    const phone = '(none)'; // No phone in current connection types
    lines.push(`${EMOJIS.FIELDS.PHONE} Phone: ${phone}`);

    const linkedInUrl = isLinkedIn ? (contact as LinkedInConnection).url : '(none)';
    let linkedInUrlStr = `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${linkedInUrl}`;
    if (type === 'UPDATE' && updateDetails?.linkedInUrlAdded) {
        linkedInUrlStr += ' (Added)';
    }
    lines.push(linkedInUrlStr);

    lines.push(`===${type} CONTACT END===`);
    return lines.join('\n');
  }
}
