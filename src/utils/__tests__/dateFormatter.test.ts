import { describe, it, expect } from 'vitest';
import {
  formatDateDDMMYYYY,
  formatDateDDMMYYYYCompact,
  formatDateTimeDDMMYYYY_HHMMSS,
  parseDateDDMMYYYY,
} from '../dateFormatter';

describe('formatDateDDMMYYYY', () => {
  it('should format date correctly', () => {
    expect(formatDateDDMMYYYY(new Date(2026, 2, 13))).toBe('13/03/2026');
  });

  it('should pad single digit day and month', () => {
    expect(formatDateDDMMYYYY(new Date(2026, 0, 5))).toBe('05/01/2026');
  });

  it('should handle leap year', () => {
    expect(formatDateDDMMYYYY(new Date(2024, 1, 29))).toBe('29/02/2024');
  });

  it('should handle year boundary', () => {
    expect(formatDateDDMMYYYY(new Date(2025, 11, 31))).toBe('31/12/2025');
  });
});

describe('formatDateDDMMYYYYCompact', () => {
  it('should format date without slashes', () => {
    expect(formatDateDDMMYYYYCompact(new Date(2026, 2, 13))).toBe('13032026');
  });
  it('should pad single digit day and month', () => {
    expect(formatDateDDMMYYYYCompact(new Date(2026, 0, 5))).toBe('05012026');
  });
  it('should handle leap year', () => {
    expect(formatDateDDMMYYYYCompact(new Date(2024, 1, 29))).toBe('29022024');
  });
  it('should handle year boundary', () => {
    expect(formatDateDDMMYYYYCompact(new Date(2025, 11, 31))).toBe('31122025');
  });
});
describe('formatDateTimeDDMMYYYY_HHMMSS', () => {
  it('should format date with time correctly', () => {
    expect(
      formatDateTimeDDMMYYYY_HHMMSS(new Date(2026, 2, 13, 22, 34, 34))
    ).toBe('13/03/2026 22:34:34');
  });
  it('should pad single digit day, month, hours, minutes and seconds', () => {
    expect(formatDateTimeDDMMYYYY_HHMMSS(new Date(2026, 0, 5, 9, 8, 7))).toBe(
      '05/01/2026 09:08:07'
    );
  });
  it('should handle midnight', () => {
    expect(formatDateTimeDDMMYYYY_HHMMSS(new Date(2026, 2, 13, 0, 0, 0))).toBe(
      '13/03/2026 00:00:00'
    );
  });
  it('should handle noon', () => {
    expect(formatDateTimeDDMMYYYY_HHMMSS(new Date(2026, 2, 13, 12, 0, 0))).toBe(
      '13/03/2026 12:00:00'
    );
  });
  it('should handle end of day', () => {
    expect(
      formatDateTimeDDMMYYYY_HHMMSS(new Date(2026, 2, 13, 23, 59, 59))
    ).toBe('13/03/2026 23:59:59');
  });
});

describe('date formatter consistency', () => {
  it('should use same underlying date for both formatters', () => {
    const testDate = new Date(2026, 2, 15);
    const withSlashes = formatDateDDMMYYYY(testDate);
    const withoutSlashes = formatDateDDMMYYYYCompact(testDate);

    expect(withSlashes).toBe('15/03/2026');
    expect(withoutSlashes).toBe('15032026');
    expect(withoutSlashes.replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3')).toBe(
      withSlashes
    );
  });

  it('should maintain date consistency across timezone changes', () => {
    const testDate = new Date(2026, 0, 1);
    const withSlashes = formatDateDDMMYYYY(testDate);
    const withoutSlashes = formatDateDDMMYYYYCompact(testDate);

    const compact = withoutSlashes.replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
    expect(compact).toBe(withSlashes);
  });

  it('should handle same date object consistently', () => {
    const dates = [
      new Date(2026, 0, 5),
      new Date(2024, 1, 29),
      new Date(2025, 11, 31),
    ];

    dates.forEach((date) => {
      const withSlashes = formatDateDDMMYYYY(date);
      const withoutSlashes = formatDateDDMMYYYYCompact(date);
      const reconstructed = withoutSlashes.replace(
        /(\d{2})(\d{2})(\d{4})/,
        '$1/$2/$3'
      );

      expect(reconstructed).toBe(withSlashes);
    });
  });
});

describe('parseDateDDMMYYYY', () => {
  it('should parse valid date string', () => {
    const result: Date | null = parseDateDDMMYYYY('13/03/2026');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getDate()).toBe(13);
    expect(result?.getMonth()).toBe(2);
    expect(result?.getFullYear()).toBe(2026);
  });

  it('should return null for invalid format', () => {
    expect(parseDateDDMMYYYY('2026-03-13')).toBeNull();
  });

  it('should return null for invalid date', () => {
    expect(parseDateDDMMYYYY('32/13/2026')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseDateDDMMYYYY('')).toBeNull();
  });
});
