export enum StatisticsStage {
  SCANNING_JOBS = 'scanning-jobs',
  SCANNING_EVENTS = 'scanning-events',
  COUNTING_NOTES = 'counting-notes',
  FETCHING_CONTACTS = 'fetching-contacts',
  CALCULATING = 'calculating',
}

export interface FileMetadata {
  name: string;
  creationDate: Date;
  size: number;
}

export interface FolderData {
  name: string;
  path: string;
  noteCount: number;
  files: FileMetadata[];
}

export interface FolderStatistics {
  jobFolders: number;
  hrFolders: number;
  eventFolders: number;
  totalFolders: number;
  emptyFolders: number;
}

export interface NoteStatistics {
  jobNotes: number;
  hrNotes: number;
  eventNotes: number;
  totalNotes: number;
  notesToday: number;
  notesThisWeek: number;
}

export interface ContactStatistics {
  googleContacts: number;
  contactsToSync: number;
  otherContactsToSync: number;
}

export interface AverageStatistics {
  avgNotesPerJob: number | null;
  avgNotesPerHR: number | null;
  avgNotesPerEvent: number | null;
}

export interface ActivityStatistics {
  mostActiveFolder: string | null;
  mostActiveFolderCount: number;
  oldestNoteDate: Date | null;
  newestNoteDate: Date | null;
  totalStorageBytes: number;
}

export interface Statistics {
  folders: FolderStatistics;
  notes: NoteStatistics;
  contacts: ContactStatistics;
  averages: AverageStatistics;
  activity: ActivityStatistics;
  timestamp: number;
}

export interface StatisticsProgress {
  stage: StatisticsStage;
  percentage: number;
  message: string;
}
