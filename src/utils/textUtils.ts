import { RegexPatterns } from '../regex/patterns';
import { NameParser } from '../parsers/nameParser';

export class TextUtils {
  static hasHebrewCharacters(text: string): boolean {
    return RegexPatterns.HEBREW.test(text);
  }

  static reverseHebrewText(text: string): string {
    if (!text || !this.hasHebrewCharacters(text)) {
      return text;
    }
    const words = text.split(' ');
    const processedWords = words.map((word) => {
      if (this.hasHebrewCharacters(word) && !this.hasMixedContent(word)) {
        return word.split('').reverse().join('');
      }
      return word;
    });
    const hebrewWords = processedWords.filter(
      (word) => this.hasHebrewCharacters(word) && !this.hasMixedContent(word)
    );
    const nonHebrewWords = processedWords.filter(
      (word) => !this.hasHebrewCharacters(word) || this.hasMixedContent(word)
    );
    if (hebrewWords.length > 1) {
      return [...hebrewWords.reverse(), ...nonHebrewWords].join(' ');
    }
    return processedWords.join(' ');
  }

  private static hasMixedContent(word: string): boolean {
    const hasHebrew = RegexPatterns.HEBREW.test(word);
    const hasNonHebrew = RegexPatterns.MIXED_CONTENT.test(word);
    return hasHebrew && hasNonHebrew;
  }

  static formatNumberWithLeadingZeros(num: number): string {
    return num
      .toString()
      .padStart(5, '0')
      .replace(RegexPatterns.NUMBER_GROUPING, ',');
  }

  static parseFullName(fullName: string): {
    firstName: string;
    lastName: string;
  } {
    return NameParser.parseFullName(fullName);
  }

  static formatCompanyToPascalCase(company: string): string {
    if (!company || !company.trim()) {
      return '';
    }
    const words = company.trim().split(/\s+/);
    const pascalCaseWords = words.map((word: string) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    return pascalCaseWords.join('');
  }

  static removeEmojis(str: string): string {
    if (!str) return '';
    return str
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\uFE0F/g, '') // remove leftover variation selectors
      .trim();
  }

  static removeHebrew(text: string): string {
    if (!text) return '';
    // 1. Remove Hebrew and Emojis
    let cleaned = text.replace(/[\u0590-\u05FF\uFB1D-\uFB4F]/g, '');
    cleaned = this.removeEmojis(cleaned);

    // 2. Keep only English alphanumeric and basic punctuation
    // Including @, _, +, . for emails (EXCLUDING apostrophe per user request)
    const matches = cleaned.match(/[a-zA-Z0-9\s\-&.@_+]+/g);
    if (!matches) return '';
    cleaned = matches.join(' ').replace(/\s+/g, ' ').trim();

    // 3. Validation: Must contain at least one English letter to be considered a "word"
    // IF not - leave it empty, as per user request
    if (cleaned && !/[a-zA-Z]/.test(cleaned)) {
      return '';
    }

    return cleaned;
  }

  static cleanName(name: string): string {
    if (!name) return '';
    // Remove Hebrew characters (including presentation forms)
    let cleaned = name.replace(/[\u0590-\u05FF\uFB1D-\uFB4F]/g, '');
    // Remove emojis
    cleaned = this.removeEmojis(cleaned);

    // Split by common separators used to append titles/suffixes ( - , | , • , / ) and take the first part
    // This handles cases like "Nava Avi - Tech Recruitment Director"
    const segments = cleaned.split(/\s+[-–—|•/]\s+/);
    if (segments.length > 0) {
      cleaned = segments[0].trim();
    }
    
    // Remove status phrases like "I am hiring", "We're recruiting", "The Tech Recruiter", etc. (ignore case)
    // Matches "I'm", "Im", "I am", "I m", "We're", "We are" followed by words, often ending with "ing" or "!".
    cleaned = cleaned.replace(/\b(i'm|i\s+am|im|i\s+m|we're|we\s+are)\s+[\w\s!&-]+$/gi, '');
    cleaned = cleaned.replace(/\b(i'm|i\s+am|im|i\s+m|we're|we\s+are)\s+[\w\s!&-]+(?=\s+|$)/gi, '');
    // Remove "The X" phrases at the end (e.g., "The Tech Recruiter") or "Hr with X"
    cleaned = cleaned.replace(/\s+\bthe\s+[\w\s]+$/gi, '');
    cleaned = cleaned.replace(/\s+\bhr\s+with\s+[\w\s]+$/gi, '');
    // Remove everything starting from "Executive" or "Always" at the end
    cleaned = cleaned.replace(/\s+\b(executive|always)\b.*$/gi, '');
    // Remove pronouns (e.g., "She/Her", "He/Him", "They/Them", "(She/They)")
    cleaned = cleaned.replace(/\s*\(?(she|he|they|ze|zir)\s*[/./\s-]\s*(her|him|them|zir|they|any)\b\)?/gi, '');
    // Remove common quote/status openers at the end (e.g., "Be yourself...")
    cleaned = cleaned.replace(/\s+\b(be|always|looking|passionate|helping|is|everything)\s+[\w\s!&,.']{10,}$/gi, '');
    // Remove "X Expert" phrases at the end (e.g., "Career Expert")
    cleaned = cleaned.replace(/\s+\b[\w\s-]+\s+expert$/gi, '');
    cleaned = cleaned.replace(/\b(hiring|recruiting|headhunter)\b/gi, '');

    // Remove specific degrees/abbreviations/certifications (whole words only)
    cleaned = cleaned.replace(/\b(llm|mba|hr|shrm|cp|phr|sphr|gphr|cipd|pmp|mha|phd|md)\b/gi, '');

    // 2. Keep only English letters, numbers and common name symbols (excluding hyphen and apostrophe per user preference)
    const matches = cleaned.match(/[a-zA-Z0-9\s]+/g);
    if (!matches) return '';
    cleaned = matches.join(' ').replace(/\s+/g, ' ').trim();

    // 3. Remove multiple spaces that might have been left behind
    cleaned = cleaned.replace(/\s+/g, ' ');
    // Title Case
    const result = cleaned
      .toLowerCase()
      .split(' ')
      .map((word) =>
        word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''
      )
      .filter((word) => word.length > 0)
      .join(' ');

    // Validation: Must contain at least one English letter
    if (result && !/[a-zA-Z]/.test(result)) {
      return '';
    }
    return result;
  }

  /**
   * Moves any content in parentheses (nicknames) to the end of the last name field,
   * while removing the parentheses themselves.
   */
  static handleNicknames(firstName: string, lastName: string): { firstName: string, lastName: string } {
    const extract = (text: string) => {
      const nicknames: string[] = [];
      const cleaned = text.replace(/\(([^)]+)\)/g, (_, nickname) => {
        nicknames.push(nickname);
        return '';
      }).trim();
      return { cleaned, nicknames };
    };

    const fnResult = extract(firstName);
    const lnResult = extract(lastName);

    const allNicknames = [...fnResult.nicknames, ...lnResult.nicknames];
    const finalFirstName = fnResult.cleaned;
    const finalLastName = [lnResult.cleaned, ...allNicknames].filter(Boolean).join(' ').trim();

    return { firstName: finalFirstName, lastName: finalLastName };
  }

  /**
   * Removes the company name from name fields if it appears as a standalone phrase.
   */
  static removeCompanyFromName(firstName: string, lastName: string, company: string): { firstName: string, lastName: string } {
    if (!company || !company.trim()) return { firstName, lastName };
    
    // Clean company name for comparison - remove "LinkedIn " prefix if present in the provided string
    let cleanedCompany = company.trim().toLowerCase();
    if (cleanedCompany.startsWith('linkedin ')) {
      cleanedCompany = cleanedCompany.substring(9).trim();
    }
    
    // If the company name is too short (e.g. 1-2 chars), don't remove it to avoid accidental matches
    if (cleanedCompany.length <= 2) return { firstName, lastName };

    const removeMatch = (name: string) => {
      if (!name) return '';
      // Create a regex for the company name as a standalone phrase
      const escaped = this.escapeRegExp(cleanedCompany);
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      return name.replace(regex, '').replace(/\s+/g, ' ').trim();
    };

    return {
      firstName: removeMatch(firstName),
      lastName: removeMatch(lastName)
    };
  }

  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
