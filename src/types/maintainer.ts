export enum MaintainerIssueType {
  CONTAINS_HEBREW = 'CONTAINS HEBREW',
  EMPTY_NAME = 'EMPTY NAME',
  DUPLICATE_CONTACTS = 'DUPLICATE CONTACTS',
  MISSING_LABEL = 'MISSING LABEL',
  WRONG_LABEL = 'WRONG LABEL',
  MISSING_PHONE_EMAIL_LABEL = 'MISSING PHONE/EMAIL LABEL',
  INVALID_PHONE_EMAIL_LABEL = 'INVALID PHONE/EMAIL LABEL',
  MISSING_URL_LABEL = 'MISSING URL LABEL',
  INVALID_URL_LABEL = 'INVALID URL LABEL',
  DUPLICATE_PHONE_GLOBAL = 'DUPLICATE PHONE - GLOBAL',
  DUPLICATE_PHONE_SINGLE = 'DUPLICATE PHONE - SINGLE',
  DUPLICATE_EMAIL_GLOBAL = 'DUPLICATE EMAIL - GLOBAL',
  DUPLICATE_EMAIL_SINGLE = 'DUPLICATE EMAIL - SINGLE',
  DUPLICATE_URL_GLOBAL = 'DUPLICATE URL - GLOBAL',
  DUPLICATE_URL_SINGLE = 'DUPLICATE URL - SINGLE',
  MISSING_REQUIRED_URL_FOR_HR_JOB_LABEL = 'MISSING REQUIRED URL FOR HR/JOB LABEL',
  INVALID_URL = 'INVALID URL',
  OUTDATED_COMPANY_NAME = 'OUTDATED COMPANY NAME - SHOULD BE: #FIXED#',
  INVALID_NAME = 'INVALID NAME - SHOULD BE: #FIXED#',
  INVALID_CONTACT_NAME = 'INVALID CONTACT - Name: #FIXED#',
  INVALID_CONTACT_COMPANY = 'INVALID CONTACT - Company: #FIXED#',
  NOTES_CONTAINS_BREAK_LINES = 'NOTES CONTAINS BREAK LINES',
  CONTAINS_WHITE_SPACES = 'CONTAINS WHITE SPACES IN FIELDS: #FIELDS#',
  OTHER_CONTACT = 'OTHER CONTACT',
}

export interface MaintainerException {
  name?: string;
  url?: string;
  reason: string;
}

export interface MaintainerReportItem {
  contact: {
    firstName: string;
    lastName: string;
    resourceName?: string;
    fullName: string;
    label: string;
    phones: { number: string; label: string }[];
    emails: { value: string; label: string }[];
    websites: { url: string; label: string }[];
    company: string;
    jobTitle: string;
    biography: string;
  };
  issues: MaintainerIssueType[];
  customIssueMessages?: Partial<Record<MaintainerIssueType, string>>;
  duplicateDetails?: Partial<
    Record<MaintainerIssueType, { value: string; otherContactIds: string[] }[]>
  >;
}
