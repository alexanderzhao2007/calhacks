// Social train (SpacetimeDB). Pure helpers shared by the toolbar popup and the
// background worker. Nothing here touches the Claude page.

/**
 * Maincloud (the shared demo database, visible on the spacetimedb.com dashboard).
 * For a local server: WXT_TOT_STDB_URI=http://127.0.0.1:3100 (see db/README.md).
 */
export const STDB_URI = import.meta.env.WXT_TOT_STDB_URI ?? 'https://maincloud.spacetimedb.com';
export const STDB_DB = import.meta.env.WXT_TOT_STDB_DB ?? 'tot';

/**
 * chrome.storage.local key for the SpacetimeDB token. Present only after the
 * student joins. Scoped to the server and database: a token issued by one
 * server is rejected by another (e.g. local vs Maincloud).
 */
export const TOKEN_KEY = `stdbToken:${STDB_URI}/${STDB_DB}`;

/**
 * How an answer earns miles (miles themselves are set by the db module):
 * 0 real thinking first try, 1 after one follow-up, 2 cop-out, 3 thought first
 * (the message already showed an attempt, so tot never asked).
 */
export type Tier = 0 | 1 | 2 | 3;

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

type MilesRow = { owner: string; day: number; miles: number };

/** Monday of `day`'s week. Day 0 (1970-01-01) was a Thursday. */
export function weekStart(day: number): number {
  return day - ((day + 3) % 7);
}

/** The group's miles since this Monday. The train resets every Monday. */
export function weekMiles(rows: Iterable<MilesRow>, today: number): number {
  const monday = weekStart(today);
  let sum = 0;
  for (const r of rows) if (r.day >= monday && r.day <= today) sum += r.miles;
  return sum;
}

/** Today's conductor: most miles today, ties broken by name. Null until someone earns miles. */
export function conductor(rows: Iterable<MilesRow>, today: number, nameOf: (owner: string) => string): string | null {
  const totals = new Map<string, number>();
  for (const r of rows) if (r.day === today) totals.set(r.owner, (totals.get(r.owner) ?? 0) + r.miles);
  let best: string | null = null;
  for (const [owner, miles] of totals) {
    if (miles <= 0) continue;
    const top = best === null ? 0 : totals.get(best)!;
    if (miles > top || (miles === top && nameOf(owner).localeCompare(nameOf(best!)) < 0)) best = owner;
  }
  return best;
}
