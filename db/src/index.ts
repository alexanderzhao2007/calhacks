// tot social train (SpacetimeDB module).
//
// Each group shares one train; answering tot's question instead of skipping
// earns miles that move it toward the group's weekly goal.
//
// Privacy (CLAUDE.md §9): stores a display name, group membership and per-day
// counts. Never prompts, answers, subjects or anything typed into Claude. Tables
// are private; clients read only through the per-user views at the bottom,
// which expose you, and your group's answers and miles (not their prompt counts).

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

const profile = table(
  { name: 'profile' },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
  },
);

// "group" is an SQL keyword, hence train_group.
const trainGroup = table(
  { name: 'train_group' },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    code: t.string().unique(),
    weeklyGoal: t.u32(),
    createdBy: t.identity(),
  },
);

// Primary key on identity: one group per person.
const groupMember = table(
  { name: 'group_member' },
  {
    identity: t.identity().primaryKey(),
    groupId: t.u64().index('btree'),
  },
);

// One row per person per local calendar day (days since 1970-01-01 in the
// student's time zone). Counts only, never content:
//   prompts   messages sent on Claude (tot's own follow-ups excluded)
//   questions times tot asked a question (follow-up rounds not counted)
//   answers   times the student answered instead of skipping
//   miles     the train's fuel; set from the answer's tier in this module only
const dailyCount = table(
  {
    name: 'daily_count',
    indexes: [{ accessor: 'by_owner_day', algorithm: 'btree', columns: ['owner', 'day'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    day: t.u32(),
    prompts: t.u32(),
    questions: t.u32(),
    answers: t.u32(),
    miles: t.u32(),
  },
);

// The popup's "character": first/last name and bulb color. Separate from
// profile so adding it was a non-breaking migration; profile.name stays the
// display name ("Maya R.") everything else uses.
const look = table(
  { name: 'look' },
  {
    identity: t.identity().primaryKey(),
    firstName: t.string(),
    lastName: t.string(),
    color: t.string(),
  },
);

// When each person boarded their current group: bulbs are shown in join order,
// and ties for the hat go to the earlier joiner.
const memberSince = table(
  { name: 'member_since' },
  {
    identity: t.identity().primaryKey(),
    joinedAt: t.timestamp(),
  },
);

// Weekly goal for someone riding solo (no group).
const soloGoal = table(
  { name: 'solo_goal' },
  {
    identity: t.identity().primaryKey(),
    weeklyGoal: t.u32(),
  },
);

const spacetimedb = schema({ profile, trainGroup, groupMember, dailyCount, look, memberSince, soloGoal });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const MAX_NAME = 24;
const MAX_PART = 20; // first or last name
// The 8 bulb colors in the popup (no gold or gray: those mean lit / not lit).
const BULB_COLORS = ['#1D9E75', '#639922', '#378ADD', '#7F77DD', '#D4537E', '#D85A30', '#A32D2D', '#6E2E73'];
const MAX_GROUP_NAME = 32;
const MAX_MEMBERS = 8;
const MIN_GOAL = 10;
const MAX_GOAL = 10_000;
const MAX_PER_DAY = 200; // per counter; far above real use, stops a runaway client
const MAX_MILES_PER_DAY = 300;
// By tier: 0 real thinking first try, 1 after one follow-up, 2 cop-out, 3 thought
// first (tot never needed to ask). The client sends only the tier.
const MILES = [10, 6, 1, 12];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const MICROS_PER_DAY = 86_400_000_000n;

function requireProfile(ctx: Ctx) {
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (!me) throw new SenderError('Join first: set a display name.');
  return me;
}

function cleanName(name: string, max: number, what: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > max) throw new SenderError(`${what} must be 1–${max} characters.`);
  return clean;
}

function checkGoal(weeklyGoal: number) {
  if (weeklyGoal < MIN_GOAL || weeklyGoal > MAX_GOAL) {
    throw new SenderError(`Goal must be ${MIN_GOAL}–${MAX_GOAL} miles.`);
  }
}

function newGroupCode(ctx: Ctx): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[ctx.random.integerInRange(0, CODE_ALPHABET.length - 1)];
    if (!ctx.db.trainGroup.code.find(code)) return code;
  }
}

function membersOf(ctx: Ctx, groupId: bigint) {
  return [...ctx.db.groupMember.groupId.filter(groupId)];
}

/** Records when the caller boarded their current group. */
function markJoined(ctx: Ctx) {
  ctx.db.memberSince.identity.delete(ctx.sender);
  ctx.db.memberSince.insert({ identity: ctx.sender, joinedAt: ctx.timestamp });
}

/** Leaves the caller's group, if any. The last one out removes the group. */
function leaveCurrentGroup(ctx: Ctx) {
  const membership = ctx.db.groupMember.identity.find(ctx.sender);
  if (!membership) return;
  ctx.db.groupMember.identity.delete(ctx.sender);
  ctx.db.memberSince.identity.delete(ctx.sender);
  if (membersOf(ctx, membership.groupId).length === 0) ctx.db.trainGroup.id.delete(membership.groupId);
}

/** Joins (first call) or renames. Joining is the opt-in: nothing is recorded before it. */
export const setName = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const clean = cleanName(name, MAX_NAME, 'Name');
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (me) ctx.db.profile.identity.update({ ...me, name: clean });
  else ctx.db.profile.insert({ identity: ctx.sender, name: clean });
});

/**
 * Joins (first call) or edits your character. The display name everyone sees
 * is "First L." (or just the first name).
 */
export const setProfile = spacetimedb.reducer(
  { firstName: t.string(), lastName: t.string(), color: t.string() },
  (ctx, { firstName, lastName, color }) => {
    const first = cleanName(firstName, MAX_PART, 'First name');
    const last = lastName.trim().replace(/\s+/g, ' ');
    if (last.length > MAX_PART) throw new SenderError(`Last name must be at most ${MAX_PART} characters.`);
    if (!BULB_COLORS.includes(color)) throw new SenderError('Pick one of the bulb colors.');
    const name = last ? `${first} ${last[0].toUpperCase()}.` : first;
    const me = ctx.db.profile.identity.find(ctx.sender);
    if (me) ctx.db.profile.identity.update({ ...me, name });
    else ctx.db.profile.insert({ identity: ctx.sender, name });
    ctx.db.look.identity.delete(ctx.sender);
    ctx.db.look.insert({ identity: ctx.sender, firstName: first, lastName: last, color });
  },
);

/** Riding solo: your own weekly goal. Kept if you later start or join a group. */
export const setSoloGoal = spacetimedb.reducer({ weeklyGoal: t.u32() }, (ctx, { weeklyGoal }) => {
  requireProfile(ctx);
  checkGoal(weeklyGoal);
  ctx.db.soloGoal.identity.delete(ctx.sender);
  ctx.db.soloGoal.insert({ identity: ctx.sender, weeklyGoal });
});

export const createGroup = spacetimedb.reducer(
  { name: t.string(), weeklyGoal: t.u32() },
  (ctx, { name, weeklyGoal }) => {
    requireProfile(ctx);
    const clean = cleanName(name, MAX_GROUP_NAME, 'Group name');
    checkGoal(weeklyGoal);
    leaveCurrentGroup(ctx);
    const group = ctx.db.trainGroup.insert({
      id: 0n,
      name: clean,
      code: newGroupCode(ctx),
      weeklyGoal,
      createdBy: ctx.sender,
    });
    ctx.db.groupMember.insert({ identity: ctx.sender, groupId: group.id });
    markJoined(ctx);
  },
);

export const joinGroup = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  requireProfile(ctx);
  const group = ctx.db.trainGroup.code.find(code.trim().toUpperCase());
  if (!group) throw new SenderError('No group has that code. Check it with your friend and try again.');
  if (ctx.db.groupMember.identity.find(ctx.sender)?.groupId === group.id) return;
  if (membersOf(ctx, group.id).length >= MAX_MEMBERS) {
    throw new SenderError(`That train is full. Groups hold up to ${MAX_MEMBERS} people.`);
  }
  leaveCurrentGroup(ctx);
  ctx.db.groupMember.insert({ identity: ctx.sender, groupId: group.id });
  markJoined(ctx);
});

export const leaveGroup = spacetimedb.reducer((ctx) => leaveCurrentGroup(ctx));

/** Any member can change the goal. */
export const setGoal = spacetimedb.reducer({ weeklyGoal: t.u32() }, (ctx, { weeklyGoal }) => {
  checkGoal(weeklyGoal);
  const membership = ctx.db.groupMember.identity.find(ctx.sender);
  const group = membership && ctx.db.trainGroup.id.find(membership.groupId);
  if (!group) throw new SenderError('Join a group first.');
  ctx.db.trainGroup.id.update({ ...group, weeklyGoal });
});

type Counter = 'prompts' | 'questions' | 'answers';

/** Adds to the caller's row for `day` (their local day number). */
function bumpDay(ctx: Ctx, day: number, counter: Counter, miles = 0) {
  requireProfile(ctx);
  // Local day may differ from the UTC day by at most one in either direction.
  const utcDay = Number(ctx.timestamp.microsSinceUnixEpoch / MICROS_PER_DAY);
  if (Math.abs(day - utcDay) > 1) throw new SenderError('Day out of range.');
  const row = [...ctx.db.dailyCount.by_owner_day.filter([ctx.sender, day])][0] ?? {
    id: 0n, owner: ctx.sender, day, prompts: 0, questions: 0, answers: 0, miles: 0,
  };
  const next = {
    ...row,
    [counter]: Math.min(row[counter] + 1, MAX_PER_DAY),
    miles: Math.min(row.miles + miles, MAX_MILES_PER_DAY),
  };
  if (row.id === 0n) ctx.db.dailyCount.insert(next);
  else ctx.db.dailyCount.id.update(next);
}

export const recordPrompt = spacetimedb.reducer({ day: t.u32() }, (ctx, { day }) => bumpDay(ctx, day, 'prompts'));

export const recordQuestion = spacetimedb.reducer({ day: t.u32() }, (ctx, { day }) => bumpDay(ctx, day, 'questions'));

/** The student answered tot's question (or showed their thinking up front, tier 3). */
export const recordThoughtFirst = spacetimedb.reducer({ day: t.u32(), tier: t.u8() }, (ctx, { day, tier }) => {
  const miles = MILES[tier];
  if (miles === undefined) throw new SenderError('Unknown tier.');
  bumpDay(ctx, day, 'answers', miles);
});

/** Leave tot's social features: deletes your profile, membership and counts. */
export const deleteMe = spacetimedb.reducer((ctx) => {
  leaveCurrentGroup(ctx);
  for (const row of [...ctx.db.dailyCount.by_owner_day.filter(ctx.sender)]) ctx.db.dailyCount.id.delete(row.id);
  ctx.db.look.identity.delete(ctx.sender);
  ctx.db.soloGoal.identity.delete(ctx.sender);
  ctx.db.profile.identity.delete(ctx.sender);
});

// ---- Views: each client sees only itself and its group ----------------------

export const myProfile = spacetimedb.view(
  { name: 'my_profile', public: true },
  t.option(profile.rowType),
  (ctx) => ctx.db.profile.identity.find(ctx.sender) ?? undefined,
);

/** Your own counts, including prompts and questions (never shown to the group). */
export const myCounts = spacetimedb.view(
  { name: 'my_counts', public: true },
  t.array(dailyCount.rowType),
  (ctx) => [...ctx.db.dailyCount.by_owner_day.filter(ctx.sender)],
);

export const myGroup = spacetimedb.view(
  { name: 'my_group', public: true },
  t.option(trainGroup.rowType),
  (ctx) => {
    const membership = ctx.db.groupMember.identity.find(ctx.sender);
    return membership ? (ctx.db.trainGroup.id.find(membership.groupId) ?? undefined) : undefined;
  },
);

/** Everyone on your train, you included. */
export const groupMembers = spacetimedb.view(
  { name: 'group_members', public: true },
  t.array(profile.rowType),
  (ctx) => {
    const membership = ctx.db.groupMember.identity.find(ctx.sender);
    if (!membership) return [];
    const rows = [];
    for (const m of ctx.db.groupMember.groupId.filter(membership.groupId)) {
      const p = ctx.db.profile.identity.find(m.identity);
      if (p) rows.push(p);
    }
    return rows;
  },
);

const GroupDay = t.object('GroupDay', {
  owner: t.identity(),
  day: t.u32(),
  answers: t.u32(),
  miles: t.u32(),
});

/** Your group's answers and miles per person per day. No prompt or question counts. */
export const groupCounts = spacetimedb.view(
  { name: 'group_counts', public: true },
  t.array(GroupDay),
  (ctx) => {
    const membership = ctx.db.groupMember.identity.find(ctx.sender);
    if (!membership) return [];
    return [...ctx.db.groupMember.groupId.filter(membership.groupId)].flatMap((m) =>
      [...ctx.db.dailyCount.by_owner_day.filter(m.identity)].map(({ owner, day, answers, miles }) => ({
        owner,
        day,
        answers,
        miles,
      })),
    );
  },
);

export const myLook = spacetimedb.view(
  { name: 'my_look', public: true },
  t.option(look.rowType),
  (ctx) => ctx.db.look.identity.find(ctx.sender) ?? undefined,
);

export const mySolo = spacetimedb.view(
  { name: 'my_solo', public: true },
  t.option(soloGoal.rowType),
  (ctx) => ctx.db.soloGoal.identity.find(ctx.sender) ?? undefined,
);

const MemberLook = t.object('MemberLook', {
  identity: t.identity(),
  firstName: t.string(),
  lastName: t.string(),
  color: t.string(),
  joinedMicros: t.u64(), // 0 if unknown (joined before join times were kept)
});

/** Characters and join order of everyone on your train, you included. */
export const groupLooks = spacetimedb.view(
  { name: 'group_looks', public: true },
  t.array(MemberLook),
  (ctx) => {
    const membership = ctx.db.groupMember.identity.find(ctx.sender);
    if (!membership) return [];
    const rows = [];
    for (const m of ctx.db.groupMember.groupId.filter(membership.groupId)) {
      const l = ctx.db.look.identity.find(m.identity);
      const since = ctx.db.memberSince.identity.find(m.identity);
      rows.push({
        identity: m.identity,
        firstName: l?.firstName ?? '',
        lastName: l?.lastName ?? '',
        color: l?.color ?? '',
        joinedMicros: since?.joinedAt.microsSinceUnixEpoch ?? 0n,
      });
    }
    return rows;
  },
);
