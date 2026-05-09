import { describe, it, expect } from 'vitest';
import { ValidationSchemas } from '../validationSchemas';

describe('ValidationSchemas', () => {
  describe('email', () => {
    it('should validate correct emails', () => {
      expect(
        ValidationSchemas.email.safeParse('test@example.com').success
      ).toBe(true);
      expect(
        ValidationSchemas.email.safeParse('user.name+tag@domain.co.uk').success
      ).toBe(true);
    });

    it('should fail on invalid email format', () => {
      expect(ValidationSchemas.email.safeParse('invalid-email').success).toBe(
        false
      );
      expect(ValidationSchemas.email.safeParse('@domain.com').success).toBe(
        false
      );
      expect(ValidationSchemas.email.safeParse('user@').success).toBe(false);
    });

    it('should fail on too long emails', () => {
      const longEmail = 'a'.repeat(246) + '@example.com'; // 246 + 12 = 258
      const result = ValidationSchemas.email.safeParse(longEmail);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Email address too long (max 254 characters)'
        );
      }
    });

    it('should fail on consecutive dots', () => {
      const result = ValidationSchemas.email.safeParse(
        'test..user@example.com'
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain('Email cannot contain consecutive dots');
      }
    });
  });

  describe('phone', () => {
    it('should validate correct phone numbers', () => {
      expect(ValidationSchemas.phone.safeParse('+1 234-567-8900').success).toBe(
        true
      );
      expect(ValidationSchemas.phone.safeParse('050-1234567').success).toBe(
        true
      );
      expect(ValidationSchemas.phone.safeParse('12345678').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('#123*').success).toBe(true);
    });

    it('should fail on invalid characters', () => {
      expect(ValidationSchemas.phone.safeParse('123abc456').success).toBe(
        false
      );
      expect(ValidationSchemas.phone.safeParse('123!@#').success).toBe(false);
    });

    it('should fail if no digits are present', () => {
      const result = ValidationSchemas.phone.safeParse('+++ ---');
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain('Phone cannot be only special characters');
      }
    });

    it('should fail if too many digits', () => {
      const longPhone = '1'.repeat(101);
      const result = ValidationSchemas.phone.safeParse(longPhone);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Phone must contain 1-100 digits'
        );
      }
    });
  });

  describe('linkedinUrl', () => {
    it('should validate correct LinkedIn URLs', () => {
      expect(
        ValidationSchemas.linkedinUrl.safeParse(
          'https://www.linkedin.com/in/username/'
        ).success
      ).toBe(true);
      expect(
        ValidationSchemas.linkedinUrl.safeParse(
          'https://linkedin.com/company/google/'
        ).success
      ).toBe(true);
      expect(
        ValidationSchemas.linkedinUrl.safeParse(
          'https://www.linkedin.com/school/stanford/'
        ).success
      ).toBe(true);
    });

    it('should fail on non-LinkedIn hosts', () => {
      const result = ValidationSchemas.linkedinUrl.safeParse(
        'https://facebook.com/in/username'
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Must be a valid LinkedIn URL'
        );
      }
    });

    it('should fail on invalid profile paths', () => {
      const result = ValidationSchemas.linkedinUrl.safeParse(
        'https://www.linkedin.com/feed/'
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'LinkedIn URL must contain a valid profile path (/in/, /company/, or /school/)'
        );
      }
    });

    it('should fail on invalid URL format', () => {
      expect(ValidationSchemas.linkedinUrl.safeParse('not-a-url').success).toBe(
        false
      );
    });
  });

  describe('fieldLength', () => {
    it('should validate strings within limit', () => {
      expect(
        ValidationSchemas.fieldLength.safeParse('short text').success
      ).toBe(true);
      expect(
        ValidationSchemas.fieldLength.safeParse('a'.repeat(1024)).success
      ).toBe(true);
    });

    it('should fail if string exceeds limit', () => {
      const result = ValidationSchemas.fieldLength.safeParse('a'.repeat(1025));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Field exceeds Google API limit of 1024 characters'
        );
      }
    });
  });

  describe('redirectPort', () => {
    it('should validate correct ports', () => {
      expect(ValidationSchemas.redirectPort.safeParse(1024).success).toBe(true);
      expect(ValidationSchemas.redirectPort.safeParse(8080).success).toBe(true);
      expect(ValidationSchemas.redirectPort.safeParse(65535).success).toBe(
        true
      );
    });

    it('should fail on non-integers', () => {
      expect(ValidationSchemas.redirectPort.safeParse(80.5).success).toBe(
        false
      );
    });

    it('should fail on ports out of range', () => {
      expect(ValidationSchemas.redirectPort.safeParse(80).success).toBe(false);
      expect(ValidationSchemas.redirectPort.safeParse(70000).success).toBe(
        false
      );
    });
  });
});
