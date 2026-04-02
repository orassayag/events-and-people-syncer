import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SETTINGS } from '../../settings';
import { DuplicateDetector } from '../../services/contacts';
import { ContactSyncer } from '../../services/linkedin';
import type { LinkedInConnection } from '../../types/linkedin';
import { SyncStatusType, ContactType } from '../../types/linkedin';
import { ApiTracker } from '../../services/api/apiTracker';
import { writeFile } from 'fs/promises';

const mockService = {
  contactGroups: {
    list: vi.fn().mockResolvedValue({
      data: { contactGroups: [], nextPageToken: undefined },
    }),
  },
  people: {
    connections: {
      list: vi.fn().mockResolvedValue({
        data: { connections: [], nextPageToken: undefined },
      }),
    },
  },
};

vi.mock('googleapis', () => ({
  google: {
    people: vi.fn(() => mockService),
  },
}));
vi.mock('../../utils', async () => {
  const actual = await vi.importActual<typeof import('../../utils')>('../../utils');
  return {
    ...actual,
    retryWithBackoff: vi.fn((fn) => fn()),
  };
});
vi.mock('../../cache', () => {
  const mockContactCache = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    getByResourceName: vi.fn().mockImplementation(async (resourceName: string) => {
      if (resourceName.startsWith('people/dryMode_')) {
        return {
          firstName: 'John',
          lastName: 'Doe',
          company: 'TechCorp',
          jobTitle: 'Software Engineer',
          emails: [{ value: 'john@example.com', label: 'TestLabel TechCorp' }],
          phones: [],
          websites: [{ url: 'https://linkedin.com/in/johndoe', label: 'LinkedIn' }],
          resourceName,
          biography: 'Added by the people syncer script (LinkedIn)',
          etag: 'dryMode_etag_12345',
          label: 'TestLabel',
        };
      }
      return null;
    }),
    getByEmail: vi.fn().mockResolvedValue([]),
    getByNormalizedPhone: vi.fn().mockResolvedValue([]),
    getByLinkedInSlug: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return {
    ContactCache: {
      getInstance: vi.fn().mockReturnValue(mockContactCache),
    },
  };
});

describe('LinkedIn Sync - Full Dry Mode Integration', { timeout: 30000 }, () => {
  let contactSyncer: ContactSyncer;
  let duplicateDetector: DuplicateDetector;
  let mockAuth: any;
  const originalDryMode = SETTINGS.dryMode;
  const mockConnections: LinkedInConnection[] = [
    {
      type: ContactType.LINKEDIN,
      id: 'john-doe',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      position: 'Software Engineer',
      company: 'TechCorp',
      url: 'https://linkedin.com/in/johndoe',
      connectedOn: '2024-01-01',
    },
    {
      type: ContactType.LINKEDIN,
      id: 'jane-smith',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      position: 'Product Manager',
      company: 'StartupInc',
      url: 'https://linkedin.com/in/janesmith',
      connectedOn: '2024-01-02',
    },
    {
      type: ContactType.LINKEDIN,
      id: 'bob-johnson',
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob@example.com',
      position: 'Designer',
      company: 'DesignStudio',
      url: 'https://linkedin.com/in/bobjohnson',
      connectedOn: '2024-01-03',
    },
  ];
  beforeEach(async () => {
    await writeFile(
      SETTINGS.paths.apiStatsFile,
      JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        read_count: 0,
        write_count: 0,
      }),
      'utf-8'
    );
    mockAuth = {} as any;
    duplicateDetector = new DuplicateDetector(mockAuth);
    contactSyncer = new ContactSyncer(mockAuth, duplicateDetector);
    vi.spyOn(contactSyncer as any, 'loadContactGroups').mockResolvedValue(undefined);
    vi.spyOn(contactSyncer as any, 'delay').mockResolvedValue(undefined);
    (contactSyncer as any).groupMap = {};
    await contactSyncer.initialize();
  });
  afterEach(() => {
    (SETTINGS as any).dryMode = originalDryMode;
    vi.clearAllMocks();
  });

  it('should complete full sync in dry-mode with mocks tracked', async () => {
    (SETTINGS as any).dryMode = true;
    const results = [];
    for (const connection of mockConnections) {
      const result = await contactSyncer.addContact(connection, 'TestLabel');
      results.push(result);
    }
    expect(results.every((r) => r.status === SyncStatusType.NEW)).toBe(true);
    const recentlyModified = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified.length).toBe(3);
    expect(recentlyModified[0].resourceName).toMatch(/^people\/dryMode_/);
    expect(recentlyModified[1].resourceName).toMatch(/^people\/dryMode_/);
    expect(recentlyModified[2].resourceName).toMatch(/^people\/dryMode_/);
  }, 10000);

  it('should detect duplicates with mock contacts', async () => {
    (SETTINGS as any).dryMode = true;
    const result1 = await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    expect(result1.status).toBe(SyncStatusType.NEW);
    const recentlyModified = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified.length).toBeGreaterThan(0);
    expect(recentlyModified[0].resourceName).toBeDefined();
    expect(recentlyModified[0].resourceName).toMatch(/^people\/dryMode_/);
  }, 10000);

  it('should detect email duplicates with mock contacts', async () => {
    (SETTINGS as any).dryMode = true;
    await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    const recentlyModified = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified.length).toBe(1);
    expect(recentlyModified[0].emails[0].value).toBe('john@example.com');
    expect(recentlyModified[0].resourceName).toBeDefined();
    expect(recentlyModified[0].resourceName).toMatch(/^people\/dryMode_/);
  }, 10000);

  it('should handle create-then-update scenario with mocks', async () => {
    (SETTINGS as any).dryMode = true;
    const result1 = await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    expect(result1.status).toBe(SyncStatusType.NEW);
    const recentlyModified = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified.length).toBe(1);
    const mockResourceName = recentlyModified[0].resourceName;
    expect(mockResourceName).toBeDefined();
    expect(mockResourceName).toMatch(/^people\/dryMode_/);
    const updatedConnection = {
      ...mockConnections[0],
      position: 'Senior Software Engineer',
    };
    const result2 = await contactSyncer.updateContact(
      mockResourceName,
      updatedConnection,
      'TestLabel'
    );
    expect(result2.status).toBe(SyncStatusType.UPDATED);
  });

  it('should prefix mock groups with [DRY-MODE]', async () => {
    (SETTINGS as any).dryMode = true;
    const resourceName = await (contactSyncer as any).ensureGroupExists('NewCompany');
    expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
  });

  it('should continue on duplicate detector tracking failure', async () => {
    (SETTINGS as any).dryMode = true;
    vi.spyOn(duplicateDetector, 'addRecentlyModifiedContact').mockImplementation(() => {
      throw new Error('Tracking failed');
    });
    const result = await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    expect(result.status).toBe(SyncStatusType.NEW);
  });

  it('should track all write operations correctly', async () => {
    (SETTINGS as any).dryMode = true;
    const apiTracker = ApiTracker.getInstance();
    const trackWriteSpy = vi.spyOn(apiTracker, 'trackWrite');
    trackWriteSpy.mockClear();
    await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    await contactSyncer.addContact(mockConnections[1], 'TestLabel');
    await contactSyncer.addContact(mockConnections[2], 'TestLabel');
    expect(trackWriteSpy).toHaveBeenCalled();
    expect(trackWriteSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    const recentlyModified = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified.length).toBe(3);
    expect(recentlyModified[0].resourceName).toMatch(/^people\/dryMode_/);
    expect(recentlyModified[1].resourceName).toMatch(/^people\/dryMode_/);
    expect(recentlyModified[2].resourceName).toMatch(/^people\/dryMode_/);
  }, 10000);

  it('should handle multiple groups in dry-mode', async () => {
    (SETTINGS as any).dryMode = true;
    const group1 = await (contactSyncer as any).ensureGroupExists('Company1');
    const group2 = await (contactSyncer as any).ensureGroupExists('Company2');
    const group3 = await (contactSyncer as any).ensureGroupExists('Company3');
    expect(group1).not.toBe(group2);
    expect(group2).not.toBe(group3);
    expect(group1).not.toBe(group3);
    expect(group1).toMatch(/^contactGroups\/dryMode_/);
    expect(group2).toMatch(/^contactGroups\/dryMode_/);
    expect(group3).toMatch(/^contactGroups\/dryMode_/);
  });

  it('should return existing group without creating new one', async () => {
    (SETTINGS as any).dryMode = true;
    const apiTracker = ApiTracker.getInstance();
    const trackWriteSpy = vi.spyOn(apiTracker, 'trackWrite');
    trackWriteSpy.mockClear();
    const group1 = await (contactSyncer as any).ensureGroupExists('ExistingGroup');
    const writeCount1 = trackWriteSpy.mock.calls.length;
    const group2 = await (contactSyncer as any).ensureGroupExists('ExistingGroup');
    const writeCount2 = trackWriteSpy.mock.calls.length;
    expect(group1).toBe(group2);
    expect(writeCount2).toBe(writeCount1);
  });

  it('should maintain mock contact state across operations', async () => {
    (SETTINGS as any).dryMode = true;
    const result1 = await contactSyncer.addContact(mockConnections[0], 'TestLabel');
    expect(result1.status).toBe(SyncStatusType.NEW);
    const recentlyModified1 = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified1.length).toBe(1);
    const result2 = await contactSyncer.addContact(mockConnections[1], 'TestLabel');
    expect(result2.status).toBe(SyncStatusType.NEW);
    const recentlyModified2 = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified2.length).toBe(2);
    const result3 = await contactSyncer.addContact(mockConnections[2], 'TestLabel');
    expect(result3.status).toBe(SyncStatusType.NEW);
    const recentlyModified3 = (duplicateDetector as any).recentlyModifiedContacts;
    expect(recentlyModified3.length).toBe(3);
  }, 10000);
});
