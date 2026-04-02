import { z } from 'zod';

export const linkedinUrlSchema = z
  .string()
  .url('Invalid URL format')
  .refine((url: string) => {
    const parsed: URL = new URL(
      url.startsWith('http') ? url : `https://${url}`
    );
    const validHosts: string[] = ['linkedin.com', 'www.linkedin.com'];
    return validHosts.includes(parsed.hostname);
  }, 'Must be a valid LinkedIn URL')
  .refine((url: string) => {
    const parsed: URL = new URL(
      url.startsWith('http') ? url : `https://${url}`
    );
    const validPaths: string[] = ['/in/', '/company/', '/school/'];
    return validPaths.some((path: string) => parsed.pathname.includes(path));
  }, 'LinkedIn URL must contain a valid profile path (/in/, /company/, or /school/)');
