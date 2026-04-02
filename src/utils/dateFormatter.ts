import { RegexPatterns } from '../regex/patterns';

export function formatDateDDMMYYYY(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, '0');
  const month: string = String(date.getMonth() + 1).padStart(2, '0');
  const year: number = date.getFullYear();
  return `${day}/${month}/${year}`;
}
export function formatDateDDMMYYYYCompact(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, '0');
  const month: string = String(date.getMonth() + 1).padStart(2, '0');
  const year: number = date.getFullYear();
  return `${day}${month}${year}`;
}
export function formatDateTimeDDMMYYYY_HHMMSS(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, '0');
  const month: string = String(date.getMonth() + 1).padStart(2, '0');
  const year: number = date.getFullYear();
  const hours: string = String(date.getHours()).padStart(2, '0');
  const minutes: string = String(date.getMinutes()).padStart(2, '0');
  const seconds: string = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export function parseDateDDMMYYYY(dateStr: string): Date | null {
  const match = dateStr.match(RegexPatterns.DATE_DD_MM_YYYY);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  const dayNum: number = parseInt(day);
  const monthNum: number = parseInt(month);
  const yearNum: number = parseInt(year);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }
  const date = new Date(yearNum, monthNum - 1, dayNum);
  if (
    isNaN(date.getTime()) ||
    date.getDate() !== dayNum ||
    date.getMonth() !== monthNum - 1 ||
    date.getFullYear() !== yearNum
  ) {
    return null;
  }
  return date;
}
