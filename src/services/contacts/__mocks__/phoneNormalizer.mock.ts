export const mockPhoneVariations: Record<string, string[]> = {
  '+972501234567': ['+972501234567', '972501234567', '0501234567', '501234567'],
  '+1-555-123-4567': ['+15551234567', '15551234567', '5551234567'],
  '050-123-4567': ['0501234567', '501234567', '050-123-4567'],
  '+44 20 7946 0958': ['+442079460958', '442079460958', '2079460958'],
};

export const mockPhoneMatches: Array<[string, string, boolean]> = [
  ['+972501234567', '+972501234567', true],
  ['+972-50-123-4567', '+972501234567', true],
  ['050-123-4567', '+972501234567', true],
  ['501234567', '+972501234567', true],
  ['+972501234567', '+972509876543', false],
  ['12345', '+972501234567', false],
];

export const mockValidPhones: Array<[string, boolean]> = [
  ['+972501234567', true],
  ['1234567', true],
  ['123456789012345', true],
  ['123456', false],
  ['1234567890123456', false],
  ['0000000', false],
  ['1111111', false],
];

export class MockPhoneNormalizer {
  normalize(phone: string): string {
    return phone.replace(/[^\d+#*]/g, '');
  }

  getAllNormalizedVariations(phone: string): string[] {
    const normalized = this.normalize(phone);
    const digitsOnly = phone.replace(/\D/g, '');
    const variations = [normalized, digitsOnly, phone];
    if (digitsOnly.startsWith('0')) {
      variations.push(digitsOnly.substring(1));
    }
    if (digitsOnly.startsWith('00')) {
      variations.push(digitsOnly.substring(2));
    }
    return [...new Set(variations)];
  }

  phonesMatch(phone1: string, phone2: string): boolean {
    const variations1 = this.getAllNormalizedVariations(phone1);
    const variations2 = this.getAllNormalizedVariations(phone2);
    for (const v1 of variations1) {
      for (const v2 of variations2) {
        if (v1 === v2) return true;
        const minLength = 6;
        const digitsV1 = v1.replace(/\D/g, '');
        const digitsV2 = v2.replace(/\D/g, '');
        if (digitsV1.length >= minLength && digitsV2.length >= minLength) {
          if (
            digitsV1.length >= digitsV2.length &&
            digitsV1.endsWith(digitsV2) &&
            digitsV2.length >= minLength
          ) {
            return true;
          }
          if (
            digitsV2.length >= digitsV1.length &&
            digitsV2.endsWith(digitsV1) &&
            digitsV1.length >= minLength
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  isValidPhone(value: string): boolean {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    if (/^0+$/.test(digitsOnly) || /^(.)\1+$/.test(digitsOnly)) return false;
    return true;
  }

  static phonesMatch(phone1: string, phone2: string): boolean {
    const instance = new MockPhoneNormalizer();
    return instance.phonesMatch(phone1, phone2);
  }
}
