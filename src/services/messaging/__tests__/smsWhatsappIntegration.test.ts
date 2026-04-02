import { describe, it, expect } from 'vitest';
import { HtmlSanitizer } from '../htmlSanitizer';
import { HtmlSourceDetector } from '../htmlSourceDetector';
import { GoogleMessagesExtractor } from '../googleMessagesExtractor';
import { WhatsAppWebExtractor } from '../whatsappWebExtractor';
import { PhoneExtractor } from '../phoneExtractor';
import { PhoneNormalizer } from '../../contacts';

describe('SMS/WhatsApp Integration Tests', () => {
  const htmlSanitizer = new HtmlSanitizer();
  const sourceDetector = new HtmlSourceDetector();
  const googleExtractor = new GoogleMessagesExtractor();
  const whatsappExtractor = new WhatsAppWebExtractor();
  const phoneExtractor = new PhoneExtractor(googleExtractor, whatsappExtractor);
  const phoneNormalizer = new PhoneNormalizer();

  describe('Google Messages full flow', () => {
    const googleMessagesHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Messages for web</title>
          <script>var MW_CONFIG = {};</script>
        </head>
        <body>
          messages.google.com
          android-messages-web
          <mws-icon></mws-icon>
          <div class="mws-conversation-list-item">
            <div class="mws-conversation-snippet">Hello there</div>
            <span class="mws-relative-timestamp">Yesterday</span>
            <div data-e2e-conversation-name="">+972501234567</span></div>
            <mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test message</span></mws-conversation-snippet>
            <div data-e2e-test="true"></div>
          </div>
          <div class="mws-conversation-list-item">
            <div data-e2e-conversation-name="">+1-555-987-6543</span></div>
            <mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Another message</span></mws-conversation-snippet>
          </div>
          <div class="mws-conversation-list-item">
            <div data-e2e-conversation-name="">John Doe</span></div>
            <mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Message</span></mws-conversation-snippet>
          </div>
        </body>
      </html>
    `;

    it('should sanitize and detect source', () => {
      const sanitized = htmlSanitizer.sanitize(googleMessagesHtml);
      expect(sanitized.scriptsRemoved).toBe(1);
      const detection = sourceDetector.detectSource(sanitized.html);
      expect(detection.source).toBe('google-messages');
    });

    it('should extract phone numbers only (not names)', () => {
      const sanitized = htmlSanitizer.sanitize(googleMessagesHtml);
      const contacts = phoneExtractor.extractPhoneNumbers(
        sanitized.html,
        'google-messages'
      );
      expect(contacts.length).toBe(2);
      expect(contacts.some((c) => c.phone.includes('972'))).toBe(true);
      expect(contacts.some((c) => c.phone.includes('555'))).toBe(true);
      expect(contacts.some((c) => c.phone.includes('John'))).toBe(false);
    });
  });

  describe('WhatsApp Web full flow', () => {
    const whatsappWebHtml = `
      <!DOCTYPE html>
      <html id="whatsapp-web">
        <head>
          <title>WhatsApp Web</title>
          <link rel="manifest" href="/data/manifest.json">
          <style>.container { width: 100%; }</style>
        </head>
        <body>
          static.whatsapp.net
          web.whatsapp.com
          <div class="app-wrapper-web">
            <div class="_ao3e">
              <span dir="auto">+972509876543</span>
            </div>
            <div class="_ao3e">
              <span dir="auto" title="+1-555-123-4567">+1-555-123-4567</span>
            </div>
            <div>
              <span dir="auto">John Smith</span>
            </div>
          </div>
        </body>
      </html>
    `;

    it('should sanitize and detect source', () => {
      const sanitized = htmlSanitizer.sanitize(whatsappWebHtml);
      expect(sanitized.stylesRemoved).toBe(1);
      const detection = sourceDetector.detectSource(sanitized.html);
      expect(detection.source).toBe('whatsapp-web');
    });

    it('should extract phone numbers only (not names)', () => {
      const sanitized = htmlSanitizer.sanitize(whatsappWebHtml);
      const contacts = phoneExtractor.extractPhoneNumbers(
        sanitized.html,
        'whatsapp-web'
      );
      expect(contacts.length).toBe(2);
      expect(contacts.some((c) => c.phone.includes('972'))).toBe(true);
      expect(contacts.some((c) => c.phone.includes('555'))).toBe(true);
      expect(contacts.some((c) => c.phone.includes('John'))).toBe(false);
    });
  });

  describe('Phone matching across formats', () => {
    it('should match same phone in different formats', () => {
      const formats = [
        '+972501234567',
        '+972-50-123-4567',
        '050-123-4567',
        '0501234567',
        '972501234567',
      ];
      for (let i = 0; i < formats.length - 1; i++) {
        for (let j = i + 1; j < formats.length; j++) {
          expect(phoneNormalizer.phonesMatch(formats[i], formats[j])).toBe(
            true
          );
        }
      }
    });

    it('should not match different phones', () => {
      expect(
        phoneNormalizer.phonesMatch('+972501234567', '+972509876543')
      ).toBe(false);
    });
  });

  describe('Contact deduplication', () => {
    it('should deduplicate contacts with same normalized phone', () => {
      const contacts = [
        { phone: '+972501234567', normalizedPhone: '+972501234567' },
        { phone: '+972-50-123-4567', normalizedPhone: '+972501234567' },
        { phone: '+972509876543', normalizedPhone: '+972509876543' },
      ];
      const unique = phoneExtractor.deduplicateContacts(contacts);
      expect(unique.length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty HTML', () => {
      const contacts = googleExtractor.extractPhones('');
      expect(contacts).toHaveLength(0);
    });

    it('should handle HTML with only invalid phone numbers', () => {
      const html = `
        data-e2e-conversation-name="0000000000"
        data-e2e-conversation-name="1111111111"
        data-e2e-conversation-name="123"
      `;
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should handle HTML with mixed valid and invalid phones', () => {
      const html = `
        <span data-e2e-conversation-name="">+972501234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">invalid</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
      `;
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(2);
    });

    it('should handle very large HTML (size validation)', () => {
      const validation = htmlSanitizer.validateSize('x'.repeat(1000));
      expect(validation.valid).toBe(true);
      expect(validation.sizeBytes).toBe(1000);
    });
  });

  describe('Edge cases - Very long phone numbers', () => {
    it('should reject phones with 16+ digits in Google Messages', () => {
      const html =
        '<span data-e2e-conversation-name="">1234567890123456</span>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should reject phones with 16+ digits in WhatsApp Web', () => {
      const html = '<span dir="auto">1234567890123456</span>';
      const contacts = whatsappExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should accept phones with exactly 15 digits', () => {
      const html =
        '<span data-e2e-conversation-name="">123456789012345</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('Edge cases - Date-like and time-like values', () => {
    it('should skip MM/DD/YYYY date format', () => {
      const html = 'data-e2e-conversation-name="12/25/2024"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip YYYY-MM-DD date format', () => {
      const html = 'data-e2e-conversation-name="2024-12-25"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip time format with AM/PM', () => {
      const html = 'data-e2e-conversation-name="10:30 AM"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip year-only values', () => {
      const html = 'data-e2e-conversation-name="2024"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });
  });

  describe('Edge cases - CSS values', () => {
    it('should skip px values', () => {
      const html = 'data-e2e-conversation-name="100px"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip percent values', () => {
      const html = 'data-e2e-conversation-name="50%"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip em values', () => {
      const html = 'data-e2e-conversation-name="1.5em"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip rem values', () => {
      const html = 'data-e2e-conversation-name="2rem"';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });
  });

  describe('Edge cases - International phone formats', () => {
    it('should extract UK phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+44 20 7946 0958</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract German phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+49 30 1234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract French phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+33 1 23 45 67 89</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract Japanese phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+81 3-1234-5678</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('Edge cases - Special phone formats', () => {
    it('should handle standard phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+12345678900</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = googleExtractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });
});
