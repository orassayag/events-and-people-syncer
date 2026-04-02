import type { Alert, LinkedInConnection, ContactData } from './';

export interface ParseResult {
  validAlerts: Alert[];
  corruptedEntries: number;
  parseErrors: string[];
}

export interface WarningEntry {
  connection: LinkedInConnection;
  matches: ContactData[];
  reason: string;
  score?: number;
}
