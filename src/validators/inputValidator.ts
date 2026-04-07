import { RegexPatterns } from '../regex';
import { ValidationSchemas } from './validationSchemas';
import type { ContactGroup, EditableContactData } from '../types';

export class InputValidator {
  static validateNoHebrew(
    text: string,
    allowHebrew: boolean = false
  ): string | true {
    if (allowHebrew) return true;
    if (!text || !text.trim()) return true;
    if (RegexPatterns.HEBREW.test(text)) {
      return 'Hebrew characters are not supported. Please use English only.';
    }
    return true;
  }

  static validateEmail(
    email: string,
    allowHebrew: boolean = false
  ): string | true {
    const trimmed = email.trim();
    if (!trimmed) return true;
    const hebrewCheck = InputValidator.validateNoHebrew(trimmed, allowHebrew);
    if (hebrewCheck !== true) {
      return hebrewCheck;
    }
    const result = ValidationSchemas.email.safeParse(trimmed);
    if (!result.success) {
      return result.error.issues[0].message;
    }
    return true;
  }

  static validatePhone(phone: string): string | true {
    const trimmed = phone.trim();
    if (!trimmed) return true;
    const result = ValidationSchemas.phone.safeParse(trimmed);
    if (!result.success) {
      return result.error.issues[0].message;
    }
    return true;
  }

  static validateText(
    text: string,
    allowHebrew: boolean = false
  ): string | true {
    const trimmed = text.trim();
    if (!trimmed) return true;
    return InputValidator.validateNoHebrew(trimmed, allowHebrew);
  }

  static validateLinkedInUrl(url: string): string | true {
    const trimmed = url.trim();
    if (!trimmed) return true;
    let urlToCheck = trimmed;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      urlToCheck = 'https://' + trimmed;
    }
    const result = ValidationSchemas.linkedinUrl.safeParse(urlToCheck);
    if (!result.success) {
      return result.error.issues[0].message;
    }
    return true;
  }

  static normalizeLinkedInUrl(url: string): string {
    let normalized = url.trim();
    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://')
    ) {
      normalized = 'https://' + normalized;
    }
    while (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  static validateUniqueEmail(
    email: string,
    existingEmails: string[],
    currentIndex?: number,
    allowHebrew: boolean = false
  ): string | true {
    const trimmed = email.trim();
    if (!trimmed) return true;
    const emailValidation = this.validateEmail(email, allowHebrew);
    if (emailValidation !== true) {
      return emailValidation;
    }
    const duplicateIndex = existingEmails.findIndex(
      (e) => e.trim() === trimmed
    );
    if (duplicateIndex !== -1 && duplicateIndex !== currentIndex) {
      return 'This email address is already added to this contact.';
    }
    return true;
  }

  static validateUniquePhone(
    phone: string,
    existingPhones: string[],
    currentIndex?: number
  ): string | true {
    const trimmed = phone.trim();
    if (!trimmed) return true;
    const phoneValidation = this.validatePhone(phone);
    if (phoneValidation !== true) {
      return phoneValidation;
    }
    const normalizedPhone = trimmed.replace(/[\s\-()]/g, '');
    const duplicateIndex = existingPhones.findIndex((p) => {
      const normalizedExisting = p.replace(/[\s\-()]/g, '');
      return normalizedExisting === normalizedPhone;
    });
    if (duplicateIndex !== -1 && duplicateIndex !== currentIndex) {
      return 'This phone number is already added to this contact.';
    }
    return true;
  }

  static validateLabelName(
    name: string,
    existingGroups: ContactGroup[]
  ): string | true {
    const trimmed = name.trim().toLowerCase();
    if (trimmed === 'cancel') {
      return true;
    }
    if (!trimmed) {
      return "Error: Label name cannot be empty. Type 'cancel' to go back.";
    }
    if (!RegexPatterns.LABEL_NAME.test(name.trim())) {
      return 'Label name can only contain letters, numbers, spaces, hyphens, and underscores.';
    }
    const exists = existingGroups.find((g) => g.name.toLowerCase() === trimmed);
    if (exists) {
      return `Label '${name.trim()}' already exists.`;
    }
    return true;
  }

  static validateMinimumRequirements(data: EditableContactData): string | true {
    if (!data.firstName || !data.firstName.trim()) {
      return 'First name is required.';
    }
    if (!data.labelResourceNames || data.labelResourceNames.length === 0) {
      return 'At least one label is required.';
    }
    return true;
  }

  static validateFieldLimits(data: EditableContactData): string | true {
    const fields = [
      data.firstName,
      data.lastName,
      data.company || '',
      data.jobTitle || '',
      ...data.emails,
      ...data.phones,
      data.linkedInUrl || '',
    ];
    for (const field of fields) {
      if (!field) continue;
      const result = ValidationSchemas.fieldLength.safeParse(field);
      if (!result.success) {
        return `Field too long: ${field.substring(0, 50)}... (max 1024 characters)`;
      }
    }
    const totalFields =
      (data.firstName ? 1 : 0) +
      (data.lastName ? 1 : 0) +
      (data.company ? 1 : 0) +
      (data.jobTitle ? 1 : 0) +
      data.emails.length +
      data.phones.length +
      (data.linkedInUrl ? 1 : 0) +
      data.labelResourceNames.length;
    if (totalFields > 500) {
      return `Too many fields (${totalFields}). Google API allows maximum 500 fields per contact.`;
    }
    return true;
  }
}
