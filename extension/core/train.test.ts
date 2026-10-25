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
    expect(trainTransform(100)).toBe('translate(116.00,20.00) rotate(0.00) translate(-52,-20)');
    expect(trainTransform(TRACK_LENGTH)).toBe('translate(228.00,120.00) rotate(0.00) translate(-52,-20)');
  });
  it('mirrors (never flips upside down) on the middle row', () => {
    expect(trainTransform(STOPS[0] + 100)).toContain('scale(-1,1) rotate(0.00)');
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
