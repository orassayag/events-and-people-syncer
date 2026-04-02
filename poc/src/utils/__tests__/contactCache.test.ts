import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactCache } from '../contactCache.js';
import type { ContactData } from '../../types.js';

describe('ContactCache', () => {
  let cache: ContactCache;
  
  const mockContacts: ContactData[] = [
    {
      label: 'Test Label',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Test Corp',
      jobTitle: 'Developer',
      emails: [],
      phones: [],
      websites: []
    }
  ];
  
  beforeEach(() => {
    cache = ContactCache.getInstance();
    cache.invalidate();
  });
  
  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ContactCache.getInstance();
      const instance2 = ContactCache.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
  
  describe('get', () => {
    it('should return null when cache is empty', () => {
      const result = cache.get();
      expect(result).toBeNull();
    });
    
    it('should return cached contacts when valid', async () => {
      cache.set(mockContacts);
      const result = await cache.get();
      expect(result).toEqual(mockContacts);
    });
    
    it('should return null when cache is expired', () => {
      cache.set(mockContacts);
      vi.useFakeTimers();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      const result = cache.get();
      expect(result).toBeNull();
      vi.useRealTimers();
    });
  });
  
  describe('set', () => {
    it('should store contacts in cache', async () => {
      cache.set(mockContacts);
      const result = await cache.get();
      expect(result).toEqual(mockContacts);
    });
  });
  
  describe('invalidate', () => {
    it('should clear cache', () => {
      cache.set(mockContacts);
      cache.invalidate();
      const result = cache.get();
      expect(result).toBeNull();
    });
  });
});
