import { describe, it, expect } from 'vitest';
import { isHtmlContent } from '../clipboardReader';

describe('clipboardReader', () => {
  describe('isHtmlContent', () => {
    it('should detect html with html tag', () => {
      expect(isHtmlContent('<html><body>Hello</body></html>')).toBe(true);
    });

    it('should detect html with div tag', () => {
      expect(isHtmlContent('<div>Hello</div>')).toBe(true);
    });

    it('should detect html with span tag', () => {
      expect(isHtmlContent('<span>Hello</span>')).toBe(true);
    });

    it('should detect html with body tag', () => {
      expect(isHtmlContent('<body>Hello</body>')).toBe(true);
    });

    it('should detect html with head tag', () => {
      expect(isHtmlContent('<head><title>Test</title></head>')).toBe(true);
    });

    it('should detect html with meta tag', () => {
      expect(isHtmlContent('<meta charset="utf-8">')).toBe(true);
    });

    it('should detect html with script tag', () => {
      expect(isHtmlContent('<script>alert(1)</script>')).toBe(true);
    });

    it('should detect html with link tag', () => {
      expect(isHtmlContent('<link rel="stylesheet" href="style.css">')).toBe(
        true
      );
    });

    it('should reject plain text', () => {
      expect(isHtmlContent('Hello World')).toBe(false);
    });

    it('should reject text without angle brackets', () => {
      expect(isHtmlContent('No tags here at all')).toBe(false);
    });

    it('should reject text with only opening bracket', () => {
      expect(isHtmlContent('Less than <')).toBe(false);
    });

    it('should reject text with only closing bracket', () => {
      expect(isHtmlContent('Greater than >')).toBe(false);
    });

    it('should reject text with angle brackets but no html tags', () => {
      expect(isHtmlContent('5 < 10 and 10 > 5')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(isHtmlContent('  <div>Hello</div>  ')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isHtmlContent('<HTML><BODY>Hello</BODY></HTML>')).toBe(true);
      expect(isHtmlContent('<Div>Hello</Div>')).toBe(true);
    });

    it('should detect complex html structure', () => {
      const complexHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Test</title>
          </head>
          <body>
            <div class="container">
              <span>Hello World</span>
            </div>
          </body>
        </html>
      `;
      expect(isHtmlContent(complexHtml)).toBe(true);
    });
  });
});
