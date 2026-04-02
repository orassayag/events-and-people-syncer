import { z } from 'zod';
import { VALIDATION_CONSTANTS } from '../constants';

export const redirectPortSchema = z
  .number()
  .int('Port must be an integer')
  .min(
    VALIDATION_CONSTANTS.PORT.MIN,
    `Port must be >= ${VALIDATION_CONSTANTS.PORT.MIN}`
  )
  .max(
    VALIDATION_CONSTANTS.PORT.MAX,
    `Port must be <= ${VALIDATION_CONSTANTS.PORT.MAX}`
  );
