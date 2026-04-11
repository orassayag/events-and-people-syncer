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

  static cleanName(name: string): string {
    if (!name) return '';
    // Remove Hebrew characters
    let cleaned = name.replace(/[\u0590-\u05FF]/g, '').trim();
    // Remove multiple spaces that might have been left behind
    cleaned = cleaned.replace(/\s+/g, ' ');
    // Title Case
    return cleaned
      .toLowerCase()
      .split(' ')
      .map((word) =>
        word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''
      )
      .filter((word) => word.length > 0)
      .join(' ');
  }
}
