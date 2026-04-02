import { RegexPatterns } from './patterns';

export class ValidationHelpers {
  static isValidEmail(email: string): boolean {
    if (!RegexPatterns.EMAIL.test(email)) return false;
    if (RegexPatterns.EMAIL_CONSECUTIVE_DOTS.test(email)) return false;
    if (RegexPatterns.EMAIL_LEADING_DOT.test(email)) return false;
    if (RegexPatterns.EMAIL_TRAILING_DOT.test(email)) return false;
    return true;
  }
}
