import type { ContactData } from './contact';
import type { OtherContactEntry } from './otherContactsSync';

export interface ContactCacheData {
  contacts: ContactData[];
  timestamp: number;
}

export interface OtherContactsCacheData {
  version: number;
  entries: OtherContactEntry[];
  timestamp: number;
}
