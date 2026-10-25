import { describe, expect, it } from 'vitest';
import {
  bubbleSide,
  initials,
  initialsFromName,
  leader,
  milesAt,
  STOPS,
  TRACK_LENGTH,
  TRACK_START,
  trackPos,
  trainTransform,
} from './train';

describe('trackPos / milesAt', () => {
  it('parks at the start with no miles and at the station at the goal', () => {
    expect(trackPos(0, 100)).toBe(TRACK_START);
    expect(trackPos(100, 100)).toBeCloseTo(TRACK_LENGTH);
    expect(trackPos(500, 100)).toBeCloseTo(TRACK_LENGTH); // never past the station
  });
  it('round-trips miles', () => {
    expect(milesAt(trackPos(37, 100), 100)).toBe(37);
    expect(milesAt(TRACK_START, 100)).toBe(0);
  });
  it('passes the stops in order', () => {
    expect(TRACK_START).toBeLessThan(STOPS[0]);
    expect(STOPS[0]).toBeLessThan(STOPS[1]);
    expect(STOPS[1]).toBeLessThan(TRACK_LENGTH);
  });
});

describe('trainTransform', () => {
  it('faces right on the top row and at the station', () => {
    expect(trainTransform(100)).toBe('translate(116.00,20.00) translate(-52,-20)');
    expect(trainTransform(TRACK_LENGTH)).toBe('translate(228.00,120.00) translate(-52,-20)');
  });
  it('faces left on the middle row', () => {
    expect(trainTransform(STOPS[0] + 100)).toMatch(/scale\(-1,1\) translate\(-52,-20\)$/);
  });
  it('never rotates; faces the way it came through each curve', () => {
    for (let s = TRACK_START; s <= TRACK_LENGTH; s += 3) expect(trainTransform(s)).not.toContain('rotate');
    const mirrored = (s: number) => trainTransform(s).includes('scale(-1,1)');
    expect(mirrored(STOPS[0])).toBe(false); // right-hand curve: still facing right
    expect(mirrored(STOPS[0] + 60)).toBe(true); // middle row
    expect(mirrored(STOPS[1])).toBe(true); // left-hand curve: still facing left
    expect(mirrored(STOPS[1] + 60)).toBe(false); // bottom row
  });
  it('follows the curves', () => {
    expect(trainTransform(STOPS[0])).toMatch(/^translate\(283\.00,45\.00\)/);
    expect(trainTransform(STOPS[1])).toMatch(/^translate\(5\.00,95\.00\)/);
  });
  it('never hangs past the card edge', () => {
    for (let s = TRACK_START; s <= TRACK_LENGTH; s += 1) {
      const t = trainTransform(s);
      const x = Number(t.match(/^translate\(([-\d.]+),/)![1]);
      const [left, right] = t.includes('scale(-1,1)') ? [x, x + 52] : [x - 52, x];
      expect(left).toBeGreaterThanOrEqual(-8);
      expect(right).toBeLessThanOrEqual(296);
    }
  });
});

describe('initials', () => {
  it('uses first + last initial, or two letters of one word', () => {
    expect(initials('kim', 'park')).toBe('KP');
    expect(initials('Theo', '')).toBe('TH');
    expect(initialsFromName('Maya R.')).toBe('MR');
    expect(initialsFromName('Old Timer')).toBe('OT');
  });
});

describe('leader', () => {
  it('picks the most miles; ties go to the earlier joiner', () => {
    expect(leader([10, 34, 34, 0])).toBe(1);
  });
  it('is nobody until someone has miles', () => {
    expect(leader([0, 0])).toBe(-1);
    expect(leader([])).toBe(-1);
  });
});

describe('bubbleSide', () => {
  it('anchors edge bulbs inward', () => {
    expect(bubbleSide(0, 5)).toBe('left');
    expect(bubbleSide(4, 5)).toBe('right');
    expect(bubbleSide(2, 5)).toBe('center');
    expect(bubbleSide(0, 1)).toBe('center');
  });
});
