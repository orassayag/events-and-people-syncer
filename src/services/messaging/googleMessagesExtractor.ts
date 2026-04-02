import { injectable } from 'inversify';
import { RegexPatterns } from '../../regex';
import { PhoneNormalizer } from '../contacts';
import type { ExtractedContact, MessagePlatformExtractor } from '../../types';

@injectable()
export class GoogleMessagesExtractor implements MessagePlatformExtractor {
  private readonly phoneNormalizer = new PhoneNormalizer();
  extractPhones(html: string): ExtractedContact[] {
    const senderPattern = new RegExp(
      RegexPatterns.GOOGLE_MESSAGES_SENDER.source,
      'g'
    );
    const messagePattern = new RegExp(
      RegexPatterns.GOOGLE_MESSAGES_MESSAGE.source,
      'g'
    );
    const senders = [...html.matchAll(senderPattern)].map(
      (m) => m[1]?.trim() ?? ''
    );
    const messages = [...html.matchAll(messagePattern)].map((m) =>
      this.cleanMessageContent(m[1])
    );
    const contacts: ExtractedContact[] = [];
    const seenPhones = new Set<string>();
    for (let i = 0; i < senders.length; i++) {
      const text = senders[i];
      const message = messages[i] ?? '';
      if (text && this.isLikelyPhoneNumber(text)) {
        const normalizedPhone = this.phoneNormalizer.normalize(text);
        if (
          !seenPhones.has(normalizedPhone) &&
          this.validateExtractedPhone(text)
        ) {
          seenPhones.add(normalizedPhone);
          contacts.push({
            phone: text,
            normalizedPhone,
            message: message || undefined,
          });
        }
      }
    }
    return contacts;
  }

  private cleanMessageContent(text: string): string {
    return text
      .replace(/<span[^>]*data-is-emoji[^>]*>[^<]*<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private isLikelyPhoneNumber(value: string): boolean {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    if (RegexPatterns.DATE_MM_DD_YYYY.test(value)) return false;
    if (RegexPatterns.DATE_MM_DD_YYYY_DASH.test(value)) return false;
    if (RegexPatterns.DATE_YYYY_MM_DD.test(value)) return false;
    if (RegexPatterns.CSS_PX.test(value)) return false;
    if (RegexPatterns.CSS_PERCENT.test(value)) return false;
    if (RegexPatterns.CSS_EM.test(value)) return false;
    if (RegexPatterns.CSS_REM.test(value)) return false;
    if (RegexPatterns.CSS_VH.test(value)) return false;
    if (RegexPatterns.CSS_VW.test(value)) return false;
    if (RegexPatterns.TIME_AM_PM.test(value)) return false;
    if (RegexPatterns.TIME_HH_MM.test(value)) return false;
    if (RegexPatterns.YEAR_ONLY.test(value)) return false;
    if (/^\d+$/.test(value) && digitsOnly.length < 10) return false;
    return RegexPatterns.PHONE_UNIVERSAL.test(value);
  }

  private validateExtractedPhone(phone: string): boolean {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    if (/^0+$/.test(digitsOnly) || /^(.)\1+$/.test(digitsOnly)) return false;
    return true;
  }
}
