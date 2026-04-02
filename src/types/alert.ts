export type AlertType = 'warning' | 'error' | 'skipped';

export interface Alert {
  index: number;
  type: AlertType;
  timestamp: string;
  contact: AlertContact;
  reason: string;
}

export interface AlertContact {
  firstName: string;
  lastName: string;
  email?: string;
  url?: string;
  company?: string;
}

export interface AlertCounts {
  warning: number;
  error: number;
  skipped: number;
  total: number;
}

export interface GroupedAlerts {
  warnings: Alert[];
  errors: Alert[];
  skipped: Alert[];
}

export const ALERT_REASONS = {
  WARNING: {
    UNCERTAIN_MATCH: 'Multiple matches or uncertain match',
    FUZZY_MATCH_LOW_CONFIDENCE: 'Fuzzy match with low confidence score',
  },
  ERROR: {
    API_CREATE_FAILED: 'Failed to create contact via Google API',
    API_UPDATE_FAILED: 'Failed to update contact via Google API',
    VALIDATION_FAILED: 'Contact data failed validation',
    MISSING_RESOURCE_NAME: 'Match found but no resourceName available',
    UNEXPECTED_ERROR: 'Unexpected error during processing',
  },
  SKIPPED: {
    MISSING_REQUIRED_DATA: 'Missing required data (email or name)',
    MISSING_EMAIL: 'Missing email address',
    MISSING_NAME: 'Missing first or last name',
    INVALID_EMAIL_FORMAT: 'Email address format is invalid',
  },
} as const;

export type AlertReason =
  | (typeof ALERT_REASONS.WARNING)[keyof typeof ALERT_REASONS.WARNING]
  | (typeof ALERT_REASONS.ERROR)[keyof typeof ALERT_REASONS.ERROR]
  | (typeof ALERT_REASONS.SKIPPED)[keyof typeof ALERT_REASONS.SKIPPED];
