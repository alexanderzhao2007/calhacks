// Friends + streaks (SpacetimeDB). Pure helpers shared by the toolbar popup and
// the background worker. Nothing here touches the Claude page.

/** Local dev server (`spacetime start --listen-addr 127.0.0.1:3100`) unless overridden. */
export const STDB_URI = import.meta.env.WXT_TOT_STDB_URI ?? 'http://127.0.0.1:3100';
export const STDB_DB = import.meta.env.WXT_TOT_STDB_DB ?? 'tot';

/** chrome.storage.local key for the SpacetimeDB token. Present only after the student joins. */
export const TOKEN_KEY = 'stdbToken';

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 in the student's own time zone. */
export function localDay(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / MS_PER_DAY);
}

/**
 * Consecutive days with at least one "thought first", ending today. A streak
 * that ended yesterday is still alive (today isn't over yet).
 */
export function streak(days: Iterable<number>, today: number): number {
  const set = new Set(days);
  let d = set.has(today) ? today : today - 1;
  let n = 0;
  while (set.has(d)) {
    n += 1;
    d -= 1;
  }
  return n;
}

/** Total over the last 7 days, today included. */
export function weekTotal(rows: Iterable<{ day: number; count: number }>, today: number): number {
  let sum = 0;
  for (const r of rows) if (r.day > today - 7 && r.day <= today) sum += r.count;
  return sum;
}
