import { describe, expect, it } from 'vitest';
import type { BodyType, Intent, PlayerState, ShuttleState, Stats } from '../types';
import { STAT_BUDGET, createPlayer, stepPlayer, validateStats } from './index';

const stats = (body: BodyType = 'balanced', o: Partial<Stats> = {}): Stats => ({
  gender: 'male', body, speed: 5, power: 5, recovery: 5, stamina: 5, ...o,
});
const idle: Intent = {
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 },
  charging: null, chargeTime: 0, release: null, basicSwing: null,
  jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
};
const farShuttle: ShuttleState = { pos: { x: 0, y: 3, z: -5 }, vel: { x: 0, y: 0, z: 0 } };
const DT = 1 / 120;

// Run `seconds` of the same intent; returns the final player.
function run(p: PlayerState, intent: Partial<Intent>, seconds: number, shuttle = farShuttle, assist = 1) {
  const i = { ...idle, ...intent };
  for (let t = 0; t < seconds - 1e-9; t += DT) p = stepPlayer(p, i, shuttle, DT, assist).player;
  return p;
}
const spawn = (body: BodyType, o: Partial<Stats> = {}) => createPlayer(stats(body, o), 'near', { x: -3, y: 0, z: 5 });
const hspeed = (p: PlayerState) => Math.hypot(p.vel.x, p.vel.z);

describe('stats', () => {
  it('budget is 20 and a spend within it is valid', () => {
    expect(STAT_BUDGET).toBe(20);
    expect(validateStats(stats('tall', { speed: 5, power: 5, recovery: 5, stamina: 5 }))).toBeNull();
    expect(validateStats(stats('short', { speed: 10, power: 10, recovery: 0, stamina: 0 }))).toBeNull();
  });
  it('rejects overspend, out-of-range stats and an unknown body', () => {
    expect(validateStats(stats('tall', { speed: 6 }))).toMatch(/20/);
    expect(validateStats(stats('tall', { speed: 11, power: 0, recovery: 0, stamina: 0 }))).not.toBeNull();
    expect(validateStats(stats('tall', { speed: -1 }))).not.toBeNull();
    expect(validateStats({ ...stats(), gender: 'male', body: 'giant' as BodyType })).not.toBeNull();
  });
  it('body fixes height', () => {
    expect(spawn('tall').racketHead.y).toBeGreaterThan(0);
  });
});

describe('racket plane', () => {
  const reach = (body: BodyType, x: number, y: number) => {
    const p = run(spawn(body), { racket: { x, y } }, 0.05);
    return { x: p.racketHead.x - p.pos.x, y: p.racketHead.y, z: p.racketHead.z - p.pos.z };
  };
  it('tall reaches farther sideways than short', () => {
    const t = reach('tall', 1, 0), s = reach('short', 1, 0);
    expect(t.x - s.x).toBeGreaterThan(0.2);
  });
  it('tall reaches higher than short', () => {
    expect(reach('tall', 0, 1).y - reach('short', 0, 1).y).toBeGreaterThan(0.3);
  });
  it('forehand is +x for the near player and -x for the far player', () => {
    const near = run(spawn('balanced'), { racket: { x: 1, y: 0 } }, 0.05);
    const far = run(createPlayer(stats(), 'far', { x: 0, y: 0, z: -5 }), { racket: { x: 1, y: 0 } }, 0.05);
    expect(near.racketHead.x - near.pos.x).toBeGreaterThan(0.5);
    expect(far.racketHead.x - far.pos.x).toBeLessThan(-0.5);
  });
  it('the head is in front of the player, toward the net', () => {
    expect(reach('balanced', 0, 0).z).toBeLessThan(0);
  });
});

describe('movement', () => {
  it('short accelerates faster than tall', () => {
    const t = run(spawn('tall'), { move: { x: 1, z: 0 } }, 0.1);
    const s = run(spawn('short'), { move: { x: 1, z: 0 } }, 0.1);
    expect(hspeed(s)).toBeGreaterThan(hspeed(t) * 1.2);
  });
  it('top speed is about 4 m/s, scaled by the speed stat and body', () => {
    const base = hspeed(run(spawn('balanced'), { move: { x: 1, z: 0 } }, 1.2));
    expect(base).toBeGreaterThan(3.8);
    expect(base).toBeLessThan(4.2);
    const fast = hspeed(run(spawn('balanced', { speed: 10 }), { move: { x: 1, z: 0 } }, 1.2));
    const slow = hspeed(run(spawn('balanced', { speed: 0 }), { move: { x: 1, z: 0 } }, 1.2));
    expect(fast / base).toBeCloseTo(1.25, 1);
    expect(slow / base).toBeCloseTo(0.75, 1);
    expect(hspeed(run(spawn('tall'), { move: { x: 1, z: 0 } }, 1.2))).toBeLessThan(base);
    expect(hspeed(run(spawn('short'), { move: { x: 1, z: 0 } }, 1.2))).toBeGreaterThan(base);
  });
  it('moving while charging is 60% speed', () => {
    const free = hspeed(run(spawn('balanced'), { move: { x: 1, z: 0 } }, 1.2));
    const charging = hspeed(run(spawn('balanced'), { move: { x: 1, z: 0 }, charging: 'clear', chargeTime: 0.3 }, 1.2));
    expect(charging / free).toBeCloseTo(0.6, 1);
  });
  it('stays inside its own half', () => {
    const toNet = run(spawn('balanced'), { move: { x: 0, z: -1 } }, 3);
    expect(toNet.pos.z).toBeGreaterThan(0);
    const back = run(spawn('balanced'), { move: { x: 0, z: 1 } }, 5);
    expect(back.pos.z).toBeLessThan(8);
    const farToNet = run(createPlayer(stats(), 'far', { x: 0, y: 0, z: -5 }), { move: { x: 0, z: 1 } }, 3);
    expect(farToNet.pos.z).toBeLessThan(0);
  });
});
