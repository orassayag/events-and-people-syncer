import { RegexPatterns } from '../regex/patterns';

export class NameParser {
  private static readonly PREFIXES = ['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'rev', 'hon', 'sir', 'lady', 'lord', 'dame', 'capt', 'col', 'gen', 'maj'];
  private static readonly SUFFIXES = ['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'phd', 'md', 'esq', 'cpa', 'dds', 'jd', 'pe', 'rn'];

  static parseFullName(fullName: string): { firstName: string; lastName: string } {
    const trimmed = fullName.trim();
    const parts = trimmed.split(RegexPatterns.MULTIPLE_SPACES).filter((p: string) => p);
    if (parts.length === 0) {
      return { firstName: '', lastName: '' };
    }
    while (parts.length > 0 && this.isPrefix(parts[0])) {
      parts.shift();
    }
    while (parts.length > 0 && this.isSuffix(parts[parts.length - 1])) {
      parts.pop();
    }
    if (parts.length === 0) {
      return { firstName: '', lastName: '' };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  private static isPrefix(word: string): boolean {
    const normalized = word.toLowerCase().replace('.', '');
    return this.PREFIXES.includes(normalized);
  }

  private static isSuffix(word: string): boolean {
    const normalized = word.toLowerCase().replace('.', '');
    return this.SUFFIXES.includes(normalized);
  }
}
