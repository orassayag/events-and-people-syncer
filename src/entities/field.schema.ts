import { z } from 'zod';

export const fieldLengthSchema = z
  .string()
  .max(1024, 'Field exceeds Google API limit of 1024 characters');
