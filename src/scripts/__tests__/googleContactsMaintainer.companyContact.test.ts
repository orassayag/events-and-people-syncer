import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleContactsMaintainerScript } from '../googleContactsMaintainer';
import { MaintainerIssueType } from '../../types/maintainer';
import { PhoneNormalizer } from '../../services/contacts/phoneNormalizer';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    promises: {
      unlink: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

class TestMaintainerScript extends GoogleContactsMaintainerScript {
  public testScanContacts(
    contacts: any[],
    allLabels: string[] = [],
    otherContacts: any[] = []
  ): any[] {
    return (this as any).scanContacts(contacts, allLabels, otherContacts);
  }
}

const companyContactIssues = [
  MaintainerIssueType.COMPANY_CONTACT_MISSING_OFFICE_LABEL,
  MaintainerIssueType.COMPANY_CONTACT_INVALID_FIRST_NAME,
  MaintainerIssueType.COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE,
  MaintainerIssueType.COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE,
  MaintainerIssueType.COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION,
  MaintainerIssueType.COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION,
  MaintainerIssueType.COMPANY_CONTACT_INVALID_URL,
  MaintainerIssueType.COMPANY_CONTACT_INVALID_URL_LABEL,
];

describe('GoogleContactsMaintainerScript - company contacts', () => {
  let maintainer: TestMaintainerScript;
  const mockAuth = {
    refreshAccessToken: vi.fn().mockResolvedValue({ credentials: {} }),
    setCredentials: vi.fn(),
  } as any;
  const mockOtherContactsFetcher = {
    fetchOtherContacts: vi.fn().mockResolvedValue([]),
  } as any;
  const phoneNormalizer = new PhoneNormalizer();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ skippedContacts: [], contactExclusions: [] })
    );
    maintainer = new TestMaintainerScript(
      mockAuth,
      mockOtherContactsFetcher,
      phoneNormalizer
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validCompanyContact = {
    firstName: 'AnyClip',
    lastName: 'Office HR AnyClip',
    company: 'HR AnyClip',
    jobTitle: '',
    emails: [{ value: 'hr@anyclip.com', label: 'HR AnyClip' }],
    phones: [{ number: '+123456789', label: 'HR AnyClip' }],
    websites: [
      { url: 'https://linkedin.com/company/AnyClip', label: 'LinkedIn' },
    ],
    label: 'Office',
    biography: '',
    resourceName: 'people/company-1',
  };

  const issuesOf = (result: any[]): string[] =>
    result.length > 0 ? result[0].issues : [];

  it('1. fully valid company contact has no issues and no person-rule flags', () => {
    const result = maintainer.testScanContacts([{ ...validCompanyContact }]);
    expect(result).toHaveLength(0);
  });

  it('2. valid with no-prefix combination is clean', () => {
    const result = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        lastName: 'Office AnyClip',
        company: 'AnyClip',
        emails: [{ value: 'hr@anyclip.com', label: 'AnyClip' }],
        phones: [{ number: '+123456789', label: 'AnyClip' }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it('3. valid with Job prefix is clean', () => {
    const result = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        lastName: 'Office Job AnyClip',
        company: 'Job AnyClip',
        emails: [{ value: 'hr@anyclip.com', label: 'Job AnyClip' }],
        phones: [{ number: '+123456789', label: 'Job AnyClip' }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it('4. missing Office label but Office last name fires MISSING_OFFICE_LABEL', () => {
    const result = maintainer.testScanContacts([
      { ...validCompanyContact, label: 'HR' },
    ]);
    expect(issuesOf(result)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_MISSING_OFFICE_LABEL
    );
  });

  it('5. multi-word / lowercase first name fires INVALID_FIRST_NAME with SHOULD BE', () => {
    const multiWord = maintainer.testScanContacts([
      { ...validCompanyContact, firstName: 'any clip' },
    ]);
    expect(issuesOf(multiWord)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_FIRST_NAME
    );

    const lowercase = maintainer.testScanContacts([
      { ...validCompanyContact, firstName: 'anyclip' },
    ]);
    expect(issuesOf(lowercase)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_FIRST_NAME
    );
    expect(
      lowercase[0].customIssueMessages[
        MaintainerIssueType.COMPANY_CONTACT_INVALID_FIRST_NAME
      ]
    ).toContain('SHOULD BE: Anyclip');
  });

  it('6. last name not starting with Office fires LAST_NAME_NOT_START_OFFICE', () => {
    const result = maintainer.testScanContacts([
      { ...validCompanyContact, lastName: 'HR AnyClip' },
    ]);
    expect(issuesOf(result)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_LAST_NAME_NOT_START_OFFICE
    );
  });

  it('7. garbage after Office fires INVALID_COMBINATION_AFTER_OFFICE', () => {
    const result = maintainer.testScanContacts([
      { ...validCompanyContact, lastName: 'Office Sales AnyClip' },
    ]);
    expect(issuesOf(result)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE
    );
    expect(
      result[0].customIssueMessages[
        MaintainerIssueType.COMPANY_CONTACT_INVALID_COMBINATION_AFTER_OFFICE
      ]
    ).toContain('SHOULD BE: HR AnyClip');
  });

  it('8. company field not matching combination fires COMPANY_NOT_MATCH_COMBINATION', () => {
    const result = maintainer.testScanContacts([
      { ...validCompanyContact, company: 'Wrong Co' },
    ]);
    expect(issuesOf(result)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_COMPANY_NOT_MATCH_COMBINATION
    );
  });

  it('9. mismatching phone and email labels fire a single LABEL_NOT_MATCH listing both', () => {
    const result = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        phones: [{ number: '+123456789', label: 'Wrong Phone' }],
        emails: [{ value: 'hr@anyclip.com', label: 'Wrong Email' }],
      },
    ]);
    const issues = issuesOf(result);
    expect(
      issues.filter(
        (i: string) =>
          i === MaintainerIssueType.COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION
      )
    ).toHaveLength(1);
    const message =
      result[0].customIssueMessages[
        MaintainerIssueType.COMPANY_CONTACT_LABEL_NOT_MATCH_COMBINATION
      ];
    expect(message).toContain('Wrong Phone');
    expect(message).toContain('Wrong Email');
  });

  it('10. wrong URL and missing URL both fire INVALID_URL', () => {
    const wrongSlug = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        websites: [
          { url: 'https://linkedin.com/in/anyclip', label: 'LinkedIn' },
        ],
      },
    ]);
    expect(issuesOf(wrongSlug)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_URL
    );

    const wrongCase = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        websites: [
          { url: 'https://linkedin.com/company/anyclip', label: 'LinkedIn' },
        ],
      },
    ]);
    expect(issuesOf(wrongCase)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_URL
    );

    const noWebsite = maintainer.testScanContacts([
      { ...validCompanyContact, websites: [] },
    ]);
    expect(issuesOf(noWebsite)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_URL
    );
  });

  it('11. URL label not LinkedIn fires INVALID_URL_LABEL', () => {
    const result = maintainer.testScanContacts([
      {
        ...validCompanyContact,
        websites: [
          { url: 'https://linkedin.com/company/AnyClip', label: 'Work' },
        ],
      },
    ]);
    expect(issuesOf(result)).toContain(
      MaintainerIssueType.COMPANY_CONTACT_INVALID_URL_LABEL
    );
  });

  it('12. a normal person contact is unaffected by company-contact rules', () => {
    const result = maintainer.testScanContacts([
      {
        firstName: 'John',
        lastName: 'Doe',
        company: 'Google',
        jobTitle: 'Developer',
        emails: [{ value: 'john@google.com', label: 'Job' }],
        phones: [{ number: '+123456789', label: 'Job' }],
        websites: [
          { url: 'https://linkedin.com/in/johndoe', label: 'LinkedIn' },
        ],
        label: 'Job',
        biography: 'Notes',
        resourceName: 'people/person-1',
      },
    ]);
    const issues = issuesOf(result);
    companyContactIssues.forEach((issue) => {
      expect(issues).not.toContain(issue);
    });
  });
});
