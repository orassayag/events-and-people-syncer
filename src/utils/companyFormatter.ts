import { SETTINGS } from '../settings';
import { RegexPatterns } from '../regex/patterns';
import { extractEnglishFromMixed } from './hebrewFormatter';
import { TextUtils } from './textUtils';



function removeDomainExtensions(text: string): string {
  const cleaned = text.replace(
    /\.(com|co\.il|net|org|io|ai|tech|app|dev|me|info|biz)\b/gi,
    ''
  );
  // Only remove if the result is meaningful (at least 2 characters)
  return cleaned.length >= 2 ? cleaned : text;
}

function removeParenthesesAndContents(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\)[^)]*$/g, '')
    .trim();
}

export function cleanCompany(company: string): string {
  if (!company.trim()) {
    return '';
  }
  let cleaned: string = company.trim();
  cleaned = removeParenthesesAndContents(cleaned);
  cleaned = cleaned.replace(/\s+at work\.?$/gi, '');
  cleaned = cleaned.replace(/'/g, '');
  cleaned = cleaned.trim();
  // Split on phrase-level separators and take only the FIRST valid segment
  // Handles: commas, pipes, spaced dashes/em-dashes, period+space, double+ spaces
  const parts: string[] = cleaned.split(/\s*[,|]\s*|\s+[-–—]\s+|\.\s+|\s{2,}/).filter(p => p.trim());
  if (parts.length > 0) {
    cleaned = parts[0].trim();
  }
  // Remove trailing period
  cleaned = cleaned.replace(/\.$/, '');
  // Remove domain extensions
  cleaned = removeDomainExtensions(cleaned);
  // Remove company suffixes
  for (const suffix of SETTINGS.linkedin.companySuffixesToRemove) {
    const regex = RegexPatterns.createCompanySuffixRegex(suffix);
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

export function formatCompanyToPascalCase(company: string, maxWords?: number): string {
  if (!company || !company.trim()) {
    return '';
  }
  let words = company.trim().split(/\s+/);
  if (maxWords && maxWords > 0) {
    let resultWords = words.slice(0, maxWords);
    // If the last word included is a "joiner" (of, &), include the next word too
    while (resultWords.length < words.length) {
      const lastWord = resultWords[resultWords.length - 1].toLowerCase();
      if (lastWord === 'of' || lastWord === '&') {
        resultWords.push(words[resultWords.length]);
      } else {
        break;
      }
    }
    words = resultWords;
  }
  const pascalCaseWords = words.map((word: string) => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return pascalCaseWords.join('');
}

export function calculateFormattedCompany(company: string, maxWords?: number): string {
  const cleanedCompany: string = cleanCompany(company);
  const englishOnlyCompany: string = extractEnglishFromMixed(cleanedCompany);
  const noEmojis: string = TextUtils.removeEmojis(englishOnlyCompany);
  const formattedCompany: string = formatCompanyToPascalCase(noEmojis, maxWords);
  return formattedCompany ? `LinkedIn ${formattedCompany}` : '';
}
