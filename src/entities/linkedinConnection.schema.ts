import { z } from 'zod';
import { ContactType } from '../types';

export const emailSchema = z.string().email().trim();

export const linkedInUrlSchema = z
  .string()
  .trim()
  .refine(
    (url: string) => {
      const lowerUrl: string = url.toLowerCase();
      return lowerUrl.includes('/in/') && !lowerUrl.includes('/company/');
    },
    {
      message:
        'LinkedIn URL must be a personal profile (contain /in/, not /company/)',
    }
  );

export const linkedInConnectionSchema = z.object({
  type: z.literal(ContactType.LINKEDIN).default(ContactType.LINKEDIN),
  id: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().optional().default(''),
  company: z.string().trim().optional().default(''),
  position: z.string().trim().optional().default(''),
  url: linkedInUrlSchema,
  connectedOn: z.string().trim().optional().default(''),
});

export const companyMappingSchema = z.object({
  label: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
});

export const companyCacheDataSchema = z.object({
  timestamp: z.number(),
  mappings: z.array(companyMappingSchema),
});
