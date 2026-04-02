import { describe, it, expect } from 'vitest';
import { PhoneExtractor } from '../phoneExtractor';
import { GoogleMessagesExtractor } from '../googleMessagesExtractor';
import { WhatsAppWebExtractor } from '../whatsappWebExtractor';
import type { ExtractedContact } from '../../../types/smsWhatsappSync';

describe('PhoneExtractor', () => {
  const googleExtractor = new GoogleMessagesExtractor();
  const whatsappExtractor = new WhatsAppWebExtractor();
  const extractor = new PhoneExtractor(googleExtractor, whatsappExtractor);

  describe('extractPhoneNumbers', () => {
    it('should use Google Messages extractor for google-messages source', () => {
      const html =
        '<span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhoneNumbers(html, 'google-messages');
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+1234567890');
    });

    it('should use WhatsApp extractor for whatsapp-web source', () => {
      const html = '<span dir="auto">+1234567890</span>';
      const contacts = extractor.extractPhoneNumbers(html, 'whatsapp-web');
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+1234567890');
    });

    it('should throw error for unknown source', () => {
      const html = '<div>Test</div>';
      expect(() => {
        extractor.extractPhoneNumbers(html, 'unknown' as never);
      }).toThrow('No extraction strategy for source: unknown');
    });
  });

  describe('deduplicateContacts', () => {
    it('should remove duplicate contacts by normalized phone', () => {
      const contacts: ExtractedContact[] = [
        { phone: '+1234567890', normalizedPhone: '+1234567890' },
        { phone: '+1 234 567 890', normalizedPhone: '+1234567890' },
        { phone: '+0987654321', normalizedPhone: '+0987654321' },
      ];
      const unique = extractor.deduplicateContacts(contacts);
      expect(unique).toHaveLength(2);
    });

    it('should keep first occurrence when duplicates exist', () => {
      const contacts: ExtractedContact[] = [
        {
          phone: '+1234567890',
          normalizedPhone: '+1234567890',
          suggestedName: 'John',
        },
        {
          phone: '+1234567890',
          normalizedPhone: '+1234567890',
          suggestedName: 'Jane',
        },
      ];
      const unique = extractor.deduplicateContacts(contacts);
      expect(unique).toHaveLength(1);
      expect(unique[0].suggestedName).toBe('John');
    });

    it('should return empty array for empty input', () => {
      const unique = extractor.deduplicateContacts([]);
      expect(unique).toHaveLength(0);
    });

    it('should preserve all contacts when no duplicates', () => {
      const contacts: ExtractedContact[] = [
        { phone: '+1111111111', normalizedPhone: '+1111111111' },
        { phone: '+2222222222', normalizedPhone: '+2222222222' },
        { phone: '+3333333333', normalizedPhone: '+3333333333' },
      ];
      const unique = extractor.deduplicateContacts(contacts);
      expect(unique).toHaveLength(3);
    });
  });
});
