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
  // Remove trailing period, underscore, or hyphen
  cleaned = cleaned.replace(/[._\-\s]+$/, '');
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
    const joiners = ['of', '&', 'and', 'with', 'for', 'the', 'a', 'an', 'in', 'at', 'by', 'or', '+', 'co', 'co.', 'ben'];
    while (resultWords.length < words.length) {
      const lastWord = resultWords[resultWords.length - 1].toLowerCase().replace(/[.,]$/, '');
      if (joiners.includes(lastWord)) {
        resultWords.push(words[resultWords.length]);
      } else {
        break;
      }
    }
    // If the final word is a joiner and we can't pull more, remove it if it's a symbol
    // OR if it's the only word left after a joiner (like "Something &")
    while (resultWords.length > 0) {
      const lastWord = resultWords[resultWords.length - 1].toLowerCase().replace(/[.,]$/, '');
      if (joiners.includes(lastWord) && resultWords.length < words.length === false) {
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
  const pascalCaseWords = words.map((word: string) => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return pascalCaseWords.join('');
}

export function calculateFormattedCompany(company: string, maxWords?: number): string {
  const normalized = company?.trim().toLowerCase();
  if (!normalized || normalized === '(none)' || normalized === 'none') {
    return 'LinkedIn';
  }

  const cleanedCompany: string = cleanCompany(company);
  const englishOnlyCompany: string = extractEnglishFromMixed(cleanedCompany);
  const noEmojis: string = TextUtils.removeEmojis(englishOnlyCompany);
  const formattedCompany: string = formatCompanyToPascalCase(noEmojis, maxWords);
  
  return formattedCompany ? `LinkedIn ${formattedCompany}` : 'LinkedIn';
}
