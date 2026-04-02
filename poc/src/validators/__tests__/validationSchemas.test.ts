import { describe, it, expect } from 'vitest';
import { ValidationSchemas } from '../validationSchemas.js';

describe('ValidationSchemas', () => {
  describe('email', () => {
    it('should validate correct email addresses', () => {
      expect(ValidationSchemas.email.safeParse('user@example.com').success).toBe(true);
      expect(ValidationSchemas.email.safeParse('test.user@domain.co.uk').success).toBe(true);
      expect(ValidationSchemas.email.safeParse('name+tag@example.com').success).toBe(true);
    });
    
    it('should reject invalid emails', () => {
      expect(ValidationSchemas.email.safeParse('not-an-email').success).toBe(false);
      expect(ValidationSchemas.email.safeParse('user..name@example.com').success).toBe(false);
      expect(ValidationSchemas.email.safeParse('.user@example.com').success).toBe(false);
      expect(ValidationSchemas.email.safeParse('@example.com').success).toBe(false);
    });
    
    it('should reject emails longer than 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(ValidationSchemas.email.safeParse(longEmail).success).toBe(false);
    });
  });
  
  describe('phone', () => {
    it('should validate phone numbers with 1-100 digits', () => {
      expect(ValidationSchemas.phone.safeParse('+1-555-0123').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('(555) 123-4567').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('1234567').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('123').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('1').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('123456789012345').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('123#456*789').success).toBe(true);
      expect(ValidationSchemas.phone.safeParse('*99#').success).toBe(true);
    });
    
    it('should reject phones with too many digits', () => {
      const tooManyDigits = '1'.repeat(101);
      expect(ValidationSchemas.phone.safeParse(tooManyDigits).success).toBe(false);
    });
    
    it('should reject phones with only special characters', () => {
      expect(ValidationSchemas.phone.safeParse('+++---').success).toBe(false);
      expect(ValidationSchemas.phone.safeParse('((((').success).toBe(false);
      expect(ValidationSchemas.phone.safeParse('   ').success).toBe(false);
      expect(ValidationSchemas.phone.safeParse('###***').success).toBe(false);
    });
    
    it('should reject phones with invalid characters', () => {
      expect(ValidationSchemas.phone.safeParse('123-456-7890abc').success).toBe(false);
      expect(ValidationSchemas.phone.safeParse('phone number').success).toBe(false);
    });
  });
  
  describe('linkedinUrl', () => {
    it('should validate correct LinkedIn URLs', () => {
      expect(ValidationSchemas.linkedinUrl.safeParse('https://linkedin.com/in/john-doe').success).toBe(true);
      expect(ValidationSchemas.linkedinUrl.safeParse('https://www.linkedin.com/in/jane-smith').success).toBe(true);
      expect(ValidationSchemas.linkedinUrl.safeParse('https://linkedin.com/company/my-company').success).toBe(true);
      expect(ValidationSchemas.linkedinUrl.safeParse('https://linkedin.com/school/university').success).toBe(true);
    });
    
    it('should reject non-LinkedIn URLs', () => {
      expect(ValidationSchemas.linkedinUrl.safeParse('https://facebook.com/profile').success).toBe(false);
      expect(ValidationSchemas.linkedinUrl.safeParse('https://example.com').success).toBe(false);
    });
    
    it('should reject LinkedIn URLs without valid paths', () => {
      expect(ValidationSchemas.linkedinUrl.safeParse('https://linkedin.com').success).toBe(false);
      expect(ValidationSchemas.linkedinUrl.safeParse('https://linkedin.com/about').success).toBe(false);
    });
  });
  
  describe('fieldLength', () => {
    it('should validate fields under 1024 characters', () => {
      expect(ValidationSchemas.fieldLength.safeParse('short text').success).toBe(true);
      expect(ValidationSchemas.fieldLength.safeParse('a'.repeat(1024)).success).toBe(true);
    });
    
    it('should reject fields over 1024 characters', () => {
      expect(ValidationSchemas.fieldLength.safeParse('a'.repeat(1025)).success).toBe(false);
    });
  });
  
  describe('redirectPort', () => {
    it('should validate valid port numbers', () => {
      expect(ValidationSchemas.redirectPort.safeParse(3000).success).toBe(true);
      expect(ValidationSchemas.redirectPort.safeParse(8080).success).toBe(true);
      expect(ValidationSchemas.redirectPort.safeParse(1024).success).toBe(true);
      expect(ValidationSchemas.redirectPort.safeParse(65535).success).toBe(true);
    });
    
    it('should reject ports below 1024', () => {
      expect(ValidationSchemas.redirectPort.safeParse(80).success).toBe(false);
      expect(ValidationSchemas.redirectPort.safeParse(1023).success).toBe(false);
    });
    
    it('should reject ports above 65535', () => {
      expect(ValidationSchemas.redirectPort.safeParse(65536).success).toBe(false);
      expect(ValidationSchemas.redirectPort.safeParse(70000).success).toBe(false);
    });
    
    it('should reject non-integer ports', () => {
      expect(ValidationSchemas.redirectPort.safeParse(3000.5).success).toBe(false);
    });
  });
});
