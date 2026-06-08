import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleContactsMaintainerScript } from '../googleContactsMaintainer';
import { MaintainerIssueType } from '../../types/maintainer';
import { PhoneNormalizer } from '../../services/contacts/phoneNormalizer';

// Test-only subclass to access private methods for testing
class TestMaintainerScript extends GoogleContactsMaintainerScript {
  public testScanContacts(
    contacts: any[],
    allLabels: string[] = [],
    otherContacts: any[] = []
  ): any[] {
    return (this as any).scanContacts(contacts, allLabels, otherContacts);
  }
}

describe('GoogleContactsMaintainerScript - Notes Extraction', () => {
  let maintainer: TestMaintainerScript;
  const mockAuth = {} as any;
  const mockOtherContactsFetcher = {
    fetchOtherContacts: vi.fn().mockResolvedValue([]),
  } as any;
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
    emails: [{ value: 'john@google.com', label: 'Work' }],
    phones: [{ number: '0541234567', label: 'Mobile' }],
    websites: [],
    label: 'Job',
    biography: '',
    resourceName: 'people/123',
  };

  it('should detect email in notes that does not exist in contact emails', () => {
    const contacts = [
      {
        ...mockContact,
        biography: 'Some notes with email: extra@gmail.com',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];
    expect(item.issues).toContain(
      MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
    );
    expect(
      item.customIssueMessages[
        MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('extra@gmail.com');
  });

  it('should detect phone in notes that does not exist in contact phones', () => {
    const contacts = [
      {
        ...mockContact,
        biography: 'Call me at 052-1112222',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];
    expect(item.issues).toContain(
      MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
    );
    expect(
      item.customIssueMessages[
        MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('052-1112222');
  });

  it('should NOT flag email in notes if it exists in contact emails', () => {
    const contacts = [
      {
        ...mockContact,
        biography: 'Contact email is john@google.com',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report.find((r) => r.contact.resourceName === 'people/123');
    // It might have other issues, but not EMAIL_IN_NOTES_NOT_IN_CONTACT
    if (item) {
      expect(item.issues).not.toContain(
        MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
      );
    }
  });

  it('should NOT flag phone in notes if it exists in contact phones (different format)', () => {
    const contacts = [
      {
        ...mockContact,
        phones: [{ number: '054-1234567', label: 'Mobile' }],
        biography: 'Phone: +972 54 123 4567',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report.find((r) => r.contact.resourceName === 'people/123');
    if (item) {
      expect(item.issues).not.toContain(
        MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
      );
    }
  });

  it('should detect multiple missing emails and phones from notes', () => {
    const contacts = [
      {
        ...mockContact,
        biography:
          'Emails: extra1@gmail.com, extra2@gmail.com. PhoneNumbers: 050-1111111, 050-2222222',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];
    expect(item.issues).toContain(
      MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
    );
    expect(item.issues).toContain(
      MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
    );

    expect(
      item.customIssueMessages[
        MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('extra1@gmail.com');
    expect(
      item.customIssueMessages[
        MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('extra2@gmail.com');
    expect(
      item.customIssueMessages[
        MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('050-1111111');
    expect(
      item.customIssueMessages[
        MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('050-2222222');
  });

  it('should extract emails and phones without prefixes', () => {
    const contacts = [
      {
        ...mockContact,
        biography:
          'Just some text extra@test.com and maybe a phone 054-999-8888',
      },
    ];
    const report = maintainer.testScanContacts(contacts);
    const item = report[0];
    expect(item.issues).toContain(
      MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
    );
    expect(item.issues).toContain(
      MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
    );
    expect(
      item.customIssueMessages[
        MaintainerIssueType.EMAIL_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('extra@test.com');
    expect(
      item.customIssueMessages[
        MaintainerIssueType.PHONE_IN_NOTES_NOT_IN_CONTACT
      ]
    ).toContain('054-999-8888');
  });
});
