import { injectable } from 'inversify';
import { JSDOM } from 'jsdom';
import { RegexPatterns } from '../../regex';
import { PhoneNormalizer } from '../contacts';
import type { ExtractedContact, MessagePlatformExtractor } from '../../types';

@injectable()
export class WhatsAppWebExtractor implements MessagePlatformExtractor {
  private readonly phoneNormalizer = new PhoneNormalizer();
  extractPhones(html: string): ExtractedContact[] {
    const contacts: ExtractedContact[] = [];
    const seenPhones = new Set<string>();
    const rowContacts = this.extractFromRows(html, seenPhones);
    if (rowContacts.length > 0) {
      contacts.push(...rowContacts);
      return contacts;
    }
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    this.extractFromSpanDirAuto(doc, contacts, seenPhones);
    if (contacts.length === 0) {
      this.extractFromAo3eClass(doc, contacts, seenPhones);
    }
    if (contacts.length === 0) {
      this.extractFromTitleAttributes(doc, contacts, seenPhones);
    }
    if (contacts.length === 0) {
      this.extractFromTextNodes(html, contacts, seenPhones);
    }
    return contacts;
  }

  private extractFromRows(
    html: string,
    seenPhones: Set<string>
  ): ExtractedContact[] {
    const contacts: ExtractedContact[] = [];
    const rowPattern = new RegExp(RegexPatterns.WHATSAPP_ROW.source, 'g');
    const rows = [...html.matchAll(rowPattern)];
    for (const row of rows) {
      const rowHtml = row[1];
      if (this.isGroupChat(rowHtml)) continue;
      const contactMatch = rowHtml.match(RegexPatterns.WHATSAPP_CONTACT_TITLE);
      if (!contactMatch) continue;
      const contactTitle = contactMatch[1];
      if (!this.isLikelyPhoneNumber(contactTitle)) continue;
      const normalizedPhone = this.phoneNormalizer.normalize(contactTitle);
      if (seenPhones.has(normalizedPhone)) continue;
      if (!this.validateExtractedPhone(contactTitle)) continue;
      seenPhones.add(normalizedPhone);
      const allTitlesPattern = new RegExp(
        RegexPatterns.WHATSAPP_ALL_TITLES.source,
        'g'
      );
      const allTitles = [...rowHtml.matchAll(allTitlesPattern)].map(
        (m) => m[1]
      );
      const messagePreview = allTitles.find(
        (t) => t !== contactTitle && t.length > 1
      );
      contacts.push({
        phone: contactTitle,
        normalizedPhone,
        message: messagePreview
          ? this.cleanMessageContent(messagePreview)
          : undefined,
      });
    }
    return contacts;
  }

  private isGroupChat(rowHtml: string): boolean {
    return RegexPatterns.WHATSAPP_GROUP_SENDER.test(rowHtml);
  }

  private cleanMessageContent(text: string): string {
    return text
      .replace(/&#x202B;/g, '')
      .replace(/&#x202C;/g, '')
      .replace(/&#x202A;/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private extractFromSpanDirAuto(
    doc: Document,
    contacts: ExtractedContact[],
    seenPhones: Set<string>
  ): void {
    const spans = doc.querySelectorAll('span[dir="auto"]');
    for (const span of spans) {
      const text = span.textContent?.trim();
      if (text && this.isLikelyPhoneNumber(text)) {
        const normalizedPhone = this.phoneNormalizer.normalize(text);
        if (
          !seenPhones.has(normalizedPhone) &&
          this.validateExtractedPhone(text)
        ) {
          seenPhones.add(normalizedPhone);
          const ariaLabel = span.getAttribute('aria-label');
          const suggestedName = ariaLabel
            ? this.extractNameFromAriaLabel(ariaLabel)
            : undefined;
          contacts.push({
            phone: text,
            normalizedPhone,
            suggestedName,
          });
        }
      }
      const tildeText = span.textContent?.trim();
      if (tildeText) {
        const tildeName = this.extractNameFromTildePrefix(tildeText);
        if (tildeName) {
          const phoneSpan =
            span.previousElementSibling ||
            span.parentElement?.querySelector('span[dir="auto"]');
          if (phoneSpan && phoneSpan !== span) {
            const phoneText = phoneSpan.textContent?.trim();
            if (phoneText && this.isLikelyPhoneNumber(phoneText)) {
              const normalizedPhone = this.phoneNormalizer.normalize(phoneText);
              const existing = contacts.find(
                (c) => c.normalizedPhone === normalizedPhone
              );
              if (existing && !existing.suggestedName) {
                existing.suggestedName = tildeName;
              }
            }
          }
        }
      }
    }
  }

  private extractFromAo3eClass(
    doc: Document,
    contacts: ExtractedContact[],
    seenPhones: Set<string>
  ): void {
    const ao3eSpans = doc.querySelectorAll('span._ao3e, [class*="_ao3e"]');
    for (const span of ao3eSpans) {
      const text = span.textContent?.trim();
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
          });
        }
      }
    }
  }

  private extractFromTitleAttributes(
    doc: Document,
    contacts: ExtractedContact[],
    seenPhones: Set<string>
  ): void {
    const titledElements = doc.querySelectorAll('[title]');
    for (const el of titledElements) {
      const title = el.getAttribute('title');
      if (title && this.isLikelyPhoneNumber(title)) {
        const normalizedPhone = this.phoneNormalizer.normalize(title);
        if (
          !seenPhones.has(normalizedPhone) &&
          this.validateExtractedPhone(title)
        ) {
          seenPhones.add(normalizedPhone);
          contacts.push({
            phone: title,
            normalizedPhone,
          });
        }
      }
    }
  }

  private extractFromTextNodes(
    html: string,
    contacts: ExtractedContact[],
    seenPhones: Set<string>
  ): void {
    const pattern = new RegExp(RegexPatterns.PHONE_EXTRACTION.source, 'g');
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const text = match[0]?.trim();
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
          });
        }
      }
    }
  }

  private extractNameFromAriaLabel(ariaLabel: string): string | undefined {
    const match = ariaLabel.match(RegexPatterns.WHATSAPP_MAYBE_NAME);
    return match ? match[1].trim() : undefined;
  }

  private extractNameFromTildePrefix(text: string): string | undefined {
    const match = text.match(RegexPatterns.WHATSAPP_TILDE_NAME);
    return match ? match[1].trim() : undefined;
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
