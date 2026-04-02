import { Container } from 'inversify';
import 'reflect-metadata';
import { TYPES } from './identifiers';
import { Logger } from '../logging';
import { 
  DuplicateDetector, 
  ContactSyncer as ContactSyncService, 
  ContactEditor, 
  EventsContactEditor,
  PhoneNormalizer
} from '../services/contacts';
import { 
  LinkedInExtractor, 
  CompanyMatcher, 
  ConnectionMatcher, 
  ContactSyncer 
} from '../services/linkedin';
import {
  LinkedInSyncScript,
  HibobSyncScript,
  ContactsSyncScript,
  EventsJobsSyncScript,
  StatisticsScript,
  ClearCacheScript,
  ClearLogsScript,
  SmsWhatsappSyncScript,
  OtherContactsSyncScript
} from '../scripts';
import { HibobExtractor, HibobContactSyncer } from '../services/hibob';
import { PathValidator } from '../validators';
import { FolderManager, FolderMatcher } from '../services/folders';
import { NoteWriter } from '../services/notes';
import { LabelResolver } from '../services/labels';
import { StatisticsCollector } from '../services/statistics';
import { 
  HtmlSanitizer, 
  HtmlSourceDetector, 
  GoogleMessagesExtractor, 
  WhatsAppWebExtractor, 
  PhoneExtractor 
} from '../services/messaging';
import { OtherContactsFetcher } from '../services/otherContacts';

export const container: Container = new Container();

container.bind(TYPES.Logger).toDynamicValue(() => new Logger('App'));
container.bind(DuplicateDetector).toSelf().inSingletonScope();
container.bind(LinkedInExtractor).toSelf();
container.bind(CompanyMatcher).toSelf();
container.bind(ConnectionMatcher).toSelf();
container.bind(ContactSyncer).toSelf();
container.bind(LinkedInSyncScript).toSelf();
container.bind(HibobExtractor).toSelf();
container.bind(HibobContactSyncer).toSelf();
container.bind(HibobSyncScript).toSelf();
container.bind(ContactSyncService).toSelf();
container.bind(ContactsSyncScript).toSelf();
container.bind(ContactEditor).toSelf().inSingletonScope();
container.bind(FolderMatcher).toSelf();
container.bind(NoteWriter).toSelf();
container.bind(FolderManager).toSelf();
container.bind(PathValidator).toSelf();
container.bind(LabelResolver).toSelf();
container.bind(EventsContactEditor).toSelf();
container.bind(EventsJobsSyncScript).toSelf();
container.bind(StatisticsCollector).toSelf();
container.bind(StatisticsScript).toSelf();
container.bind(ClearCacheScript).toSelf();
container.bind(ClearLogsScript).toSelf();
container.bind(HtmlSanitizer).toSelf();
container.bind(HtmlSourceDetector).toSelf();
container.bind(GoogleMessagesExtractor).toSelf();
container.bind(WhatsAppWebExtractor).toSelf();
container.bind(PhoneExtractor).toSelf();
container.bind(PhoneNormalizer).toSelf();
container.bind(SmsWhatsappSyncScript).toSelf();
container.bind(OtherContactsFetcher).toSelf();
container.bind(OtherContactsSyncScript).toSelf();
