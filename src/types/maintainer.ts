// ⚠️ NEVER reuse or reassign an ID — only add new entries with the next incremented ID.
// IDs are permanent and referenced in exclusion JSON files and backups.
export const MaintainerIssueDefinitions = {
  CONTAINS_HEBREW: { id: 1, message: 'CONTAINS HEBREW' },
  EMPTY_NAME: { id: 2, message: 'EMPTY NAME' },
  EMPTY_CONTACT: { id: 3, message: 'EMPTY CONTACT' },
  DUPLICATE_CONTACTS: { id: 4, message: 'DUPLICATE CONTACTS' },
  POSSIBLE_DUPLICATE_CONTACT: { id: 5, message: 'POSSIBLE DUPLICATE CONTACT' },
  MISSING_LABEL: { id: 6, message: 'MISSING LABEL' },
  WRONG_LABEL: { id: 7, message: 'WRONG LABEL' },
  MISSING_PHONE_EMAIL_LABEL: { id: 8, message: 'MISSING PHONE/EMAIL LABEL' },
  INVALID_PHONE_EMAIL_LABEL: { id: 9, message: 'INVALID PHONE/EMAIL LABEL' },
  PHONE_LABEL_NOT_MATCH_TO_COMPANY_NAME: {
    id: 10,
    message: 'PHONE LABEL NOT MATCH TO COMPANY NAME',
  },
  EMAIL_LABEL_NOT_MATCH_TO_COMPANY_NAME: {
    id: 11,
    message: 'EMAIL LABEL NOT MATCH TO COMPANY NAME',
  },
  PHONE_CONTAINS_SEPARATORS: { id: 12, message: 'PHONE CONTAINS SEPARATORS' },
  MISSING_URL_LABEL: { id: 13, message: 'MISSING URL LABEL' },
  INVALID_URL_LABEL: { id: 14, message: 'INVALID URL LABEL' },
  DUPLICATE_PHONE_GLOBAL: { id: 15, message: 'DUPLICATE PHONE - GLOBAL' },
  DUPLICATE_PHONE_SINGLE: { id: 16, message: 'DUPLICATE PHONE - SINGLE' },
  DUPLICATE_EMAIL_GLOBAL: { id: 17, message: 'DUPLICATE EMAIL - GLOBAL' },
  DUPLICATE_EMAIL_SINGLE: { id: 18, message: 'DUPLICATE EMAIL - SINGLE' },
  DUPLICATE_URL_GLOBAL: { id: 19, message: 'DUPLICATE URL - GLOBAL' },
  DUPLICATE_URL_SINGLE: { id: 20, message: 'DUPLICATE URL - SINGLE' },
  MISSING_REQUIRED_URL_FOR_LABEL: {
    id: 21,
    message: 'MISSING REQUIRED URL FOR #LABEL#',
  },
  INVALID_URL: { id: 22, message: 'INVALID URL' },
  PHONE_GLOBAL_PREFIX: { id: 23, message: 'PHONE GLOBAL PREFIX' },
  PHONE_CONTAIN_SPACES: { id: 24, message: 'PHONE_CONTAIN_SPACES: #VALUE#' },
  OUTDATED_COMPANY_NAME: {
    id: 25,
    message: 'OUTDATED COMPANY NAME - SHOULD BE: #FIXED#',
  },
  INVALID_NAME: { id: 26, message: 'INVALID NAME - SHOULD BE: #FIXED#' },
  INVALID_CONTACT_NAME: { id: 27, message: 'INVALID CONTACT - Name: #FIXED#' },
  INVALID_CONTACT_COMPANY: {
    id: 28,
    message: 'INVALID CONTACT - Company: #FIXED#',
  },
  NOTES_CONTAINS_BREAK_LINES: { id: 29, message: 'NOTES CONTAINS BREAK LINES' },
  CONTAINS_WHITE_SPACES: {
    id: 30,
    message: 'CONTAINS WHITE SPACES IN FIELDS: #FIELDS#',
  },
  OTHER_CONTACT: { id: 31, message: 'OTHER CONTACT' },
  POSSIBLE_DUPLICATE_CONTACTS_BY_NOTES: {
    id: 32,
    message: 'POSSIBLE DUPLICATE CONTACTS BY NOTES',
  },
  LOWER_CASE_NAME: { id: 33, message: 'LOWER CASE NAME' },
  UPPER_CASE_NAME: { id: 34, message: 'UPPER CASE NAME' },
  CONTAINS_HIDDEN_UNICODE_CHARACTER: {
    id: 35,
    message: 'CONTAINS_HIDDEN_UNICODE_CHARACTER',
  },
  MISSING_SUB_LABEL: { id: 36, message: 'MISSING SUB-LABEL FOR: #LABEL#' },
  INVALID_ORDER_FOR_SUB_LABEL: {
    id: 37,
    message: 'INVALID ORDER FOR SUB-LABEL',
  },
  INVALID_MIXED_LABELED: { id: 38, message: 'INVALID MIXED LABELED' },
  INVALID_LABEL: { id: 39, message: 'INVALID LABEL' },
  INVALID_LABEL_NAME: {
    id: 40,
    message: 'INVALID LABEL NAME - SHOULD BE: #FIXED#',
  },
  CONTAINS_MULTIPLE_SPACES: {
    id: 41,
    message: 'CONTAINS MULTIPLE SPACES IN FIELD: #FIELD#',
  },
  INVALID_EMAIL: { id: 42, message: 'INVALID EMAIL' },
  LINKEDIN_CONTACT_MISSING_EMAIL_OR_PHONE: {
    id: 43,
    message: 'LINKEDIN CONTACT MISSING EMAIL OR PHONE',
  },
  JOB_TITLE_START_IS_INVALID: {
    id: 44,
    message: 'JOB TITLE START IS INVALID',
  },
  CONTAINS_ADDRESS: { id: 45, message: 'CONTAINS ADDRESS' },
  MIXED_UNKNOWN_AND_OTHER_TAGS: {
    id: 46,
    message: 'MIXED UNKNOWN AND OTHER TAGS',
  },
  UNKNOWN_LABEL_WITH_CONNECTED_ON: {
    id: 47,
    message: 'UNKNOWN LABEL WITH CONNECTED ON IN NOTES',
  },
  EMAIL_IN_NOTES_NOT_IN_CONTACT: {
    id: 48,
    message: 'EMAIL IN NOTES NOT IN CONTACT: #VALUE#',
  },
  PHONE_IN_NOTES_NOT_IN_CONTACT: {
    id: 49,
    message: 'PHONE IN NOTES NOT IN CONTACT: #VALUE#',
  },
  MISSING_COMPANY_AFTER_LINKEDIN: {
    id: 50,
    message: 'MISSING COMPANY AFTER LINKEDIN: #FIELDS#',
  },
  PHONE_CONTAINS_EMAIL: {
    id: 51,
    message: 'PHONE CONTAINS EMAIL: #VALUE#',
  },
  DUPLICATE_EMAIL_IN_OTHER_CONTACT: {
    id: 52,
    message: 'DUPLICATE EMAIL IN OTHER CONTACT IN: #CONTACT-LINK#',
  },
  COMPANY_CONTACT_MISSING_OFFICE_LABEL: {
    id: 53,
    message: 'COMPANY CONTACT MISSING OFFICE LABEL',
  },
  COMPANY_CONTACT_INVALID_FIRST_NAME: {
    id: 54,
    message: 'COMPANY CONTACT INVALID FIRST NAME - SHOULD BE: #FIXED#',
  },
  COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE: {
    id: 55,
    message: 'COMPANY CONTACT LAST NAME MUST START WITH OFFICE',
  },
  COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE: {
    id: 56,
    message: 'COMPANY CONTACT INVALID COMBINATION AFTER OFFICE - SHOULD BE: #FIXED#',
  },
  COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION: {
    id: 57,
    message: 'COMPANY CONTACT COMPANY FIELD DOES NOT MATCH COMBINATION - SHOULD BE: #FIXED#',
  },
  COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION: {
    id: 58,
    message: 'COMPANY CONTACT PHONE/EMAIL LABEL DOES NOT MATCH COMBINATION: #VALUE#',
  },
  COMPANY_CONTACT_INVALID_URL: {
    id: 59,
    message: 'COMPANY CONTACT INVALID URL - SHOULD BE: #FIXED#',
  },
  COMPANY_CONTACT_INVALID_URL_LABEL: {
    id: 60,
    message: 'COMPANY CONTACT INVALID URL LABEL - SHOULD BE: LinkedIn',
  },
  MISSING_CODE_LABEL: { id: 61, message: 'MISSING CODE LABEL' },
} as const;

export type MaintainerIssueType = keyof typeof MaintainerIssueDefinitions;

// This allows using MaintainerIssueType.CONTAINS_HEBREW in code
export const MaintainerIssueType = Object.fromEntries(
  Object.keys(MaintainerIssueDefinitions).map((key) => [key, key])
) as { [K in MaintainerIssueType]: K };

// Build a lookup map: numeric ID → issue key
export const issueIdMap = new Map(
  Object.entries(MaintainerIssueDefinitions).map(([key, def]) => [
    def.id,
    key as MaintainerIssueType,
  ])
);

export interface ExclusionEntry {
  id: string;
  reason?: string;
  // Absent or true = the rule is enforced; false = the rule is ignored during validation.
  active?: boolean;
}

export interface ContactExclusion extends ExclusionEntry {
  excludeIssues: number[];
}

export interface ExclusionFile {
  skippedContacts: ExclusionEntry[];
  contactExclusions: ContactExclusion[];
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
    addresses?: { formattedValue: string; label: string }[];
    company: string;
    jobTitle: string;
    biography: string;
  };
  issues: MaintainerIssueType[];
  customIssueMessages?: Partial<Record<MaintainerIssueType, string>>;
  duplicateDetails?: Partial<
    Record<
      MaintainerIssueType,
      { value: string; otherContacts: { id: string; name: string }[] }[]
    >
  >;
}
