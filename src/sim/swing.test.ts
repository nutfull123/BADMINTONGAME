import { describe, expect, it } from 'vitest';
import { COURT, predictLanding, stepShuttle } from '../physics';
import type { BodyType, HitResult, Intent, PlayerState, ShuttleState, Stats, Vec3 } from '../types';
import { createPlayer, setRandom, stepPlayer } from './index';
import { launchShuttle } from './shots';

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
const zero: Vec3 = { x: 0, y: 0, z: 0 };
const spawn = (body: BodyType = 'balanced', side: 'near' | 'far' = 'near', z = 5, o: Partial<Stats> = {}) =>
  createPlayer(stats(body, o), side, { x: 0, y: 0, z: side === 'near' ? z : -z });

const speedOf = (h: HitResult) => Math.hypot(h.launch.vel.x, h.launch.vel.y, h.launch.vel.z);
const headFor = (p: PlayerState, racket: { x: number; y: number }) =>
  stepPlayer(p, { ...idle, racket }, farShuttle, DT, 1).player.racketHead;
const at = (v: Vec3, d: Partial<Vec3>): Vec3 => ({ x: v.x + (d.x ?? 0), y: v.y + (d.y ?? 0), z: v.z + (d.z ?? 0) });

interface SwingOpts {
  racket?: { x: number; y: number };
  racketVel?: { x: number; y: number };
  offset?: Partial<Vec3>; // shuttle position relative to the racket head
  shuttleVel?: Vec3;
  assist?: number;
  player?: PlayerState;
  serve?: boolean; // place the shuttle at the serve-clamped racket head
}
// Fire `first` on frame 0, then hold the racket still for 0.3 s; returns the first hit (and the player then).
function swing(first: Partial<Intent>, o: SwingOpts = {}) {
  let p = o.player ?? spawn();
  const racket = o.racket ?? { x: 0, y: 0 };
  const head = o.serve
    ? stepPlayer(p, { ...idle, racket, charging: 'serveShort', chargeTime: 0 }, farShuttle, DT, o.assist ?? 1).player.racketHead
    : headFor(p, racket);
  let s: ShuttleState = { pos: at(head, o.offset ?? {}), vel: o.shuttleVel ?? zero };
  const base = { racket, racketVel: o.racketVel ?? { x: 0, y: 0 } };
  for (let i = 0; i < 36; i++) {
    const intent = i === 0 ? { ...idle, ...base, ...first } : { ...idle, ...base, chargeTime: first.chargeTime ?? 0 };
    const r = stepPlayer(p, intent, s, DT, o.assist ?? 1);
    p = r.player;
    if (r.hit) return { hit: r.hit, player: p };
    s = { pos: at(s.pos, { x: s.vel.x * DT, y: s.vel.y * DT, z: s.vel.z * DT }), vel: s.vel };
  }
  return { hit: null, player: p };
}
const land = (h: HitResult) => predictLanding(h.launch)!;
const noSpread = () => setRandom(() => 0.5);

describe('exchange', () => {
  it('a clear flies across with real shuttle physics and the far player returns it', () => {
    noSpread();
    const first = swing({ release: 'clear', chargeTime: 1 }, { racket: { x: 0, y: 1 } }).hit!;
    const down = land(first);
    let far = createPlayer(stats(), 'far', { x: down.x, y: 0, z: down.z - 0.5 });
    let s = first.launch;
    let fired = false;
    let ret: HitResult | null = null;
    for (let i = 0; i < 120 * 4 && !ret; i++) {
      const lowEnough = s.pos.y < 1.2 && s.vel.y < 0;
      const r = stepPlayer(far, { ...idle, racket: { x: 0, y: -1 }, release: lowEnough && !fired ? 'clear' : null }, s, DT, 1);
      far = r.player;
      fired = fired || lowEnough;
      ret = r.hit;
      const f = stepShuttle(s, DT);
      s = f.state;
      expect(f.event.kind === 'floor' && !ret).toBe(false); // it must be hit before it lands
    }
    expect(ret).not.toBeNull();
    expect(Object.values(ret!.launch.vel).every(Number.isFinite)).toBe(true);
    expect(land(ret!).z).toBeGreaterThan(4); // cleared back deep into the near half
  });
});

describe('hit detection', () => {
  const E: Partial<Intent> = { basicSwing: 'forehand' };
  it('hits when the shuttle is within the radius and misses outside it', () => {
    expect(swing(E, { offset: { x: 0.2 } }).hit).not.toBeNull();
    expect(swing(E, { offset: { x: 1.5 } }).hit).toBeNull();
  });
  it('hit assist enlarges the radius', () => {
    expect(swing(E, { offset: { x: 0.55 }, assist: 0 }).hit).toBeNull();
    expect(swing(E, { offset: { x: 0.55 }, assist: 1 }).hit).not.toBeNull();
  });
  it('no swing, no hit', () => {
    expect(swing({}, { offset: { x: 0 } }).hit).toBeNull();
  });
  it('a very fast shuttle cannot skip through the radius between frames', () => {
    const r = swing(E, { offset: { z: -3 }, shuttleVel: { x: 0, y: 0, z: 90 }, assist: 0 });
    expect(r.hit).not.toBeNull();
  });
  it('one swing hits once; a re-swing inside the cooldown does nothing', () => {
    const first = swing(E, { offset: { x: 0 } });
    const still: ShuttleState = { pos: first.hit!.launch.pos, vel: zero };
    let p = first.player;
    let hit: HitResult | null = null;
    for (let i = 0; i < 10; i++) {
      const r = stepPlayer(p, { ...idle, basicSwing: i === 0 ? 'forehand' : null }, still, DT, 1);
      p = r.player;
      hit = hit ?? r.hit;
    }
    expect(hit).toBeNull();
  });
});

describe('perfect', () => {
  it('contact in the sweet spot is perfect, a looser contact is not', () => {
    expect(swing({ basicSwing: 'forehand' }, { offset: { x: 0.05 } }).hit!.perfect).toBe(true);
    expect(swing({ basicSwing: 'forehand' }, { offset: { x: 0.3 } }).hit!.perfect).toBe(false);
  });
  it('a perfect smash is faster than a loose one', () => {
    noSpread();
    const smash = { release: 'smash' as const, chargeTime: 0.8 };
    const racket = { x: 0, y: 1 };
    const a = swing(smash, { racket, offset: { x: 0.02 } }).hit!;
    const b = swing(smash, { racket, offset: { x: 0.3 } }).hit!;
    expect(a.perfect).toBe(true);
    expect(b.perfect).toBe(false);
    expect(speedOf(a)).toBeGreaterThan(speedOf(b));
  });
  it('a non-perfect shot has more spread than a perfect one', () => {
    setRandom(() => 1);
    const clear = { release: 'clear' as const, chargeTime: 0.6 };
    const racket = { x: 0, y: 1 };
    const perfect = land(swing(clear, { racket, offset: { x: 0.02 } }).hit!);
    const loose = land(swing(clear, { racket, offset: { x: 0.3 } }).hit!);
    expect(Math.abs(loose.x)).toBeGreaterThan(Math.abs(perfect.x) * 3);
  });
});

describe('shots', () => {
  const racket = { x: 0, y: 1 }; // overhead
  it('wrong-side basic swing is weaker and slower than the right side', () => {
    noSpread();
    const right = swing({ basicSwing: 'forehand' }, { racket: { x: 1, y: 0 } }).hit!;
    const wrong = swing({ basicSwing: 'forehand' }, { racket: { x: -1, y: 0 } }).hit!;
    expect(speedOf(wrong)).toBeLessThan(speedOf(right) * 0.7);
    expect(land(wrong).z).toBeGreaterThan(land(right).z + 1); // shorter: lands nearer the net
    expect(wrong.perfect).toBe(false);
  });
  it('a basic shot is a flat drive over the net into the far court', () => {
    noSpread();
    const h = swing({ basicSwing: 'backhand' }, { racket: { x: -1, y: 0 } }).hit!;
    expect(h.shot).toBe('basic');
    expect(land(h).z).toBeLessThan(-3);
    expect(Math.abs(h.launch.vel.y)).toBeLessThan(Math.hypot(h.launch.vel.x, h.launch.vel.z));
  });
  it('a clear lands deep in the far court, deeper with charge', () => {
    noSpread();
    const light = land(swing({ release: 'clear', chargeTime: 0 }, { racket }).hit!);
    const full = land(swing({ release: 'clear', chargeTime: 5 }, { racket }).hit!);
    expect(light.z).toBeLessThan(-5.0);
    expect(light.z).toBeGreaterThan(-6.7);
    expect(full.z).toBeLessThan(light.z);
    expect(full.z).toBeGreaterThan(-6.7);
    expect(full.z).toBeLessThan(-6.2);
  });
  it('a drop lands short past the net, further with charge', () => {
    noSpread();
    const light = land(swing({ release: 'drop', chargeTime: 0 }, { racket }).hit!);
    const full = land(swing({ release: 'drop', chargeTime: 5 }, { racket }).hit!);
    expect(light.z).toBeLessThan(0);
    expect(light.z).toBeGreaterThan(-1.2);
    expect(full.z).toBeLessThan(light.z);
    expect(full.z).toBeGreaterThan(-3.5);
  });
  it('a smash is fast and downward; charge and power add speed', () => {
    noSpread();
    const hit = (chargeTime: number, power = 5) =>
      swing({ release: 'smash', chargeTime }, { racket, player: spawn('balanced', 'near', 5, { power }) }).hit!;
    const a = hit(0), b = hit(5), c = hit(5, 10), d = hit(5, 0);
    expect(a.launch.vel.y).toBeLessThan(0);
    expect(speedOf(b)).toBeGreaterThan(speedOf(a));
    expect(speedOf(c)).toBeGreaterThan(speedOf(d));
    expect(speedOf(b)).toBeGreaterThan(50);
    expect(land(b).z).toBeLessThan(-1);
  });
  it('a smash from a tall player is steeper than from a short one', () => {
    noSpread();
    const steep = (h: HitResult) => Math.atan2(-h.launch.vel.y, Math.hypot(h.launch.vel.x, h.launch.vel.z));
    const tall = swing({ release: 'smash', chargeTime: 5 }, { racket, player: spawn('tall') }).hit!;
    const short = swing({ release: 'smash', chargeTime: 5 }, { racket, player: spawn('short') }).hit!;
    expect(steep(tall)).toBeGreaterThan(steep(short));
  });
  it('the flick aims left and right up to about 25 degrees', () => {
    noSpread();
    const drop = { release: 'drop' as const, chargeTime: 1 };
    const right = swing(drop, { racket, racketVel: { x: 3, y: 0 } }).hit!;
    const left = swing(drop, { racket, racketVel: { x: -3, y: 0 } }).hit!;
    const straight = swing(drop, { racket }).hit!;
    expect(land(right).x).toBeGreaterThan(land(straight).x + 0.5);
    expect(land(left).x).toBeLessThan(land(straight).x - 0.5);
    const angle = (h: HitResult) => (Math.atan2(h.launch.vel.x, -h.launch.vel.z) * 180) / Math.PI;
    expect(angle(right)).toBeCloseTo(25, 0);
    expect(angle(swing(drop, { racket, racketVel: { x: 30, y: 0 } }).hit!)).toBeCloseTo(25, 0);
  });
  it("the far player hits toward +z and flicks to their own right (-x)", () => {
    noSpread();
    const h = swing({ release: 'drop', chargeTime: 1 }, { racket, racketVel: { x: 3, y: 0 }, player: spawn('balanced', 'far') }).hit!;
    expect(land(h).z).toBeGreaterThan(0);
    expect(land(h).x).toBeLessThan(-0.5);
  });
  it('net shot: above the tape kills, below tumbles just over, an upward flick pushes deep', () => {
    noSpread();
    const p = () => spawn('balanced', 'near', 1.4);
    const kill = swing({ netShot: true }, { racket: { x: 0, y: 0.8 }, player: p() }).hit!;
    const tumble = swing({ netShot: true }, { racket: { x: 0, y: -0.6 }, player: p() }).hit!;
    const push = swing({ netShot: true }, { racket: { x: 0, y: -0.6 }, racketVel: { x: 0, y: 3.5 }, player: p() }).hit!;
    expect(kill.shot).toBe('net');
    expect(kill.launch.vel.y).toBeLessThan(0);
    expect(land(kill).z).toBeLessThan(-1);
    expect(land(tumble).z).toBeLessThan(0);
    expect(land(tumble).z).toBeGreaterThan(-1.2);
    expect(land(push).z).toBeLessThan(-4);
  });
  it('short serve lands just past the short service line, long serve near the back line', () => {
    noSpread();
    const p = () => spawn('balanced', 'near', 2.2);
    const racket = { x: 0, y: -0.3 };
    const shortS = swing({ release: 'serveShort', chargeTime: 0.4 }, { racket, player: p() }).hit!;
    const longS = swing({ release: 'serveLong', chargeTime: 0.4 }, { racket, player: p() }).hit!;
    expect(land(shortS).z).toBeLessThan(-1.98);
    expect(land(shortS).z).toBeGreaterThan(-2.9);
    expect(land(longS).z).toBeLessThan(-5.8);
    expect(land(longS).z).toBeGreaterThan(-6.7);
  });
  it('serve contact stays below 1.15 m even with the racket held high', () => {
    const held = stepPlayer(spawn('tall', 'near', 2.2), { ...idle, racket: { x: 0, y: 1 }, charging: 'serveShort', chargeTime: 0.2 }, farShuttle, DT, 1).player;
    expect(held.racketHead.y).toBeLessThanOrEqual(1.15);
  });
  it('a serve is struck at or below 1.15 m when a high assist reaches a shuttle above the limit', () => {
    // BWF Law 9.1.6: the whole shuttle must be below 1.15 m when the server's racket hits it. The racket head is
    // clamped for a serve, but hit assist 1 has a 0.8 m radius, so a high shuttle can still be inside the radius.
    noSpread();
    const out = swing(
      { release: 'serveShort', chargeTime: 0.3 },
      { racket: { x: 0, y: 1 }, offset: { y: 0.5 }, assist: 1, serve: true },
    );
    expect(out.hit).not.toBeNull();
    expect(out.hit!.launch.pos.y).toBeLessThanOrEqual(1.15);
  });
  it('does not lower a non-serve contact: only serves are capped at 1.15 m', () => {
    noSpread();
    const out = swing(
      { release: 'smash', chargeTime: 0.3 },
      { racket: { x: 0, y: 1 }, offset: { y: 0.5 }, assist: 1 },
    );
    expect(out.hit).not.toBeNull();
    expect(out.hit!.launch.pos.y).toBeGreaterThan(1.15);
  });
});

describe('doubles long serve', () => {
  // BWF Law 1: a doubles serve must land in front of the doubles long service line (5.94 m from the net).
  const depthOf = (doubles: boolean, charge: number, r: number) => {
    setRandom(() => r);
    const launch = launchShuttle({
      shot: 'serveLong', side: 'near', contact: { x: 1.2, y: 1.1, z: 2.2 }, flick: { x: -2.4, y: 0 },
      charge, perfect: false, weak: false, stats: stats(), doubles,
    });
    return -predictLanding(launch)!.z;
  };

  it('lands inside the doubles service box at every charge and aim error', () => {
    for (const charge of [0, 0.5, 1]) {
      for (const r of [0, 0.5, 0.999]) {
        const d = depthOf(true, charge, r);
        expect(d).toBeGreaterThan(COURT.shortServiceLine);
        expect(d).toBeLessThanOrEqual(COURT.longServiceLineDoubles + 0.05);
      }
    }
    setRandom(Math.random);
  });

  it('still goes deep past the doubles line in singles', () => {
    expect(depthOf(false, 1, 0.5)).toBeGreaterThan(COURT.longServiceLineDoubles);
    setRandom(Math.random);
  });
});
