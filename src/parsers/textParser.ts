import { RegexPatterns } from '../regex';
import { NameParser } from './nameParser';

export class TextParser {
  static hasHebrewCharacters(text: string): boolean {
    return RegexPatterns.HEBREW.test(text);
  }

  static reverseHebrewText(text: string): string {
    if (!text || !this.hasHebrewCharacters(text)) {
      return text;
    }
    const words: string[] = text.split(' ');
    const processedWords: string[] = words.map((word: string) => {
      if (this.hasHebrewCharacters(word) && !this.hasMixedContent(word)) {
        return word.split('').reverse().join('');
      }
      return word;
    });
    return processedWords.join(' ');
  }

  private static hasMixedContent(word: string): boolean {
    const hasHebrew: boolean = RegexPatterns.HEBREW.test(word);
    const hasNonHebrew: boolean = RegexPatterns.MIXED_CONTENT.test(word);
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
}
