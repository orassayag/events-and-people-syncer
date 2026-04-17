import { EMOJIS } from '../constants';
import { LinkedInConnection, UpdateDetails, HibobContact } from '../types';
import { calculateFormattedCompany } from '../utils';

export class LogFormatter {
  static formatContactBlock(
    type: 'ADD' | 'UPDATE' | 'SKIP',
    contact: LinkedInConnection | HibobContact,
    label: string,
    updateDetails?: UpdateDetails
  ): string {
    const lines: string[] = [];
    lines.push('=======================');

    const isLinkedIn = contact.type === 'linkedin';
    const formattedCompany = isLinkedIn ? calculateFormattedCompany((contact as LinkedInConnection).company, 2) : '';
    
    // Logic matching the syncer's lastNameValue
    const getEnrichedFullName = (firstName: string, lastName: string | undefined, lbl: string, company: string) => {
        const enrichedLastName = [
          lastName,
          company.toLowerCase().startsWith(lbl.toLowerCase()) ? '' : lbl,
          company
        ].filter(s => s).join(' ').replace(/'/g, '').trim();
        return `${firstName} ${enrichedLastName}`.trim();
    };

    const calculatedLabel = (formattedCompany.toLowerCase().startsWith(label.toLowerCase()) ? formattedCompany : [label, formattedCompany].filter(Boolean).join(' ')).replace(/'/g, '');
    const currentFullName = getEnrichedFullName(contact.firstName, contact.lastName, label.replace(/'/g, ''), formattedCompany);
    
    let fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName}`;
    if (type === 'UPDATE' && updateDetails?.lastName) {
      const oldFullName = `${contact.firstName} ${updateDetails.lastName.from}`;
      // In updateDetails.lastName.to, the label and company are already included because of how lastNameValue is calculated in updateContact
      fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName} (${oldFullName} => ${currentFullName})`;
    }
    lines.push(fullNameStr);

    lines.push(`${EMOJIS.FIELDS.LABEL}  Labels: ${label.replace(/'/g, '')}`);

    const companyDisplay = isLinkedIn ? formattedCompany : label;
    lines.push(`${EMOJIS.FIELDS.COMPANY} Company: ${companyDisplay}`);

    const jobTitle = isLinkedIn ? (contact as LinkedInConnection).position : '(none)';
    let jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${jobTitle}`;
    if (type === 'UPDATE' && updateDetails?.jobTitle) {
        jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${updateDetails.jobTitle.to} (${updateDetails.jobTitle.from} => ${updateDetails.jobTitle.to})`;
    }
    lines.push(jobTitleStr);

    const email = contact.email || '(none)';
    let emailStr = `${EMOJIS.FIELDS.EMAIL} Email: ${email}${email !== '(none)' && calculatedLabel ? ` ${calculatedLabel}` : ''}`;
    if (type === 'UPDATE' && updateDetails?.emailAdded) {
        emailStr = `${EMOJIS.FIELDS.EMAIL} Email: ${updateDetails.emailAdded} ${calculatedLabel} (Added)`;
    }
    lines.push(emailStr);

    const phone = '(none)'; // No phone in current connection types
    let phoneStr = `${EMOJIS.FIELDS.PHONE} Phone: ${phone}${phone !== '(none)' && calculatedLabel ? ` ${calculatedLabel}` : ''}`;
    lines.push(phoneStr);

    const linkedInUrl = isLinkedIn ? (contact as LinkedInConnection).url : '(none)';
    let linkedInUrlStr = `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${linkedInUrl}`;
    if (type === 'UPDATE' && updateDetails?.linkedInUrlAdded) {
        linkedInUrlStr += ' (Added)';
    }
    lines.push(linkedInUrlStr);

    if (type === 'SKIP') {
      lines.push(`${EMOJIS.NAVIGATION.SKIP}  Reason: Existing match found - skipping update`);
    }

    lines.push('=======================');
    return lines.join('\n');
  }
}
