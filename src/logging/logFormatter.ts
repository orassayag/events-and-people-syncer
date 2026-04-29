import { EMOJIS } from '../constants';
import { LinkedInConnection, UpdateDetails, HibobContact } from '../types';
import {
  calculateFormattedCompany,
  stripCompanyPrefixOverlapFromName,
} from '../utils';

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
    const formattedCompany = isLinkedIn
      ? calculateFormattedCompany((contact as LinkedInConnection).company, 2)
      : '';

    // Logic matching the syncer's lastNameValue
    const getEnrichedFullName = (
      firstName: string,
      lastName: string | undefined,
      company: string
    ) => {
      const enrichedLastName = [lastName, company]
        .filter((s) => s)
        .join(' ')
        .replace(/'/g, '')
        .trim();
      return `${firstName} ${enrichedLastName}`.trim();
    };

    const calculatedLabel = formattedCompany.replace(/'/g, '');
    const lastNameForDisplay: string = isLinkedIn
      ? stripCompanyPrefixOverlapFromName(
          contact.lastName ?? '',
          (contact as LinkedInConnection).company
        )
      : (contact.lastName ?? '');
    const currentFullName = getEnrichedFullName(
      contact.firstName,
      lastNameForDisplay,
      formattedCompany
    );

    let fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName}`;
    if (type === 'UPDATE' && updateDetails?.lastName) {
      const oldFullName = `${contact.firstName} ${updateDetails.lastName.from}`;
      // In updateDetails.lastName.to, the label and company are already included because of how lastNameValue is calculated in updateContact
      fullNameStr = `${EMOJIS.FIELDS.PERSON} Full name: ${currentFullName} (${oldFullName} => ${currentFullName})`;
    }
    lines.push(fullNameStr);

    if (type === 'SKIP') {
      const reason =
        updateDetails?.skipReason || 'Existing match found - skipping update';
      lines.push(`${EMOJIS.NAVIGATION.SKIP}  Reason: ${reason}`);
      lines.push('=======================');
      return lines.join('\n');
    }

    lines.push(`${EMOJIS.FIELDS.LABEL}  Labels: ${label.replace(/'/g, '')}`);

    const companyDisplay = isLinkedIn ? formattedCompany : label;
    lines.push(`${EMOJIS.FIELDS.COMPANY} Company: ${companyDisplay}`);

    const positionRaw = isLinkedIn
      ? ((contact as LinkedInConnection).position?.trim() ?? '')
      : '';
    const jobTitle = isLinkedIn ? positionRaw || '(none)' : '(none)';
    let jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${jobTitle}`;
    if (type === 'UPDATE' && updateDetails?.jobTitle) {
      const toDisplay = updateDetails.jobTitle.to.trim() || '(none)';
      jobTitleStr = `${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${toDisplay} (${updateDetails.jobTitle.from} => ${toDisplay})`;
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

    const linkedInUrl = isLinkedIn
      ? (contact as LinkedInConnection).url
      : '(none)';
    let linkedInUrlStr = `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${linkedInUrl}`;
    if (type === 'UPDATE' && updateDetails?.linkedInUrlAdded) {
      linkedInUrlStr += ' (Added)';
    }
    lines.push(linkedInUrlStr);

    lines.push('=======================');
    return lines.join('\n');
  }
}
