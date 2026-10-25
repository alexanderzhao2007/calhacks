import { describe, expect, it } from 'vitest';
import { conductor, localDay, streak, weekMiles, weekStart } from './social';

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

describe('weekStart', () => {
  it('is the Monday of the week', () => {
    const monday = localDay(new Date(2026, 9, 19, 12)); // Mon 19 Oct 2026
    for (let i = 0; i < 7; i++) expect(weekStart(monday + i)).toBe(monday);
    expect(weekStart(monday - 1)).toBe(monday - 7); // Sunday belongs to the week before
  });
});

describe('weekMiles', () => {
  it('sums miles since Monday, ignoring future days', () => {
    const monday = weekStart(20750);
    const rows = [
      { owner: 'a', day: monday, miles: 10 },
      { owner: 'b', day: monday + 2, miles: 6 },
      { owner: 'a', day: monday - 1, miles: 100 }, // last Sunday: reset
      { owner: 'b', day: monday + 3, miles: 50 }, // after "today"
    ];
    expect(weekMiles(rows, monday + 2)).toBe(16);
  });
});

describe('conductor', () => {
  const names: Record<string, string> = { a: 'Ann', b: 'Bo', c: 'Cy' };
  const nameOf = (o: string) => names[o] ?? '';
  it('picks the most miles today, ties by name', () => {
    const rows = [
      { owner: 'c', day: 5, miles: 12 },
      { owner: 'b', day: 5, miles: 12 },
      { owner: 'a', day: 4, miles: 300 }, // yesterday
    ];
    expect(conductor(rows, 5, nameOf)).toBe('b');
  });
  it('is nobody before anyone earns miles today', () => {
    expect(conductor([{ owner: 'a', day: 4, miles: 10 }], 5, nameOf)).toBeNull();
    expect(conductor([{ owner: 'a', day: 5, miles: 0 }], 5, nameOf)).toBeNull();
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
