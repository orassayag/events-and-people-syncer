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

export interface Address {
  formattedValue: string;
  label: string;
}

export interface ContactData {
  label: string;
  labels?: string[];
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  emails: EmailAddress[];
  phones: PhoneNumber[];
  websites: Website[];
  addresses: Address[];
  resourceName?: string;
  biography?: string;
  etag?: string;
  note?: string;
}
