import { SETTINGS } from '../settings';
import { extractEnglishFromMixed } from './hebrewFormatter';
import { TextUtils } from './textUtils';

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
  cleaned = cleaned.trim();

  // Pre-merge abbreviation-style "WORD. WORD" patterns before splitting.
  // e.g. "EX. CO" → "EX.CO" so the dot-space splitter doesn't chop off the second part.
  // We only merge when the word before the dot is short (≤5 chars) — a hallmark of abbreviations.
  cleaned = cleaned.replace(
    /\b([A-Za-z]{1,5})\.\s+([A-Za-z]{1,5})\b/g,
    '$1.$2'
  );

  // Split on phrase-level separators and take only the FIRST valid segment
  // Handles: commas, pipes, spaced dashes/em-dashes, period+space, double+ spaces
  const parts: string[] = cleaned
    .split(/\s*[,|]\s*|[-–—]\s+|\s+[-–—]|\.\s+|\s{2,}/)
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

const YAFO_OR_JAFFA: ReadonlySet<string> = new Set(['yafo', 'jaffa']);

function stripTrailingPunct(word: string): string {
  return word.replace(/[.,]$/, '');
}

function normCompanyWord(word: string): string {
  return stripTrailingPunct(word).toLowerCase();
}

/**
 * Tel Aviv is two words but should count as one city prefix for maxWords; optional
 * "Yafo"/"Jaffa" is dropped. Same optional skip after "Jerusalem" or "Haifa".
 */
function preprocessIsraeliCityCompanyWords(words: string[]): string[] {
  if (words.length === 0) {
    return words;
  }
  const n0: string = normCompanyWord(words[0]);
  const n1: string = words.length > 1 ? normCompanyWord(words[1]) : '';

  if (n0 === 'tel' && n1 === 'aviv') {
    let idx: number = 2;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['TelAviv', ...words.slice(idx)];
  }

  if (n0 === 'jerusalem') {
    let idx: number = 1;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['Jerusalem', ...words.slice(idx)];
  }

  if (n0 === 'haifa') {
    let idx: number = 1;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['Haifa', ...words.slice(idx)];
  }

  return words;
}

function wordToPascalCaseSegment(word: string): string {
  if (!word) {
    return '';
  }
  const key: string = normCompanyWord(word);
  if (key === 'telaviv') {
    return 'TelAviv';
  }
  if (key === 'jerusalem') {
    return 'Jerusalem';
  }
  if (key === 'haifa') {
    return 'Haifa';
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatCompanyToPascalCase(
  company: string,
  maxWords?: number
): string {
  if (!company || !company.trim()) {
    return '';
  }
  let words: string[] = preprocessIsraeliCityCompanyWords(
    company.trim().split(/\s+/)
  );
  if (maxWords && maxWords > 0) {
    let resultWords = words.slice(0, maxWords);
    const joiners = [
      'of',
      '&',
      'and',
      'with',
      'for',
      'the',
      'a',
      'an',
      'in',
      'at',
      'by',
      'or',
      '+',
      'co',
      'co.',
      'ben',
      'hebrew',
      'jewish',
      'bar',
      'israel',
      'bet',
      'house',
    ];
    const forceNextPrefixes = [
      'TheOpen',
      'BarIlan',
      'IsraelNational',
      'TheIsraeli',
      'TheIsrael',
      'BetShemesh',
      'BenGurion',
      'TheAcademic',
      'TheADHD',
      'Medical',
      'HouseOf',
      'Houseof',
    ];

    while (resultWords.length < words.length) {
      const lastWord = resultWords[resultWords.length - 1]
        .toLowerCase()
        .replace(/[.,]$/, '');
      const currentPascal = resultWords
        .map((w) => wordToPascalCaseSegment(w))
        .join('');

      const shouldForceNext = forceNextPrefixes.some((prefix) =>
        currentPascal.endsWith(prefix)
      );

      if (joiners.includes(lastWord) || shouldForceNext) {
        resultWords.push(words[resultWords.length]);
      } else if (/\d$/.test(lastWord)) {
        let nextIdx = resultWords.length;
        // Skip over purely special character words to find the next meaningful word
        while (nextIdx < words.length && !/[a-zA-Z0-9]/.test(words[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx < words.length) {
          for (let i = resultWords.length; i <= nextIdx; i++) {
            resultWords.push(words[i]);
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }
    // If the final word is a joiner and we can't pull more, remove it if it's a symbol
    // OR if it's the only word left after a joiner (like "Something &")
    while (resultWords.length > 0) {
      const lastWord = resultWords[resultWords.length - 1]
        .toLowerCase()
        .replace(/[.,]$/, '');
      if (
        joiners.includes(lastWord) &&
        resultWords.length < words.length === false
      ) {
        // If it's a symbol like '&' or '+', always remove if at the end
        if (lastWord === '&' || lastWord === '+') {
          resultWords.pop();
        } else {
          break;
        }
      } else {
        break;
      }
    }
    words = resultWords;
  }
  const pascalCaseWords: string[] = words.map((word: string) =>
    wordToPascalCaseSegment(word)
  );
  return pascalCaseWords.join('');
}

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

  // Check if company name matches the person's name (Self-Employed case)
  const fName = typeof firstName === 'string' ? firstName : undefined;
  const lName = typeof lastName === 'string' ? lastName : undefined;

  if (fName?.trim() && lName?.trim()) {
    const cleanStr = (s: string): string =>
      s.replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '').toLowerCase();

    // Remove "linkedin" from company name for the comparison
    const compClean = cleanStr(cleanedCompany)
      .replace(/^linkedin/, '')
      .replace(/linkedin$/, '');
    const fNameClean = cleanStr(fName);
    const lNameClean = cleanStr(lName);
    const name1Clean = fNameClean + lNameClean;
    const name2Clean = lNameClean + fNameClean;

    if (
      compClean &&
      (compClean === name1Clean ||
        compClean === name2Clean ||
        (compClean.length >= 4 &&
          (name1Clean.includes(compClean) || compClean.includes(name1Clean))) ||
        (compClean.length >= 3 &&
          (compClean === fNameClean || compClean === lNameClean)))
    ) {
      return 'LinkedIn SelfEmployed';
    }
  }

  const englishOnlyCompany: string = extractEnglishFromMixed(cleanedCompany);
  const noEmojis: string = TextUtils.removeEmojis(englishOnlyCompany);
  const formattedCompany: string = formatCompanyToPascalCase(
    noEmojis,
    maxWords
  );

  return formattedCompany ? `LinkedIn ${formattedCompany}` : 'LinkedIn';
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
