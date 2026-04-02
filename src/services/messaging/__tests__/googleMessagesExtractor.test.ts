import { describe, it, expect } from 'vitest';
import { GoogleMessagesExtractor } from '../googleMessagesExtractor';

describe('GoogleMessagesExtractor', () => {
  const extractor = new GoogleMessagesExtractor();

  describe('extractPhones', () => {
    it('should extract phone from data-e2e-conversation-name attribute', () => {
      const html =
        '<span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test message</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+1234567890');
    });

    it('should extract multiple phones', () => {
      const html = `
        <span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">+0987654321</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(2);
    });

    it('should deduplicate same phone numbers', () => {
      const html = `
        <span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">+1234567890</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should normalize extracted phones', () => {
      const html =
        '<span data-e2e-conversation-name="">+1-555-123-4567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].normalizedPhone).toBe('+15551234567');
    });

    it('should skip contact names (non-phone values)', () => {
      const html = '<span data-e2e-conversation-name="">John Doe</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip date-like strings', () => {
      const html = '<span data-e2e-conversation-name="">12/25/2024</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip CSS-like values', () => {
      const html = '<span data-e2e-conversation-name="">100px</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip time-like values', () => {
      const html = '<span data-e2e-conversation-name="">10:30 AM</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip all zeros phone', () => {
      const html = '<span data-e2e-conversation-name="">0000000000</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip repeated digit phone', () => {
      const html = '<span data-e2e-conversation-name="">1111111111</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should return empty array for html without phones', () => {
      const html = '<div><p>Just some text</p></div>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should handle Israeli format', () => {
      const html =
        '<span data-e2e-conversation-name="">+972501234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+972501234567');
    });

    it('should handle local format with leading zero', () => {
      const html =
        '<span data-e2e-conversation-name="">050-123-4567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract main phone even with extension text', () => {
      const html =
        '<span data-e2e-conversation-name="">+1-234-567-8900</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should skip very long phone sequences (more than 15 digits)', () => {
      const html =
        '<span data-e2e-conversation-name="">12345678901234567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip year-only values', () => {
      const html = '<span data-e2e-conversation-name="">2024</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should handle UK phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+44 20 7946 0958</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle German phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+49 30 1234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle French phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+33 1 23 45 67 89</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle Japanese phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+81 3-1234-5678</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle Chinese phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+86 10 1234 5678</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle Australian phone format', () => {
      const html =
        '<span data-e2e-conversation-name="">+61 2 1234 5678</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract multiple international formats', () => {
      const html = `
        <span data-e2e-conversation-name="">+15551234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">+442079460958</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
        <span data-e2e-conversation-name="">+972521234567</span><mws-conversation-snippet><span dir="auto" class="ng-star-inserted">Test</span></mws-conversation-snippet>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(3);
    });
  });
});
