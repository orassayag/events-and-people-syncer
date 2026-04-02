import { z } from 'zod';

export const ValidationSchemas = {
  email: z
    .string()
    .email('Invalid email address format')
    .max(254, 'Email address too long (max 254 characters)')
    .refine(
      (email: string) => !email.includes('..'),
      'Email cannot contain consecutive dots'
    ),
  phone: z
    .string()
    .regex(
      /^[\d+\-\s()#*]+$/,
      'Only numbers, +, -, spaces, parentheses, #, and * allowed'
    )
    .refine((phone: string) => {
      const digits = phone.replace(/[^\d]/g, '');
      return digits.length >= 1 && digits.length <= 100;
    }, 'Phone must contain 1-100 digits')
    .refine(
      (phone: string) => !/^[\s\-+()#*]+$/.test(phone),
      'Phone cannot be only special characters'
    ),
  linkedinUrl: z
    .string()
    .url('Invalid URL format')
    .refine((url: string) => {
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        const validHosts = ['linkedin.com', 'www.linkedin.com'];
        return validHosts.includes(parsed.hostname);
      } catch {
        return false;
      }
    }, 'Must be a valid LinkedIn URL')
    .refine((url: string) => {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      const validPaths = ['/in/', '/company/', '/school/'];
      return validPaths.some((path: string) => parsed.pathname.includes(path));
    }, 'LinkedIn URL must contain a valid profile path (/in/, /company/, or /school/)'),
  fieldLength: z
    .string()
    .max(1024, 'Field exceeds Google API limit of 1024 characters'),
  redirectPort: z
    .number()
    .int('Port must be an integer')
    .min(1024, 'Port must be >= 1024')
    .max(65535, 'Port must be <= 65535'),
};
