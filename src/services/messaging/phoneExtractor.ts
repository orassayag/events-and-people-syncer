import { injectable, inject } from 'inversify';
import type { MessagePlatformExtractor, ExtractedContact, MessageSource } from '../../types';
import { GoogleMessagesExtractor } from './googleMessagesExtractor';
import { WhatsAppWebExtractor } from './whatsappWebExtractor';

export { MessagePlatformExtractor };

@injectable()
export class PhoneExtractor {
  private strategies: Map<MessageSource, MessagePlatformExtractor> = new Map();

  constructor(
    @inject(GoogleMessagesExtractor) googleExtractor: GoogleMessagesExtractor,
    @inject(WhatsAppWebExtractor) whatsappExtractor: WhatsAppWebExtractor
  ) {
    this.strategies.set('google-messages', googleExtractor);
    this.strategies.set('whatsapp-web', whatsappExtractor);
  }

  extractPhoneNumbers(html: string, source: MessageSource): ExtractedContact[] {
    const strategy = this.strategies.get(source);
    if (!strategy) {
      throw new Error(`No extraction strategy for source: ${source}`);
    }
    return strategy.extractPhones(html);
  }

  deduplicateContacts(contacts: ExtractedContact[]): ExtractedContact[] {
    const seen = new Set<string>();
    const unique: ExtractedContact[] = [];
    for (const contact of contacts) {
      if (!seen.has(contact.normalizedPhone)) {
        seen.add(contact.normalizedPhone);
        unique.push(contact);
      }
    }
    return unique;
  }
}
