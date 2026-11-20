import { describe, expect, it } from 'vitest';
import type { BodyType, Intent, PlayerState, ShuttleState, Stats } from '../types';
import { chargeLevel, createPlayer, recoverBetweenPoints, setRandom, stepPlayer } from './index';

const stats = (body: BodyType = 'balanced', o: Partial<Stats> = {}): Stats => ({
  body, speed: 5, power: 5, recovery: 5, stamina: 5, ...o,
});
const idle: Intent = {
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 },
  charging: null, chargeTime: 0, release: null, basicSwing: null,
  jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
};
const farShuttle: ShuttleState = { pos: { x: 0, y: 3, z: -5 }, vel: { x: 0, y: 0, z: 0 } };
const DT = 1 / 120;
const spawn = (body: BodyType = 'balanced', o: Partial<Stats> = {}) => createPlayer(stats(body, o), 'near', { x: 0, y: 0, z: 5 });

function run(p: PlayerState, intent: Partial<Intent>, seconds: number, shuttle = farShuttle) {
  const i = { ...idle, ...intent };
  for (let t = 0; t < seconds - 1e-9; t += DT) p = stepPlayer(p, i, shuttle, DT, 1).player;
  return p;
}
const step = (p: PlayerState, intent: Partial<Intent>, shuttle = farShuttle) =>
  stepPlayer(p, { ...idle, ...intent }, shuttle, DT, 1);

describe('stamina and fatigue', () => {
  it('charging drains stamina', () => {
    const p = run(spawn(), { charging: 'clear', chargeTime: 0.5 }, 1);
    expect(p.staminaNow).toBeLessThan(0.97);
    expect(p.staminaNow).toBeGreaterThan(0.8);
  });
  it('stamina regenerates slowly when not charging', () => {
    const tired = { ...spawn(), staminaNow: 0.3 };
    const p = run(tired, {}, 2);
    expect(p.staminaNow).toBeGreaterThan(0.3);
    expect(p.staminaNow).toBeLessThan(0.45);
  });
  it('a high stamina stat drains less and regenerates faster', () => {
    const lo = run(spawn('balanced', { stamina: 0 }), { charging: 'clear', chargeTime: 0.5 }, 1);
    const hi = run(spawn('balanced', { stamina: 10 }), { charging: 'clear', chargeTime: 0.5 }, 1);
    expect(hi.staminaNow).toBeGreaterThan(lo.staminaNow);
  });
  it('low stamina lowers the maximum charge and the speed', () => {
    const full = spawn();
    const empty = { ...spawn(), staminaNow: 0 };
    expect(chargeLevel(full, 5)).toBe(1);
    expect(chargeLevel(empty, 5)).toBeLessThan(0.6);
    const sprint = (p: PlayerState) => {
      const v = run(p, { move: { x: 1, z: 0 } }, 0.8).vel;
      return Math.hypot(v.x, v.z);
    };
    expect(sprint({ ...empty, pos: { x: -3, y: 0, z: 5 } })).toBeLessThan(sprint({ ...full, pos: { x: -3, y: 0, z: 5 } }) * 0.9);
  });
  it('fatigue builds over a long run and eases when standing still', () => {
    let p = spawn();
    for (let t = 0; t < 40; t += 0.5) p = run({ ...p, pos: { x: -2, y: 0, z: 5 } }, { move: { x: 1, z: 0 } }, 0.5);
    expect(p.fatigue).toBeGreaterThan(0.1);
    const rested = run(p, {}, 5);
    expect(rested.fatigue).toBeLessThan(p.fatigue);
  });
  it('recoverBetweenPoints restores part of stamina and fatigue and resets the stance', () => {
    const p = recoverBetweenPoints({ ...spawn(), staminaNow: 0.2, fatigue: 0.6, action: 'down', getUpPressesLeft: 5 }, { x: 1, y: 0, z: 6 });
    expect(p.staminaNow).toBeGreaterThan(0.2);
    expect(p.fatigue).toBeLessThan(0.6);
    expect(p.action).toBe('idle');
    expect(p.pos).toEqual({ x: 1, y: 0, z: 6 });
  });
});

describe('jump', () => {
  const peak = (p: PlayerState, jumpCharge: number) => {
    let q = step(p, { jumpRelease: true, jumpCharge }).player;
    let top = q.pos.y;
    expect(q.action).toBe('airborne');
    for (let i = 0; i < 240 && q.pos.y > 0; i++) { q = step(q, {}).player; top = Math.max(top, q.pos.y); }
    return { top, q };
  };
  it('charge sets the height between 0.3 and 0.7 m, then you land', () => {
    expect(peak(spawn(), 0).top).toBeCloseTo(0.3, 1);
    const full = peak(spawn(), 1);
    expect(full.top).toBeCloseTo(0.7, 1);
    expect(full.q.pos.y).toBe(0);
    expect(full.q.action).not.toBe('airborne');
  });
  it('body and power change the height', () => {
    const base = peak(spawn(), 1).top;
    expect(peak(spawn('short'), 1).top).toBeGreaterThan(base);
    expect(peak(spawn('tall'), 1).top).toBeLessThan(base);
    expect(peak(spawn('balanced', { power: 10 }), 1).top).toBeGreaterThan(base);
  });
  it('jumping lifts the racket head and costs stamina', () => {
    const ground = spawn().racketHead.y;
    let p = step(spawn(), { jumpRelease: true, jumpCharge: 1 }).player;
    p = run(p, {}, 0.15);
    expect(p.racketHead.y).toBeGreaterThan(ground + 0.2);
    expect(p.staminaNow).toBeLessThan(1);
  });
  it('cannot jump again in the air', () => {
    const p = run(step(spawn(), { jumpRelease: true, jumpCharge: 0 }).player, {}, 0.05);
    const v = p.vel.y;
    expect(step(p, { jumpRelease: true, jumpCharge: 1 }).player.vel.y).toBeLessThan(v);
  });
});

describe('dive and get up', () => {
  const dive = (p: PlayerState, intent: Partial<Intent> = {}, shuttle = farShuttle) => {
    let q = step(p, { ...intent, dive: true }, shuttle).player;
    expect(q.action).toBe('diving');
    while (q.action === 'diving') q = step(q, { ...intent }, shuttle).player;
    return q;
  };
  it('lunges about 1.8 m in the move direction, then you are down', () => {
    const start = { ...spawn(), pos: { x: -1, y: 0, z: 5 } };
    const q = dive(start, { move: { x: 1, z: 0 } });
    expect(q.pos.x - -1).toBeGreaterThan(1.7);
    expect(q.pos.x - -1).toBeLessThan(1.9);
    expect(q.action).toBe('down');
  });
  it('without move input it lunges toward the shuttle', () => {
    const shuttle: ShuttleState = { pos: { x: 2, y: 0.4, z: 5 }, vel: { x: 0, y: 0, z: 0 } };
    const q = dive({ ...spawn(), pos: { x: 0, y: 0, z: 5 } }, {}, shuttle);
    expect(q.pos.x).toBeGreaterThan(1.5);
  });
  it('a dive costs stamina and is ignored with no stamina', () => {
    expect(step(spawn(), { dive: true }).player.staminaNow).toBeLessThan(0.95);
    expect(step({ ...spawn(), staminaNow: 0 }, { dive: true }).player.action).not.toBe('diving');
  });
  it('gives one chance to lift the shuttle back, as a clear', () => {
    setRandom(() => 0.5);
    const low: ShuttleState = { pos: { x: 1.2, y: 0.3, z: 4.6 }, vel: { x: 0, y: 0, z: 0 } };
    let p = step(spawn(), { dive: true, move: { x: 1, z: 0 } }, low).player;
    let first = null;
    for (let i = 0; i < 30 && !first; i++) {
      const r = step(p, { move: { x: 1, z: 0 }, basicSwing: i === 0 ? 'forehand' : null, racket: { x: 1, y: -1 } }, low);
      p = r.player;
      first = r.hit;
    }
    expect(first?.shot).toBe('clear');
    expect(first?.perfect).toBe(false);
    // the lift is used up: a second swing during the same dive does nothing
    let second = null;
    for (let i = 0; i < 30 && p.action === 'diving'; i++) {
      const r = step(p, { move: { x: 1, z: 0 }, basicSwing: 'forehand', racket: { x: 1, y: -1 } }, low);
      p = r.player;
      second = second ?? r.hit;
    }
    expect(second).toBeNull();
  });
  it('get-up presses depend on recovery: max(4, round(12 - 0.8 * recovery))', () => {
    const downFor = (recovery: number) => dive(spawn('balanced', { recovery })).getUpPressesLeft;
    expect(downFor(0)).toBe(12);
    expect(downFor(5)).toBe(8);
    expect(downFor(10)).toBe(4);
  });
  it('each dive press while down counts, and at 0 you get up', () => {
    let p = dive(spawn('balanced', { recovery: 10 }));
    expect(p.getUpPressesLeft).toBe(4);
    for (let n = 3; n >= 0; n--) {
      p = step(p, { dive: true }).player;
      expect(p.getUpPressesLeft).toBe(n);
      expect(p.action).toBe(n === 0 ? 'idle' : 'down');
    }
  });
  it('while down you cannot move or swing', () => {
    const p = dive(spawn());
    const q = run(p, { move: { x: 1, z: 0 }, basicSwing: 'forehand' }, 0.3, { pos: { ...p.racketHead }, vel: { x: 0, y: 0, z: 0 } });
    expect(q.pos).toEqual(p.pos);
    expect(q.action).toBe('down');
  });
});
