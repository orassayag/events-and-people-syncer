export interface OtherContactsSyncStats {
  added: number;
  updated: number;
  skipped: number;
  error: number;
  phonesAutoAdded: number;
}
export interface OtherContactEntry {
  emails: string[];
  phones: string[];
  resourceName: string;
  displayName?: string;
}
