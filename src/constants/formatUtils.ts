import { RegexPatterns } from '../regex/patterns';

export class FormatUtils {
  static formatNumberWithLeadingZeros(num: number, digits: number = 6): string {
    return num
      .toString()
      .padStart(digits, '0')
      .replace(RegexPatterns.NUMBER_GROUPING, ',');
  }

  static padLineWithEquals(content: string, totalWidth: number): string {
    const contentLength = content.length;
    if (contentLength >= totalWidth) {
      return content;
    }
    const paddingNeeded = totalWidth - contentLength;
    const leftPadding = Math.floor(paddingNeeded / 2);
    const rightPadding = paddingNeeded - leftPadding;
    return '='.repeat(leftPadding) + content + '='.repeat(rightPadding);
  }
}
