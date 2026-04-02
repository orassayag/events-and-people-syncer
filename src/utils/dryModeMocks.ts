export class DryModeMocks {
  private static counter = 0;
  private static generateUniqueId(): string {
    this.counter++;
    return `${Date.now()}_${this.counter}_${Math.random().toString(36).slice(2, 11)}`;
  }

  static createGroupResponse(_groupName: string): string {
    return `contactGroups/dryMode_${this.generateUniqueId()}`;
  }

  static createContactResponse(
    firstName: string,
    lastName: string
  ): {
    resourceName: string;
    etag: string;
    names: Array<{ givenName?: string; familyName?: string }>;
    emailAddresses?: any[];
    phoneNumbers?: any[];
    organizations?: any[];
    urls?: any[];
    memberships?: any[];
    biographies?: any[];
  } {
    return {
      resourceName: `people/dryMode_${this.generateUniqueId()}`,
      etag: `dryMode_etag_${this.generateUniqueId()}`,
      names: [{ givenName: firstName, familyName: lastName }],
      emailAddresses: [],
      phoneNumbers: [],
      organizations: [],
      urls: [],
      memberships: [],
      biographies: [],
    };
  }
}
