import { SETTINGS } from '../settings';
import { RegexPatterns } from '../regex/patterns';
import { extractEnglishFromMixed } from './hebrewFormatter';

function removeEmojis(text: string): string {
  return text
    .replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/gu,
      ''
    )
    .trim();
}

function removeDomainExtensions(text: string): string {
  return text.replace(
    /\.(com|co\.il|net|org|io|ai|tech|app|dev|me|info|biz)\b/gi,
    ''
  );
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
  cleaned = cleaned.trim();
  const parts: string[] = cleaned.split(/[,|\-]|\.\s+|\s{2,}/);
  const cleanedParts: string[] = parts
    .map((p) => p.trim().replace(/\.$/, ''))
    .map((p) => removeDomainExtensions(p))
    .map((p) => {
      let cleaned: string = p;
      for (const suffix of SETTINGS.linkedin.companySuffixesToRemove) {
        const regex = RegexPatterns.createCompanySuffixRegex(suffix);
        const afterRemoval: string = cleaned.replace(regex, '').trim();
        if (afterRemoval) {
          cleaned = afterRemoval;
        }
      }
      return cleaned.trim();
    })
    .filter((p) => p);
  if (cleanedParts.length === 0) {
    return company.trim();
  }
  if (company.includes(',')) {
    return cleanedParts[0];
  }
  return cleanedParts.join(' ');
}

export function formatCompanyToPascalCase(company: string, maxWords?: number): string {
  if (!company || !company.trim()) {
    return '';
  }
  let words = company.trim().split(/\s+/);
  if (maxWords && maxWords > 0) {
    words = words.slice(0, maxWords);
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
  const noEmojis: string = removeEmojis(englishOnlyCompany);
  const formattedCompany: string = formatCompanyToPascalCase(noEmojis, maxWords);
  return formattedCompany;
}
