import { injectable } from 'inversify';
import { SMS_WHATSAPP_CONSTANTS, DetectionSelector } from '../../constants';
import { SETTINGS } from '../../settings';
import type {
  DetectionResult,
  MessageSource,
  SelectorResult,
} from '../../types';

@injectable()
export class HtmlSourceDetector {
  detectSource(html: string): DetectionResult {
    const googleResult = this.checkSelectors(
      html,
      SMS_WHATSAPP_CONSTANTS.GOOGLE_MESSAGES_SELECTORS
    );
    const whatsappResult = this.checkSelectors(
      html,
      SMS_WHATSAPP_CONSTANTS.WHATSAPP_WEB_SELECTORS
    );
    const googleThreshold =
      SETTINGS.smsWhatsappSync.googleMessagesDetectionThreshold;
    const whatsappThreshold =
      SETTINGS.smsWhatsappSync.whatsappWebDetectionThreshold;
    const googleMatched =
      googleResult.matchedSelectors.length >= googleThreshold;
    const whatsappMatched =
      whatsappResult.matchedSelectors.length >= whatsappThreshold;
    if (googleMatched && !whatsappMatched) {
      return {
        source: 'google-messages',
        matchedSelectors: googleResult.matchedSelectors,
        failedSelectors: googleResult.failedSelectors,
        selectors: googleResult.selectors,
        confidence: googleResult.confidence,
      };
    }
    if (whatsappMatched && !googleMatched) {
      return {
        source: 'whatsapp-web',
        matchedSelectors: whatsappResult.matchedSelectors,
        failedSelectors: whatsappResult.failedSelectors,
        selectors: whatsappResult.selectors,
        confidence: whatsappResult.confidence,
      };
    }
    if (googleMatched && whatsappMatched) {
      if (googleResult.confidence >= whatsappResult.confidence) {
        return {
          source: 'google-messages',
          matchedSelectors: googleResult.matchedSelectors,
          failedSelectors: googleResult.failedSelectors,
          selectors: googleResult.selectors,
          confidence: googleResult.confidence,
        };
      }
      return {
        source: 'whatsapp-web',
        matchedSelectors: whatsappResult.matchedSelectors,
        failedSelectors: whatsappResult.failedSelectors,
        selectors: whatsappResult.selectors,
        confidence: whatsappResult.confidence,
      };
    }
    const allSelectors: SelectorResult[] = [
      ...SMS_WHATSAPP_CONSTANTS.GOOGLE_MESSAGES_SELECTORS.map((s) => ({
        pattern: s.pattern,
        selector: s.selector,
        matched: false,
      })),
      ...SMS_WHATSAPP_CONSTANTS.WHATSAPP_WEB_SELECTORS.map((s) => ({
        pattern: s.pattern,
        selector: s.selector,
        matched: false,
      })),
    ];
    return {
      source: null,
      matchedSelectors: [],
      failedSelectors: [
        ...SMS_WHATSAPP_CONSTANTS.GOOGLE_MESSAGES_SELECTORS.map(
          (s) => s.pattern
        ),
        ...SMS_WHATSAPP_CONSTANTS.WHATSAPP_WEB_SELECTORS.map((s) => s.pattern),
      ],
      selectors: allSelectors,
      confidence: 0,
    };
  }

  private checkSelectors(
    html: string,
    selectors: DetectionSelector[]
  ): {
    matchedSelectors: string[];
    failedSelectors: string[];
    selectors: SelectorResult[];
    confidence: number;
  } {
    const matchedSelectors: string[] = [];
    const failedSelectors: string[] = [];
    const selectorResults: SelectorResult[] = [];
    for (const sel of selectors) {
      const matched = html.includes(sel.pattern);
      if (matched) {
        matchedSelectors.push(sel.pattern);
      } else {
        failedSelectors.push(sel.pattern);
      }
      selectorResults.push({
        pattern: sel.pattern,
        selector: sel.selector,
        matched,
      });
    }
    const confidence = Math.round(
      (matchedSelectors.length / selectors.length) * 100
    );
    return {
      matchedSelectors,
      failedSelectors,
      selectors: selectorResults,
      confidence,
    };
  }

  isLowConfidence(confidence: number): boolean {
    return confidence < SETTINGS.smsWhatsappSync.lowConfidenceWarningThreshold;
  }

  getSourceDisplayName(source: MessageSource | null): string {
    if (source === 'google-messages') return 'Google Messages';
    if (source === 'whatsapp-web') return 'WhatsApp Web';
    return 'Unknown';
  }
}
