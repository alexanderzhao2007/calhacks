import { describe, expect, it } from 'vitest';
import { localDay, streak, weekTotal } from './social';

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(streak([10, 9, 8, 6], 10)).toBe(3);
  });
  it('stays alive when the last day was yesterday', () => {
    expect(streak([9, 8], 10)).toBe(2);
  });
  it('is zero after a missed day', () => {
    expect(streak([8, 7], 10)).toBe(0);
    expect(streak([], 10)).toBe(0);
  });
});

describe('weekTotal', () => {
  it('sums the last 7 days including today', () => {
    const rows = [
      { day: 10, count: 2 },
      { day: 4, count: 5 },
      { day: 3, count: 100 }, // 8 days ago: outside the window
      { day: 11, count: 9 }, // future (friend's time zone ahead): ignored
    ];
    expect(weekTotal(rows, 10)).toBe(7);
  });
});

describe('localDay', () => {
  it('advances once per local day', () => {
    const a = new Date(2026, 9, 24, 0, 5);
    const b = new Date(2026, 9, 24, 23, 55);
    const c = new Date(2026, 9, 25, 0, 5);
    expect(localDay(a)).toBe(localDay(b));
    expect(localDay(c)).toBe(localDay(a) + 1);
  });
});
