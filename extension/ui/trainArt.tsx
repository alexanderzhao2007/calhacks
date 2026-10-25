// SVG pieces of the train popup, drawn to the "tot popup" design. Colors come
// from CSS variables in train.css (light and dark), so nothing here hardcodes
// a theme except the brand gold and each person's bulb color.

import { STOPS, TRACK_PATH, trainTransform } from '../core/train';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <rect className="lg-tile" width="128" height="128" rx="30" strokeWidth="4" />
      <circle cx="64" cy="54" r="30" fill="#F2B300" />
      <rect className="lg-base" x="52" y="89" width="24" height="8" rx="3" />
      <rect className="lg-base" x="56" y="101" width="16" height="6" rx="3" />
    </svg>
  );
}

/** The locomotive, 52×20 with its nose at x=52, wheels on y=20. */
export function Engine({ puffs }: { puffs?: React.ReactNode }) {
  return (
    <>
      {puffs}
      <rect className="e-dark" x="2" y="-6" width="20" height="3.5" rx="1.75" />
      <rect className="e-body" x="4" y="-3" width="15" height="20" rx="3" />
      <rect className="e-detail" x="7.5" y="0" width="8" height="6.5" rx="1.5" />
      <rect className="e-body" x="17" y="5" width="30" height="12" rx="5" />
      <rect className="e-detail" x="28" y="5" width="1.5" height="12" opacity="0.3" />
      <rect className="e-body" x="36" y="-2" width="6" height="8" rx="1.5" />
      <rect className="e-dark" x="34.5" y="-4.5" width="9" height="3" rx="1.5" />
      <circle className="e-detail" cx="45.5" cy="9.5" r="2.4" />
      <path className="e-body" d="M 46 13 L 52 19 L 46 19 Z" />
      {[12, 25, 38].map((x) => (
        <g key={x}>
          <circle className="e-wheel" cx={x} cy="20" r="4.5" strokeWidth="1.5" />
          <circle className="e-hub" cx={x} cy="20" r="1.4" />
        </g>
      ))}
    </>
  );
}

/** Steam puffs from the chimney. `className` picks the timing (idle, fast, arrival). */
export function Puffs({ classes }: { classes: string[] }) {
  return (
    <>
      {classes.map((c, i) => (
        <circle key={i} className={`e-steam ${c}`} cx="39" cy="-9" r={i === classes.length - 1 ? 3.5 : 3} />
      ))}
    </>
  );
}

function Station({ lamp }: { lamp?: React.ReactNode }) {
  return (
    <g>
      <rect className="s-base" x="238" y="122" width="48" height="6" rx="2" />
      <rect className="s-post" x="243" y="93" width="2.5" height="29" rx="1" />
      <rect className="s-post" x="278.5" y="93" width="2.5" height="29" rx="1" />
      <rect className="s-roof" x="238" y="86" width="48" height="8" rx="4" />
      <rect className="s-roof" x="261" y="94" width="1.5" height="5" />
      <circle className="s-lamp" cx="261.75" cy="103" r="4.5" strokeWidth="1.5" />
      {lamp}
    </g>
  );
}

/** The S-shaped track. `s` is the train's distance along it (see core/train.ts). */
export function Track({
  s,
  label,
  arrival = false,
  showTrail = true,
}: {
  s: number;
  label: string;
  /** The weekly arrival: train pulls in, lamp flickers on, rays pop. */
  arrival?: boolean;
  /** Home shows an empty track: no gold trail. */
  showTrail?: boolean;
}) {
  const lit = (stop: number) => (arrival || s >= stop ? 'is-lit' : '');
  return (
    <svg className="tr-svg" width="288" height="150" viewBox="0 0 288 150" role="img" aria-label={label}>
      <g transform="translate(0,12)">
        <path className="tr-rail" d={TRACK_PATH} />
        {arrival ? (
          <>
            <path className="tr-trail" d="M 16 20 L 258 20 A 25 25 0 0 1 258 70 L 30 70 A 25 25 0 0 0 30 120" />
            <path className="tr-trail arr-trail" d="M 30 120 L 228 120" />
          </>
        ) : (
          showTrail && <path className="tr-trail" d={TRACK_PATH} strokeDasharray={`${s.toFixed(1)} 2000`} />
        )}
        <circle className={`tr-stop ${lit(STOPS[0])}`} cx="283" cy="45" r="5" strokeWidth="2" />
        <circle className={`tr-stop ${lit(STOPS[1])}`} cx="5" cy="95" r="5" strokeWidth="2" />
        <Station
          lamp={
            arrival && (
              <>
                <circle className="arr-lamp" cx="261.75" cy="103" r="5" fill="#F2B300" />
                <g className="arr-rays">
                  <path
                    d="M 252 103 L 249 103 M 271.5 103 L 274.5 103 M 254.5 110 L 252.5 112 M 269 110 L 271 112 M 261.75 111.5 L 261.75 114.5"
                    fill="none"
                    stroke="#F2B300"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </g>
              </>
            )
          }
        />
        {arrival ? (
          <g transform="translate(176,100)">
            <g className="arr-train">
              <Engine puffs={<Puffs classes={['arr-puff d1', 'arr-puff d2', 'arr-puff d3', 'arr-puff d4']} />} />
            </g>
          </g>
        ) : (
          <g transform={trainTransform(s)} className="tr-train">
            <Engine />
          </g>
        )}
      </g>
    </svg>
  );
}

/** A person's bulb: initials on the glass, base in their color, optional hat. */
export function Bulb({
  initials,
  color,
  lit,
  hat = false,
  size = 40,
  popClass,
}: {
  initials: string;
  color: string;
  lit: boolean;
  hat?: boolean;
  size?: number;
  /** Arrival: an extra gold glass that pops on with this class. */
  popClass?: string;
}) {
  return (
    <svg width={size} height={(size * 52) / 40} viewBox="0 0 40 52" aria-hidden="true">
      <circle className={`b-glass ${lit ? 'is-lit' : ''}`} cx="20" cy="24" r="14" strokeWidth="1" />
      {popClass && <circle className={`b-pop ${popClass}`} cx="20" cy="24" r="14" fill="#F2B300" />}
      {hat && (
        <>
          <rect className="b-hat" x="14" y="0" width="12" height="8.5" rx="1.5" />
          <rect className="b-hat" x="9" y="7.5" width="22" height="3" rx="1.5" />
        </>
      )}
      <text
        className={`b-ink ${lit || popClass ? 'is-lit' : ''}`}
        x="20"
        y="28.5"
        textAnchor="middle"
        fontFamily="Figtree, system-ui, sans-serif"
        fontWeight="600"
        fontSize="12"
      >
        {initials}
      </text>
      {/* style, not the fill attribute, so CSS variables work too */}
      <rect x="12" y="40" width="16" height="5" rx="2" style={{ fill: color }} />
      <rect x="15" y="47" width="10" height="4" rx="2" style={{ fill: color }} />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

export function ReplayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </svg>
  );
}
