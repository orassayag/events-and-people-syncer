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
}

export interface GoogleCredentials {
  web: {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
  };
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface EnvironmentConfig {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  PROJECT_ID: string;
  AUTH_URI: string;
  TOKEN_URI: string;
  AUTH_PROVIDER_CERT_URL: string;
  REDIRECT_PORT: string;
}

export interface InitialContactData {
  labelResourceNames: string[];
  company: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
}

export interface EditableContactData {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
  labelResourceNames: string[];
}

export interface ContactName {
  givenName?: string;
  familyName?: string;
}

export interface ContactEmail {
  value: string;
  type: string;
}

export interface ContactPhone {
  value: string;
  type: string;
}

export interface ContactOrganization {
  name?: string;
  title?: string;
  type: string;
}

export interface ContactUrl {
  value: string;
  type: string;
}

export interface ContactMembership {
  contactGroupMembership: {
    contactGroupResourceName: string;
  };
}

export interface CreateContactRequest {
  names?: ContactName[];
  emailAddresses?: ContactEmail[];
  phoneNumbers?: ContactPhone[];
  organizations?: ContactOrganization[];
  urls?: ContactUrl[];
  memberships?: ContactMembership[];
}

export interface ApiStats {
  date: string;
  read_count: number;
  write_count: number;
}

export interface ContactGroup {
  resourceName: string;
  name: string;
}
