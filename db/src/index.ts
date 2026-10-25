// tot friends + streaks (SpacetimeDB module).
//
// Privacy (CLAUDE.md §9): stores a display name, a friend code, friendships and
// per-day counts of "answered tot's question". Never prompts, answers, subjects
// or anything typed into Claude. Tables are private; clients read only through
// the per-user views below, which expose you and your mutual friends.

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

const profile = table(
  { name: 'profile' },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    friendCode: t.string().unique(),
  },
);

// Stored in both directions so "my friends" is one index lookup.
const friendship = table(
  {
    name: 'friendship',
    indexes: [{ accessor: 'by_owner_friend', algorithm: 'btree', columns: ['owner', 'friend'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    friend: t.identity().index('btree'),
  },
);

// One row per person per local calendar day (days since 1970-01-01 in the student's time zone).
const dailyCount = table(
  {
    name: 'daily_count',
    indexes: [{ accessor: 'by_owner_day', algorithm: 'btree', columns: ['owner', 'day'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    day: t.u32(),
    count: t.u32(),
  },
);

const spacetimedb = schema({ profile, friendship, dailyCount });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const MAX_NAME = 24;
const MAX_PER_DAY = 200; // far above real use; stops a runaway client inflating the board
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const MICROS_PER_DAY = 86_400_000_000n;

function requireProfile(ctx: Ctx) {
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (!me) throw new SenderError('Join first: set a display name.');
  return me;
}

function newFriendCode(ctx: Ctx): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[ctx.random.integerInRange(0, CODE_ALPHABET.length - 1)];
    if (!ctx.db.profile.friendCode.find(code)) return code;
  }
}

function areFriends(ctx: Ctx, a: Ctx['sender'], b: Ctx['sender']): boolean {
  return [...ctx.db.friendship.by_owner_friend.filter([a, b])].length > 0;
}

/** Joins (first call) or renames. Joining is the opt-in: nothing is recorded before it. */
export const setName = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > MAX_NAME) throw new SenderError(`Name must be 1–${MAX_NAME} characters.`);
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (me) ctx.db.profile.identity.update({ ...me, name: clean });
  else ctx.db.profile.insert({ identity: ctx.sender, name: clean, friendCode: newFriendCode(ctx) });
});

/** Mutual on purpose: entering someone's code adds you to each other's boards. */
export const addFriend = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  requireProfile(ctx);
  const them = ctx.db.profile.friendCode.find(code.trim().toUpperCase());
  if (!them) throw new SenderError('No one has that friend code.');
  if (them.identity.isEqual(ctx.sender)) throw new SenderError('That’s your own code.');
  if (areFriends(ctx, ctx.sender, them.identity)) return;
  ctx.db.friendship.insert({ id: 0n, owner: ctx.sender, friend: them.identity });
  ctx.db.friendship.insert({ id: 0n, owner: them.identity, friend: ctx.sender });
});

export const removeFriend = spacetimedb.reducer({ friend: t.identity() }, (ctx, { friend }) => {
  for (const [a, b] of [[ctx.sender, friend], [friend, ctx.sender]] as const) {
    for (const row of [...ctx.db.friendship.by_owner_friend.filter([a, b])]) ctx.db.friendship.id.delete(row.id);
  }
});

/** The student answered tot's question instead of skipping. `day` is their local day number. */
export const recordThoughtFirst = spacetimedb.reducer({ day: t.u32() }, (ctx, { day }) => {
  requireProfile(ctx);
  // Local day may differ from the UTC day by at most one in either direction.
  const utcDay = Number(ctx.timestamp.microsSinceUnixEpoch / MICROS_PER_DAY);
  if (Math.abs(day - utcDay) > 1) throw new SenderError('Day out of range.');
  const existing = [...ctx.db.dailyCount.by_owner_day.filter([ctx.sender, day])][0];
  if (!existing) ctx.db.dailyCount.insert({ id: 0n, owner: ctx.sender, day, count: 1 });
  else if (existing.count < MAX_PER_DAY) ctx.db.dailyCount.id.update({ ...existing, count: existing.count + 1 });
});

/** Leave tot's social features: deletes your profile, friendships and counts. */
export const deleteMe = spacetimedb.reducer((ctx) => {
  for (const row of [...ctx.db.friendship.iter()]) {
    if (row.owner.isEqual(ctx.sender) || row.friend.isEqual(ctx.sender)) ctx.db.friendship.id.delete(row.id);
  }
  for (const row of [...ctx.db.dailyCount.by_owner_day.filter(ctx.sender)]) ctx.db.dailyCount.id.delete(row.id);
  ctx.db.profile.identity.delete(ctx.sender);
});

// ---- Views: each client sees only itself and its friends --------------------

export const myProfile = spacetimedb.view(
  { name: 'my_profile', public: true },
  t.option(profile.rowType),
  (ctx) => ctx.db.profile.identity.find(ctx.sender) ?? undefined,
);

export const friendProfiles = spacetimedb.view(
  { name: 'friend_profiles', public: true },
  t.array(profile.rowType),
  (ctx) => {
    const rows = [];
    for (const f of ctx.db.friendship.by_owner_friend.filter(ctx.sender)) {
      const p = ctx.db.profile.identity.find(f.friend);
      if (p) rows.push(p);
    }
    return rows;
  },
);

export const boardCounts = spacetimedb.view(
  { name: 'board_counts', public: true },
  t.array(dailyCount.rowType),
  (ctx) => {
    const people = [ctx.sender, ...[...ctx.db.friendship.by_owner_friend.filter(ctx.sender)].map((f) => f.friend)];
    return people.flatMap((who) => [...ctx.db.dailyCount.by_owner_day.filter(who)]);
  },
);
