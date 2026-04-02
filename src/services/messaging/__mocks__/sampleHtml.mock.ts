export const GOOGLE_MESSAGES_SAMPLE_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <title>Google Messages for web</title>
    <script>var MW_CONFIG = { version: '1.0' };</script>
  </head>
  <body>
    <div>messages.google.com</div>
    <div>android-messages-web</div>
    <mws-icon></mws-icon>
    <div class="mws-conversation-list-item">
      <div class="mws-conversation-snippet">Hello there</div>
      <span class="mws-relative-timestamp">Yesterday</span>
      <div data-e2e-conversation-name="+972501234567"></div>
      <div data-e2e-test="true"></div>
    </div>
    <div class="mws-conversation-list-item">
      <div data-e2e-conversation-name="+1-555-987-6543"></div>
    </div>
    <div class="mws-conversation-list-item">
      <div data-e2e-conversation-name="052-999-5784"></div>
    </div>
    <div class="mws-conversation-list-item">
      <div data-e2e-conversation-name="John Doe"></div>
    </div>
    <div class="mws-conversation-list-item">
      <div data-e2e-conversation-name="Mom"></div>
    </div>
  </body>
</html>
`;

export const WHATSAPP_WEB_SAMPLE_HTML = `
<!DOCTYPE html>
<html id="whatsapp-web">
  <head>
    <title>WhatsApp Web</title>
    <meta name="description" content="WhatsApp Web">
    <link rel="manifest" href="/data/manifest.json">
    <style>.container { width: 100%; }</style>
  </head>
  <body>
    <div>static.whatsapp.net</div>
    <div>web.whatsapp.com</div>
    <div class="app-wrapper-web">
      <div class="_ao3e">
        <span dir="auto">+972509876543</span>
      </div>
      <div class="_ao3e">
        <span dir="auto" aria-label="Maybe נתנאל">+972 54-441-9002</span>
      </div>
      <div class="_ao3e">
        <span dir="auto" title="+1-555-123-4567">+1-555-123-4567</span>
      </div>
      <div>
        <span dir="auto">John Smith</span>
      </div>
      <div>
        <span dir="auto">~ David Cohen</span>
      </div>
    </div>
  </body>
</html>
`;

export const WHATSAPP_WEB_GROUP_SAMPLE_HTML = `
<!DOCTYPE html>
<html id="whatsapp-web">
  <head>
    <title>WhatsApp Web</title>
    <meta name="description" content="WhatsApp Web">
    <link rel="manifest" href="/data/manifest.json">
  </head>
  <body>
    <div>static.whatsapp.net</div>
    <div>web.whatsapp.com</div>
    <div class="app-wrapper-web">
      <div class="group-participants">
        <span dir="auto" class="_ao3e">+972 54-441-9002</span>:&nbsp;
        <span dir="auto" class="_ao3e">+972 52-123-4567</span>:&nbsp;
        <span dir="auto" class="_ao3e">+44 20 7946 0958</span>:&nbsp;
        <span dir="auto">Admin User</span>
      </div>
    </div>
  </body>
</html>
`;

export const INVALID_HTML_SAMPLE = `
<div>
  <p>This is just some plain HTML without any messaging platform selectors</p>
  <span>No phones here</span>
</div>
`;

export const EMPTY_HTML_SAMPLE = '';

export const PLAIN_TEXT_SAMPLE = 'This is just plain text, not HTML at all.';

export const HTML_WITH_DATES_AND_TIMES = `
<!DOCTYPE html>
<html>
  <head><title>Google Messages for web</title></head>
  <body>
    messages.google.com MW_CONFIG mws-conversation-list-item mws-conversation-snippet mws-relative-timestamp
    <div data-e2e-conversation-name="12/25/2024"></div>
    <div data-e2e-conversation-name="2024-12-25"></div>
    <div data-e2e-conversation-name="10:30 AM"></div>
    <div data-e2e-conversation-name="14:30:00"></div>
    <div data-e2e-conversation-name="2024"></div>
    <div data-e2e-conversation-name="+972501234567"></div>
  </body>
</html>
`;

export const HTML_WITH_CSS_VALUES = `
<!DOCTYPE html>
<html>
  <head><title>Google Messages for web</title></head>
  <body>
    messages.google.com MW_CONFIG mws-conversation-list-item mws-conversation-snippet mws-relative-timestamp
    <div data-e2e-conversation-name="100px"></div>
    <div data-e2e-conversation-name="50%"></div>
    <div data-e2e-conversation-name="1.5em"></div>
    <div data-e2e-conversation-name="2rem"></div>
    <div data-e2e-conversation-name="100vh"></div>
    <div data-e2e-conversation-name="100vw"></div>
    <div data-e2e-conversation-name="+972501234567"></div>
  </body>
</html>
`;

export const HTML_WITH_INVALID_PHONES = `
<!DOCTYPE html>
<html>
  <head><title>Google Messages for web</title></head>
  <body>
    messages.google.com MW_CONFIG mws-conversation-list-item mws-conversation-snippet mws-relative-timestamp
    <div data-e2e-conversation-name="0000000000"></div>
    <div data-e2e-conversation-name="1111111111"></div>
    <div data-e2e-conversation-name="123"></div>
    <div data-e2e-conversation-name="12345678901234567"></div>
    <div data-e2e-conversation-name="+972501234567"></div>
  </body>
</html>
`;

export const HTML_WITH_INTERNATIONAL_PHONES = `
<!DOCTYPE html>
<html>
  <head><title>Google Messages for web</title></head>
  <body>
    messages.google.com MW_CONFIG mws-conversation-list-item mws-conversation-snippet mws-relative-timestamp
    <div data-e2e-conversation-name="+1 (555) 123-4567"></div>
    <div data-e2e-conversation-name="+44 20 7946 0958"></div>
    <div data-e2e-conversation-name="+49 30 1234567"></div>
    <div data-e2e-conversation-name="+33 1 23 45 67 89"></div>
    <div data-e2e-conversation-name="+972 52-123-4567"></div>
    <div data-e2e-conversation-name="+81 3-1234-5678"></div>
    <div data-e2e-conversation-name="+86 10 1234 5678"></div>
    <div data-e2e-conversation-name="+61 2 1234 5678"></div>
  </body>
</html>
`;

export const HTML_WITH_SHORT_CODES = `
<!DOCTYPE html>
<html>
  <head><title>Google Messages for web</title></head>
  <body>
    messages.google.com MW_CONFIG mws-conversation-list-item mws-conversation-snippet mws-relative-timestamp
    <div data-e2e-conversation-name="*123"></div>
    <div data-e2e-conversation-name="#999"></div>
    <div data-e2e-conversation-name="*2700"></div>
  </body>
</html>
`;

export const HTML_WITH_HEBREW_CONTEXT = `
<!DOCTYPE html>
<html id="whatsapp-web">
  <head>
    <title>WhatsApp Web</title>
    <link rel="manifest" href="/data/manifest.json">
  </head>
  <body>
    static.whatsapp.net web.whatsapp.com app-wrapper-web data-icon=" WhatsApp Web
    <div>
      <span dir="auto">שלום +972501234567 מה שלומך</span>
    </div>
    <div>
      <span dir="auto" aria-label="Maybe אבי כהן">+972509876543</span>
    </div>
  </body>
</html>
`;
