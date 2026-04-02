export enum FolderType {
  JOB = 'job',
  HR = 'hr',
  LIFE_EVENT = 'life-event',
}
export enum ScriptState {
  IDLE = 'idle',
  NOTE_CREATED = 'note_created',
  FOLDER_SELECTED = 'folder_selected',
}
export enum MenuOption {
  WRITE_NOTES = 'write_notes',
  CREATE_NOTE = 'create_note',
  REWRITE_NOTE = 'rewrite_note',
  DELETE_LAST_NOTE = 'delete_last_note',
  DELETE_EMPTY_FOLDER = 'delete_empty_folder',
  RENAME_FOLDER = 'rename_folder',
  ADD_CONTACT = 'add_contact',
  EXIT = 'exit',
}
export interface FolderMapping {
  name: string;
  path: string;
  type: FolderType;
  label: string;
  companyName?: string;
}
export interface FolderMatch {
  folder: FolderMapping;
  score: number;
}
export interface FolderCacheData {
  timestamp: number;
  jobFolders: FolderMapping[];
  lifeEventFolders: FolderMapping[];
}
export interface EventsJobsSyncStats {
  jobNotes: number;
  lifeEventNotes: number;
  contacts: number;
  deletedNotes: number;
  createdFolders: number;
  deletedFolders: number;
  renamedFolders: number;
}
