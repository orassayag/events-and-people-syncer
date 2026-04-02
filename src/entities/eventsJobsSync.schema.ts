import { z } from 'zod';
export const folderTypeSchema = z.enum(['job', 'hr', 'life-event']);
export const folderMappingSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  type: folderTypeSchema,
  label: z.string().trim().min(1),
  companyName: z.string().trim().optional(),
});
export const folderCacheDataSchema = z.object({
  timestamp: z.number(),
  jobFolders: z.array(folderMappingSchema),
  lifeEventFolders: z.array(folderMappingSchema),
});
