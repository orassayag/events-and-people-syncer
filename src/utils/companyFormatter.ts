import { SETTINGS } from '../settings';
import { extractEnglishFromMixed } from './hebrewFormatter';
import { TextUtils } from './textUtils';
import {
  MANUAL_COMPANY_MAPPINGS,
  PROTECTED_SUFFIXES,
  COMPANY_SUFFIXES_TO_REMOVE,
} from './companyMappings';
import { formatCompanyToPascalCase as formatCompany } from './companyUtils';

function removeDomainsAndUrls(text: string): string {
  const urlRegex =
    /(?:https?:\/\/)?(?:www\.)?([\w-]+)\.(?:com|co\.il|net|org|io|ai|tech|app|dev|me|info|biz|co|il|org\.il|gov\.il|edu|ac\.il)\b[/\w-]*\b/gi;
  let cleaned = text
    .replace(urlRegex, (match, domain) => {
      if (
        /^(?:https?:\/\/)?www\./i.test(match) ||
        /\.co\.il\/?$/i.test(match)
      ) {
        return domain;
      }
      return match;
    })
    .trim();

  cleaned = cleaned.replace(/\bwww\.\b/gi, '');
  // If we removed everything, return the original
  return cleaned.length >= 2 ? cleaned : text;
}

function removeParenthesesAndContents(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\)[^)]*$/g, '')
    .replace(/\([^)]*$/, '')
    .trim();
}

export function cleanCompany(company: string): string {
  if (!company.trim()) {
    return '';
  }
  let cleaned: string = company.trim();

  // Specific rule: Truncate if contains ",", " - ", or "- "
  const separators = [',', ' - ', '- '];
  let firstIndex = -1;
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
      firstIndex = idx;
    }
  }
  if (firstIndex !== -1) {
    cleaned = cleaned.substring(0, firstIndex).trim();
  }

  // Truncate everything from the word "formerly" onwards (case-insensitive)
  const formerlyMatch = cleaned.match(/\bformerly\b/i);
  if (formerlyMatch && formerlyMatch.index !== undefined) {
    cleaned = cleaned.substring(0, formerlyMatch.index).trim();
  }

  cleaned = removeParenthesesAndContents(cleaned);
  cleaned = cleaned.replace(/\s+at work\.?$/gi, '');
  cleaned = cleaned.replace(/'/g, '');

  // Remove profession if it starts with it and is followed by "At" or similar
  const jobTitles = TextUtils.getJobTitlesRegex(false);
  cleaned = cleaned.replace(
    new RegExp(`^\\b${jobTitles}\\b\\s*(at|of|in|the)?\\s*`, 'gi'),
    ''
  );

  cleaned = cleaned.trim();

  // Pre-merge abbreviation-style "WORD. WORD" patterns before splitting.
  // e.g. "EX. CO" → "EX.CO" so the dot-space splitter doesn't chop off the second part.
  // We only merge when the word before the dot is short (≤5 chars) — a hallmark of abbreviations.
  cleaned = cleaned.replace(
    /\b([A-Za-z]{1,5})\.\s+([A-Za-z]{1,5})\b/g,
    '$1.$2'
  );

  // If there are multiple companies separated by "and" or "&" and contains a domain-like pattern (X.X),
  // take only the first one.
  if (/(?:\s+and\s+|\s+&\s+)/i.test(cleaned) && /\b\w+\.\w+\b/.test(cleaned)) {
    const andParts = cleaned.split(/\s+(?:and|&)\s+/i);
    if (andParts.length > 1) {
      cleaned = andParts[0].trim();
    }
  }

  // Split on phrase-level separators and take only the FIRST valid segment
  // Handles: commas, pipes, spaced dashes/em-dashes, period+space, double+ spaces
  // PROTECT: Do not split on period+space if it's followed by "com", "io", "ai", etc. (common domains)
  const parts: string[] = cleaned
    .split(
      /\s*[,|]\s*|[-–—]\s+|\s+[-–—]|\.\s+(?!(?:com|io|ai|net|org|co|gov|edu|ac|biz|info|me|tech|app|dev|il)\b)|\s{2,}/i
    )
    .filter((p) => p.trim());
  if (parts.length > 0) {
    cleaned = parts[0].trim();
  }
  // Remove trailing period, underscore, or hyphen
  cleaned = cleaned.replace(/[._\-\s]+$/, '');
  // Remove domains and URLs
  cleaned = removeDomainsAndUrls(cleaned);
  // Remove company suffixes — but only when preceded by a space (not embedded in a dotted abbreviation like EX.CO)
  for (const suffix of SETTINGS.linkedin.companySuffixesToRemove ?? []) {
    // Only match the suffix when preceded by whitespace or start of string (not after a dot)
    const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<=\\s|^),?\\s*${escapedSuffix}\\.?$`, 'gi');
    const afterRemoval: string = cleaned.replace(regex, '').trim();
    if (afterRemoval) {
      cleaned = afterRemoval;
    }
  }
  // Replace word-joining hyphens with spaces (e.g., "Log-On" → "Log On")
  // This lets PascalCase handle them as separate words
  cleaned = cleaned.replace(/-/g, ' ');
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return company.trim();
  }
  return cleaned;
}

export { formatCompany as formatCompanyToPascalCase };

export function calculateFormattedCompany(
  company: string,
  maxWords?: number,
  firstName?: string,
  lastName?: string
): string {
  const normalized = company?.trim().toLowerCase();
  if (!normalized || normalized === '(none)' || normalized === 'none') {
    return 'LinkedIn';
  }

  const cleanedCompany: string = cleanCompany(company);

  // Check if company name matches the person's full name (Self-Employed case)
  const fName = typeof firstName === 'string' ? firstName : undefined;
  const lName = typeof lastName === 'string' ? lastName : undefined;

  if (fName?.trim() && lName?.trim()) {
    const cleanStr = (s: string): string =>
      s.replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '').toLowerCase();

    const compClean = cleanStr(cleanedCompany)
      .replace(/^linkedin/, '')
      .replace(/linkedin$/, '');
    const fNameClean = cleanStr(fName);
    const lNameClean = cleanStr(lName);
    const fullNameClean = fNameClean + lNameClean;

    // Strict full match only
    if (compClean && compClean === fullNameClean) {
      return 'LinkedIn SelfEmployed';
    }
  }

  const englishOnlyCompany: string = extractEnglishFromMixed(cleanedCompany);
  const noEmojis: string = TextUtils.removeEmojis(englishOnlyCompany);
  const formattedCompany: string = formatCompany(noEmojis, maxWords);

  const refactoredCompany = refactorCompanyName(formattedCompany);

  return refactoredCompany ? `LinkedIn ${refactoredCompany}` : 'LinkedIn';
}

/**
 * Refactors a cleaned and formatted company name into a short brand name.
 * Based on the Final Company Name Refactoring Plan.
 */
export function refactorCompanyName(formattedCompany: string): string {
  if (!formattedCompany || formattedCompany === 'LinkedIn') {
    return formattedCompany;
  }

  let refactored = formattedCompany;

  // 1. Manual Refactor List (Check FIRST to prioritize explicit mappings)
  // Whitespace-agnostic and case-insensitive matching
  const normKey = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetNorm = normKey(refactored);

  for (const [key, value] of Object.entries(MANUAL_COMPANY_MAPPINGS)) {
    if (normKey(key) === targetNorm) {
      return value;
    }
  }

  // 2. Handle Special Characters: & -> And, é -> e
  refactored = refactored.replace(/&/g, 'And').replace(/é/g, 'e');

  // 3. IDF / Unit Rule
  const idfKeywords = [
    'idf',
    'israeldefense',
    'israelimilitary',
    'israeliarmy',
    'israelinavy',
    'israeliairforce',
    'mamram',
  ];
  if (
    /unit\s?\d{3,4}/i.test(refactored) ||
    /ofek\s?\d{3,4}/i.test(refactored) ||
    (idfKeywords.some((k) => refactored.toLowerCase().includes(k)) &&
      refactored.toLowerCase() !== 'lotem') ||
    refactored.toLowerCase() === 'lotem 8200'
  ) {
    return 'IDF';
  }

  // 4. Stealth Rule
  if (refactored.toLowerCase().includes('stealth')) {
    return 'Stealth';
  }

  // 5. Freelance / Self Rule
  const freelanceKeywords = [
    'freelance',
    'independent',
    'selfemployed',
    'self',
  ];
  if (freelanceKeywords.some((k) => refactored.toLowerCase().includes(k))) {
    return 'Freelance';
  }

  // 6. Known rebrands/acquisitions & Acquired companies
  const acquisitionRegex = /(?:ASalesforce|A\s+Salesforce|Formerly|by|via|@)/i;
  const acquisitionParts = refactored.split(acquisitionRegex);
  if (acquisitionParts.length > 1) {
    refactored = acquisitionParts[0].trim();
  }

  // 7. Strip noise from the end
  const noiseToRemove = [
    ...COMPANY_SUFFIXES_TO_REMOVE,
    'Israel', // Rule 11: Remove "Israel" in the end
  ];

  for (const noise of noiseToRemove) {
    // Only remove if it's NOT a protected brand suffix
    if (
      PROTECTED_SUFFIXES.some((p) =>
        p.toLowerCase().includes(noise.toLowerCase())
      )
    ) {
      continue;
    }
    const regex = new RegExp(`${noise}$`, 'i');
    refactored = refactored.replace(regex, '');
  }

  return refactored;
}

const GENERIC_COMPANY_TOKENS: Set<string> = new Set([
  'inc',
  'llc',
  'ltd',
  'corp',
  'co',
  'plc',
  'sa',
  'ag',
  'gmbh',
  'limited',
]);

function normalizeOverlapToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\.co\.il$/i, '');
}

function splitOverlapTokens(text: string): string[] {
  return text
    .trim()
    .split(/[\s-]+/)
    .filter((t) => t.length > 0);
}

/**
 * Removes a trailing run of words from `name` when it matches the leading words of the
 * cleaned company string (after normalizing spaces and hyphens). Handles cases like
 * last name "Hrzog Log On" with company "Log-On Software" → "Hrzog".
 */
export function stripCompanyPrefixOverlapFromName(
  name: string,
  company: string
): string {
  if (!name?.trim() || !company?.trim()) {
    return (name || '').trim();
  }
  const nameTokens: string[] = splitOverlapTokens(name);
  if (nameTokens.length === 0) {
    return name.trim();
  }
  const cleanedCompany: string = cleanCompany(company);
  if (!cleanedCompany.trim()) {
    return name.trim();
  }
  const companyTokens: string[] = splitOverlapTokens(cleanedCompany);
  if (companyTokens.length === 0) {
    return name.trim();
  }

  const nameNorm: string[] = nameTokens.map(normalizeOverlapToken);
  const companyNorm: string[] = companyTokens.map(normalizeOverlapToken);

  // 1. Check if the company tokens, when joined, exactly match any contiguous sub-sequence
  //    of the name tokens. For example: name ["g", "ness"] matches company ["gness"].
  const companyJoined = companyNorm.join('');
  if (companyJoined.length >= 3 && !GENERIC_COMPANY_TOKENS.has(companyJoined)) {
    let matchStartIndex = -1;
    let matchEndIndex = -1;

    for (let i = 0; i < nameNorm.length; i++) {
      let currentJoined = '';
      for (let j = i; j < nameNorm.length; j++) {
        currentJoined += nameNorm[j];
        if (currentJoined === companyJoined) {
          matchStartIndex = i;
          matchEndIndex = j;
          break;
        }
        if (currentJoined.length > companyJoined.length) {
          break;
        }
      }
      if (matchStartIndex !== -1) {
        break;
      }
    }

    if (matchStartIndex !== -1) {
      const kept = [
        ...nameTokens.slice(0, matchStartIndex),
        ...nameTokens.slice(matchEndIndex + 1),
      ];
      // PROTECTION: Never strip the entire name if it leaves the result empty
      if (kept.length === 0 && nameTokens.length > 0) {
        return name.trim();
      }
      return kept.join(' ').trim();
    }
  }

  // 2. Check for overlapping trailing prefix (existing logic)
  const maxK: number = Math.min(nameNorm.length, companyNorm.length);
  let bestK: number = 0;
  for (let k: number = maxK; k >= 1; k--) {
    let matches: boolean = true;
    for (let i: number = 0; i < k; i++) {
      if (nameNorm[nameNorm.length - k + i] !== companyNorm[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    if (k === 1) {
      const firstCompanyWord: string = companyNorm[0];
      if (GENERIC_COMPANY_TOKENS.has(firstCompanyWord)) {
        continue;
      }
      if (firstCompanyWord.length < 3) {
        continue;
      }
      if (companyNorm.length > 1 && firstCompanyWord.length < 4) {
        continue;
      }
    }
    const joinedLen: number = companyNorm.slice(0, k).join('').length;
    if (joinedLen < 3) {
      continue;
    }
    bestK = k;
    break;
  }

  if (bestK === 0) {
    return name.trim();
  }
  const kept: string[] = nameTokens.slice(0, nameTokens.length - bestK);
  // PROTECTION: If stripping would leave the name empty, and it's a single token match, skip it
  if (kept.length === 0 && nameTokens.length > 0 && bestK === 1) {
    return name.trim();
  }
  return kept.join(' ');
}
