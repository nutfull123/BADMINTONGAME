import { describe, expect, it } from 'vitest';
import type { ShuttleState } from '../types';
import { COURT, isInCourt, isInServiceBox, isInSingles, predictLanding, serviceBox, stepShuttle } from './index';

const speed = (s: ShuttleState) => Math.hypot(s.vel.x, s.vel.y, s.vel.z);
const v = (x: number, y: number, z: number) => ({ x, y, z });

function fly(s: ShuttleState, maxT = 10, dt = 1 / 120) {
  for (let t = 0; t < maxT; t += dt) {
    const r = stepShuttle(s, dt);
    s = r.state;
    if (r.event.kind !== 'none') return { s, event: r.event };
  }
  return { s, event: { kind: 'none' as const } };
}

describe('flight', () => {
  it('speed approaches 6.8 m/s falling from rest', () => {
    let s: ShuttleState = { pos: v(0, 500, 3), vel: v(0, 0, 0) };
    for (let i = 0; i < 120 * 5; i++) s = stepShuttle(s, 1 / 120).state;
    expect(speed(s)).toBeGreaterThan(6.7);
    expect(speed(s)).toBeLessThan(6.9);
  });
  it('an 80 m/s smash is below 40 m/s after 0.3 s', () => {
    let s: ShuttleState = { pos: v(0, 3, 3), vel: v(0, 0, -80) };
    for (let i = 0; i < 36; i++) s = stepShuttle(s, 1 / 120).state;
    expect(speed(s)).toBeLessThan(40);
  });
  // 25 m/s only reaches z ~ -2 with vt = 6.8 (checked with a 1e-5 s reference); 50 m/s is a real clear.
  it('a 50 m/s 50-degree clear from z = 6 lands at z < -4', () => {
    const a = (50 * Math.PI) / 180;
    const { s, event } = fly({ pos: v(0, 2.5, 6), vel: v(0, 50 * Math.sin(a), -50 * Math.cos(a)) });
    expect(event.kind).toBe('floor');
    expect(s.pos.z).toBeLessThan(-4);
  });
});

describe('net and floor', () => {
  it('a low shot hits the net', () => {
    expect(fly({ pos: v(0, 1, 3), vel: v(0, 2, -12) }).event.kind).toBe('net');
  });
  it('passes over the net and outside the posts', () => {
    expect(fly({ pos: v(0, 3, 3), vel: v(0, 0, -10) }).event.kind).toBe('floor');
    expect(fly({ pos: v(3.5, 1, 3), vel: v(0, 0, -10) }).event.kind).toBe('floor');
  });
  it('floor contact is interpolated inside the substep', () => {
    const r = stepShuttle({ pos: v(1, 0.01, 2), vel: v(0, -6, -3) }, 1 / 60);
    expect(r.event.kind).toBe('floor');
    if (r.event.kind === 'floor') {
      expect(r.event.at.y).toBeCloseTo(0, 6);
      expect(r.event.at.z).toBeLessThan(2);
      expect(r.event.at.z).toBeGreaterThan(1.99);
    }
  });
});

describe('predictLanding', () => {
  it('matches the simulated floor point within 1 cm', () => {
    const start: ShuttleState = { pos: v(0.5, 2.2, 5), vel: v(1, 12, -14) };
    const p = predictLanding(start)!;
    const { event } = fly(start, 10, 1 / 60);
    expect(event.kind).toBe('floor');
    if (event.kind === 'floor') {
      expect(Math.hypot(p.x - event.at.x, p.z - event.at.z)).toBeLessThan(0.01);
    }
  });
  it('is null when the shuttle hits the net', () => {
    expect(predictLanding({ pos: v(0, 1, 3), vel: v(0, 2, -12) })).toBeNull();
  });
});

describe('court', () => {
  it('singles: lines are in, per side', () => {
    expect(isInSingles(v(2.59, 0, 6.7), 'near')).toBe(true);
    expect(isInSingles(v(-2.59, 0, -6.7), 'far')).toBe(true);
    expect(isInSingles(v(2.6, 0, 3), 'near')).toBe(false);
    expect(isInSingles(v(0, 0, 6.71), 'near')).toBe(false);
    expect(isInSingles(v(0, 0, -3), 'near')).toBe(false);
    expect(isInSingles(v(0, 0, 3), 'far')).toBe(false);
  });
  it('service box, near receiver: right is +x', () => {
    expect(isInServiceBox(v(1, 0, 4), 'near', 'right')).toBe(true);
    expect(isInServiceBox(v(-1, 0, 4), 'near', 'right')).toBe(false);
    expect(isInServiceBox(v(-1, 0, 4), 'near', 'left')).toBe(true);
    expect(isInServiceBox(v(1, 0, 4), 'near', 'left')).toBe(false);
    expect(isInServiceBox(v(1, 0, 1.97), 'near', 'right')).toBe(false);
    expect(isInServiceBox(v(1, 0, 1.98), 'near', 'right')).toBe(true);
    expect(isInServiceBox(v(1, 0, -4), 'near', 'right')).toBe(false);
  });
  it('service box, far receiver: right is -x', () => {
    expect(isInServiceBox(v(-1, 0, -4), 'far', 'right')).toBe(true);
    expect(isInServiceBox(v(1, 0, -4), 'far', 'right')).toBe(false);
    expect(isInServiceBox(v(1, 0, -4), 'far', 'left')).toBe(true);
    expect(isInServiceBox(v(-1, 0, -4), 'far', 'left')).toBe(false);
    expect(isInServiceBox(v(-1, 0, -1.97), 'far', 'right')).toBe(false);
    expect(isInServiceBox(v(-1, 0, -6.71), 'far', 'right')).toBe(false);
    expect(COURT.shortServiceLine).toBe(1.98);
  });
});

describe('doubles court', () => {
  it('rally court is the full doubles width; serve box is wider but ends at the doubles long service line', () => {
    expect(isInCourt({ x: 2.9, y: 0, z: -4 }, 'far', true)).toBe(true);
    expect(isInCourt({ x: 2.9, y: 0, z: -4 }, 'far', false)).toBe(false);
    expect(isInCourt({ x: 0, y: 0, z: 6.5 }, 'near', true)).toBe(true);
    // serve: 6.3 m deep is in for singles, out (long) for doubles; 2.9 m wide is out for singles, in for doubles
    expect(isInServiceBox({ x: -1, y: 0, z: -6.3 }, 'far', 'right', false)).toBe(true);
    expect(isInServiceBox({ x: -1, y: 0, z: -6.3 }, 'far', 'right', true)).toBe(false);
    expect(isInServiceBox({ x: -2.9, y: 0, z: -4 }, 'far', 'right', true)).toBe(true);
    expect(isInServiceBox({ x: -2.9, y: 0, z: -4 }, 'far', 'right', false)).toBe(false);
    const b = serviceBox('near', 'left', true);
    expect([b.xMin, b.xMax, b.zMin, b.zMax]).toEqual([-3.05, 0, 1.98, 5.94]);
  });
});
