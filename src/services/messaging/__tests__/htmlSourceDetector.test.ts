import { describe, it, expect } from 'vitest';
import { HtmlSourceDetector } from '../htmlSourceDetector';

describe('HtmlSourceDetector', () => {
  const detector = new HtmlSourceDetector();

  describe('detectSource', () => {
    it('should detect Google Messages with multiple selectors', () => {
      const html = `
        messages.google.com
        MW_CONFIG
        mws-conversation-list-item
        mws-conversation-snippet
        mws-relative-timestamp
        data-e2e-conversation-name="+1234567890"
        mws-icon
      `;
      const result = detector.detectSource(html);
      expect(result.source).toBe('google-messages');
      expect(result.matchedSelectors.length).toBeGreaterThanOrEqual(5);
    });

    it('should detect WhatsApp Web with multiple selectors', () => {
      const html = `
        id="whatsapp-web"
        static.whatsapp.net
        web.whatsapp.com
        /data/manifest.json
        WhatsApp Web
        <span class="_ao3e">+1234567890</span>
      `;
      const result = detector.detectSource(html);
      expect(result.source).toBe('whatsapp-web');
      expect(result.matchedSelectors.length).toBeGreaterThanOrEqual(5);
    });

    it('should return null source when no selectors match', () => {
      const html = '<div><p>Plain HTML content</p></div>';
      const result = detector.detectSource(html);
      expect(result.source).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should return null when insufficient selectors match', () => {
      const html = `
        <div data-e2e-conversation-name="+1234567890">Conversation</div>
      `;
      const result = detector.detectSource(html);
      expect(result.source).toBeNull();
    });

    it('should prefer higher confidence when both match thresholds', () => {
      const html = `
        messages.google.com
        MW_CONFIG
        mws-conversation-list-item
        mws-conversation-snippet
        mws-relative-timestamp
        data-e2e-
        id="whatsapp-web"
        static.whatsapp.net
        web.whatsapp.com
        /data/manifest.json
        WhatsApp Web
      `;
      const result = detector.detectSource(html);
      expect(result.source).not.toBeNull();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('isLowConfidence', () => {
    it('should return true for confidence below threshold', () => {
      expect(detector.isLowConfidence(30)).toBe(true);
    });

    it('should return true for confidence at 50 (threshold is 70)', () => {
      expect(detector.isLowConfidence(50)).toBe(true);
    });

    it('should return false for confidence at threshold', () => {
      expect(detector.isLowConfidence(70)).toBe(false);
    });

    it('should return false for high confidence', () => {
      expect(detector.isLowConfidence(80)).toBe(false);
    });
  });

  describe('getSourceDisplayName', () => {
    it('should return Google Messages for google-messages', () => {
      expect(detector.getSourceDisplayName('google-messages')).toBe(
        'Google Messages'
      );
    });

    it('should return WhatsApp Web for whatsapp-web', () => {
      expect(detector.getSourceDisplayName('whatsapp-web')).toBe(
        'WhatsApp Web'
      );
    });

    it('should return Unknown for null', () => {
      expect(detector.getSourceDisplayName(null)).toBe('Unknown');
    });
  });
});
