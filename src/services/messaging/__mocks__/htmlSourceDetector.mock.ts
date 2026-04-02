import type {
  DetectionResult,
  MessageSource,
  SelectorResult,
} from '../../../types/smsWhatsappSync';

const createSelectors = (
  matchedSelectors: string[],
  failedSelectors: string[]
): SelectorResult[] => {
  return [
    ...matchedSelectors.map((pattern) => ({
      pattern,
      selector: `[${pattern}]`,
      matched: true,
    })),
    ...failedSelectors.map((pattern) => ({
      pattern,
      selector: `[${pattern}]`,
      matched: false,
    })),
  ];
};

export const createMockDetectionResult = (
  source: MessageSource | null,
  confidence: number = 80,
  matchedSelectors: string[] = [],
  failedSelectors: string[] = []
): DetectionResult => ({
  source,
  matchedSelectors,
  failedSelectors,
  selectors: createSelectors(matchedSelectors, failedSelectors),
  confidence,
});

export const mockGoogleMessagesDetection: DetectionResult = {
  source: 'google-messages',
  matchedSelectors: [
    'messages.google.com',
    'MW_CONFIG',
    'mws-conversation-list-item',
    'mws-conversation-snippet',
    'mws-relative-timestamp',
    'data-e2e-',
    'mws-icon',
  ],
  failedSelectors: [
    '_ngcontent-ng-c',
    'android-messages-web',
    'Google Messages for web',
  ],
  selectors: createSelectors(
    [
      'messages.google.com',
      'MW_CONFIG',
      'mws-conversation-list-item',
      'mws-conversation-snippet',
      'mws-relative-timestamp',
      'data-e2e-',
      'mws-icon',
    ],
    ['_ngcontent-ng-c', 'android-messages-web', 'Google Messages for web']
  ),
  confidence: 70,
};

export const mockWhatsAppWebDetection: DetectionResult = {
  source: 'whatsapp-web',
  matchedSelectors: [
    'id="whatsapp-web"',
    'static.whatsapp.net',
    'web.whatsapp.com',
    '/data/manifest.json',
    'WhatsApp Web',
  ],
  failedSelectors: [
    'app-wrapper-web',
    'data-icon="',
    'data-btmanifest',
    'requireLazy',
    'wa-popovers-bucket',
  ],
  selectors: createSelectors(
    [
      'id="whatsapp-web"',
      'static.whatsapp.net',
      'web.whatsapp.com',
      '/data/manifest.json',
      'WhatsApp Web',
    ],
    [
      'app-wrapper-web',
      'data-icon="',
      'data-btmanifest',
      'requireLazy',
      'wa-popovers-bucket',
    ]
  ),
  confidence: 50,
};

export const mockNoSourceDetection: DetectionResult = {
  source: null,
  matchedSelectors: [],
  failedSelectors: [],
  selectors: [],
  confidence: 0,
};

export const mockLowConfidenceDetection: DetectionResult = {
  source: 'whatsapp-web',
  matchedSelectors: ['static.whatsapp.net', 'web.whatsapp.com'],
  failedSelectors: [
    'id="whatsapp-web"',
    '/data/manifest.json',
    'app-wrapper-web',
    'data-icon="',
    'WhatsApp Web',
    'data-btmanifest',
    'requireLazy',
    'wa-popovers-bucket',
  ],
  selectors: createSelectors(
    ['static.whatsapp.net', 'web.whatsapp.com'],
    [
      'id="whatsapp-web"',
      '/data/manifest.json',
      'app-wrapper-web',
      'data-icon="',
      'WhatsApp Web',
      'data-btmanifest',
      'requireLazy',
      'wa-popovers-bucket',
    ]
  ),
  confidence: 20,
};

export class MockHtmlSourceDetector {
  private mockResult: DetectionResult = mockNoSourceDetection;
  setMockResult(result: DetectionResult): void {
    this.mockResult = result;
  }

  detectSource(_html: string): DetectionResult {
    return this.mockResult;
  }

  isLowConfidence(confidence: number): boolean {
    return confidence < 70;
  }

  getSourceDisplayName(source: MessageSource | null): string {
    if (source === 'google-messages') return 'Google Messages';
    if (source === 'whatsapp-web') return 'WhatsApp Web';
    return 'Unknown';
  }
}
