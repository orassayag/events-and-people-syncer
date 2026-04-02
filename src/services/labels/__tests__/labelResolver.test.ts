import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LabelResolver } from '../labelResolver';
import type { ContactGroup } from '../../../types/api';

vi.mock('../../../settings', () => ({
  SETTINGS: {
    dryMode: false,
    api: {
      pageSize: 1000,
    },
  },
}));

vi.mock('../../api/apiTracker', () => ({
  ApiTracker: {
    getInstance: vi.fn(() => ({
      trackWrite: vi.fn(),
      trackRead: vi.fn(),
      logStats: vi.fn(),
    })),
  },
}));

vi.mock('googleapis', () => ({
  google: {
    people: vi.fn(() => ({
      contactGroups: {
        create: vi.fn().mockResolvedValue({
          data: {
            resourceName: 'contactGroups/newgroup123',
          },
        }),
      },
    })),
  },
}));

const mockAuth = {} as any;

describe('LabelResolver', () => {
  let resolver: LabelResolver;
  let mockContactGroups: ContactGroup[];

  beforeEach(() => {
    resolver = new LabelResolver(mockAuth);
    mockContactGroups = [
      { resourceName: 'contactGroups/job123', name: 'Job' },
      { resourceName: 'contactGroups/hr456', name: 'HR' },
      { resourceName: 'contactGroups/osr789', name: 'OSR' },
      { resourceName: 'contactGroups/alex111', name: 'Alex' },
    ];
    vi.clearAllMocks();
  });

  describe('resolveLabel', () => {
    it('should resolve existing label', () => {
      const result = resolver.resolveLabel('Job', true, mockContactGroups);

      expect(result).toEqual({
        resourceName: 'contactGroups/job123',
        created: false,
      });
    });

    it('should resolve existing label case-sensitively', () => {
      const result = resolver.resolveLabel('OSR', false, mockContactGroups);

      expect(result).toEqual({
        resourceName: 'contactGroups/osr789',
        created: false,
      });
    });

    it('should throw error when required label does not exist', () => {
      expect(() =>
        resolver.resolveLabel('NonExistent', true, mockContactGroups)
      ).toThrow(
        "Required label 'NonExistent' does not exist. Please create it in Google Contacts first."
      );
    });

    it('should return empty resourceName when optional label does not exist', () => {
      const result = resolver.resolveLabel(
        'NewLabel',
        false,
        mockContactGroups
      );

      expect(result).toEqual({
        resourceName: '',
        created: false,
      });
    });

    it('should handle empty contact groups array', () => {
      expect(() => resolver.resolveLabel('Job', true, [])).toThrow(
        'Required label'
      );
    });

    it('should match exact label name only', () => {
      const result = resolver.resolveLabel('HR', true, mockContactGroups);

      expect(result.resourceName).toBe('contactGroups/hr456');
    });
  });

  describe('inferLabelFromExisting', () => {
    it('should infer label from first matching word', () => {
      const result = resolver.inferLabelFromExisting(
        'Alex Z OSR',
        mockContactGroups
      );

      expect(result).toBe('Alex');
    });

    it('should return first match when multiple words match', () => {
      const result = resolver.inferLabelFromExisting(
        'OSR Alex Test',
        mockContactGroups
      );

      expect(result).toBe('OSR');
    });

    it('should return null when no words match', () => {
      const result = resolver.inferLabelFromExisting(
        'Unknown Name Test',
        mockContactGroups
      );

      expect(result).toBeNull();
    });

    it('should handle single word folder name', () => {
      const result = resolver.inferLabelFromExisting('OSR', mockContactGroups);

      expect(result).toBe('OSR');
    });

    it('should trim whitespace from folder name', () => {
      const result = resolver.inferLabelFromExisting(
        '  Alex Z OSR  ',
        mockContactGroups
      );

      expect(result).toBe('Alex');
    });

    it('should handle empty folder name', () => {
      const result = resolver.inferLabelFromExisting('', mockContactGroups);

      expect(result).toBeNull();
    });

    it('should handle empty contact groups', () => {
      const result = resolver.inferLabelFromExisting('Alex Z OSR', []);

      expect(result).toBeNull();
    });

    it('should match exact word only not partial', () => {
      const groups: ContactGroup[] = [
        { resourceName: 'contactGroups/test123', name: 'Testing' },
      ];

      const result = resolver.inferLabelFromExisting('Test Word', groups);

      expect(result).toBeNull();
    });

    it('should return first match in left-to-right order', () => {
      const groups: ContactGroup[] = [
        { resourceName: 'contactGroups/word1', name: 'Word' },
        { resourceName: 'contactGroups/test1', name: 'Test' },
      ];

      const result = resolver.inferLabelFromExisting('Test Word', groups);

      expect(result).toBe('Test');
    });
  });

  describe('createLabel', () => {
    it('should create label in dry-mode and return mock resourceName', async (): Promise<void> => {
      const { SETTINGS } = await import('../../../settings');
      const originalDryMode = (SETTINGS as any).dryMode;
      (SETTINGS as any).dryMode = true;
      const result = await resolver.createLabel('NewLabel');
      expect(result).toMatch(/^contactGroups\/dryMode_/);
      expect(typeof result).toBe('string');
      (SETTINGS as any).dryMode = originalDryMode;
    });

    it('should create label via API and return resourceName', async (): Promise<void> => {
      const { SETTINGS } = await import('../../../settings');
      (SETTINGS as any).dryMode = false;
      const result = await resolver.createLabel('NewLabel');
      expect(typeof result).toBe('string');
      expect(result).toBe('contactGroups/newgroup123');
    });
  });

  describe('setApiLogging', () => {
    it('should enable API logging', () => {
      resolver.setApiLogging(true);

      expect(() => resolver.setApiLogging(true)).not.toThrow();
    });

    it('should disable API logging', () => {
      resolver.setApiLogging(false);

      expect(() => resolver.setApiLogging(false)).not.toThrow();
    });
  });
});
