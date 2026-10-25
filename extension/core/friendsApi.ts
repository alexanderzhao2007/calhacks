// SpacetimeDB over HTTP for the toolbar popup.
//
// Why not the `spacetimedb` SDK: it compiles its message decoders with
// `Function(...)` at runtime, and MV3 extension pages forbid 'unsafe-eval', so
// the SDK throws on connect and the popup renders blank. Reducer calls go to
// /call/<reducer> and reads go through the per-user views via /sql, both
// authenticated with the student's token, so privacy is still enforced by the
// module's views.

import { STDB_DB, STDB_URI } from './social';

export type Profile = { identity: string; name: string };
export type Group = { name: string; code: string; weeklyGoal: number };
/** A group member's day: answers and miles only (the module never shares prompt counts). */
export type GroupDay = { owner: string; day: number; answers: number; miles: number };
/** One of your own days. Only you can read prompts and questions. */
export type Activity = { day: number; prompts: number; questions: number; answers: number; miles: number };
export type Board = {
  me: Profile | null;
  group: Group | null;
  members: Profile[];
  groupDays: GroupDay[];
  mine: Activity[];
};

const TIMEOUT_MS = 8000;
const DB_URL = `${STDB_URI}/v1/database/${STDB_DB}`;

/** Reducer rejected the call (e.g. "No group has that code."). Safe to show. */
export class FriendsError extends Error {}

/** A fresh identity. Called only when the student presses Join. */
export async function createIdentity(): Promise<string> {
  const res = await fetch(`${STDB_URI}/v1/identity`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`identity ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  return token;
}

export async function callReducer(token: string, reducer: string, args: unknown[]): Promise<void> {
  const res = await fetch(`${DB_URL}/call/${reducer}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return;
  const text = await res.text();
  // 530: the reducer threw a SenderError; its message is written for the student.
  if (res.status === 530 && text) throw new FriendsError(text);
  throw new Error(`${reducer} ${res.status}`);
}

type SqlResult = { schema: { elements: { name: { some: string } | null }[] }; rows: unknown[][] };

/** Rows of one view as objects keyed by column name. */
async function query(token: string, view: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${DB_URL}/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: `SELECT * FROM ${view}`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`sql ${view} ${res.status}`);
  const [result] = (await res.json()) as SqlResult[];
  if (!result) return [];
  const names = result.schema.elements.map((e) => e.name?.some ?? '');
  return result.rows.map((row) => Object.fromEntries(row.map((v, i) => [names[i], v])));
}

// Identities arrive as a one-field product: ["0x…"].
const identityHex = (v: unknown): string => (Array.isArray(v) ? String(v[0]) : String(v));

const toProfile = (r: Record<string, unknown>): Profile => ({ identity: identityHex(r.identity), name: String(r.name) });

export async function loadBoard(token: string): Promise<Board> {
  const [profile, group, members, groupDays, mine] = await Promise.all([
    query(token, 'my_profile'),
    query(token, 'my_group'),
    query(token, 'group_members'),
    query(token, 'group_counts'),
    query(token, 'my_counts'),
  ]);
  const g = group[0];
  return {
    me: profile[0] ? toProfile(profile[0]) : null,
    group: g ? { name: String(g.name), code: String(g.code), weeklyGoal: Number(g.weekly_goal) } : null,
    members: members.map(toProfile),
    groupDays: groupDays.map((r) => ({
      owner: identityHex(r.owner),
      day: Number(r.day),
      answers: Number(r.answers),
      miles: Number(r.miles),
    })),
    mine: mine.map((r) => ({
      day: Number(r.day),
      prompts: Number(r.prompts),
      questions: Number(r.questions),
      answers: Number(r.answers),
      miles: Number(r.miles),
    })),
  };
}
