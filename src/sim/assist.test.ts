import { describe, it, expect } from 'vitest';
import { aimReach, aimView, applyAssist, autoRacket, moveToward, racketFromAim, racketInputFor, reachCentre } from './assist';
import { createPlayer, racketHeadFor, stepPlayer } from './index';
import { predictLanding, stepShuttle } from '../physics';
import type { Intent, ShuttleState, Stats } from '../types';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const intent = (o: Partial<Intent> = {}): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0.7, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false, ...o,
});
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// a clear coming from the far end, landing in the near half
const incoming: ShuttleState = { pos: { x: 0.5, y: 2.6, z: -2 }, vel: { x: 0.5, y: 4, z: 14 } };

describe('aimView', () => {
  it('reports forehand/backhand from the racket side, for both players', () => {
    for (const side of ['near', 'far'] as const) {
      const p = createPlayer(stats, side, { x: 0, y: 0, z: side === 'near' ? 3.5 : -3.5 });
      expect(aimView({ ...p, racketHead: racketHeadFor(p, 0.8, 0, false, false) }, incoming, 0).side).toBe('forehand');
      expect(aimView({ ...p, racketHead: racketHeadFor(p, -0.8, 0, false, false) }, incoming, 0).side).toBe('backhand');
    }
  });

  it('marks the live shuttle while it heads toward the player, and onTarget when the racket can reach it now', () => {
    const p = createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });
    const away = aimView(p, { ...incoming, vel: { ...incoming.vel, z: -14 } }, 0.7); // the player's own shot leaving
    expect(away.target).toBeNull();
    expect(away.onTarget).toBe(false);
    expect(aimView(p, { pos: incoming.pos, vel: { x: 0, y: 0, z: 0 } }, 0.7).target).toBeNull(); // held for a serve
    expect(aimView(p, incoming, 0.7).target).toEqual(incoming.pos); // where the shuttle is right now
    expect(aimView(p, incoming, 0.7).onTarget).toBe(false); // still across the net
    const atRacket: ShuttleState = { pos: { ...p.racketHead, y: p.racketHead.y + 0.2 }, vel: { x: 0, y: -2, z: 3 } };
    expect(aimView(p, atRacket, 0).onTarget).toBe(true);
    const offRacket: ShuttleState = { ...atRacket, pos: { ...atRacket.pos, x: atRacket.pos.x + 1.5 } };
    expect(aimView(p, offRacket, 0).onTarget).toBe(false);
  });
});

describe('assist', () => {
  it('racketInputFor round-trips to within 5 cm for reachable targets', () => {
    for (const body of ['tall', 'balanced', 'short'] as const) {
      for (const side of ['near', 'far'] as const) {
        const p = createPlayer({ ...stats, body }, side, { x: 0.4, y: 0, z: side === 'near' ? 3.5 : -3.5 });
        for (const rx of [-0.8, 0, 0.6]) for (const ry of [-0.7, 0, 0.9]) {
          const target = racketHeadFor(p, rx, ry, false, false);
          const r = racketInputFor(p, target);
          expect(dist(racketHeadFor(p, r.x, r.y, false, false), target)).toBeLessThan(0.05);
        }
      }
    }
  });

  it('autoRacket plus a swing hits a scripted incoming shot at assist 0.7', () => {
    let p = createPlayer(stats, 'near', { x: 0.2, y: 0, z: 3.5 });
    let s = incoming;
    let hit = false;
    for (let t = 0; t < 3 && !hit; t += 1 / 120) {
      const close = dist(p.racketHead, s.pos) < 1.2;
      const out = stepPlayer(p, intent({ racket: autoRacket(p, s), basicSwing: close ? 'forehand' : null }), s, 1 / 120, 0.7);
      p = out.player;
      hit = out.hit !== null;
      s = stepShuttle(s, 1 / 120).state;
    }
    expect(hit).toBe(true);
  });

  it('timing mode ignores WASD and moves toward the landing spot', () => {
    const p = createPlayer(stats, 'near', { x: -1, y: 0, z: 3.5 });
    const landing = predictLanding(incoming)!;
    const out = applyAssist(intent({ move: { x: -1, z: 0 } }), p, incoming, 'timing');
    expect(Math.sign(out.move.x)).toBe(Math.sign(landing.x - p.pos.x));
    expect(out.move).toEqual(moveToward(p, landing, 1));
  });

  it('easy mode pulls toward the landing spot and keeps WASD', () => {
    const p = createPlayer(stats, 'near', { x: -1, y: 0, z: 3.5 });
    const landing = predictLanding(incoming)!;
    const still = applyAssist(intent(), p, incoming, 'easy');
    expect(Math.sign(still.move.x)).toBe(Math.sign(landing.x - p.pos.x));
    const keyed = applyAssist(intent({ move: { x: 0, z: 1 } }), p, incoming, 'easy');
    expect(keyed.move.z).toBeGreaterThan(still.move.z);
    expect(keyed.racketVel).toEqual({ x: 0.7, y: 0 });
  });

  it('normal automates only the racket; pro leaves the intent unchanged', () => {
    const p = createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });
    const i = intent({ move: { x: 1, z: 0 }, racket: { x: 0.3, y: 0.3 } });
    expect(applyAssist(i, p, incoming, 'pro')).toBe(i);
    const n = applyAssist(i, p, incoming, 'normal');
    expect(n.move).toEqual(i.move);
    expect(n.racket).toEqual(autoRacket(p, incoming));
  });
});

describe('racketFromAim', () => {
  const p = createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });
  const c = reachCentre(p);
  const down = { x: 0, y: 0, z: -1 };

  it('a ray whose closest point is inside reach gives racketInputFor at that point', () => {
    const point = { x: 0.5, y: c.y + 0.4, z: c.z }; // ray runs along -z through this point
    const r = racketFromAim(p, { x: 0.5, y: c.y + 0.4, z: 6 }, down);
    expect(r).toEqual(racketInputFor(p, point));
  });

  it('aiming right gives x > 0, left x < 0, up y > 0, down y < 0 for a near-side player', () => {
    expect(racketFromAim(p, { x: 0.7, y: c.y, z: 6 }, down).x).toBeGreaterThan(0);
    expect(racketFromAim(p, { x: -0.7, y: c.y, z: 6 }, down).x).toBeLessThan(0);
    expect(racketFromAim(p, { x: 0, y: c.y + 0.7, z: 6 }, down).y).toBeGreaterThan(0);
    expect(racketFromAim(p, { x: 0, y: c.y - 0.7, z: 6 }, down).y).toBeLessThan(0);
  });

  it('a far-away aim is pulled back to the reach distance', () => {
    const r = racketFromAim(p, { x: 10, y: c.y, z: 6 }, down);
    expect(r).toEqual(racketInputFor(p, { x: c.x + aimReach(p), y: c.y, z: c.z }));
  });

  it('works for the far side too (own right = world -x)', () => {
    const f = createPlayer(stats, 'far', { x: 0, y: 0, z: -3.5 });
    const fc = reachCentre(f);
    expect(racketFromAim(f, { x: -0.7, y: fc.y, z: -6 }, { x: 0, y: 0, z: 1 }).x).toBeGreaterThan(0);
  });
});
