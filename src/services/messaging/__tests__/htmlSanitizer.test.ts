import { describe, it, expect } from 'vitest';
import { HtmlSanitizer } from '../htmlSanitizer';

describe('HtmlSanitizer', () => {
  const sanitizer = new HtmlSanitizer();

  describe('sanitize', () => {
    it('should remove script tags', () => {
      const html = '<div>Hello</div><script>alert("xss")</script><p>World</p>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div><p>World</p>');
      expect(result.scriptsRemoved).toBe(1);
    });

    it('should remove multiple script tags', () => {
      const html = '<script>a</script><div>Hello</div><script>b</script>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.scriptsRemoved).toBe(2);
    });

    it('should remove style tags', () => {
      const html = '<style>.red { color: red; }</style><div>Hello</div>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.stylesRemoved).toBe(1);
    });

    it('should remove multiple style tags', () => {
      const html = '<style>a</style><div>Hello</div><style>b</style>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.stylesRemoved).toBe(2);
    });

    it('should remove both script and style tags', () => {
      const html = '<script>a</script><style>b</style><div>Hello</div>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.scriptsRemoved).toBe(1);
      expect(result.stylesRemoved).toBe(1);
    });

    it('should handle html with no dangerous tags', () => {
      const html = '<div>Hello <span>World</span></div>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe(html);
      expect(result.scriptsRemoved).toBe(0);
      expect(result.stylesRemoved).toBe(0);
    });

    it('should handle script tags with attributes', () => {
      const html =
        '<script type="text/javascript" src="evil.js"></script><div>Hello</div>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.scriptsRemoved).toBe(1);
    });

    it('should handle multiline script tags', () => {
      const html =
        '<script>\nvar x = 1;\nvar y = 2;\n</script><div>Hello</div>';
      const result = sanitizer.sanitize(html);
      expect(result.html).toBe('<div>Hello</div>');
      expect(result.scriptsRemoved).toBe(1);
    });
  });

  describe('validateSize', () => {
    it('should accept html within size limit', () => {
      const html = '<div>Hello</div>';
      const result = sanitizer.validateSize(html);
      expect(result.valid).toBe(true);
      expect(result.sizeBytes).toBe(Buffer.byteLength(html, 'utf-8'));
    });

    it('should reject html exceeding size limit', () => {
      const largeHtml = 'x'.repeat(20 * 1024 * 1024);
      const result = sanitizer.validateSize(largeHtml);
      expect(result.valid).toBe(false);
    });

    it('should return correct size in bytes for unicode', () => {
      const html = '<div>שלום</div>';
      const result = sanitizer.validateSize(html);
      expect(result.sizeBytes).toBe(Buffer.byteLength(html, 'utf-8'));
    });
  });

  describe('isHtml', () => {
    it('should detect html with html tag', () => {
      expect(sanitizer.isHtml('<html><body>Hello</body></html>')).toBe(true);
    });

    it('should detect html with div tag', () => {
      expect(sanitizer.isHtml('<div>Hello</div>')).toBe(true);
    });

    it('should detect html with span tag', () => {
      expect(sanitizer.isHtml('<span>Hello</span>')).toBe(true);
    });

    it('should detect html with meta tag', () => {
      expect(sanitizer.isHtml('<meta charset="utf-8">')).toBe(true);
    });

    it('should reject plain text', () => {
      expect(sanitizer.isHtml('Hello World')).toBe(false);
    });

    it('should reject text with angle brackets but no html tags', () => {
      expect(sanitizer.isHtml('5 < 10 and 10 > 5')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(sanitizer.isHtml('  <div>Hello</div>  ')).toBe(true);
    });
  });
});
