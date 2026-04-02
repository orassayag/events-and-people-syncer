import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionMatcher } from '../connectionMatcher';
import { DuplicateDetector } from '../../contacts';
import { MatchType, ContactType } from '../../../types/linkedin';
import type { LinkedInConnection } from '../../../types/linkedin';

const mockDuplicateDetector = {
  checkDuplicateLinkedInUrl: vi.fn(),
  checkDuplicateEmail: vi.fn(),
  checkDuplicateName: vi.fn(),
} as unknown as DuplicateDetector;

describe('ConnectionMatcher', () => {
  let connectionMatcher: ConnectionMatcher;
  beforeEach(() => {
    vi.clearAllMocks();
    connectionMatcher = new ConnectionMatcher(mockDuplicateDetector);
  });

  const mockConnection: LinkedInConnection = {
    type: ContactType.LINKEDIN,
    id: 'test-user',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Microsoft',
    position: 'Engineer',
    url: 'https://www.linkedin.com/in/test-user',
    connectedOn: '01 Jan 2024',
  };

  describe('match', () => {
    it('should return EXACT match when LinkedIn URL matches', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'LinkedIn',
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.EXACT);
      expect(result.resourceName).toBe('people/c123');
    });
    it('should return UNCERTAIN when multiple LinkedIn URL matches found', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'LinkedIn',
        },
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'HR',
            company: 'Google',
            jobTitle: 'Manager',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c456',
          },
          similarityType: 'LinkedIn',
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.UNCERTAIN);
    });
    it('should return EXACT match when email matches', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [{ value: 'john@example.com', label: 'work' }],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'Email',
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.EXACT);
      expect(result.resourceName).toBe('people/c123');
    });
    it('should return UNCERTAIN when multiple email matches found', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'Email',
        },
        {
          contact: {
            firstName: 'John',
            lastName: 'Smith',
            label: 'HR',
            company: 'Google',
            jobTitle: 'Manager',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c456',
          },
          similarityType: 'Email',
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.UNCERTAIN);
    });
    it('should return FUZZY match when name matches with good score', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue(
        []
      );
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'Full Name',
          score: 0.15,
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.FUZZY);
      expect(result.resourceName).toBe('people/c123');
      expect(result.score).toBe(0.15);
    });
    it('should return UNCERTAIN when name match score is between 0.2 and 0.4', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue(
        []
      );
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'Full Name',
          score: 0.3,
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.UNCERTAIN);
      expect(result.score).toBe(0.3);
    });
    it('should return NONE when name match score is above 0.4', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue(
        []
      );
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([
        {
          contact: {
            firstName: 'Jane',
            lastName: 'Smith',
            label: 'Job',
            company: 'Google',
            jobTitle: 'PM',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c789',
          },
          similarityType: 'Full Name',
          score: 0.5,
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.NONE);
    });
    it('should return UNCERTAIN when multiple name matches found', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue(
        []
      );
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'Job',
            company: 'Microsoft',
            jobTitle: 'Engineer',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c123',
          },
          similarityType: 'Full Name',
          score: 0.1,
        },
        {
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            label: 'HR',
            company: 'Google',
            jobTitle: 'Manager',
            emails: [],
            phones: [],
            websites: [],
            resourceName: 'people/c456',
          },
          similarityType: 'Full Name',
          score: 0.15,
        },
      ]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.UNCERTAIN);
    });
    it('should return NONE when no matches found', async () => {
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateEmail).mockResolvedValue(
        []
      );
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([]);
      const result = await connectionMatcher.match(mockConnection);
      expect(result.matchType).toBe(MatchType.NONE);
    });
    it('should skip email matching if connection has no email', async () => {
      const connectionWithoutEmail = { ...mockConnection, email: '' };
      vi.mocked(
        mockDuplicateDetector.checkDuplicateLinkedInUrl
      ).mockResolvedValue([]);
      vi.mocked(mockDuplicateDetector.checkDuplicateName).mockResolvedValue([]);
      await connectionMatcher.match(connectionWithoutEmail);
      expect(mockDuplicateDetector.checkDuplicateEmail).not.toHaveBeenCalled();
    });
  });
});
