import { z } from 'zod';

export const emailSchema = z
  .string()
  .email('Invalid email address format')
  .max(254, 'Email address too long (max 254 characters)')
  .refine(
    (email: string) => !email.includes('..'),
    'Email cannot contain consecutive dots'
  );
