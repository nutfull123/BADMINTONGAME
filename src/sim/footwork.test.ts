import { describe, it, expect } from 'vitest';
import { createPlayer, racketHeadFor, stepPlayer } from './index';
import { footworkOf } from './footwork';
import type { Intent, PlayerState, ShuttleState, Stats } from '../types';

const DT = 1 / 120;
const stats: Stats = { body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const intent = (o: Partial<Intent> = {}): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0.7, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false, ...o,
});
const idle: ShuttleState = { pos: { x: 0, y: 3, z: -4 }, vel: { x: 0, y: 0, z: 0 } };
const awayShot: ShuttleState = { pos: { x: 0, y: 3, z: -4 }, vel: { x: 0, y: 0, z: -10 } };
const towardShot: ShuttleState = { pos: { x: 0, y: 3, z: -4 }, vel: { x: 0, y: 0, z: 10 } };
const start = { x: 0, y: 0, z: 3.5 };

function run(p: PlayerState, i: Intent, s: ShuttleState, seconds: number, each?: (p: PlayerState) => void): PlayerState {
  for (let t = 0; t < seconds - 1e-9; t += DT) { p = stepPlayer(p, i, s, DT, 0).player; each?.(p); }
  return p;
}
// seconds the footwork kind stays `kind` once it has started
function kindDuration(p: PlayerState, kind: string, i: Intent, s: ShuttleState): number {
  let n = 0, seen = false;
  for (let k = 0; k < 600; k++) {
    p = stepPlayer(p, i, s, DT, 0).player;
    const on = footworkOf(p).kind === kind;
    if (on) { seen = true; n++; } else if (seen) break;
  }
  return n * DT;
}
const withRecovery = (recovery: number) => createPlayer({ ...stats, recovery, speed: 5 }, 'near', start);

describe('footwork', () => {
  it('a plain player reports none', () => {
    const f = footworkOf(createPlayer(stats, 'near', start));
    expect(f.kind).toBe('none');
    expect(f.phase).toBe(0);
  });

  it('split step triggers when the opponent hits toward the player', () => {
    let p = run(createPlayer(stats, 'near', start), intent(), idle, 0.1);
    expect(footworkOf(p).kind).toBe('none');
    p = run(p, intent(), towardShot, 0.05);
    expect(footworkOf(p).kind).toBe('split');
    p = run(createPlayer(stats, 'near', start), intent(), awayShot, 0.1);
    expect(footworkOf(p).kind).toBe('none');
  });

  it('a player already moving fast skips the split', () => {
    let p = run(createPlayer(stats, 'near', start), intent({ move: { x: 1, z: 0 } }), idle, 0.3);
    p = run(p, intent({ move: { x: 1, z: 0 } }), towardShot, 0.05);
    expect(footworkOf(p).kind).not.toBe('split');
  });

  it('a well-timed split accelerates faster than no split', () => {
    const vxAfter = (s: ShuttleState, recovery = 5) => {
      let p = run(withRecovery(recovery), intent(), s, 0.3); // hop lands, boost starts
      p = run(p, intent({ move: { x: 1, z: 0 } }), s, 0.1);
      return p.vel.x;
    };
    expect(vxAfter(towardShot)).toBeGreaterThan(vxAfter(awayShot) * 1.2);
    expect(vxAfter(towardShot, 0)).toBeCloseTo(vxAfter(awayShot, 0), 6); // hop too slow to land in the window: no boost
  });

  it('sideways move reports chasse and fast backward move reports crossover', () => {
    let p = run(createPlayer(stats, 'near', start), intent({ move: { x: 1, z: 0 } }), idle, 0.5);
    expect(footworkOf(p).kind).toBe('chasse');
    expect(footworkOf(p).dir.x).toBeGreaterThan(0.9);
    p = run(createPlayer(stats, 'near', start), intent({ move: { x: 0, z: 1 } }), idle, 0.6);
    expect(footworkOf(p).kind).toBe('crossover');
    expect(footworkOf(p).dir.z).toBeGreaterThan(0.9);
  });

  it('crossover is faster backward than the same run forward', () => {
    const back = run(createPlayer(stats, 'near', start), intent({ move: { x: 0, z: 1 } }), idle, 0.6);
    const fwd = run(createPlayer(stats, 'near', start), intent({ move: { x: 0, z: -1 } }), idle, 0.6);
    expect(Math.abs(back.vel.z)).toBeGreaterThan(Math.abs(fwd.vel.z));
  });

  it('recover shows after a swing and gives way to movement', () => {
    let p = run(createPlayer(stats, 'near', start), intent({ basicSwing: 'forehand' }), idle, DT);
    p = run(p, intent(), idle, 0.2);
    expect(footworkOf(p).kind).toBe('recover');
    p = run(p, intent({ move: { x: 1, z: 0 } }), idle, 0.3);
    expect(footworkOf(p).kind).toBe('chasse');
  });

  describe('lunge', () => {
    // plane z = 3.0; the shuttle hangs 0.9 m beyond it, out of normal reach (radius 0.35)
    const target = (p: PlayerState): ShuttleState => {
      const head = racketHeadFor(p, 0, 0, false, false);
      return { pos: { x: head.x, y: head.y, z: head.z - 0.9 }, vel: { x: 0, y: 0, z: 0 } };
    };
    const runningForward = (recovery = 5) => {
      let p = withRecovery(recovery);
      p = run(p, intent({ move: { x: 0, z: -1 } }), idle, 0.2);
      return p;
    };
    const swingNow = (p: PlayerState, shuttle: ShuttleState) => {
      let hit = false;
      let kind = 'none';
      for (let k = 0; k < 20; k++) {
        const out = stepPlayer(p, intent({ move: { x: 0, z: -1 }, basicSwing: k === 0 ? 'forehand' : null }), shuttle, DT, 0);
        p = out.player;
        hit = hit || out.hit !== null;
        if (footworkOf(p).kind === 'lunge') kind = 'lunge';
      }
      return { hit, kind, p };
    };

    it('extends forward reach by 0.3 m', () => {
      let p = runningForward();
      const shuttle = target(p);
      for (let k = 0; k < 30 && footworkOf(p).kind !== 'lunge'; k++) {
        p = stepPlayer(p, intent({ move: { x: 0, z: -1 }, basicSwing: k === 0 ? 'forehand' : null }), shuttle, DT, 0).player;
      }
      expect(footworkOf(p).kind).toBe('lunge');
      expect(p.racketHead.z).toBeCloseTo(racketHeadFor(p, 0, 0, false, false).z - 0.3, 6);
    });

    it('hits a ball a standing player cannot reach', () => {
      const p = runningForward();
      expect(swingNow(p, target(p)).hit).toBe(true);
      const still = withRecovery(5);
      let hit = false;
      for (let k = 0; k < 20; k++) {
        hit = hit || stepPlayer(still, intent({ basicSwing: k === 0 ? 'forehand' : null }), target(still), DT, 0).hit !== null;
      }
      expect(hit).toBe(false);
    });

    it('blocks movement for a recovery delay that the recovery stat shortens', () => {
      const dur = (recovery: number) => {
        const p = runningForward(recovery);
        return kindDuration(p, 'lunge', intent({ move: { x: 0, z: -1 }, basicSwing: 'forehand' }), target(p));
      };
      expect(dur(5)).toBeGreaterThan(0.25);
      expect(dur(10)).toBeLessThan(dur(5));
      expect(dur(0)).toBeGreaterThan(dur(5));
    });
  });

  it('recovery stat shortens the split hop', () => {
    const hop = (r: number) => kindDuration(withRecovery(r), 'split', intent(), towardShot);
    expect(hop(10)).toBeLessThan(hop(5));
    expect(hop(0)).toBeGreaterThan(hop(5));
  });

  it('phase stays within 0..1', () => {
    const check = (p: PlayerState) => {
      const f = footworkOf(p);
      expect(f.phase).toBeGreaterThanOrEqual(0);
      expect(f.phase).toBeLessThanOrEqual(1);
    };
    run(createPlayer(stats, 'near', start), intent({ move: { x: 1, z: 0 } }), towardShot, 2, check);
    run(createPlayer(stats, 'near', start), intent({ move: { x: 0, z: 1 } }), idle, 2, check);
    run(createPlayer(stats, 'near', start), intent({ basicSwing: 'forehand', move: { x: 0, z: -1 } }), towardShot, 2, check);
  });
});
