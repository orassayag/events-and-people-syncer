import { SETTINGS } from '../settings';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Manual company name refactoring mappings and protected suffixes.
 * This file is based on the Final Company Name Refactoring Plan.
 */

export const PROTECTED_SUFFIXES = [
  '.com',
  '.ai',
  '.io',
  '.fm',
  'J.P.',
  'AT&T',
  'eBay',
  'SVT.Jobs',
  'GlassesUSA.com',
  'YaelGroup',
  'JobInfo',
];

export const COMPANY_SUFFIXES_TO_REMOVE = [
  'Ltd',
  'Limited',
  'Inc',
  'LLC',
  'Corp',
  'Co',
  'Holdings',
  'Group',
  'Technologies',
  'Systems',
  'Solutions',
  'R&D',
  'International',
];

/**
 * Manual refactor list.
 * Keys are the "cleaned" PascalCase names (with whitespace ignored during matching).
 * Values are the desired display brand names.
 */
const getManualCompanyMappings = (): Record<string, string> => {
  const filePath = join(SETTINGS.backup.contactsPath, 'companies_mapping.json');
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load manual company mappings:', error);
    return {};
  }
};

export const MANUAL_COMPANY_MAPPINGS: Record<string, string> =
  getManualCompanyMappings();

/**
 * Known LinkedIn URLs for companies.
 * Used to suppress "MISSING REQUIRED URL FOR HR/JOB LABEL" or suggest URLs.
 */
export const COMPANY_URL_MAPPINGS: Record<string, string> = {
  Gotfriends: 'https://www.linkedin.com/company/gotfriends/',
  Nisha: 'https://www.linkedin.com/company/nisha-group/',
  Maof: 'https://www.linkedin.com/company/maof-group/',
  Experis: 'https://www.linkedin.com/company/experis-israel/',
  Manpower: 'https://www.linkedin.com/company/manpower-israel/',
  Triad: 'https://www.linkedin.com/company/triad-israel/',
  SVTJobs: 'https://www.linkedin.com/company/svt-jobs/',
  AllJobs: 'https://www.linkedin.com/company/alljobs/',
};
