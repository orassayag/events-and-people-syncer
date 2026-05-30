import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleContactsMaintainerScript } from '../googleContactsMaintainer';
import { MaintainerIssueType } from '../../types';

// Test-only subclass to access private methods for testing
class TestMaintainerScript extends GoogleContactsMaintainerScript {
  public testScanContacts(contacts: any[], allLabels: string[] = []): any[] {
    return (this as any).scanContacts(contacts, allLabels);
  }
}

describe('GoogleContactsMaintainer - Reported Issues Repro', () => {
  let maintainer: TestMaintainerScript;

  const mockContact = {
    resourceName: 'people/c1',
    firstName: 'First',
    lastName: 'Last',
    company: '',
    jobTitle: '',
    label: '',
    emails: [],
    phones: [],
    websites: [],
    biography: '',
  };

  beforeEach(() => {
    const mockAuth = {} as any;
    const mockOtherContactsFetcher = {
      fetchOtherContacts: vi.fn().mockResolvedValue([]),
    } as any;
    const mockPhoneNormalizer = {
      normalize: vi.fn((p) => p),
    } as any;

    maintainer = new TestMaintainerScript(
      mockAuth,
      mockOtherContactsFetcher,
      mockPhoneNormalizer
    );
  });

  it('Issue 1: should not suggest LinkedIn prefix for OSR if OSR is a valid label', () => {
    // Contact with OSR label and OSR company
    const contacts = [
      {
        ...mockContact,
        firstName: 'Avi',
        lastName: 'Cohen OSR',
        label: 'OSR',
        company: 'OSR',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];

    // Should NOT have OUTDATED_COMPANY_NAME issue because OSR is used as prefix and matches suggestedClean
    expect(item.issues).not.toContain(
      MaintainerIssueType.OUTDATED_COMPANY_NAME
    );
  });

  it('Issue 2: should not suggest HR Hr if label is HR and company is Hr', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Linoy',
        lastName: 'Bar HR',
        label: 'HR',
        company: 'Hr',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];

    // Should NOT suggest "HR Hr"
    expect(item.issues).not.toContain(
      MaintainerIssueType.OUTDATED_COMPANY_NAME
    );
  });

  it('Issue 3: should not suggest Job Papaya for Pagaya company (fixed mapping)', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'Yotam',
        lastName: 'Manor Job Pagaya',
        label: 'Job',
        company: 'Pagaya',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];

    // Should NOT have OUTDATED_COMPANY_NAME issue because Pagaya no longer maps to Papaya
    expect(item.issues).not.toContain(
      MaintainerIssueType.OUTDATED_COMPANY_NAME
    );
  });

  it('should still suggest correct prefix for LinkedIn contacts', () => {
    const contacts = [
      {
        ...mockContact,
        firstName: 'John',
        lastName: 'Doe',
        label: 'LinkedIn',
        company: 'Google',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];

    expect(item.issues).toContain(MaintainerIssueType.OUTDATED_COMPANY_NAME);
    expect(
      item.customIssueMessages[MaintainerIssueType.OUTDATED_COMPANY_NAME]
    ).toBe('OUTDATED COMPANY NAME - SHOULD BE: LinkedIn Google');
  });
});
