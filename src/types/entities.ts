import { z } from 'zod';
import { extractedContactSchema, detectionResultSchema, smsWhatsappSyncStatsSchema } from '../entities/smsWhatsappSync.schema';

export type ExtractedContactSchema = z.infer<typeof extractedContactSchema>;
export type DetectionResultSchema = z.infer<typeof detectionResultSchema>;
export type SmsWhatsappSyncStatsSchema = z.infer<typeof smsWhatsappSyncStatsSchema>;

export interface DetectionSelector {
  pattern: string;
  selector: string;
  stable: boolean;
}
