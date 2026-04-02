export const MOCK_CONNECTIONS = [
  {
    id: 'john-doe-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    company: 'Microsoft Corporation',
    position: 'Software Engineer',
    url: 'https://www.linkedin.com/in/john-doe-123',
    connectedOn: '01 Jan 2024',
  },
  {
    id: 'jane-smith-456',
    firstName: 'Jane',
    lastName: 'Smith',
    email: '',
    company: 'Google Inc',
    position: 'Product Manager',
    url: 'https://www.linkedin.com/in/jane-smith-456',
    connectedOn: '15 Feb 2024',
  },
  {
    id: 'bob-johnson-789',
    firstName: 'Bob',
    lastName: 'Johnson',
    email: 'bob@startup.io',
    company: '',
    position: 'CEO',
    url: 'https://www.linkedin.com/in/bob-johnson-789',
    connectedOn: '20 Mar 2024',
  },
];

export const MOCK_CSV_CONTENT = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/in/john-doe-123,john.doe@example.com,Microsoft Corporation,Software Engineer,01 Jan 2024
Jane,Smith,https://www.linkedin.com/in/jane-smith-456,,Google Inc,Product Manager,15 Feb 2024
Bob,Johnson,https://www.linkedin.com/in/bob-johnson-789,bob@startup.io,,CEO,20 Mar 2024`;

export const MOCK_INVALID_CSV_MISSING_REQUIRED = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,,https://www.linkedin.com/in/john-doe,,Microsoft,Engineer,01 Jan 2024
,Smith,https://www.linkedin.com/in/jane-smith,jane@test.com,Google,PM,15 Feb 2024`;

export const MOCK_INVALID_CSV_COMPANY_URL = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/company/microsoft,john@test.com,Microsoft,Engineer,01 Jan 2024`;

export const MOCK_DUPLICATE_URL_CSV = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Doe,https://www.linkedin.com/in/john-doe-123,john@test.com,Microsoft,Engineer,01 Jan 2024
Jane,Smith,https://www.linkedin.com/in/john-doe-123,jane@test.com,Google,PM,15 Feb 2024`;
