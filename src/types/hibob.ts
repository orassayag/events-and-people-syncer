import { ContactType } from './linkedin';

export interface HibobContact {
  type: ContactType.HIBOB;
  firstName: string;
  lastName?: string;
  email?: string;
}

export interface HibobSyncStatus {
  processed: number;
  new: number;
  upToDate: number;
  updated: number;
  warning: number;
  needClarification: number;
  error: number;
  skipped: number;
  previouslyAlerted: number;
}

export interface ContactWithDetails {
  contact: HibobContact;
  label: string;
  reason?: string;
}
