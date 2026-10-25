// Pure helpers for the train popup: the S-shaped track, initials, and who wears
// the hat. Geometry follows the design's 288×150 track drawing (the "tot popup"
// design artifact): two straights joined by half circles of radius 25.

export const BULB_COLORS = [
  { label: 'Teal', hex: '#1D9E75' },
  { label: 'Green', hex: '#639922' },
  { label: 'Blue', hex: '#378ADD' },
  { label: 'Purple', hex: '#7F77DD' },
  { label: 'Pink', hex: '#D4537E' },
  { label: 'Coral', hex: '#D85A30' },
  { label: 'Brick', hex: '#A32D2D' },
  { label: 'Plum', hex: '#6E2E73' },
] as const;
export const DEFAULT_COLOR = BULB_COLORS[0].hex;

/** The track's SVG path (drawn inside a translate(0,12) group). */
export const TRACK_PATH = 'M 16 20 L 258 20 A 25 25 0 0 1 258 70 L 30 70 A 25 25 0 0 0 30 120 L 228 120';

const R = 25;
const L1 = 242; // top row
const ARC = Math.PI * R;
const L2 = 228; // middle row
const L3 = 198; // bottom row, ends at the station
export const TRACK_LENGTH = L1 + ARC + L2 + ARC + L3;
/** Where the train parks at the start of the week, so it sits fully on the track. */
export const TRACK_START = 36;
/** Distance along the track of the two stops (the middle of each curve). */
export const STOPS = [L1 + ARC / 2, L1 + ARC + L2 + ARC / 2] as const;

/** Distance along the track for this week's miles. */
export function trackPos(miles: number, goal: number): number {
  const progress = goal > 0 ? Math.min(1, Math.max(0, miles / goal)) : 0;
  return TRACK_START + (TRACK_LENGTH - TRACK_START) * progress;
}

/** Miles to show while the train is at `s` (counts up as it glides). */
export function milesAt(s: number, goal: number): number {
  const progress = (s - TRACK_START) / (TRACK_LENGTH - TRACK_START);
  return Math.round(Math.max(0, Math.min(goal, progress * goal)));
}

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * SVG transform that puts the 52×20 train drawing with its nose at distance
 * `s`. It tilts on the curves and faces left on the middle row, mirrored rather
 * than rotated so it is never upside down.
 */
export function trainTransform(s: number): string {
  let x: number;
  let y: number;
  let angle: number;
  if (s <= L1) {
    [x, y, angle] = [16 + s, 20, 0];
  } else if (s <= L1 + ARC) {
    const a = -Math.PI / 2 + (s - L1) / R;
    [x, y, angle] = [258 + R * Math.cos(a), 45 + R * Math.sin(a), deg(a) + 90];
  } else if (s <= L1 + ARC + L2) {
    [x, y, angle] = [258 - (s - L1 - ARC), 70, 180];
  } else if (s <= L1 + 2 * ARC + L2) {
    const b = 1.5 * Math.PI - (s - L1 - ARC - L2) / R;
    [x, y, angle] = [30 + R * Math.cos(b), 95 + R * Math.sin(b), deg(b) - 90];
  } else {
    [x, y, angle] = [30 + (s - (L1 + 2 * ARC + L2)), 120, 0];
  }
  const at = `translate(${x.toFixed(2)},${y.toFixed(2)}) `;
  if (angle <= 90) return `${at}rotate(${angle.toFixed(2)}) translate(-52,-20)`;
  return `${at}scale(-1,1) rotate(${(180 - angle).toFixed(2)}) translate(-52,-20)`;
}

/** "Kim Park" → KP; one word → its first two letters. */
export function initials(first: string, last: string): string {
  const f = first.trim();
  const l = last.trim();
  if (f && l) return (f.charAt(0) + l.charAt(0)).toUpperCase();
  return f.slice(0, 2).toUpperCase();
}

/** Initials from a display name alone ("Maya R." → MR), for people without a saved character. */
export function initialsFromName(name: string): string {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return initials(first, rest.join(' '));
}

/**
 * Index of the person with the most miles (strictly more than 0). `miles` is in
 * join order, so a tie goes to the earlier joiner. -1 when nobody has any.
 */
export function leader(miles: readonly number[]): number {
  let best = -1;
  let most = 0;
  miles.forEach((m, i) => {
    if (m > most) [best, most] = [i, m];
  });
  return best;
}

/** Where a tapped bulb's bubble sits, so edge bulbs don't push it out of the popup. */
export function bubbleSide(index: number, count: number): 'left' | 'right' | 'center' {
  if (index === 0 && count > 1) return 'left';
  if (index === count - 1 && count > 1) return 'right';
  return 'center';
}
