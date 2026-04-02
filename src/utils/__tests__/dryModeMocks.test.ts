import { describe, it, expect } from 'vitest';
import { DryModeMocks } from '../dryModeMocks';

describe('DryModeMocks', () => {
  describe('createContactResponse', () => {
    it('should create mock contact response with correct structure', () => {
      const response = DryModeMocks.createContactResponse('John', 'Smith');
      expect(response.resourceName).toMatch(/^people\/dryMode_/);
      expect(response.etag).toMatch(/^dryMode_etag_/);
      expect(response.names).toEqual([
        { givenName: 'John', familyName: 'Smith' },
      ]);
      expect(response.emailAddresses).toEqual([]);
      expect(response.phoneNumbers).toEqual([]);
      expect(response.organizations).toEqual([]);
      expect(response.urls).toEqual([]);
      expect(response.memberships).toEqual([]);
      expect(response.biographies).toEqual([]);
    });

    it('should create unique resource names', () => {
      const response1 = DryModeMocks.createContactResponse('John', 'Smith');
      const response2 = DryModeMocks.createContactResponse('Jane', 'Doe');
      expect(response1.resourceName).not.toBe(response2.resourceName);
      expect(response1.etag).not.toBe(response2.etag);
    });

    it('should handle empty names', () => {
      const response = DryModeMocks.createContactResponse('', '');
      expect(response.resourceName).toMatch(/^people\/dryMode_/);
      expect(response.names).toEqual([{ givenName: '', familyName: '' }]);
    });
  });

  describe('createGroupResponse', () => {
    it('should create mock group resourceName', () => {
      const resourceName = DryModeMocks.createGroupResponse('TestGroup');
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });

    it('should create unique group resource names', () => {
      const resourceName1 = DryModeMocks.createGroupResponse('Group1');
      const resourceName2 = DryModeMocks.createGroupResponse('Group2');
      expect(resourceName1).not.toBe(resourceName2);
    });

    it('should handle empty group name', () => {
      const resourceName = DryModeMocks.createGroupResponse('');
      expect(resourceName).toMatch(/^contactGroups\/dryMode_/);
    });
  });
});
