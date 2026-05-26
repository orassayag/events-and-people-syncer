import { injectable } from 'inversify';

@injectable()
export class PhoneNormalizer {
  normalize(phone: string): string {
    return phone.replace(/[^\d+#*]/g, '');
  }

  getAllNormalizedVariations(phone: string): string[] {
    const variations: string[] = [];
    const normalized = this.normalize(phone);
    const digitsOnly = phone.replace(/\D/g, '');
    variations.push(normalized);
    variations.push(digitsOnly);
    variations.push(phone);

    // Israeli specific logic
    if (digitsOnly.startsWith('972')) {
      // +972... case
      const without972 = digitsOnly.substring(3);
      if (without972.startsWith('0')) {
        // +9720... case
        const local = without972; // already starts with 0
        variations.push(local);
        const withoutExtraZero = '972' + without972.substring(1);
        variations.push(withoutExtraZero);
        variations.push('+' + withoutExtraZero);
      } else {
        // +972... (no extra 0)
        const local = '0' + without972;
        variations.push(local);
        const withExtraZero = '9720' + without972;
        variations.push(withExtraZero);
        variations.push('+' + withExtraZero);
      }
    } else if (digitsOnly.startsWith('0') && !digitsOnly.startsWith('00')) {
      // 0... local case
      const withoutZero = digitsOnly.substring(1);
      const international = '972' + withoutZero;
      variations.push(international);
      variations.push('+' + international);
      const internationalWithZero = '9720' + withoutZero;
      variations.push(internationalWithZero);
      variations.push('+' + internationalWithZero);
    }

    if (digitsOnly.startsWith('0')) {
      variations.push(digitsOnly.substring(1));
    }
    if (digitsOnly.startsWith('00')) {
      variations.push(digitsOnly.substring(2));
    }
    return [...new Set(variations)];
  }

  phonesMatch(phone1: string, phone2: string): boolean {
    const variations1 = this.getAllNormalizedVariations(phone1).filter(
      (v) => v.trim() !== ''
    );
    const variations2 = this.getAllNormalizedVariations(phone2).filter(
      (v) => v.trim() !== ''
    );

    if (variations1.length === 0 || variations2.length === 0) {
      // If one of them has no numeric/special content, only match if the raw strings are identical
      return phone1.trim().toLowerCase() === phone2.trim().toLowerCase();
    }

    for (const v1 of variations1) {
      for (const v2 of variations2) {
        if (v1.toLowerCase() === v2.toLowerCase()) return true;
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
    const instance = new PhoneNormalizer();
    return instance.phonesMatch(phone1, phone2);
  }
}
