export interface SmsWhatsappSyncStats {
  added: number;
  updated: number;
  skipped: number;
  error: number;
}
export interface ExtractedContact {
  phone: string;
  normalizedPhone: string;
  suggestedName?: string;
  message?: string;
}
export interface SelectorResult {
  pattern: string;
  selector: string;
  matched: boolean;
}
export interface DetectionResult {
  source: 'google-messages' | 'whatsapp-web' | null;
  matchedSelectors: string[];
  failedSelectors: string[];
  selectors: SelectorResult[];
  confidence: number;
}
export type MessageSource = 'google-messages' | 'whatsapp-web';
