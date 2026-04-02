import { z } from 'zod';
import { phoneSchema } from './phone.schema';

export const extractedContactSchema = z.object({
  phone: phoneSchema,
  normalizedPhone: z.string().min(7).max(15),
  suggestedName: z.string().optional(),
});

export const detectionResultSchema = z.object({
  source: z.enum(['google-messages', 'whatsapp-web']).nullable(),
  matchedSelectors: z.array(z.string()),
  failedSelectors: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

export const smsWhatsappSyncStatsSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
});

export type { ExtractedContactSchema, DetectionResultSchema, SmsWhatsappSyncStatsSchema } from '../types/entities';
