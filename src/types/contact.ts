export interface EmailAddress {
  value: string;
  label: string;
}

export interface PhoneNumber {
  number: string;
  label: string;
}

export interface Website {
  url: string;
  label: string;
}

export interface ContactData {
  label: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  emails: EmailAddress[];
  phones: PhoneNumber[];
  websites: Website[];
  resourceName?: string;
  biography?: string;
  etag?: string;
  note?: string;
}
