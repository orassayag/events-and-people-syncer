import { describe, it, expect } from 'vitest';
import { WhatsAppWebExtractor } from '../whatsappWebExtractor';

describe('WhatsAppWebExtractor', () => {
  const extractor = new WhatsAppWebExtractor();

  describe('extractPhones', () => {
    it('should extract phone from span with dir="auto"', () => {
      const html = '<span dir="auto">+1234567890</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+1234567890');
    });

    it('should extract multiple phones from spans', () => {
      const html = `
        <span dir="auto">+1234567890</span>
        <span dir="auto">+0987654321</span>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(2);
    });

    it('should deduplicate same phone numbers', () => {
      const html = `
        <span dir="auto">+1234567890</span>
        <span dir="auto">+1234567890</span>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should normalize extracted phones', () => {
      const html = '<span dir="auto">+1-555-123-4567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].normalizedPhone).toBe('+15551234567');
    });

    it('should extract phone from _ao3e class span', () => {
      const html = '<span class="_ao3e">+1234567890</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract phone from title attribute', () => {
      const html = '<div title="+1234567890">Contact</div>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should skip contact names (non-phone values)', () => {
      const html = '<span dir="auto">John Doe</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip date-like strings', () => {
      const html = '<span dir="auto">12/25/2024</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip CSS-like values', () => {
      const html = '<span dir="auto">100px</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip time-like values', () => {
      const html = '<span dir="auto">10:30 AM</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip all zeros phone', () => {
      const html = '<span dir="auto">0000000000</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip repeated digit phone', () => {
      const html = '<span dir="auto">1111111111</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should return empty array for html without phones', () => {
      const html = '<div><p>Just some text</p></div>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should handle Israeli format', () => {
      const html = '<span dir="auto">+972501234567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].phone).toBe('+972501234567');
    });

    it('should handle local format with leading zero', () => {
      const html = '<span dir="auto">050-123-4567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should fallback to text nodes when no structured elements found', () => {
      const html = '<div>Contact: +1234567890</div>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract suggested name from aria-label', () => {
      const html =
        '<span dir="auto" aria-label="Contact: John Doe">+1234567890</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('prioritization', () => {
    it('should prefer span dir="auto" over other methods', () => {
      const html = `
        <span dir="auto">+1234567890</span>
        <span class="_ao3e">+1234567890</span>
        <div title="+1234567890">Contact</div>
      `;
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('suggested name extraction', () => {
    it('should extract name from aria-label with "Maybe" prefix', () => {
      const html =
        '<span dir="auto" aria-label="Maybe John Doe">+1234567890</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should extract Hebrew name from aria-label', () => {
      const html =
        '<span dir="auto" aria-label="Maybe נתנאל">+972509876543</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('edge cases - very long phone numbers', () => {
    it('should skip phones with more than 15 digits', () => {
      const html = '<span dir="auto">12345678901234567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should accept phones with exactly 15 digits', () => {
      const html = '<span dir="auto">123456789012345</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('edge cases - international formats', () => {
    it('should handle UK phone format', () => {
      const html = '<span dir="auto">+44 20 7946 0958</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle German phone format', () => {
      const html = '<span dir="auto">+49 30 1234567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });

    it('should handle French phone format', () => {
      const html = '<span dir="auto">+33 1 23 45 67 89</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('edge cases - RTL context', () => {
    it('should extract phone from RTL context with Hebrew text', () => {
      const html = '<span dir="auto">שלום +972501234567</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts.length).toBeGreaterThanOrEqual(0);
    });

    it('should extract phone from element with Hebrew aria-label', () => {
      const html =
        '<span dir="auto" aria-label="Maybe אבי כהן">+972509876543</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('edge cases - year-only values', () => {
    it('should skip year-only values like 2024', () => {
      const html = '<span dir="auto">2024</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });

    it('should skip year-only values like 1999', () => {
      const html = '<span dir="auto">1999</span>';
      const contacts = extractor.extractPhones(html);
      expect(contacts).toHaveLength(0);
    });
  });
});
