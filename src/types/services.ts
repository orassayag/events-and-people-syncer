import type { ContactData } from './contact';
import type { EditableContactData } from './validation';
import type { ExtractedContact } from './smsWhatsappSync';
import type { LinkedInConnection, ContactType } from './linkedin';

export type SimilarityType = 'Full Name' | 'Email' | 'Phone' | 'LinkedIn';

export interface ContactGroupMap {
  [name: string]: string;
}

export interface PrePopulatedData extends Partial<EditableContactData> {
  skipLabelConfirmation?: boolean;
  labelResourceNames?: string[];
  company?: string;
}

export type SupportedContact = LinkedInConnection | { type: ContactType.HIBOB; firstName: string; lastName?: string; email?: string };

export interface DuplicateMatch {
  contact: ContactData;
  similarityType: SimilarityType;
  score?: number;
}

export interface SyncableContact {
  contact: ContactData;
  priorityLevel: 1 | 2 | 3 | 4;
  reasons: string[];
  resourceName: string;
}

export interface LabelResolutionResult {
  resourceName: string;
  created: boolean;
}

export interface NoteUpdateResult {
  shouldUpdate: boolean;
  newNoteValue: string;
}

export interface MessagePlatformExtractor {
  extractPhones(html: string): ExtractedContact[];
}

export interface SanitizeResult {
  html: string;
  scriptsRemoved: number;
  stylesRemoved: number;
}

export type DuplicatePromptResult =
  | { action: 'create_new' }
  | { action: 'use_existing'; contact: ContactData };
