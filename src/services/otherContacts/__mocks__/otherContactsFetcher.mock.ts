import type { OtherContactEntry } from '../../../types/otherContactsSync';

export const createMockOtherContactEntry = (
  emails: string[],
  phones: string[] = [],
  displayName?: string,
  resourceName: string = `otherContacts/${Math.random().toString(36).substr(2, 9)}`
): OtherContactEntry => ({
  emails,
  phones,
  resourceName,
  displayName,
});

export const mockOtherContactsWithEmails: OtherContactEntry[] = [
  createMockOtherContactEntry(
    ['john@example.com'],
    [],
    'John Doe',
    'otherContacts/1'
  ),
  createMockOtherContactEntry(
    ['jane@example.com', 'jane.work@example.com'],
    ['+1-555-123-4567'],
    'Jane Smith',
    'otherContacts/2'
  ),
  createMockOtherContactEntry(
    ['unknown@test.com'],
    [],
    undefined,
    'otherContacts/3'
  ),
];

export const mockOtherContactsWithPhonesOnly: OtherContactEntry[] = [
  createMockOtherContactEntry(
    [],
    ['+972-50-123-4567'],
    'רחל כהן',
    'otherContacts/4'
  ),
  createMockOtherContactEntry(
    [],
    ['+44 20 7946 0958'],
    'David Wilson',
    'otherContacts/5'
  ),
];

export const mockOtherContactsEmpty: OtherContactEntry[] = [];

export const mockOtherContactsWithDuplicateEmails: OtherContactEntry[] = [
  createMockOtherContactEntry(
    ['shared@example.com'],
    [],
    'First Person',
    'otherContacts/6'
  ),
  createMockOtherContactEntry(
    ['shared@example.com'],
    [],
    'Second Person',
    'otherContacts/7'
  ),
  createMockOtherContactEntry(
    ['unique@example.com'],
    [],
    'Third Person',
    'otherContacts/8'
  ),
];

export const mockOtherContactsNoEmailNoName: OtherContactEntry[] = [
  createMockOtherContactEntry([], [], undefined, 'otherContacts/9'),
  createMockOtherContactEntry(
    [],
    ['+1-555-000-0000'],
    undefined,
    'otherContacts/10'
  ),
];

export const mockGoogleApiResponse = {
  singlePage: {
    data: {
      otherContacts: [
        {
          resourceName: 'otherContacts/1',
          names: [{ displayName: 'John Doe' }],
          emailAddresses: [{ value: 'john@example.com' }],
          phoneNumbers: [],
        },
        {
          resourceName: 'otherContacts/2',
          names: [{ displayName: 'Jane Smith' }],
          emailAddresses: [
            { value: 'jane@example.com' },
            { value: 'jane.work@example.com' },
          ],
          phoneNumbers: [{ value: '+1-555-123-4567' }],
        },
      ],
      totalSize: 2,
      nextPageToken: undefined,
    },
  },
  multiplePagesFirstPage: {
    data: {
      otherContacts: [
        {
          resourceName: 'otherContacts/1',
          names: [{ displayName: 'Person One' }],
          emailAddresses: [{ value: 'one@example.com' }],
          phoneNumbers: [],
        },
      ],
      totalSize: 3,
      nextPageToken: 'page2token',
    },
  },
  multiplePagesSecondPage: {
    data: {
      otherContacts: [
        {
          resourceName: 'otherContacts/2',
          names: [{ displayName: 'Person Two' }],
          emailAddresses: [{ value: 'two@example.com' }],
          phoneNumbers: [],
        },
        {
          resourceName: 'otherContacts/3',
          names: [{ displayName: 'Person Three' }],
          emailAddresses: [{ value: 'three@example.com' }],
          phoneNumbers: [],
        },
      ],
      totalSize: 3,
      nextPageToken: undefined,
    },
  },
  emptyResponse: {
    data: {
      otherContacts: [],
      totalSize: 0,
      nextPageToken: undefined,
    },
  },
  malformedResponse: {
    data: {
      otherContacts: [
        {
          resourceName: 'otherContacts/1',
        },
        {
          resourceName: 'otherContacts/2',
          names: null,
          emailAddresses: null,
          phoneNumbers: null,
        },
        {
          resourceName: 'otherContacts/3',
          names: [{ displayName: '   ' }],
          emailAddresses: [{ value: '' }],
          phoneNumbers: [{ value: null }],
        },
      ],
      totalSize: 3,
    },
  },
};
