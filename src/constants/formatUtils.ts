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

  static calculatePercentage(part: number, total: number): string {
    if (total === 0) {
      return '00.00%';
    }

    const percentage = ((part / total) * 100).toFixed(2);
    const [whole, decimal] = percentage.split('.');

    return `${whole.padStart(2, '0')}.${decimal}%`;
  }

  static formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }
}
