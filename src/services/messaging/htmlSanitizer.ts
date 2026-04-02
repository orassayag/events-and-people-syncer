import { injectable } from 'inversify';
import { RegexPatterns } from '../../regex';
import { SETTINGS } from '../../settings';
import type { SanitizeResult } from '../../types';

export { SanitizeResult };

@injectable()
export class HtmlSanitizer {
  sanitize(html: string): SanitizeResult {
    let scriptsRemoved = 0;
    let stylesRemoved = 0;
    let sanitized = html.replace(RegexPatterns.SCRIPT_TAG, () => {
      scriptsRemoved++;
      return '';
    });
    sanitized = sanitized.replace(RegexPatterns.STYLE_TAG, () => {
      stylesRemoved++;
      return '';
    });
    return {
      html: sanitized,
      scriptsRemoved,
      stylesRemoved,
    };
  }

  validateSize(html: string): {
    valid: boolean;
    sizeBytes: number;
    maxBytes: number;
  } {
    const sizeBytes = Buffer.byteLength(html, 'utf-8');
    const maxBytes = SETTINGS.smsWhatsappSync.maxHtmlSizeBytes;
    return {
      valid: sizeBytes <= maxBytes,
      sizeBytes,
      maxBytes,
    };
  }

  isHtml(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed.includes('<') || !trimmed.includes('>')) {
      return false;
    }
    const htmlTagPatterns = [
      /<html/i,
      /<div/i,
      /<span/i,
      /<body/i,
      /<head/i,
      /<meta/i,
      /<script/i,
      /<link/i,
    ];
    return htmlTagPatterns.some((pattern) => pattern.test(trimmed));
  }
}
