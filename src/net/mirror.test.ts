import { describe, expect, it } from 'vitest';
import { FORMAT_3X15, awardRally, createMatch } from '../rules';
import { createPlayer, stepPlayer } from '../sim';
import type { Intent, ShuttleState, Stats } from '../types';
import { isMirrored, mirrorIntent, mirrorMatch, mirrorPlayer, mirrorShuttle, seatSide, seatSlot } from './mirror';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const idle = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0.4, y: 0.2 }, racketVel: { x: 1, y: 2 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});

describe('mirror', () => {
  it('maps seats to sides and slots', () => {
    expect(([0, 1, 2, 3] as const).map(seatSide)).toEqual(['near', 'far', 'near', 'far']);
    expect(([0, 1, 2, 3] as const).map(seatSlot)).toEqual([0, 0, 1, 1]);
    expect(isMirrored(1)).toBe(true);
    expect(isMirrored(2)).toBe(false);
  });

  it('round-trips players and shuttle', () => {
    const p = { ...createPlayer(stats, 'far', { x: 1.2, y: 0.3, z: -3.5 }), vel: { x: 2, y: 0, z: -1 }, facing: 0.4 };
    const m = mirrorPlayer(p);
    expect(m.side).toBe('near');
    expect(m.pos).toEqual({ x: -1.2, y: 0.3, z: 3.5 });
    expect(m.vel).toEqual({ x: -2, y: 0, z: 1 });
    expect(m.facing).toBeCloseTo(-0.4);
    expect(mirrorPlayer(m)).toEqual(p);
    const s: ShuttleState = { pos: { x: 1, y: 2, z: -3 }, vel: { x: -4, y: 5, z: 6 } };
    expect(mirrorShuttle(mirrorShuttle(s))).toEqual(s);
    expect(mirrorShuttle(s).vel).toEqual({ x: 4, y: 5, z: -6 });
  });

  it('a mirrored far player moves like its near twin given the mirrored intent', () => {
    const far = createPlayer(stats, 'far', { x: 1, y: 0, z: -3.5 });
    const shuttle: ShuttleState = { pos: { x: 0, y: 3, z: -2 }, vel: { x: 0, y: 0, z: 0 } };
    const intent: Intent = { ...idle(), move: { x: 0.6, z: -0.8 } };
    let a = far;
    let b = mirrorPlayer(far);
    for (let i = 0; i < 60; i++) {
      a = stepPlayer(a, intent, shuttle, 1 / 120, 0.5).player;
      b = stepPlayer(b, mirrorIntent(intent), mirrorShuttle(shuttle), 1 / 120, 0.5).player;
    }
    expect(b.pos.x).toBeCloseTo(-a.pos.x, 6);
    expect(b.pos.z).toBeCloseTo(-a.pos.z, 6);
    expect(b.racketHead.x).toBeCloseTo(-a.racketHead.x, 6);
    expect(b.racketHead.z).toBeCloseTo(-a.racketHead.z, 6);
    expect(b.facing).toBeCloseTo(-a.facing, 6);
  });

  it('round-trips an intent and keeps the player-relative parts', () => {
    const i: Intent = { ...idle(), move: { x: 0.3, z: -1 } };
    const m = mirrorIntent(i);
    expect(m.move).toEqual({ x: -0.3, z: 1 });
    expect(m.racket).toEqual(i.racket);
    expect(mirrorIntent(m)).toEqual(i);
  });

  it('swaps the score for the scoreboard and round-trips', () => {
    let m = createMatch(FORMAT_3X15, 'near', false);
    m = awardRally(awardRally(m, 'near'), 'far');
    m = awardRally(m, 'near');
    const v = mirrorMatch(m);
    expect(v.score).toEqual({ near: m.score.far, far: m.score.near });
    expect(v.server).toBe(m.server === 'near' ? 'far' : 'near');
    expect(mirrorMatch(v)).toEqual(m);
  });
});
