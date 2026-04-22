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
    // Normalize to NFC to handle combining characters (e.g., decomposed umlauts)
    let cleaned = name.normalize('NFC');
    // Remove Hebrew characters (including presentation forms)
    cleaned = cleaned.replace(/[\u0590-\u05FF\uFB1D-\uFB4F]/g, '');
    // Remove emojis
    cleaned = this.removeEmojis(cleaned);

    // Remove prefacing professional titles (e.g. "Dr. Michal", "Prof Dr Smith")
    const titleRegex = /^(?:(?:dr|mr|mrs|ms|miss|prof|professor|sir|dame|rev|hon|adv|advocate|eng|engineer|rabbi)\b\.?\s*)+/i;
    cleaned = cleaned.replace(titleRegex, '');

    // Split by common separators used to append titles/suffixes ( - , | , • , / ) and take the first part
    // This handles cases like "Nava Avi - Tech Recruitment Director"
    const segments = cleaned.split(/\s+[-–—|•/]\s+/);
    if (segments.length > 0) {
      cleaned = segments[0].trim();
    }
    
    // Remove status phrases like "I am hiring", "We're recruiting", etc. (ignore case)
    // We target common status prefixes followed by status keywords to avoid removing legitimate content like "LinkedIn"
    const statusPrefixes = "([il]['’`\\s]*m|[il]\\s+am|we['’`\\s]*re|we\\s+are)";
    const statusKeywords = "(hiring|recruiting|looking|seeking|building|helping|passionate|expert|specialist)";
    cleaned = cleaned.replace(new RegExp(`\\b${statusPrefixes}\\s+${statusKeywords}\\b[\\w\\s!&-]*`, 'gi'), '');
    // Remove everything starting from "The " to the end of the string (e.g., "The Corporate Recruiter")
    cleaned = cleaned.replace(/\bthe\b.*$/gi, '');
    // Remove "Hr with X" phrases (more flexible than end-anchored)
    cleaned = cleaned.replace(/\bhr\s+with\s+\w+\b/gi, '');
    // Remove everything starting from "Executive" or "Always" at the end
    cleaned = cleaned.replace(/\s+\b(executive|always)\b.*$/gi, '');
    // Remove pronouns (e.g., "She/Her", "He/Him", "They/Them", "(She/They)")
    cleaned = cleaned.replace(/\s*\(?(she|he|they|ze|zir)\s*[/./\s-]\s*(her|him|them|zir|they|any)\b\)?/gi, '');
    // Remove specific phrase "Be yourself everyone else is already taken" anywhere
    cleaned = cleaned.replace(/\bbe\s+yourself\s+everyone\s+else\s+is\s+already\s+taken\b/gi, '');
    // Remove common quote/status openers at the end (e.g., "Be yourself...")
    cleaned = cleaned.replace(/\s+\b(be|always|looking|passionate|helping|is|everything)\s+[\w\s!&,.']{10,}$/gi, '');
    // Remove "X Expert" phrases at the end (e.g., "Career Expert")
    cleaned = cleaned.replace(/\s+\b[\w\s-]+\s+expert$/gi, '');
    cleaned = cleaned.replace(/\b(hiring|recruiter|recruiting|talent|acquisition|headhunter|[il][\s'’`]*m)\b/gi, '');

    // Remove network size indicators (e.g., "5k", "10K")
    cleaned = cleaned.replace(/\b\d+[km]\b/gi, '');

    // Remove dotted academic degrees BEFORE the alphanumeric filter strips their dots
    // e.g. "Ph.D." → removed here so it doesn't become "Ph D" and slip through
    cleaned = cleaned.replace(/\b(ph\.\s*d|m\.\s*d|ll\.\s*m|m\.\s*b\.\s*a|m\.\s*s|b\.\s*s|m\.\s*a)\.?\b.*$/gi, '');

    // Remove specific degrees/abbreviations/certifications and everything after them
    cleaned = cleaned.replace(/\b(llm|mba|hr|shrm|cp|phr|sphr|gphr|cipd|pmp|mha|phd|md|chfp|cpa|cfa|cfp|cfe|cia|cisa|cism|crisc|cissp|rhia|rhit|cpc|ccs|cdip|chda|chps|cphi|hcispp|cphims|cphq|lcsw|lpc|rn|np|pa|dds|dmd|psyd|edd|jd|do|dna)\b.*$/gi, '');

    // Remove apostrophes before the alphanumeric filter so they don't become spaces
    cleaned = cleaned.replace(/'/g, '');

    // 2. Keep only letters (including accented/German/international), numbers and spaces 
    // (excluding hyphen and apostrophe per user preference)
    const matches = cleaned.match(/[\p{L}\p{N}\s]+/gu);
    if (!matches) return '';
    cleaned = matches.join(' ').replace(/\s+/g, ' ').trim();

    // Remove degrees that may have become split words after dot-stripping AND everything after them
    cleaned = cleaned.replace(/\bph\s+d\b.*$/gi, '');
    cleaned = cleaned.replace(/\bm\s+d\b.*$/gi, '');
    cleaned = cleaned.replace(/\bll\s+m\b.*$/gi, '');
    cleaned = cleaned.replace(/\bm\s+b\s+a\b.*$/gi, '');
    cleaned = cleaned.replace(/\bm\s+s\b.*$/gi, '');
    cleaned = cleaned.replace(/\bb\s+s\b.*$/gi, '');
    cleaned = cleaned.replace(/\bm\s+a\b.*$/gi, '');

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
   * Parenthetical pronoun lines (e.g. "(She/her/hers)") must not be treated as nicknames;
   * they are dropped entirely. Slash- or comma-separated tokens must all be known pronoun forms.
   */
  private static readonly PRONOUN_PAREN_TOKENS: ReadonlySet<string> = new Set([
    'she',
    'her',
    'hers',
    'herself',
    'he',
    'him',
    'his',
    'himself',
    'they',
    'them',
    'their',
    'theirs',
    'themself',
    'themselves',
    'ze',
    'zir',
    'zirs',
    'zirself',
    'xe',
    'xem',
    'xyr',
    'xyrs',
    'xemself',
    'ey',
    'em',
    'eir',
    'eirs',
    'fae',
    'faer',
    'faers',
    've',
    'ver',
    'vis',
    'vers',
    'te',
    'ter',
    'tem',
    'it',
    'its',
    'any',
    'all',
    'none',
    'other',
    'others',
    'mx',
    'one',
    'ones',
    'mix',
    'mixed',
    'elle',
  ]);

  private static isLikelyPronounOnlyParenthetical(text: string): boolean {
    const raw: string = text.trim();
    if (!raw) {
      return false;
    }
    const n: string = raw.replace(/\s+/g, ' ').trim();
    let chunks: string[];
    if (n.includes('/')) {
      chunks = n.split(/\s*\/\s*/).map((s: string) => s.trim()).filter(Boolean);
    } else if (n.includes(',')) {
      chunks = n.split(/\s*,\s*/).map((s: string) => s.trim()).filter(Boolean);
    } else {
      chunks = [n];
    }
    const tokens: string[] = [];
    for (const c of chunks) {
      if (/\s/.test(c)) {
        tokens.push(...c.split(/\s+/).filter(Boolean));
      } else {
        tokens.push(c);
      }
    }
    if (tokens.length === 0) {
      return false;
    }
    return tokens.every((t: string) =>
      TextUtils.PRONOUN_PAREN_TOKENS.has(t.toLowerCase())
    );
  }

  /**
   * Moves any content in parentheses (nicknames) to the end of the last name field,
   * while removing the parentheses themselves.
   */
  static handleNicknames(firstName: string, lastName: string): { firstName: string, lastName: string } {
    const extract = (text: string) => {
      const nicknames: string[] = [];
      const cleaned = text.replace(/\(([^)]+)\)/g, (_, nickname: string) => {
        if (!TextUtils.isLikelyPronounOnlyParenthetical(nickname)) {
          nicknames.push(nickname);
        }
        return '';
      }).trim();
      return { cleaned, nicknames };
    };

    const fnResult = extract(firstName);
    const lnResult = extract(lastName);

    const allNicknames = [...fnResult.nicknames, ...lnResult.nicknames];
    const finalFirstName = fnResult.cleaned;
    const baseLastName = lnResult.cleaned;

    // Collect all words that are part of the core names to avoid duplicating them from the nicknames
    const nameWords = new Set<string>();
    [finalFirstName, baseLastName].forEach((namePart) => {
      if (namePart) {
        namePart.split(/\s+/).forEach((w) => nameWords.add(w.toLowerCase()));
      }
    });

    const deduplicatedNicknames = allNicknames.map((nn) => {
      // Split the nickname into words, keep only those that are not already present in the core name
      const nnWords = nn.split(/\s+/);
      const filtered = nnWords.filter((w) => !nameWords.has(w.toLowerCase()));
      return filtered.join(' ');
    }).filter((nn) => nn.trim().length > 0);

    const finalLastName = [baseLastName, ...deduplicatedNicknames].filter(Boolean).join(' ').trim();

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
