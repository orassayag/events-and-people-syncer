import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);

export interface Settings {
  environment: 'test' | 'production';
  readonly dryMode: boolean;
  auth: {
    clientId: string;
    clientSecret: string;
    projectId: string;
    authUri: string;
    tokenUri: string;
    authProviderCertUrl: string;
    redirectPort: number;
    scopes: string[];
  };
  api: {
    pageSize: number;
    displayPageSize: number;
    topContactsDisplay: number;
    browserTimeout: number;
  };
  paths: {
    apiStatsFile: string;
    tokenFile: string;
  };
  linkedin: {
    zipFileName: string;
    sourcesPath: string;
    cachePath: string;
    companyFoldersPath: string;
    cacheExpirationDays: number;
    defaultLabel: string;
    deleteAfterSync: boolean;
    bypassContactCache: boolean;
    companySuffixesToRemove: string[];
    writeDelayMs: number;
    testConnectionLimit: number | null;
  };
  hibob: {
    filePath: string;
    writeDelayMs: number;
    testContactLimit: number | null;
  };
  contactsSync: {
    maintainFetchOrder: boolean;
    writeDelayMs: number;
  };
  eventsJobsSync: {
    companyFoldersPath: string;
    lifeEventsPath: string;
  };
  smsWhatsappSync: {
    writeDelayMs: number;
    maxHtmlSizeBytes: number;
    googleMessagesDetectionThreshold: number;
    whatsappWebDetectionThreshold: number;
    lowConfidenceWarningThreshold: number;
  };
  otherContactsSync: {
    writeDelayMs: number;
  };
  statistics: {
    displayWidth: number;
  };
}

const parseDryMode = (): boolean => {
  const value = process.env.DRY_MODE?.toLowerCase() || '';
  return !['false', '0', 'no', 'n'].includes(value);
};

export const SETTINGS: Settings = {
  environment: 'test',
  dryMode: parseDryMode(),
  auth: {
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    projectId: process.env.PROJECT_ID || '',
    authUri: process.env.AUTH_URI || '',
    tokenUri: process.env.TOKEN_URI || '',
    authProviderCertUrl: process.env.AUTH_PROVIDER_CERT_URL || '',
    redirectPort: parseInt(process.env.REDIRECT_PORT || '3000', 10),
    scopes: [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    ],
  },
  api: {
    pageSize: 1000,
    displayPageSize: 15,
    topContactsDisplay: 10,
    browserTimeout: 240000,
  },
  paths: {
    apiStatsFile: join(__dirname, '..', '..', 'api-stats.json'),
    tokenFile: join(__dirname, '..', '..', 'token.json'),
  },
  linkedin: {
    zipFileName: 'Basic_LinkedInDataExport_03-11-2026.zip',
    sourcesPath: join(__dirname, '..', '..', 'sources'),
    cachePath: join(__dirname, '..', '..', 'sources', '.cache'),
    companyFoldersPath: join(__dirname, '..', '..', 'dummy', 'job-interviews'),
    cacheExpirationDays: 1,
    defaultLabel: 'Job',
    deleteAfterSync: false,
    bypassContactCache: false,
    companySuffixesToRemove: [
      'Inc',
      'Ltd',
      'LLC',
      'GmbH',
      'Corp',
      'Corporation',
      'Co',
      'Company',
      'Limited',
    ],
    writeDelayMs: 2500,
    testConnectionLimit: process.env.TEST_CONNECTION_LIMIT
      ? parseInt(process.env.TEST_CONNECTION_LIMIT, 10)
      : null,
  },
  hibob: {
    filePath: join(__dirname, '..', '..', 'sources', 'hibob.txt'),
    writeDelayMs: 2500,
    testContactLimit: null,
  },
  contactsSync: {
    maintainFetchOrder: true,
    writeDelayMs: 500,
  },
  get eventsJobsSync() {
    return {
      companyFoldersPath: this.linkedin.companyFoldersPath,
      lifeEventsPath: join(__dirname, '..', '..', 'dummy', 'life-events'),
    };
  },
  smsWhatsappSync: {
    writeDelayMs: 500,
    maxHtmlSizeBytes: 5 * 1024 * 1024,
    googleMessagesDetectionThreshold: 5,
    whatsappWebDetectionThreshold: 5,
    lowConfidenceWarningThreshold: 70,
  },
  otherContactsSync: {
    writeDelayMs: 500,
  },
  statistics: {
    displayWidth: 30,
  },
};
