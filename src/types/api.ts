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
  biographies?: Array<{ value: string; contentType: string }>;
}

export interface ApiStats {
  date: string;
  read_count: number;
  write_count: number;
}

export interface ContactGroup {
  resourceName: string;
  name: string;
  memberCount?: number;
}
