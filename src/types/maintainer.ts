export enum MaintainerIssueType {
  CONTAINS_HEBREW = 'CONTAINS HEBREW',
  EMPTY_NAME = 'EMPTY NAME',
  DUPLICATE_CONTACTS = 'DUPLICATE CONTACTS',
  MISSING_LABEL = 'MISSING LABEL',
  MISSING_PHONE_EMAIL_LABEL = 'MISSING PHONE/EMAIL LABEL',
  INVALID_PHONE_EMAIL_LABEL = 'INVALID PHONE/EMAIL LABEL',
  MISSING_URL_LABEL = 'MISSING URL LABEL',
  INVALID_URL_LABEL = 'INVALID URL LABEL',
  DUPLICATE_PHONE_GLOBAL_SINGLE = 'DUPLICATE PHONE - GLOBAL/SINGLE',
  DUPLICATE_EMAIL_GLOBAL_SINGLE = 'DUPLICATE EMAIL - GLOBAL/SINGLE',
  DUPLICATE_URL_GLOBAL_SINGLE = 'DUPLICATE URL - GLOBAL/SINGLE',
  MISSING_REQUIRED_URL_FOR_HR_JOB_LABEL = 'MISSING REQUIRED URL FOR HR/JOB LABEL',
  INVALID_URL = 'INVALID URL',
  OUTDATED_COMPANY_NAME = 'OUTDATED COMPANY NAME - SHOULD BE: #FIXED#',
  INVALID_NAME = 'INVALID NAME - SHOULD BE: #FIXED#',
  NOTES_CONTAINS_BREAK_LINES = 'NOTES CONTAINS BREAK LINES',
  CONTAINS_WHITE_SPACES = 'CONTAINS WHITE SPACES IN FIELDS: #FIELDS#',
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
}
