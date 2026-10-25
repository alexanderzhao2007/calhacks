// Social train popup, to the "tot popup" design. One shared train per group:
// every answer to tot's question earns miles that move it toward the weekly
// goal, and it resets every Monday. Or ride solo with your own goal.
//
// Flow: Home → About you → (Start your train → Invite | Climb aboard | Solo
// goal) → Train → Arrival once a week. Shows only you and your group (enforced
// by the module's views); skips are never counted.

import { useCallback, useEffect, useRef, useState } from 'react';
import { callReducer, createIdentity, FriendsError, loadBoard, type Board } from '../core/friendsApi';
import { isEnabled, openWelcome, ENABLED_KEY } from '../core/consent';
import { localDay, streak, TOKEN_KEY, weekMiles, weekStart } from '../core/social';
import {
  BULB_COLORS,
  bubbleSide,
  DEFAULT_COLOR,
  initials,
  initialsFromName,
  leader,
  milesAt,
  TRACK_LENGTH,
  TRACK_START,
  trackPos,
} from '../core/train';
import { COPY } from './copy';
import { BackIcon, Bulb, CalendarIcon, CopyIcon, Engine, Logo, MenuIcon, Puffs, ReplayIcon, Track } from './trainArt';

const T = COPY.train;
const POLL_MS = 3000;
const GROUP_GOALS = [50, 100, 200];
const SOLO_GOALS = [30, 50, 100];
const ARRIVALS_KEY = 'totArrivalsSeen';

type Screen = 'home' | 'about' | 'group' | 'solo' | 'goal' | 'invite' | 'join' | 'train' | 'arrival';
type Motion = 'go-fwd' | 'go-back' | 'go-fade';
/** Why About you was opened, which decides where Continue goes. */
type Intent = 'start' | 'join' | 'solo' | 'bring' | 'edit';
type Draft = { first: string; last: string; color: string };

export type Rider = {
  key: string;
  name: string;
  initials: string;
  color: string;
  today: number;
  week: number;
  isMe: boolean;
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function errorText(e: unknown): string {
  return e instanceof FriendsError && e.message ? e.message : T.genericError;
}

async function storedToken(): Promise<string | undefined> {
  const { [TOKEN_KEY]: token } = (await browser.storage.local.get(TOKEN_KEY)) as Record<string, string | undefined>;
  return token;
}

/** Everyone on the train in join order (solo: just you), with today's and this week's miles. */
function ridersOf(data: Board, today: number): Rider[] {
  const monday = weekStart(today);
  const sum = (rows: { day: number; miles: number }[], from: number) =>
    rows.reduce((t, r) => (r.day >= from && r.day <= today ? t + r.miles : t), 0);
  const me = data.me!;
  if (!data.group) {
    const look = data.look;
    return [
      {
        key: me.identity,
        name: T.you,
        initials: look ? initials(look.firstName, look.lastName) : initialsFromName(me.name),
        color: look?.color || DEFAULT_COLOR,
        today: sum(data.mine, today),
        week: sum(data.mine, monday),
        isMe: true,
      },
    ];
  }
  const lookOf = new Map(data.looks.map((l) => [l.identity, l]));
  return [...data.members]
    .sort((a, b) => {
      const ja = lookOf.get(a.identity)?.joinedMicros ?? 0;
      const jb = lookOf.get(b.identity)?.joinedMicros ?? 0;
      return ja - jb || a.name.localeCompare(b.name);
    })
    .map((m) => {
      const look = lookOf.get(m.identity);
      const days = data.groupDays.filter((d) => d.owner === m.identity);
      return {
        key: m.identity,
        name: m.name,
        initials: look?.firstName ? initials(look.firstName, look.lastName) : initialsFromName(m.name),
        color: look?.color || DEFAULT_COLOR,
        today: sum(days, today),
        week: sum(days, monday),
        isMe: m.identity === me.identity,
      };
    });
}

export function TrainPopup() {
  // undefined: still reading storage; null: never joined (nothing stored).
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [motion, setMotion] = useState<Motion>('go-fade');
  const [intent, setIntent] = useState<Intent>('start');
  const [draft, setDraft] = useState<Draft>({ first: '', last: '', color: DEFAULT_COLOR });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void storedToken().then((t) => setToken(t ?? null));
    void isEnabled().then(setEnabledState);
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ENABLED_KEY in changes) void isEnabled().then(setEnabledState);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  const refresh = useCallback(async (tok: string) => {
    try {
      const board = await loadBoard(tok);
      setData(board);
      setOffline(false);
      return board;
    } catch {
      setOffline(true);
      return null;
    }
  }, []);

  // Poll while the popup is open; the board is small and the popup short-lived.
  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const id = window.setInterval(() => void refresh(token), POLL_MS);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  const go = useCallback((next: Screen, how: Motion = 'go-fwd') => {
    setMotion(how);
    setScreen(next);
    setMenuOpen(false);
  }, []);

  // First screen: your train if you're on one, otherwise Home. Back to Home if
  // the train goes away underneath you (left or deleted on another browser).
  const riding = Boolean(data?.me && (data.group || data.soloGoal !== null));
  useEffect(() => {
    if (screen === null) {
      if (token === null) go('home', 'go-fade');
      else if (data) go(riding ? 'train' : 'home', 'go-fade');
    } else if ((screen === 'train' || screen === 'arrival') && data && !riding) {
      go('home', 'go-fade');
    }
  }, [screen, token, data, riding, go]);

  /** Open About you, prefilled from your saved character. */
  function openAbout(why: Intent) {
    setIntent(why);
    const look = data?.look;
    if (look?.firstName) setDraft({ first: look.firstName, last: look.lastName, color: look.color || DEFAULT_COLOR });
    else if (data?.me) {
      const [first = '', ...rest] = data.me.name.split(/\s+/);
      setDraft({ first, last: rest.join(' ').replace(/\.$/, ''), color: DEFAULT_COLOR });
    }
    go('about');
  }

  /**
   * Saves your character (creating your identity the first time) and returns
   * the token. Saving it is the opt-in: only then can anything be recorded.
   */
  async function saveProfile(): Promise<string> {
    const tok = token ?? (await createIdentity());
    await callReducer(tok, 'set_profile', [draft.first, draft.last, draft.color]);
    if (!token) {
      await browser.storage.local.set({ [TOKEN_KEY]: tok });
      setToken(tok);
    }
    return tok;
  }

  const actions = {
    async createGroup(name: string, goal: number) {
      const tok = intent === 'bring' ? token! : await saveProfile();
      await callReducer(tok, 'create_group', [name, goal]);
      await refresh(tok);
      go('invite');
    },
    async join(code: string) {
      const tok = await saveProfile();
      await callReducer(tok, 'join_group', [code]);
      await refresh(tok);
      go('train', 'go-fade');
    },
    async startSolo(goal: number) {
      const tok = await saveProfile();
      await callReducer(tok, 'set_solo_goal', [goal]);
      await refresh(tok);
      go('train', 'go-fade');
    },
    async saveCharacter() {
      const tok = await saveProfile();
      await refresh(tok);
      go('train', 'go-back');
    },
    async setGoal(goal: number) {
      await callReducer(token!, data?.group ? 'set_goal' : 'set_solo_goal', [goal]);
      await refresh(token!);
      go('train', 'go-back');
    },
    async leaveGroup() {
      if (!window.confirm(T.leaveGroupConfirm)) return;
      await callReducer(token!, 'leave_group', []);
      const board = await refresh(token!);
      go(board?.soloGoal != null ? 'train' : 'home', 'go-fade');
    },
    async deleteAll() {
      if (!window.confirm(T.deleteConfirm)) return;
      await callReducer(token!, 'delete_me', []);
      await browser.storage.local.remove(TOKEN_KEY);
      setData(null);
      setToken(null);
      go('home', 'go-fade');
    },
  };

  let body: React.ReactNode;
  if (offline && !data && screen !== 'home') {
    // Checked first: with no data the first screen is never picked.
    body = <Message text={T.offline} />;
  } else if (screen === null || (token && !data)) {
    body = <Message text={T.connecting} />;
  } else if (screen === 'home') {
    body = (
      <Home
        enabled={enabled}
        onStart={() => openAbout('start')}
        onJoin={() => openAbout('join')}
        onSolo={() => openAbout('solo')}
      />
    );
  } else if (screen === 'about') {
    body = (
      <AboutYou
        draft={draft}
        setDraft={setDraft}
        editing={intent === 'edit'}
        onBack={() => go(intent === 'edit' ? 'train' : 'home', 'go-back')}
        onNext={async () => {
          if (intent === 'edit') await actions.saveCharacter();
          else go(intent === 'join' ? 'join' : intent === 'solo' ? 'solo' : 'group');
        }}
      />
    );
  } else if (screen === 'group') {
    body = (
      <GoalScreen
        kind="group"
        onBack={() => (intent === 'bring' ? go('train', 'go-back') : go('about', 'go-back'))}
        onSubmit={(goal, name) => actions.createGroup(name!, goal)}
      />
    );
  } else if (screen === 'solo') {
    body = <GoalScreen kind="solo" onBack={() => go('about', 'go-back')} onSubmit={(goal) => actions.startSolo(goal)} />;
  } else if (screen === 'goal') {
    body = (
      <GoalScreen
        kind={data?.group ? 'editGroup' : 'editSolo'}
        initial={data?.group?.weeklyGoal ?? data?.soloGoal ?? undefined}
        onBack={() => go('train', 'go-back')}
        onSubmit={(goal) => actions.setGoal(goal)}
      />
    );
  } else if (screen === 'invite') {
    body = <Invite code={data?.group?.code ?? ''} onDone={() => go('train', 'go-fade')} />;
  } else if (screen === 'join') {
    body = <Join onBack={() => go('about', 'go-back')} onJoin={actions.join} />;
  } else if (data?.me && riding) {
    body = (
      <TrainView
        data={data}
        screen={screen}
        enabled={enabled}
        go={go}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onBring={() => {
          setIntent('bring');
          go('group');
        }}
        onEdit={() => openAbout('edit')}
        actions={actions}
      />
    );
  } else {
    body = <Message text={T.connecting} />;
  }

  return (
    <main className="tp">
      {/* Keyed by screen so each arrival plays its enter animation. */}
      <div key={screen ?? 'loading'} className={`tp-screen-host ${motion}`}>
        {body}
      </div>
    </main>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="tp-screen">
      <Header />
      <p className="tp-lead">{text}</p>
    </div>
  );
}

function Header({ onBack, title, onMenu }: { onBack?: () => void; title?: string; onMenu?: () => void }) {
  return (
    <header className="tp-head">
      {onBack && (
        <button type="button" className="tp-icon-btn is-back" aria-label={T.back} onClick={onBack}>
          <BackIcon />
        </button>
      )}
      <Logo />
      {title ? <span className="tp-group-name">{title}</span> : <span className="tp-brand">{T.brand}</span>}
      {onMenu && (
        <button type="button" className="tp-icon-btn is-menu" aria-label={T.menu} aria-haspopup="menu" onClick={onMenu}>
          <MenuIcon />
        </button>
      )}
    </header>
  );
}

function OffNotice() {
  return (
    <p className="tp-off">
      {T.totOff}{' '}
      <button type="button" onClick={openWelcome}>
        {T.turnOn}
      </button>
    </p>
  );
}

// ---- Home ---------------------------------------------------------------------

function Home({
  enabled,
  onStart,
  onJoin,
  onSolo,
}: {
  enabled: boolean;
  onStart: () => void;
  onJoin: () => void;
  onSolo: () => void;
}) {
  return (
    <div className="tp-screen is-tight">
      <Header />
      {!enabled && <OffNotice />}
      <div className="tp-track-card is-home">
        <Track s={TRACK_START} label={T.homeTrackLabel} showTrail={false} />
      </div>
      <div className="tp-intro">
        <h1 className="tp-title">{T.homeTitle}</h1>
        <p className="tp-lead">{T.homeLead}</p>
      </div>
      <div className="tp-stack">
        <button type="button" className="tp-btn is-primary" onClick={onStart}>
          {T.startGroup}
        </button>
        <button type="button" className="tp-btn is-secondary" onClick={onJoin}>
          {T.joinGroup}
        </button>
        <button type="button" className="tp-btn is-link" onClick={onSolo}>
          {T.goSolo}
        </button>
      </div>
      <p className="tp-small tp-center">{T.homePrivacy}</p>
    </div>
  );
}

// ---- About you ----------------------------------------------------------------

function AboutYou({
  draft,
  setDraft,
  editing,
  onBack,
  onNext,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: boolean;
  onBack: () => void;
  onNext: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = initials(draft.first, draft.last);
  const colorName = BULB_COLORS.find((c) => c.hex === draft.color)?.label ?? '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.first.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onNext();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="tp-screen" onSubmit={submit}>
      <Header onBack={onBack} />
      <div className="tp-intro">
        <h1 className="tp-title">{T.aboutTitle}</h1>
        <p className="tp-lead">{T.aboutLead}</p>
      </div>
      <div className="tp-preview" role="img" aria-label={T.bulbPreview(mine, colorName)}>
        <Bulb initials={mine} color={draft.color} lit={false} size={64} />
      </div>
      <div className="tp-two">
        <div className="tp-field-wrap">
          <label className="tp-label" htmlFor="tp-first">
            {T.firstName}
          </label>
          <input
            id="tp-first"
            className="tp-field"
            placeholder={T.firstPlaceholder}
            value={draft.first}
            maxLength={20}
            autoComplete="given-name"
            autoFocus
            onChange={(e) => setDraft({ ...draft, first: e.target.value })}
          />
        </div>
        <div className="tp-field-wrap">
          <label className="tp-label" htmlFor="tp-last">
            {T.lastName}
          </label>
          <input
            id="tp-last"
            className="tp-field"
            placeholder={T.lastPlaceholder}
            value={draft.last}
            maxLength={20}
            autoComplete="family-name"
            onChange={(e) => setDraft({ ...draft, last: e.target.value })}
          />
        </div>
      </div>
      <fieldset className="tp-fieldset">
        <legend className="tp-label">{T.bulbColor}</legend>
        <div className="tp-swatches">
          {BULB_COLORS.map((c) => {
            const on = c.hex === draft.color;
            return (
              <button
                key={c.hex}
                type="button"
                className="tp-swatch"
                aria-label={c.label}
                aria-pressed={on}
                onClick={() => setDraft({ ...draft, color: c.hex })}
              >
                <span style={{ background: c.hex }} />
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p className="tp-error" role="alert">
          {error}
        </p>
      )}
      <div className="tp-grow" />
      <button type="submit" className="tp-btn is-primary" disabled={!draft.first.trim() || busy}>
        {editing ? T.save : T.continue}
      </button>
    </form>
  );
}

// ---- Goals (start a group, solo, change goal) ------------------------------------

function GoalScreen({
  kind,
  initial,
  onBack,
  onSubmit,
}: {
  kind: 'group' | 'solo' | 'editGroup' | 'editSolo';
  initial?: number;
  onBack: () => void;
  onSubmit: (goal: number, name?: string) => Promise<void>;
}) {
  const solo = kind === 'solo' || kind === 'editSolo';
  const presets = solo ? SOLO_GOALS : GROUP_GOALS;
  const fallback = solo ? 50 : 100;
  const start = initial ?? fallback;
  const [choice, setChoice] = useState<number | 'other'>(presets.includes(start) ? start : 'other');
  const [other, setOther] = useState(presets.includes(start) ? '' : String(start));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const goal = choice === 'other' ? Number(other) : choice;
  const goalOk = Number.isInteger(goal) && goal >= 10 && goal <= 10000;
  const ready = goalOk && (kind !== 'group' || name.trim().length > 0);
  const [title, lead, cta] =
    kind === 'group'
      ? [T.groupTitle, T.groupLead, T.createGroup]
      : kind === 'solo'
        ? [T.soloTitle, T.soloLead, T.start]
        : [T.goalEditTitle, T.goalEditLead, T.save];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(goal, name);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="tp-screen" onSubmit={submit}>
      <Header onBack={onBack} />
      <div className="tp-intro">
        <h1 className="tp-title">{title}</h1>
        <p className="tp-lead">{lead}</p>
      </div>
      {kind === 'group' && (
        <div className="tp-field-wrap">
          <label className="tp-label" htmlFor="tp-gname">
            {T.groupName}
          </label>
          <input
            id="tp-gname"
            className="tp-field"
            placeholder={T.groupNamePlaceholder}
            value={name}
            maxLength={32}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <fieldset className="tp-fieldset">
        <legend className="tp-label">{T.weeklyGoal}</legend>
        <div className="tp-chips">
          {presets.map((g) => (
            <button key={g} type="button" className="tp-chip" aria-pressed={choice === g} onClick={() => setChoice(g)}>
              {g}
            </button>
          ))}
          <button type="button" className="tp-chip" aria-pressed={choice === 'other'} onClick={() => setChoice('other')}>
            {T.other}
          </button>
        </div>
        {choice === 'other' && (
          <input
            className="tp-field"
            type="number"
            inputMode="numeric"
            min={10}
            max={10000}
            aria-label={T.otherLabel}
            placeholder={T.otherLabel}
            value={other}
            autoFocus
            onChange={(e) => setOther(e.target.value)}
          />
        )}
        <p className="tp-small">{T.goalHint}</p>
      </fieldset>
      {error && (
        <p className="tp-error" role="alert">
          {error}
        </p>
      )}
      <div className="tp-grow" />
      <button type="submit" className="tp-btn is-primary" disabled={!ready || busy}>
        {cta}
      </button>
    </form>
  );
}

// ---- Invite and join ---------------------------------------------------------

function Invite({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="tp-screen">
      <Header />
      <div className="tp-intro">
        <h1 className="tp-title">{T.inviteTitle}</h1>
        <p className="tp-lead">{T.inviteLead}</p>
      </div>
      <div className="tp-code-card">
        <span className="tp-label">{T.groupCode}</span>
        <span className="tp-code">{code}</span>
        <button type="button" className="tp-btn is-secondary is-icon" onClick={() => void copy()}>
          <CopyIcon />
          {copied ? T.copied : T.copyCode}
        </button>
      </div>
      <p className="tp-small">{T.inviteLater}</p>
      <div className="tp-grow" />
      <button type="button" className="tp-btn is-primary" onClick={onDone}>
        {T.toTrain}
      </button>
    </div>
  );
}

function Join({ onBack, onJoin }: { onBack: () => void; onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checking) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError(T.codeLength);
      return;
    }
    setChecking(true);
    setError('');
    try {
      await onJoin(clean);
    } catch (err) {
      setError(errorText(err));
      setChecking(false);
    }
  }

  const puff = checking ? 'idle-puff is-fast' : 'idle-puff';
  return (
    <form className="tp-screen" onSubmit={submit}>
      <Header onBack={onBack} />
      <div className="tp-intro">
        <h1 className="tp-title">{T.joinTitle}</h1>
        <p className="tp-lead">{T.joinLead}</p>
      </div>
      <div className="tp-field-wrap">
        <label className="tp-label" htmlFor="tp-code">
          {T.groupCode}
        </label>
        <input
          id="tp-code"
          className={`tp-field is-code ${error ? 'is-invalid' : ''}`}
          placeholder="K7PM2Q"
          value={code}
          maxLength={6}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'tp-code-err' : undefined}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
        />
        {error && (
          <p id="tp-code-err" className="tp-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="tp-join-art">
        <svg
          width="312"
          height="187"
          viewBox="-30 -50 120 72"
          role="img"
          aria-label={checking ? T.joinCheckingLabel : T.joinIdleLabel}
        >
          <rect className="tp-platform" x="-30" y="22" width="120" height="5" rx="2.5" />
          <Engine puffs={<Puffs classes={[`${puff} p0`, `${puff} p1`, `${puff} p2`]} />} />
        </svg>
      </div>
      <button type="submit" className="tp-btn is-primary" disabled={checking}>
        {checking ? T.checking : T.joinCta}
      </button>
    </form>
  );
}

// ---- Train and arrival ---------------------------------------------------------

type Actions = {
  leaveGroup: () => Promise<void>;
  deleteAll: () => Promise<void>;
};

async function arrivalSeen(key: string): Promise<boolean> {
  const { [ARRIVALS_KEY]: seen = [] } = (await browser.storage.local.get(ARRIVALS_KEY)) as Record<string, string[]>;
  return seen.includes(key);
}

async function markArrivalSeen(key: string): Promise<void> {
  const { [ARRIVALS_KEY]: seen = [] } = (await browser.storage.local.get(ARRIVALS_KEY)) as Record<string, string[]>;
  await browser.storage.local.set({ [ARRIVALS_KEY]: [...seen.filter((k) => k !== key), key].slice(-20) });
}

function TrainView({
  data,
  screen,
  enabled,
  go,
  menuOpen,
  setMenuOpen,
  onBring,
  onEdit,
  actions,
}: {
  data: Board;
  screen: Screen;
  enabled: boolean;
  go: (s: Screen, how?: Motion) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onBring: () => void;
  onEdit: () => void;
  actions: Actions;
}) {
  const today = localDay(new Date());
  const solo = !data.group;
  const riders = ridersOf(data, today);
  const goal = data.group?.weeklyGoal ?? data.soloGoal ?? 50;
  // ridersOf always includes you.
  const me = riders.find((r) => r.isMe)!;
  const miles = solo ? me.week : weekMiles(data.groupDays, today);
  const target = trackPos(miles, goal);
  const myStreak = streak(
    data.mine.filter((d) => d.answers > 0).map((d) => d.day),
    today,
  );
  const arrivalKey = `${data.group ? `g${data.group.id}` : 'solo'}:${weekStart(today)}`;

  // The train glides (~1 s) to its new spot when miles change.
  const [s, setS] = useState(target);
  const sRef = useRef(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reducedMotion()) {
      sRef.current = target;
      setS(target);
      return;
    }
    const step = () => {
      const d = target - sRef.current;
      if (Math.abs(d) < 0.4) {
        sRef.current = target;
        setS(target);
        raf.current = null;
        return;
      }
      sRef.current += d * 0.08 + (d > 0 ? 0.3 : -0.3);
      setS(sRef.current);
      raf.current = requestAnimationFrame(step);
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [target]);

  // "+N miles" over the track when YOU earn miles while the popup is open.
  const [toast, setToast] = useState<{ n: number; id: number } | null>(null);
  const lastToday = useRef(me.today);
  useEffect(() => {
    const gained = me.today - lastToday.current;
    lastToday.current = me.today;
    if (gained > 0) setToast((t) => ({ n: gained, id: (t?.id ?? 0) + 1 }));
  }, [me.today]);

  // Arrival plays once per week, when the train reaches the station.
  const atStation = target >= TRACK_LENGTH - 0.5 && s >= TRACK_LENGTH - 0.5;
  useEffect(() => {
    if (screen !== 'train' || !atStation) return;
    let cancelled = false;
    void arrivalSeen(arrivalKey).then((seen) => {
      if (seen || cancelled) return;
      window.setTimeout(() => {
        if (cancelled) return;
        void markArrivalSeen(arrivalKey);
        go('arrival', 'go-fade');
      }, 500);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, atStation, arrivalKey, go]);

  const title = data.group?.name ?? T.justYou;
  const menu = menuOpen && (
    <TrainMenu
      code={data.group?.code ?? null}
      onArrival={screen === 'arrival'}
      onClose={() => setMenuOpen(false)}
      onShowTrain={() => go('train', 'go-fade')}
      onEdit={onEdit}
      onGoal={() => go('goal')}
      onLeave={() => void actions.leaveGroup().catch(() => {})}
      onDelete={() => void actions.deleteAll().catch(() => {})}
    />
  );

  if (screen === 'arrival') {
    return (
      <>
        <Arrival title={title} goal={goal} riders={riders} solo={solo} onMenu={() => setMenuOpen(true)} />
        {menu}
      </>
    );
  }

  const shown = milesAt(s, goal);
  const hat = solo ? -1 : leader(riders.map((r) => r.today));
  return (
    <>
      <div className="tp-screen is-tight">
        <Header title={title} onMenu={() => setMenuOpen(true)} />
        {!enabled && <OffNotice />}
        <div className="tp-track-card">
          <Track s={s} label={T.trainLabel(miles, goal)} />
          {toast && (
            <div key={toast.id} className="tp-toast" role="status">
              {T.toast(toast.n)}
            </div>
          )}
        </div>
        <div className="tp-miles">
          <div className="tp-miles-big">
            <span className="tp-miles-num">{shown}</span>
            <span className="tp-miles-goal">{T.milesThisWeek(goal)}</span>
          </div>
          <span className="tp-miles-left">{T.toGo(Math.max(0, goal - miles))}</span>
        </div>
        <Bulbs riders={riders} hat={hat} solo={solo} />
        <div className="tp-grow" />
        {solo && (
          <button type="button" className="tp-btn is-secondary" onClick={onBring}>
            {T.bringFriends}
          </button>
        )}
        <div className="tp-you">
          <strong>{T.you}</strong>
          <span>{T.youLine(me.today, myStreak)}</span>
        </div>
      </div>
      {menu}
    </>
  );
}

function Bulbs({ riders, hat, solo }: { riders: Rider[]; hat: number; solo: boolean }) {
  const [tapped, setTapped] = useState<number | null>(null);
  if (solo) {
    const me = riders[0]!;
    return (
      <div className="tp-bulbs is-solo" role="img" aria-label={T.bulbLabel(T.you, false, me.today)}>
        <Bulb initials={me.initials} color={me.color} lit={me.today > 0} size={52} />
      </div>
    );
  }
  return (
    <div className="tp-bulbs">
      {riders.map((r, i) => {
        const name = r.isMe ? T.you : r.name;
        return (
          <div key={r.key} className="tp-bulb">
            {tapped === i && (
              <div className={`tp-bubble is-${bubbleSide(i, riders.length)}`} role="status">
                {`${name} · ${T.milesToday(r.today)}`}
              </div>
            )}
            <button
              type="button"
              className="tp-bulb-btn"
              aria-label={T.bulbLabel(name, i === hat, r.today)}
              aria-expanded={tapped === i}
              onClick={() => setTapped(tapped === i ? null : i)}
            >
              <Bulb initials={r.initials} color={r.color} lit={r.today > 0} hat={i === hat} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TrainMenu({
  code,
  onArrival,
  onClose,
  onShowTrain,
  onEdit,
  onGoal,
  onLeave,
  onDelete,
}: {
  code: string | null;
  onArrival: boolean;
  onClose: () => void;
  onShowTrain: () => void;
  onEdit: () => void;
  onGoal: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <>
      <div className="tp-menu-scrim" onClick={onClose} />
      <div
        className="tp-menu"
        role="menu"
        aria-label={T.menu}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {code && (
          <div className="tp-menu-code">
            <div>
              <span className="tp-label">{T.menuCode}</span>
              <strong>{code}</strong>
            </div>
            <button ref={first} type="button" className="tp-btn is-secondary" role="menuitem" onClick={() => void copy()}>
              {copied ? T.copied : T.copy}
            </button>
          </div>
        )}
        {onArrival && (
          <button type="button" className="tp-menu-item" role="menuitem" onClick={onShowTrain}>
            {T.menuShowTrain}
          </button>
        )}
        <button ref={code ? undefined : first} type="button" className="tp-menu-item" role="menuitem" onClick={onEdit}>
          {T.menuEdit}
        </button>
        <button type="button" className="tp-menu-item" role="menuitem" onClick={onGoal}>
          {T.menuGoal}
        </button>
        {code && (
          <button type="button" className="tp-menu-item" role="menuitem" onClick={onLeave}>
            {T.menuLeaveGroup}
          </button>
        )}
        <button type="button" className="tp-menu-item is-danger" role="menuitem" onClick={onDelete}>
          {T.menuDelete}
        </button>
      </div>
    </>
  );
}

/** The once-a-week arrival timeline (CSS keyframes in train.css). Replay restarts it. */
function Arrival({
  title,
  goal,
  riders,
  solo,
  onMenu,
}: {
  title: string;
  goal: number;
  riders: Rider[];
  solo: boolean;
  onMenu: () => void;
}) {
  const [run, setRun] = useState(0);
  const top = riders[leader(riders.map((r) => r.week))] ?? riders[0]!;
  return (
    <div className="tp-arrival" key={run}>
      <div className="arr-glow" aria-hidden="true" />
      <div className="tp-screen is-arrival">
        <Header title={title} onMenu={onMenu} />
        <div className="tp-track-card is-arrival">
          <Track s={TRACK_LENGTH} label={T.arrivedLabel} arrival />
        </div>
        <div className="arr-text">
          <h1 className="tp-title">{T.arrivedTitle}</h1>
          <p className="tp-lead">{T.arrivedLead(goal)}</p>
        </div>
        <div className="tp-bulbs is-arrival" role="img" aria-label={T.arrivedBulbs(riders.length)}>
          {riders.map((r, i) => (
            <Bulb
              key={r.key}
              initials={r.initials}
              color={r.color}
              lit={false}
              hat={!solo && r === top}
              popClass={`pop-${i}`}
            />
          ))}
        </div>
        <div className={solo ? undefined : 'arr-card-slot'}>
          {!solo && (
            <div className="arr-card">
              <Bulb initials={top.initials} color={top.color} lit hat size={56} />
              <div>
                <span className="tp-label">{T.conductorOfWeek}</span>
                <span className="arr-card-name">{top.isMe ? T.you : top.name}</span>
                <span className="tp-lead">{T.milesThisWeekShort(top.week)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="tp-grow" />
        <div className="arr-monday">
          <div>
            <CalendarIcon />
            <span>{T.newJourney}</span>
          </div>
          <button type="button" className="arr-replay" aria-label={T.replay} onClick={() => setRun((n) => n + 1)}>
            <ReplayIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
