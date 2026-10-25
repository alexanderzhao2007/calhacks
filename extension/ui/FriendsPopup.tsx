// Friends board: live streaks of "answered tot's question instead of skipping".
// Shows only you and mutual friends (enforced by the module's views). Skips are
// never counted or shown.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../stdb';
import { localDay, streak, TOKEN_KEY, weekTotal } from '../core/social';
import { COPY } from './copy';

const T = COPY.friends;

type Row = { key: string; name: string; isMe: boolean; streak: number; week: number };

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : T.genericError;
}

export function FriendsPopup() {
  const { identity, token, connectionError } = useSpacetimeDB();
  const [mine, mineReady] = useTable(tables.myProfile);
  const [friends] = useTable(tables.friendProfiles);
  const [bumped, setBumped] = useState<string | null>(null);
  const bumpTimer = useRef<number | undefined>(undefined);
  const countsLoaded = useRef(false);
  const [counts, countsReady] = useTable(tables.boardCounts, {
    // Brief highlight when someone's count changes live.
    onUpdate: (_old, row) => bump(row.owner.toHexString()),
    onInsert: (row) => bump(row.owner.toHexString()),
  });
  countsLoaded.current = countsReady;
  function bump(key: string) {
    if (!countsLoaded.current) return; // initial sync, not a live change
    setBumped(key);
    window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => setBumped(null), 1200);
  }

  const me = mine[0];

  // Joining is the opt-in: only then is the token saved, which is what lets the
  // background worker record anything.
  useEffect(() => {
    if (me && token) void browser.storage.local.set({ [TOKEN_KEY]: token });
  }, [me, token]);

  const today = localDay(new Date());
  const board: Row[] = useMemo(() => {
    if (!me) return [];
    const people = [me, ...friends];
    return people
      .map((p) => {
        const rows = counts.filter((c) => c.owner.isEqual(p.identity));
        return {
          key: p.identity.toHexString(),
          name: p.name,
          isMe: identity ? p.identity.isEqual(identity) : p === me,
          streak: streak(rows.map((r) => r.day), today),
          week: weekTotal(rows, today),
        };
      })
      .sort((a, b) => b.week - a.week || b.streak - a.streak || a.name.localeCompare(b.name));
  }, [me, friends, counts, identity, today]);

  if (connectionError) {
    return (
      <Shell>
        <p className="tf-muted">{T.offline}</p>
      </Shell>
    );
  }
  if (!mineReady) {
    return (
      <Shell>
        <p className="tf-muted">{T.connecting}</p>
      </Shell>
    );
  }
  return <Shell>{me ? <Board board={board} code={me.friendCode} bumped={bumped} /> : <Join />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="tf">
      <header className="tf-head">
        <svg className="tf-icon" viewBox="0 0 128 128" aria-hidden="true">
          <rect width="128" height="128" rx="30" fill="#2F4858" />
          <rect className="tf-icon-edge" x="2" y="2" width="124" height="124" rx="28" fill="none" strokeWidth="4" />
          <circle cx="64" cy="54" r="30" fill="#F2B300" />
          <rect x="52" y="89" width="24" height="8" rx="3" fill="#FFFFFF" />
          <rect x="56" y="101" width="16" height="6" rx="3" fill="#FFFFFF" />
        </svg>
        <h1>{T.title}</h1>
      </header>
      {children}
    </main>
  );
}

function Join() {
  const setName = useReducer(reducers.setName);
  const [name, setNameText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await setName({ name });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tf-section" onSubmit={join}>
      <p className="tf-lead">{T.joinLead}</p>
      <p className="tf-muted">{T.privacy}</p>
      <label className="tf-label" htmlFor="tf-name">
        {T.nameLabel}
      </label>
      <div className="tf-row">
        <input
          id="tf-name"
          className="tf-field"
          value={name}
          maxLength={24}
          autoComplete="nickname"
          onChange={(e) => setNameText(e.target.value)}
          autoFocus
        />
        <button className="tf-btn tf-btn-primary" type="submit" disabled={busy || !name.trim()}>
          {T.join}
        </button>
      </div>
      <p className="tf-error" role="alert">
        {error}
      </p>
    </form>
  );
}

function Board({ board, code, bumped }: { board: Row[]; code: string; bumped: string | null }) {
  const addFriend = useReducer(reducers.addFriend);
  const deleteMe = useReducer(reducers.deleteMe);
  const [friendCode, setFriendCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const mine = board.find((r) => r.isMe);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!friendCode.trim()) return;
    setError('');
    try {
      await addFriend({ code: friendCode });
      setFriendCode('');
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function leave() {
    if (!window.confirm(T.leaveConfirm)) return;
    try {
      await deleteMe();
      await browser.storage.local.remove(TOKEN_KEY);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      {mine && (
        <section className="tf-stats" aria-label={T.yourStats}>
          <div>
            <span className="tf-big">{mine.streak}</span>
            <span className="tf-muted">{T.dayStreak}</span>
          </div>
          <div>
            <span className="tf-big">{mine.week}</span>
            <span className="tf-muted">{T.thisWeek}</span>
          </div>
        </section>
      )}

      <section className="tf-section" aria-labelledby="tf-board-title">
        <h2 id="tf-board-title">{T.boardTitle}</h2>
        <ol className="tf-board">
          {board.map((r, i) => (
            <li key={r.key} className={`${r.isMe ? 'is-me' : ''} ${bumped === r.key ? 'is-bumped' : ''}`}>
              <span className="tf-rank">{i + 1}</span>
              <span className="tf-name">{r.isMe ? T.you(r.name) : r.name}</span>
              <span className="tf-streak" title={`${r.streak} ${T.dayStreak}`}>
                {r.streak > 0 ? T.streakShort(r.streak) : ''}
              </span>
              <span className="tf-week">{r.week}</span>
            </li>
          ))}
        </ol>
        {board.length <= 1 && <p className="tf-muted">{T.noFriends}</p>}
        <p className="tf-muted tf-small">{T.boardNote}</p>
      </section>

      <section className="tf-section">
        <h2>{T.yourCode}</h2>
        <div className="tf-row">
          <code className="tf-code">{code}</code>
          <button className="tf-btn tf-btn-secondary" type="button" onClick={copy}>
            {copied ? T.copied : T.copy}
          </button>
        </div>
        <form className="tf-row" onSubmit={add}>
          <input
            className="tf-field tf-code-input"
            aria-label={T.friendCodeLabel}
            placeholder={T.friendCodePlaceholder}
            value={friendCode}
            maxLength={6}
            onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
          />
          <button className="tf-btn tf-btn-primary" type="submit" disabled={!friendCode.trim()}>
            {T.add}
          </button>
        </form>
        <p className="tf-error" role="alert">
          {error}
        </p>
      </section>

      <button className="tf-leave" type="button" onClick={leave}>
        {T.leave}
      </button>
    </>
  );
}
