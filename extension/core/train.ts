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

/** The train drawing is 52 wide; its nose is at x=52. */
const TRAIN_W = 52;
/** Horizontal room the train may use (the card's padding included), so it never hangs off. */
const MIN_X = -8;
const MAX_X = 296;

/**
 * SVG transform that puts the train with its nose at distance `s`. The train
 * always stays level and faces the way it is heading: right along the top row
 * and down the right-hand curve, left along the middle row and down the
 * left-hand curve, right again on the bottom row. Facing the way it came
 * through each curve keeps its body over the track; right after it turns
 * around at the start of a row, it is nudged along so it never hangs past the
 * card's edge.
 */
export function trainTransform(s: number): string {
  let x: number;
  let y: number;
  let right: boolean;
  if (s <= L1) {
    [x, y, right] = [16 + s, 20, true];
  } else if (s <= L1 + ARC) {
    const t = (s - L1) / R; // 0..π, clockwise down the right-hand curve
    [x, y, right] = [258 + R * Math.sin(t), 45 - R * Math.cos(t), true];
  } else if (s <= L1 + ARC + L2) {
    [x, y, right] = [258 - (s - L1 - ARC), 70, false];
  } else if (s <= L1 + 2 * ARC + L2) {
    const t = (s - L1 - ARC - L2) / R; // 0..π, counterclockwise down the left-hand curve
    [x, y, right] = [30 - R * Math.sin(t), 95 - R * Math.cos(t), false];
  } else {
    [x, y, right] = [30 + (s - (L1 + 2 * ARC + L2)), 120, true];
  }
  x = right ? Math.max(x, MIN_X + TRAIN_W) : Math.min(x, MAX_X - TRAIN_W);
  const at = `translate(${x.toFixed(2)},${y.toFixed(2)}) `;
  // Mirrored (not rotated) to face left, so the nose stays at the anchor point.
  return right ? `${at}translate(-52,-20)` : `${at}scale(-1,1) translate(-52,-20)`;
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
