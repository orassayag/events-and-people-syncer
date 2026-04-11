export enum ContactType {
  HIBOB = 'hibob',
  LINKEDIN = 'linkedin',
}

export interface LinkedInConnection {
  type: ContactType.LINKEDIN;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  position: string;
  url: string;
  connectedOn: string;
}

export interface CompanyMapping {
  label: string;
  companyName: string;
}

export interface CompanyCacheData {
  timestamp: number;
  mappings: CompanyMapping[];
}

export enum MatchType {
  EXACT = 'exact',
  FUZZY = 'fuzzy',
  UNCERTAIN = 'uncertain',
  NONE = 'none',
}
import type { DuplicateMatch } from './services';

export interface MatchResult {
  matchType: MatchType;
  resourceName?: string;
  score?: number;
  matches?: DuplicateMatch[];
  exactMatchMessage?: string;
}

export interface SyncStatus {
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

export enum SyncStatusType {
  NEW = 'new',
  UP_TO_DATE = 'upToDate',
  UPDATED = 'updated',
  WARNING = 'warning',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

export interface UpdateDetails {
  lastName?: { from: string; to: string };
  jobTitle?: { from: string; to: string };
  emailAdded?: string;
  linkedInUrlAdded?: boolean;
  linkedInUrlLabelFixed?: boolean;
  noteUpdated?: { from: string; to: string };
}

export interface SyncResult {
  status: SyncStatusType;
  updateDetails?: UpdateDetails;
  error?: {
    message: string;
    stack?: string;
  };
}
