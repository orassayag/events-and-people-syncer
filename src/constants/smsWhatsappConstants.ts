import type { DetectionSelector } from '../types';

export { DetectionSelector };

export const SMS_WHATSAPP_CONSTANTS = {
  GOOGLE_MESSAGES_SELECTORS: [
    {
      pattern: 'messages.google.com',
      selector: 'link[href*="messages.google.com"]',
      stable: true,
    },
    {
      pattern: 'MW_CONFIG',
      selector: 'script:contains("MW_CONFIG")',
      stable: true,
    },
    {
      pattern: 'mws-conversation-list-item',
      selector: 'mws-conversation-list-item',
      stable: true,
    },
    {
      pattern: 'mws-conversation-snippet',
      selector: 'mws-conversation-snippet',
      stable: true,
    },
    {
      pattern: 'mws-relative-timestamp',
      selector: 'mws-relative-timestamp',
      stable: true,
    },
    {
      pattern: 'data-e2e-',
      selector: '[data-e2e-conversation-name]',
      stable: true,
    },
    {
      pattern: '_ngcontent-ng-c',
      selector: '[_ngcontent-ng-c*]',
      stable: false,
    },
    { pattern: 'mws-icon', selector: 'mws-icon', stable: true },
    {
      pattern: 'android-messages-web',
      selector: 'meta[name="application-name"][content*="android"]',
      stable: true,
    },
    {
      pattern: 'Google Messages for web',
      selector: 'title:contains("Google Messages")',
      stable: true,
    },
  ] as DetectionSelector[],
  WHATSAPP_WEB_SELECTORS: [
    { pattern: 'id="whatsapp-web"', selector: '#whatsapp-web', stable: true },
    {
      pattern: 'static.whatsapp.net',
      selector: '[src*="static.whatsapp.net"]',
      stable: true,
    },
    {
      pattern: 'web.whatsapp.com',
      selector: 'link[href*="web.whatsapp.com"]',
      stable: true,
    },
    {
      pattern: '/data/manifest.json',
      selector: 'link[href*="/data/manifest.json"]',
      stable: true,
    },
    { pattern: 'app-wrapper-web', selector: '.app-wrapper-web', stable: false },
    { pattern: 'data-icon="', selector: '[data-icon]', stable: false },
    {
      pattern: 'WhatsApp Web',
      selector: 'title:contains("WhatsApp Web")',
      stable: true,
    },
    {
      pattern: 'data-btmanifest',
      selector: '[data-btmanifest]',
      stable: false,
    },
    {
      pattern: 'requireLazy',
      selector: 'script:contains("requireLazy")',
      stable: false,
    },
    {
      pattern: 'wa-popovers-bucket',
      selector: '#wa-popovers-bucket',
      stable: false,
    },
  ] as DetectionSelector[],
  PHONE_PATTERNS: {
    PHONE_UNIVERSAL: /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/,
    EXTRACTION: /[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,20}/g,
  },
};
