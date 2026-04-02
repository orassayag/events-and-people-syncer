import { z } from 'zod';
import { RegexPatterns } from '../regex';

export const phoneSchema = z
  .string()
  .regex(
    RegexPatterns.PHONE_ALLOWED_CHARS,
    'Only numbers, +, -, spaces, parentheses, #, and * allowed'
  )
  .refine((phone: string) => {
    const digits: string = phone.replace(RegexPatterns.DIGITS_ONLY, '');
    return digits.length >= 1 && digits.length <= 100;
  }, 'Phone must contain 1-100 digits')
  .refine(
    (phone: string) => !RegexPatterns.PHONE_ONLY_SPECIAL.test(phone),
    'Phone cannot be only special characters'
  );
