import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleContactsMaintainerScript } from '../googleContactsMaintainer';
import { PhoneNormalizer } from '../../services/contacts/phoneNormalizer';
import {
  MaintainerIssueType,
  MaintainerReportItem,
} from '../../types/maintainer';

// Subclass to expose private methods for testing
class TestMaintainerScript extends GoogleContactsMaintainerScript {
  public testScanContacts(
    contacts: any[],
    allLabels: string[] = []
  ): MaintainerReportItem[] {
    return (this as any).scanContacts(contacts, allLabels);
  }
}

describe('GoogleContactsMaintainerScript LinkedIn Duplicates', () => {
  let maintainer: TestMaintainerScript;
  const mockAuth = {} as any;
  const mockOtherContactsFetcher = {} as any;
  const phoneNormalizer = new PhoneNormalizer();

  beforeEach(() => {
    maintainer = new TestMaintainerScript(
      mockAuth,
      mockOtherContactsFetcher,
      phoneNormalizer
    );
  });

  const mockContact = {
    firstName: 'John',
    lastName: 'Doe',
    company: 'Google',
    jobTitle: 'Developer',
    emails: [],
    phones: [],
    websites: [],
    label: 'Job',
    biography: '',
    resourceName: 'people/123',
  };

  describe('LinkedIn URL Validation', () => {
    it('should NOT flag valid LinkedIn URL (starting with linkedin.com/in/)', () => {
      const contacts = [
        {
          ...mockContact,
          websites: [
            { url: 'linkedin.com/in/alex-dineen-b1364113a', label: 'LinkedIn' },
          ],
        },
      ];
      const report = maintainer.testScanContacts(contacts);
      const issues = report[0]?.issues || [];
      expect(issues).not.toContain(MaintainerIssueType.INVALID_URL);
    });

    it('should flag LinkedIn URL starting with https://', () => {
      const contacts = [
        {
          ...mockContact,
          websites: [
            {
              url: 'https://linkedin.com/in/alex-dineen-b1364113a',
              label: 'LinkedIn',
            },
          ],
        },
      ];
      const report = maintainer.testScanContacts(contacts);
      const issues = report[0]?.issues || [];
      expect(issues).toContain(MaintainerIssueType.INVALID_URL);
    });

    it('should flag LinkedIn URL starting with www.', () => {
      const contacts = [
        {
          ...mockContact,
          websites: [
            {
              url: 'www.linkedin.com/in/alex-dineen-b1364113a',
              label: 'LinkedIn',
            },
          ],
        },
      ];
      const report = maintainer.testScanContacts(contacts);
      const issues = report[0]?.issues || [];
      expect(issues).toContain(MaintainerIssueType.INVALID_URL);
    });

    it('should flag LinkedIn URL without /in/', () => {
      const contacts = [
        {
          ...mockContact,
          websites: [{ url: 'linkedin.com/alex-dineen', label: 'LinkedIn' }],
        },
      ];
      const report = maintainer.testScanContacts(contacts);
      const issues = report[0]?.issues || [];
      expect(issues).toContain(MaintainerIssueType.INVALID_URL);
    });
  });

  it('should detect possible duplicate if names match EXACTLY and LinkedIn matches', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Dummy',
        lastName: 'User',
        resourceName: 'people/1',
        websites: [{ url: 'linkedin.com/in/dummyuser', label: 'LinkedIn' }],
      },
      {
        ...mockContact,
        firstName: 'Dummy',
        lastName: 'User',
        resourceName: 'people/2',
        websites: [{ url: 'linkedin.com/in/dummyuser', label: 'LinkedIn' }],
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const issues1 = report.find(
      (r: MaintainerReportItem) => r.contact.resourceName === 'people/1'
    )?.issues;
    expect(issues1).toContain(MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT);
  });

  it('should NOT detect possible duplicate if names match EXACTLY but LinkedIn differs', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Dummy',
        lastName: 'User',
        resourceName: 'people/1',
        websites: [{ url: 'linkedin.com/in/dummy1', label: 'LinkedIn' }],
      },
      {
        ...mockContact,
        firstName: 'Dummy',
        lastName: 'User',
        resourceName: 'people/2',
        websites: [{ url: 'linkedin.com/in/dummy2', label: 'LinkedIn' }],
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const issues1 = report.find(
      (r: MaintainerReportItem) => r.contact.resourceName === 'people/1'
    )?.issues;
    expect(issues1).not.toContain(
      MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT
    );
  });

  it('should detect possible duplicate for partial match if LinkedIn matches', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Vim',
        resourceName: 'people/1',
        websites: [{ url: 'linkedin.com/in/dummyuser', label: 'LinkedIn' }],
      },
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Job BTB',
        resourceName: 'people/2',
        websites: [{ url: 'linkedin.com/in/dummyuser', label: 'LinkedIn' }],
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const issues1 = report.find(
      (r: MaintainerReportItem) => r.contact.resourceName === 'people/1'
    )?.issues;
    expect(issues1).toContain(MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT);
  });

  it('should NOT detect possible duplicate for partial match if LinkedIn differs', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Vim',
        resourceName: 'people/1',
        websites: [{ url: 'linkedin.com/in/dummy1', label: 'LinkedIn' }],
      },
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Job BTB',
        resourceName: 'people/2',
        websites: [{ url: 'linkedin.com/in/dummy2', label: 'LinkedIn' }],
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const issues1 = report.find(
      (r: MaintainerReportItem) => r.contact.resourceName === 'people/1'
    )?.issues;
    expect(issues1).not.toContain(
      MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT
    );
  });

  it('should detect possible duplicate for partial match if no LinkedIn is present', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Vim',
        resourceName: 'people/1',
      },
      {
        ...mockContact,
        firstName: 'Dummy User',
        lastName: 'Job BTB',
        resourceName: 'people/2',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const issues1 = report.find(
      (r: MaintainerReportItem) => r.contact.resourceName === 'people/1'
    )?.issues;
    expect(issues1).toContain(MaintainerIssueType.POSSIBLE_DUPLICATE_CONTACT);
  });
});
