import { describe, it, expect } from 'vitest';
import { TextUtils } from '../textUtils';

describe('TextUtils.handleNicknames', () => {
  it('drops pronoun-only parentheses instead of appending to last name', () => {
    const { firstName, lastName } = TextUtils.handleNicknames(
      'Mor',
      'Basson-Toren (She/her/hers)'
    );
    expect(firstName).toBe('Mor');
    expect(lastName).toBe('Basson-Toren');
  });

  it('still moves real nicknames to the end of last name', () => {
    const { firstName, lastName } = TextUtils.handleNicknames(
      'John',
      'Smith (Momo)'
    );
    expect(firstName).toBe('John');
    expect(lastName).toBe('Smith Momo');
  });

  it('drops they/them style parentheticals', () => {
    const { lastName } = TextUtils.handleNicknames(
      'Alex',
      'Rivera (They/them)'
    );
    expect(lastName).toBe('Rivera');
  });
});

describe('TextUtils.cleanName after handleNicknames (Mor Basson-Toren case)', () => {
  it('produces Mor Basson Toren without Hers', () => {
    const { firstName: fn, lastName: ln } = TextUtils.handleNicknames(
      'Mor',
      'Basson-Toren (She/her/hers)'
    );
    const firstName = TextUtils.cleanName(fn);
    const lastName = TextUtils.cleanName(ln);
    expect(firstName).toBe('Mor');
    expect(lastName).toBe('Basson Toren');
    expect(lastName.toLowerCase()).not.toContain('hers');
  });
});
