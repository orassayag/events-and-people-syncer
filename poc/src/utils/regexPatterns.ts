export class RegexPatterns {
  static readonly HEBREW = /[\u0590-\u05FF]/;
  static readonly EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  static readonly EMAIL_CONSECUTIVE_DOTS = /\.\./;
  static readonly EMAIL_LEADING_DOT = /^\./;
  static readonly EMAIL_TRAILING_DOT = /\.@/;
  static readonly PHONE = /^[\d+\-\s()]+$/;
  static readonly PHONE_NON_DIGITS = /[\s\-()]/g;
  static readonly LABEL_NAME = /^[a-zA-Z0-9\s\-_]+$/;
  static readonly MULTIPLE_SPACES = /\s+/;
  static readonly NUMBER_GROUPING = /\B(?=(\d{3})+(?!\d))/g;
  static readonly MIXED_CONTENT = /[a-zA-Z0-9]/;

  static isValidEmail(email: string): boolean {
    if (!this.EMAIL.test(email)) return false;
    if (this.EMAIL_CONSECUTIVE_DOTS.test(email)) return false;
    if (this.EMAIL_LEADING_DOT.test(email)) return false;
    if (this.EMAIL_TRAILING_DOT.test(email)) return false;
    return true;
  }
}
