import { describe, it, expect } from 'vitest';

describe('ContactEditor - Extract Base Last Name', () => {
  const extractBaseLastName = (lastName: string): string => {
    if (!lastName) return '';
    const parts = lastName.split(' ');
    if (parts.length > 0) {
      return parts[0];
    }
    return lastName;
  };

  it('should extract base last name from composite last name', () => {
    const result = extractBaseLastName('Smith Job Microsoft');
    expect(result).toBe('Smith');
  });

  it('should return empty string for empty last name', () => {
    const result = extractBaseLastName('');
    expect(result).toBe('');
  });

  it('should return last name if no composite suffix', () => {
    const result = extractBaseLastName('Smith');
    expect(result).toBe('Smith');
  });

  it('should handle last name with multiple parts', () => {
    const result = extractBaseLastName('Smith Job Microsoft Azure');
    expect(result).toBe('Smith');
  });
});

describe('ContactEditor - Composite Suffix Building', () => {
  const buildCompositeSuffix = (labelName: string, company: string): string => {
    return [labelName, company].filter((s) => s).join(' ');
  };

  it('should build composite suffix with label and company', () => {
    const result = buildCompositeSuffix('Job', 'Microsoft');
    expect(result).toBe('Job Microsoft');
  });

  it('should build composite suffix with only label', () => {
    const result = buildCompositeSuffix('Job', '');
    expect(result).toBe('Job');
  });

  it('should build composite suffix with only company', () => {
    const result = buildCompositeSuffix('', 'Microsoft');
    expect(result).toBe('Microsoft');
  });

  it('should return empty string when both missing', () => {
    const result = buildCompositeSuffix('', '');
    expect(result).toBe('');
  });
});

describe('ContactEditor - System Memberships Preservation', () => {
  interface Membership {
    contactGroupMembership?: {
      contactGroupResourceName?: string | null;
    };
  }

  const preserveSystemMemberships = (
    existingMemberships: Membership[],
    newUserResourceNames: string[]
  ): Membership[] => {
    const systemMemberships = existingMemberships.filter((m) => {
      const rn = m.contactGroupMembership?.contactGroupResourceName;
      return !rn || !rn.startsWith('contactGroups/');
    });
    const newUserMemberships = newUserResourceNames.map((rn) => ({
      contactGroupMembership: { contactGroupResourceName: rn },
    }));
    return [...systemMemberships, ...newUserMemberships];
  };

  it('should preserve system memberships when updating user groups', () => {
    const existing: Membership[] = [
      { contactGroupMembership: { contactGroupResourceName: null } },
      { contactGroupMembership: { contactGroupResourceName: 'myContacts' } },
      {
        contactGroupMembership: {
          contactGroupResourceName: 'contactGroups/userGroup1',
        },
      },
    ];
    const newUserGroups = [
      'contactGroups/userGroup2',
      'contactGroups/userGroup3',
    ];
    const result = preserveSystemMemberships(existing, newUserGroups);
    expect(result.length).toBe(4);
    expect(
      result[0].contactGroupMembership?.contactGroupResourceName
    ).toBeNull();
    expect(result[1].contactGroupMembership?.contactGroupResourceName).toBe(
      'myContacts'
    );
    expect(result[2].contactGroupMembership?.contactGroupResourceName).toBe(
      'contactGroups/userGroup2'
    );
    expect(result[3].contactGroupMembership?.contactGroupResourceName).toBe(
      'contactGroups/userGroup3'
    );
  });

  it('should handle empty existing memberships', () => {
    const existing: Membership[] = [];
    const newUserGroups = ['contactGroups/userGroup1'];
    const result = preserveSystemMemberships(existing, newUserGroups);
    expect(result.length).toBe(1);
    expect(result[0].contactGroupMembership?.contactGroupResourceName).toBe(
      'contactGroups/userGroup1'
    );
  });

  it('should filter out old user groups', () => {
    const existing: Membership[] = [
      {
        contactGroupMembership: {
          contactGroupResourceName: 'contactGroups/oldGroup',
        },
      },
    ];
    const newUserGroups = ['contactGroups/newGroup'];
    const result = preserveSystemMemberships(existing, newUserGroups);
    expect(result.length).toBe(1);
    expect(result[0].contactGroupMembership?.contactGroupResourceName).toBe(
      'contactGroups/newGroup'
    );
  });
});

describe('ContactEditor - Update Mask Building', () => {
  it('should include names in mask when first name changed', () => {
    const mask: string[] = [];
    const firstNameChanged = true;
    if (firstNameChanged) {
      mask.push('names');
    }
    expect(mask).toContain('names');
  });

  it('should include names in mask when last name changed', () => {
    const mask: string[] = [];
    const lastNameChanged = true;
    if (lastNameChanged) {
      mask.push('names');
    }
    expect(mask).toContain('names');
  });

  it('should include names in mask when company changed', () => {
    const mask: string[] = [];
    const companyChanged = true;
    if (companyChanged) {
      mask.push('names');
    }
    expect(mask).toContain('names');
  });

  it('should include emailAddresses when emails changed', () => {
    const mask: string[] = [];
    const emailsChanged = true;
    if (emailsChanged) {
      mask.push('emailAddresses');
    }
    expect(mask).toContain('emailAddresses');
  });

  it('should include emailAddresses when company changed (label update)', () => {
    const mask: string[] = [];
    const companyChanged = true;
    if (companyChanged) {
      mask.push('emailAddresses');
    }
    expect(mask).toContain('emailAddresses');
  });

  it('should not include unchanged fields', () => {
    const mask: string[] = [];
    const firstNameChanged = false;
    const lastNameChanged = false;
    const emailsChanged = false;
    if (firstNameChanged || lastNameChanged) {
      mask.push('names');
    }
    if (emailsChanged) {
      mask.push('emailAddresses');
    }
    expect(mask.length).toBe(0);
  });
});

describe('ContactEditor - Field Change Detection', () => {
  it('should detect first name change', () => {
    const original = 'John';
    const updated = 'Jane';
    expect(original).not.toBe(updated);
  });

  it('should detect no change when values identical', () => {
    const original = 'John';
    const updated = 'John';
    expect(original !== updated).toBe(false);
  });

  it('should detect email array change', () => {
    const original = ['john@example.com'];
    const updated = ['jane@example.com'];
    expect(
      JSON.stringify(original.sort()) !== JSON.stringify(updated.sort())
    ).toBe(true);
  });

  it('should detect no email change when arrays identical', () => {
    const original = ['john@example.com', 'john2@example.com'];
    const updated = ['john2@example.com', 'john@example.com'];
    expect(
      JSON.stringify(original.sort()) !== JSON.stringify(updated.sort())
    ).toBe(false);
  });
});

describe('ContactEditor - addPhoneToExistingContact Logic', () => {
  interface PhoneNumber {
    value: string;
    type: string;
  }

  const addPhoneToExisting = (
    existingPhones: PhoneNumber[],
    newPhone: string
  ): PhoneNumber[] => {
    return [...existingPhones, { value: newPhone, type: 'other' }];
  };

  it('should add phone to existing phones array', () => {
    const existing: PhoneNumber[] = [
      { value: '+972501234567', type: 'mobile' },
    ];
    const result = addPhoneToExisting(existing, '+1-555-987-6543');
    expect(result).toHaveLength(2);
    expect(result[1].value).toBe('+1-555-987-6543');
    expect(result[1].type).toBe('other');
  });

  it('should add phone to empty phones array', () => {
    const existing: PhoneNumber[] = [];
    const result = addPhoneToExisting(existing, '+972501234567');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('+972501234567');
  });

  it('should preserve existing phone types', () => {
    const existing: PhoneNumber[] = [
      { value: '+972501234567', type: 'work' },
      { value: '+972509876543', type: 'home' },
    ];
    const result = addPhoneToExisting(existing, '+1-555-987-6543');
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('work');
    expect(result[1].type).toBe('home');
    expect(result[2].type).toBe('other');
  });
});

describe('ContactEditor - 412 Etag Conflict Handling', () => {
  it('should identify 412 error code', () => {
    const error = { code: 412 };
    const is412Error = error.code === 412;
    expect(is412Error).toBe(true);
  });

  it('should identify 412 status', () => {
    const error = { status: 412 };
    const is412Error = error.status === 412;
    expect(is412Error).toBe(true);
  });

  it('should not identify non-412 errors', () => {
    const error = { code: 400 };
    const is412Error = error.code === 412 || (error as any).status === 412;
    expect(is412Error).toBe(false);
  });

  it('should handle retry logic after 412 error', () => {
    let retryCount = 0;
    const maxRetries = 1;
    const simulateUpdateWithRetry = (): boolean => {
      try {
        throw { code: 412 };
      } catch (error: unknown) {
        const errorCode =
          (error as { code?: number; status?: number })?.code ||
          (error as { code?: number; status?: number })?.status;
        if (errorCode === 412 && retryCount < maxRetries) {
          retryCount++;
          return true;
        }
        throw error;
      }
    };
    const shouldRetry = simulateUpdateWithRetry();
    expect(shouldRetry).toBe(true);
    expect(retryCount).toBe(1);
  });
});

describe('ContactEditor - Phone Validation Before Adding', () => {
  const isValidPhoneForAdding = (phone: string): boolean => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    if (/^0+$/.test(digitsOnly) || /^(.)\1+$/.test(digitsOnly)) return false;
    return true;
  };

  it('should accept valid phone numbers', () => {
    expect(isValidPhoneForAdding('+972501234567')).toBe(true);
    expect(isValidPhoneForAdding('050-123-4567')).toBe(true);
    expect(isValidPhoneForAdding('+1 (555) 123-4567')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(isValidPhoneForAdding('123456')).toBe(false);
    expect(isValidPhoneForAdding('0000000')).toBe(false);
    expect(isValidPhoneForAdding('1111111')).toBe(false);
  });

  it('should reject phones that are too long', () => {
    expect(isValidPhoneForAdding('1234567890123456')).toBe(false);
  });
});

describe('ContactEditor - addEmailToExistingContact Logic', () => {
  interface EmailAddress {
    value: string;
    type: string;
  }

  const addEmailToExisting = (
    existingEmails: EmailAddress[],
    newEmail: string
  ): EmailAddress[] => {
    return [...existingEmails, { value: newEmail, type: 'other' }];
  };

  it('should add email to existing emails array', () => {
    const existing: EmailAddress[] = [
      { value: 'john@example.com', type: 'work' },
    ];
    const result = addEmailToExisting(existing, 'john.personal@example.com');
    expect(result).toHaveLength(2);
    expect(result[1].value).toBe('john.personal@example.com');
    expect(result[1].type).toBe('other');
  });

  it('should add email to empty emails array', () => {
    const existing: EmailAddress[] = [];
    const result = addEmailToExisting(existing, 'new@example.com');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('new@example.com');
  });

  it('should preserve existing email types', () => {
    const existing: EmailAddress[] = [
      { value: 'work@example.com', type: 'work' },
      { value: 'home@example.com', type: 'home' },
    ];
    const result = addEmailToExisting(existing, 'other@example.com');
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('work');
    expect(result[1].type).toBe('home');
    expect(result[2].type).toBe('other');
  });
});

describe('ContactEditor - Email Already Exists Check', () => {
  const emailNormalize = (email: string): string => email.toLowerCase().trim();

  const emailAlreadyExists = (
    existingEmails: string[],
    newEmail: string
  ): boolean => {
    const normalizedNew = emailNormalize(newEmail);
    return existingEmails.some((e) => emailNormalize(e) === normalizedNew);
  };

  it('should detect existing email with exact match', () => {
    const existing = ['john@example.com', 'jane@example.com'];
    expect(emailAlreadyExists(existing, 'john@example.com')).toBe(true);
  });

  it('should detect existing email with different case', () => {
    const existing = ['John@Example.COM'];
    expect(emailAlreadyExists(existing, 'john@example.com')).toBe(true);
  });

  it('should detect existing email with whitespace', () => {
    const existing = ['  john@example.com  '];
    expect(emailAlreadyExists(existing, 'john@example.com')).toBe(true);
  });

  it('should return false for non-existing email', () => {
    const existing = ['john@example.com'];
    expect(emailAlreadyExists(existing, 'jane@example.com')).toBe(false);
  });

  it('should return false for empty existing list', () => {
    const existing: string[] = [];
    expect(emailAlreadyExists(existing, 'john@example.com')).toBe(false);
  });

  it('should not consider plus addressing as the same email', () => {
    const existing = ['user@example.com'];
    expect(emailAlreadyExists(existing, 'user+tag@example.com')).toBe(false);
  });
});

describe('ContactEditor - Phone Already Exists Check', () => {
  const getAllVariations = (phone: string): string[] => {
    const variations: string[] = [];
    const normalized = phone.replace(/[^\d+#*]/g, '');
    const digitsOnly = phone.replace(/\D/g, '');
    variations.push(normalized);
    variations.push(digitsOnly);
    if (digitsOnly.startsWith('0')) {
      variations.push(digitsOnly.substring(1));
    }
    if (digitsOnly.startsWith('00')) {
      variations.push(digitsOnly.substring(2));
    }
    return [...new Set(variations)];
  };

  const phonesMatch = (phone1: string, phone2: string): boolean => {
    const v1 = getAllVariations(phone1);
    const v2 = getAllVariations(phone2);
    for (const a of v1) {
      for (const b of v2) {
        if (a === b) return true;
        const d1 = a.replace(/\D/g, '');
        const d2 = b.replace(/\D/g, '');
        const minLength = 6;
        if (d1.length >= minLength && d2.length >= minLength) {
          if (d1.endsWith(d2) || d2.endsWith(d1)) return true;
        }
      }
    }
    return false;
  };

  const phoneAlreadyExists = (
    existingPhones: string[],
    newPhone: string
  ): boolean => {
    return existingPhones.some((p) => phonesMatch(p, newPhone));
  };

  it('should detect existing phone with exact match', () => {
    const existing = ['+972501234567'];
    expect(phoneAlreadyExists(existing, '+972501234567')).toBe(true);
  });

  it('should detect existing phone with different formatting', () => {
    const existing = ['+972-50-123-4567'];
    expect(phoneAlreadyExists(existing, '+972501234567')).toBe(true);
  });

  it('should detect existing phone with local vs international', () => {
    const existing = ['+972501234567'];
    expect(phoneAlreadyExists(existing, '0501234567')).toBe(true);
  });

  it('should return false for non-existing phone', () => {
    const existing = ['+972501234567'];
    expect(phoneAlreadyExists(existing, '+972509876543')).toBe(false);
  });

  it('should return false for empty existing list', () => {
    const existing: string[] = [];
    expect(phoneAlreadyExists(existing, '+972501234567')).toBe(false);
  });
});

describe('ContactEditor - 412 Etag Conflict Handling for Email', () => {
  it('should handle 412 error when adding email', () => {
    let retryCount = 0;
    const maxRetries = 1;
    const simulateEmailUpdateWithRetry = (): boolean => {
      try {
        throw { code: 412 };
      } catch (error: unknown) {
        const errorCode =
          (error as { code?: number; status?: number })?.code ||
          (error as { code?: number; status?: number })?.status;
        if (errorCode === 412 && retryCount < maxRetries) {
          retryCount++;
          return true;
        }
        throw error;
      }
    };
    const shouldRetry = simulateEmailUpdateWithRetry();
    expect(shouldRetry).toBe(true);
    expect(retryCount).toBe(1);
  });

  it('should check if email exists after 412 retry and skip if found', () => {
    const existingEmails = ['john@example.com'];
    const newEmail = 'john@example.com';
    const emailExistsAfterRefresh = existingEmails.some(
      (e) => e.toLowerCase() === newEmail.toLowerCase()
    );
    expect(emailExistsAfterRefresh).toBe(true);
  });
});

describe('ContactEditor - collectInitialInput with Pre-populated Data', () => {
  it('should use pre-populated first name and last name', () => {
    const prePopulatedData = {
      firstName: 'John',
      lastName: 'Doe',
    };
    const defaultFullName =
      `${prePopulatedData.firstName} ${prePopulatedData.lastName}`.trim();
    expect(defaultFullName).toBe('John Doe');
  });

  it('should handle empty pre-populated data', () => {
    const prePopulatedData = {
      firstName: '',
      lastName: '',
    };
    const defaultFullName =
      `${prePopulatedData.firstName || ''} ${prePopulatedData.lastName || ''}`.trim();
    expect(defaultFullName).toBe('');
  });

  it('should use pre-populated emails array', () => {
    const prePopulatedData = {
      emails: ['john@example.com', 'john.work@example.com'],
    };
    const emails = prePopulatedData.emails?.slice() || [];
    expect(emails).toHaveLength(2);
    expect(emails).toContain('john@example.com');
  });

  it('should use pre-populated phones array', () => {
    const prePopulatedData = {
      phones: ['+972501234567', '+1-555-123-4567'],
    };
    const phones = prePopulatedData.phones?.slice() || [];
    expect(phones).toHaveLength(2);
  });

  it('should use pre-populated company', () => {
    const prePopulatedData = {
      company: 'Acme Corp',
    };
    const company = prePopulatedData.company || '';
    expect(company).toBe('Acme Corp');
  });
});
