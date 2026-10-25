// Social train: one shared train per group. Every answer to tot's question earns
// miles that move it toward the group's weekly goal; it resets every Monday.
// Shows only you and your group (enforced by the module's views). Skips are
// never counted, and there's no full ranking: just today's conductor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { callReducer, createIdentity, FriendsError, loadBoard, type Activity, type Board } from '../core/friendsApi';
import { conductor, localDay, TOKEN_KEY, weekMiles } from '../core/social';
import { COPY } from './copy';

const T = COPY.train;
const POLL_MS = 3000;
const GOAL_PRESETS = [100, 250, 500] as const;

function errorText(e: unknown): string {
  return e instanceof FriendsError && e.message ? e.message : T.genericError;
}

async function storedToken(): Promise<string | undefined> {
  const { [TOKEN_KEY]: token } = (await browser.storage.local.get(TOKEN_KEY)) as Record<string, string | undefined>;
  return token;
}

export function TrainPopup() {
  // undefined: still reading storage; null: never joined (nothing stored).
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void storedToken().then((t) => setToken(t ?? null));
  }, []);

  const refresh = useCallback(async (tok: string) => {
    try {
      setData(await loadBoard(tok));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // Poll while the popup is open; the board is small and the popup short-lived.
  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const id = window.setInterval(() => void refresh(token), POLL_MS);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  /** Runs a reducer as the student, then refreshes. */
  async function act(reducer: string, args: unknown[] = []) {
    await callReducer(token!, reducer, args);
    await refresh(token!);
  }

  // Joining is the opt-in: the token is saved only after set_name succeeds,
  // which is what lets the background worker record anything.
  async function board(name: string, group: { create: string; goal: number } | { code: string }) {
    let tok = token;
    if (!data?.me) {
      tok = tok ?? (await createIdentity());
      await callReducer(tok, 'set_name', [name]);
      await browser.storage.local.set({ [TOKEN_KEY]: tok });
      setToken(tok);
    }
    if ('create' in group) await callReducer(tok!, 'create_group', [group.create, group.goal]);
    else await callReducer(tok!, 'join_group', [group.code]);
    await refresh(tok!);
  }

  async function leaveBoard() {
    if (!window.confirm(T.leaveConfirm)) return;
    await callReducer(token!, 'delete_me', []);
    await browser.storage.local.remove(TOKEN_KEY);
    setData(null);
    setToken(null);
  }

  if (offline && !data) return <Shell><p className="tf-muted">{T.offline}</p></Shell>;
  if (token === undefined || (token && !data)) return <Shell><p className="tf-muted">{T.connecting}</p></Shell>;

  if (!data?.me || !data.group) {
    return (
      <Shell>
        <Boarding needsName={!data?.me} board={board} />
        {data?.me && <MyActivity rows={data.mine} />}
        {data?.me && <LeaveBoard leave={leaveBoard} />}
      </Shell>
    );
  }
  return (
    <Shell>
      <Train data={data} act={act} />
      <MyActivity rows={data.mine} />
      <div className="tf-row tf-links">
        <button
          className="tf-leave"
          type="button"
          onClick={() => {
            if (window.confirm(T.leaveGroupConfirm)) void act('leave_group');
          }}
        >
          {T.leaveGroup}
        </button>
        <LeaveBoard leave={leaveBoard} />
      </div>
    </Shell>
  );
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

function LeaveBoard({ leave }: { leave: () => Promise<void> }) {
  return (
    <button className="tf-leave" type="button" onClick={() => void leave().catch(() => {})}>
      {T.leave}
    </button>
  );
}

/** Not on a train yet: name (first time only), then start a group or join one. */
function Boarding({
  needsName,
  board,
}: {
  needsName: boolean;
  board: (name: string, group: { create: string; goal: number } | { code: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [goal, setGoal] = useState<number>(GOAL_PRESETS[1]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = (!needsName || name.trim()) && (mode === 'create' ? groupName.trim() : code.trim().length === 6);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await board(name, mode === 'create' ? { create: groupName, goal } : { code });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tf-section" onSubmit={submit}>
      <p className="tf-lead">{T.joinLead}</p>
      <p className="tf-muted">{T.privacy}</p>
      {needsName && (
        <>
          <label className="tf-label" htmlFor="tf-name">{T.nameLabel}</label>
          <input
            id="tf-name"
            className="tf-field"
            value={name}
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </>
      )}
      <div className="tf-tabs" role="tablist">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`tf-tab ${mode === m ? 'is-on' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'create' ? T.startGroup : T.joinGroup}
          </button>
        ))}
      </div>
      {mode === 'create' ? (
        <>
          <label className="tf-label" htmlFor="tf-group">{T.groupNameLabel}</label>
          <input id="tf-group" className="tf-field" value={groupName} maxLength={32} onChange={(e) => setGroupName(e.target.value)} />
          <span className="tf-label">{T.goalLabel}</span>
          <GoalPicker value={goal} onPick={setGoal} />
        </>
      ) : (
        <>
          <label className="tf-label" htmlFor="tf-code">{T.codeLabel}</label>
          <input
            id="tf-code"
            className="tf-field tf-code-input"
            value={code}
            maxLength={6}
            placeholder={T.codePlaceholder}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </>
      )}
      <button className="tf-btn tf-btn-primary" type="submit" disabled={busy || !ready}>
        {mode === 'create' ? T.startCta : T.joinCta}
      </button>
      <p className="tf-error" role="alert">{error}</p>
    </form>
  );
}

function GoalPicker({ value, onPick }: { value: number; onPick: (goal: number) => void }) {
  return (
    <div className="tf-row" role="radiogroup" aria-label={T.goalLabel}>
      {GOAL_PRESETS.map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          className={`tf-chip ${value === g ? 'is-on' : ''}`}
          onClick={() => onPick(g)}
        >
          {T.miles(g)}
        </button>
      ))}
    </div>
  );
}

function Train({ data, act }: { data: Board; act: (reducer: string, args?: unknown[]) => Promise<void> }) {
  const group = data.group!;
  const me = data.me!;
  const today = localDay(new Date());
  const miles = weekMiles(data.groupDays, today);
  const progress = Math.min(1, miles / group.weeklyGoal);
  const arrived = miles >= group.weeklyGoal;
  const members = [...data.members].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) => members.find((m) => m.identity === id)?.name ?? '';
  const hat = conductor(data.groupDays, today, nameOf);

  // A short chug when the group's miles go up while the popup is open.
  const [moving, setMoving] = useState(false);
  const lastMiles = useRef(miles);
  useEffect(() => {
    if (miles > lastMiles.current) {
      setMoving(true);
      const id = window.setTimeout(() => setMoving(false), 1400);
      lastMiles.current = miles;
      return () => window.clearTimeout(id);
    }
    lastMiles.current = miles;
  }, [miles]);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    await navigator.clipboard.writeText(group.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  async function pickGoal(goal: number) {
    setError('');
    try {
      await act('set_goal', [goal]);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <section className="tf-section" aria-labelledby="tf-group-title">
        <div className="tf-group-head">
          <h2 id="tf-group-title" className="tf-group-name">{group.name}</h2>
          <span className="tf-muted tf-small">{T.resetsMonday}</span>
        </div>

        <div
          className={`tf-track ${arrived ? 'is-arrived' : ''}`}
          role="img"
          aria-label={T.progressLabel(miles, group.weeklyGoal)}
        >
          <div className="tf-rail" />
          <div className="tf-station" aria-hidden="true">
            <span>{arrived ? '🎉' : '🚉'}</span>
          </div>
          <div
            className={`tf-train ${moving ? 'is-moving' : ''}`}
            style={{ '--progress': progress } as React.CSSProperties}
            aria-hidden="true"
          >
            {members.map((m) => (
              <span key={m.identity} className={`tf-car ${m.identity === me.identity ? 'is-me' : ''}`} title={m.name}>
                {m.identity === hat && <span className="tf-hat">🎩</span>}
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            <span className="tf-engine" />
          </div>
        </div>

        <p className="tf-progress">
          <strong>{miles}</strong> / {T.miles(group.weeklyGoal)}
          <span className="tf-muted"> {T.thisWeek}</span>
        </p>
        {arrived && <p className="tf-arrived" role="status">{T.arrived(group.weeklyGoal)}</p>}
        <p className="tf-muted">{hat ? T.conductor(nameOf(hat)) : T.noConductor}</p>
        <p className="tf-muted tf-small">{T.onBoard(members.map((m) => (m.identity === me.identity ? T.you(m.name) : m.name)))}</p>
      </section>

      <section className="tf-section">
        <h2>{T.goalLabel}</h2>
        <GoalPicker value={group.weeklyGoal} onPick={(g) => void pickGoal(g)} />
      </section>

      <section className="tf-section">
        <h2>{T.codeTitle}</h2>
        <div className="tf-row">
          <code className="tf-code">{group.code}</code>
          <button className="tf-btn tf-btn-secondary" type="button" onClick={copy}>
            {copied ? T.copied : T.copy}
          </button>
        </div>
        <p className="tf-muted tf-small">{T.codeNote}</p>
        <p className="tf-error" role="alert">{error}</p>
      </section>
    </>
  );
}

const ACTIVITY_KEYS = ['prompts', 'questions', 'answers', 'miles'] as const;

/** Your own counts (prompts and questions are never shown to the group). */
function MyActivity({ rows }: { rows: Activity[] }) {
  const today = localDay(new Date());
  const sum = (from: number) => {
    const out = { prompts: 0, questions: 0, answers: 0, miles: 0 };
    for (const r of rows) if (r.day >= from && r.day <= today) for (const k of ACTIVITY_KEYS) out[k] += r[k];
    return out;
  };
  const day = sum(today);
  const week = sum(today - 6);
  return (
    <section className="tf-section" aria-labelledby="tf-activity-title">
      <h2 id="tf-activity-title">{T.activityTitle}</h2>
      <table className="tf-activity">
        <thead>
          <tr>
            <th />
            <th scope="col">{T.today}</th>
            <th scope="col">{T.last7}</th>
          </tr>
        </thead>
        <tbody>
          {ACTIVITY_KEYS.map((k) => (
            <tr key={k}>
              <th scope="row">{T.activity[k]}</th>
              <td>{day[k]}</td>
              <td>{week[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
