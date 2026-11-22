import { describe, expect, it } from 'vitest';
import { FORMAT_3X15, awardRally, createMatch, receiverSlot, serverSlot } from '../rules';
import { createPlayer, setRandom } from '../sim';
import { botIntent, createBot } from '../sim/bot';
import type { Intent, PlayerState, Side, Slot, Stats } from '../types';
import { serviceBox } from '../physics';
import {
  STEP, aimServe, botContext, judgeFloor, runRally, serveSpots, startRally, stepRally, type Rally,
} from './rally';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const idle = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});
const team = (side: Side, n: number): PlayerState[] =>
  Array.from({ length: n }, (_, i) => createPlayer(stats, side, { x: 0, y: 0, z: (side === 'near' ? 1 : -1) * 3.5 }, i as Slot));
const singles = () => ({ near: team('near', 1), far: team('far', 1) });
const doubles = () => ({ near: team('near', 2), far: team('far', 2) });
const doublesMatch = () => createMatch(FORMAT_3X15, 'near', true);
// Repeatable but varied randomness (LCG): a constant 0.5 makes bots never miss, so four of them can rally forever.
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
// the same intent for every player of both sides
const all = (r: Rally, i: Intent): Record<Side, Intent[]> => ({
  near: r.players.near.map(() => i), far: r.players.far.map(() => i),
});

// a human-like serve: hold the short serve for 0.3 s, then release
const scriptedServe = (t: number, p: PlayerState): Intent => {
  const i = idle();
  if (t < 0.3) { i.charging = 'serveShort'; i.chargeTime = t; } else if (t < 0.3 + STEP * 1.5) { i.release = 'serveShort'; i.chargeTime = 0.3; }
  return aimServe(i, p);
};

// Doubles rally already in `stage`, with the shuttle resting at `who`'s racket so a swing hits it.
function setUpHit(stage: 'serveFlight' | 'rally', lastHitter: Side, who: { side: Side; slot: Slot }): Rally {
  const r = startRally(doublesMatch(), doubles());
  r.stage = stage;
  r.lastHitter = lastHitter;
  const p = r.players[who.side][who.slot];
  r.shuttle = { pos: { ...p.racketHead }, vel: { x: 0, y: 0, z: 0 } };
  return r;
}
const swingAt = (r: Rally, who: { side: Side; slot: Slot }, frames = 120) => {
  for (let k = 0; k < frames && !r.result && r.lastHitter === (who.side === 'near' ? 'far' : 'near') && r.stage !== 'rally'; k++) {
    const intents = all(r, idle());
    intents[who.side][who.slot] = { ...idle(), basicSwing: k === 0 ? 'forehand' : null };
    stepRally(r, intents, STEP, 1);
  }
};

describe('judgeFloor', () => {
  it('in on the opponent side wins for the hitter, out or own side loses', () => {
    expect(judgeFloor({ x: 0, y: 0, z: -3 }, 'near', false, 'right')).toEqual({ winner: 'near', reason: 'in' });
    expect(judgeFloor({ x: 3, y: 0, z: -3 }, 'near', false, 'right')).toEqual({ winner: 'far', reason: 'out' });
    expect(judgeFloor({ x: 0, y: 0, z: 3 }, 'near', false, 'right')).toEqual({ winner: 'far', reason: 'out' });
  });
  it('a serve must land in the diagonal service box', () => {
    expect(judgeFloor({ x: -1, y: 0, z: -4 }, 'near', true, 'right')).toEqual({ winner: 'near', reason: 'in' });
    expect(judgeFloor({ x: 1, y: 0, z: -4 }, 'near', true, 'right')).toEqual({ winner: 'far', reason: 'serve-fault' });
    expect(judgeFloor({ x: -1, y: 0, z: -1 }, 'near', true, 'right')).toEqual({ winner: 'far', reason: 'serve-fault' });
  });
  it('doubles rally uses the doubles width', () => {
    expect(judgeFloor({ x: 2.9, y: 0, z: -3 }, 'near', false, 'right', true)).toEqual({ winner: 'near', reason: 'in' });
    expect(judgeFloor({ x: 2.9, y: 0, z: -3 }, 'near', false, 'right', false)).toEqual({ winner: 'far', reason: 'out' });
    expect(judgeFloor({ x: 3.2, y: 0, z: -3 }, 'near', false, 'right', true)).toEqual({ winner: 'far', reason: 'out' });
  });
  it('a doubles serve 2.9 m wide is in; one past the doubles long service line is a fault', () => {
    expect(judgeFloor({ x: -2.9, y: 0, z: -4 }, 'near', true, 'right', true)).toEqual({ winner: 'near', reason: 'in' });
    expect(judgeFloor({ x: -2.9, y: 0, z: -4 }, 'near', true, 'right', false)).toEqual({ winner: 'far', reason: 'serve-fault' });
    expect(judgeFloor({ x: -1, y: 0, z: -6.2 }, 'near', true, 'right', true)).toEqual({ winner: 'far', reason: 'serve-fault' });
    expect(judgeFloor({ x: -1, y: 0, z: -6.2 }, 'near', true, 'right', false)).toEqual({ winner: 'near', reason: 'in' });
  });
});

describe('runRally', () => {
  it('a diagonal serve the receiver never touches scores for the server', () => {
    setRandom(() => 0.5);
    const out = runRally({
      match: createMatch(FORMAT_3X15, 'near'), players: singles(),
      intent: (side, _slot, r, t) => (side === 'near' ? scriptedServe(t, r.players.near[0]) : idle()),
    });
    expect(out.result).toEqual({ winner: 'near', reason: 'in' });
  });

  it('places the server and receiver in the diagonal courts', () => {
    const r = startRally(awardRally(createMatch(FORMAT_3X15, 'near'), 'near'), singles());
    expect(r.court).toBe('left');
    expect(r.players.near[0].pos.x).toBeLessThan(0);
    expect(r.players.far[0].pos.x).toBeGreaterThan(0);
    expect(serveSpots('far', 'right').server.x).toBeLessThan(0);
  });

  it('during the serve both players stay inside their own service court, off the lines', () => {
    const r = startRally(createMatch(FORMAT_3X15, 'near'), singles()); // near serves from the right (+x)
    const walk = (x: number, z: number): Intent => ({ ...idle(), move: { x, z } });
    // the server walks hard toward the left court and the net; the receiver walks toward the far left court and back
    for (let i = 0; i < 360; i++) stepRally(r, { near: [walk(-1, -1)], far: [walk(1, -1)] }, STEP, 0.7);
    expect(r.stage).toBe('serve');
    const nb = serviceBox('near', 'right'), fb = serviceBox('far', 'right');
    expect(r.players.near[0].pos.x).toBeGreaterThan(nb.xMin);
    expect(r.players.near[0].pos.z).toBeGreaterThan(nb.zMin);
    expect(r.players.far[0].pos.x).toBeLessThan(fb.xMax);
    expect(r.players.far[0].pos.z).toBeGreaterThan(fb.zMin);
  });

  it('feet are stationary once the server starts the serve', () => {
    const r = startRally(createMatch(FORMAT_3X15, 'near'), singles());
    const nearAt = { ...r.players.near[0].pos }, farAt = { ...r.players.far[0].pos };
    const charge: Intent = { ...idle(), move: { x: 1, z: 1 }, charging: 'serveShort', chargeTime: 0.2 };
    for (let i = 0; i < 60; i++) stepRally(r, { near: [charge], far: [{ ...idle(), move: { x: -1, z: 1 } }] }, STEP, 0.7);
    expect(r.players.near[0].pos.x).toBeCloseTo(nearAt.x, 6);
    expect(r.players.near[0].pos.z).toBeCloseTo(nearAt.z, 6);
    expect(r.players.far[0].pos.x).toBeCloseTo(farAt.x, 6);
    expect(r.players.far[0].pos.z).toBeCloseTo(farAt.z, 6);
  });

  it('a full rally against the bot ends with a point', () => {
    setRandom(() => 0.5);
    const bot = createBot('medium', () => 0.5);
    let match = createMatch(FORMAT_3X15, 'near');
    const out = runRally({
      match, players: singles(),
      intent: (side, slot, r, t) => (side === 'near'
        ? scriptedServe(t, r.players.near[0])
        : botIntent(bot, r.players.far[slot], botContext(r, 'far', slot), r.shuttle, STEP)),
    });
    expect(out.result).not.toBeNull();
    match = awardRally(match, out.result!.winner);
    expect(match.score.near + match.score.far).toBe(1);
  });
});

describe('doubles', () => {
  it('startRally puts server and receiver in the doubles boxes and partners behind in their own half', () => {
    let m = doublesMatch();
    for (const winner of ['near', 'far', 'far', 'near'] as const) { // walks through different slots and courts
      const r = startRally(m, doubles());
      expect(r.doubles).toBe(true);
      expect(r.serverSlot).toBe(serverSlot(m));
      expect(r.receiverSlot).toBe(receiverSlot(m));
      const recvSide: Side = m.server === 'near' ? 'far' : 'near';
      const server = r.players[m.server][r.serverSlot], receiver = r.players[recvSide][r.receiverSlot];
      const inBox = (p: PlayerState) => {
        const b = serviceBox(p.side, m.serviceCourt, true);
        return p.pos.x > b.xMin && p.pos.x < b.xMax && p.pos.z > b.zMin && p.pos.z < b.zMax;
      };
      expect(inBox(server)).toBe(true);
      expect(inBox(receiver)).toBe(true);
      expect(Math.abs(server.pos.z)).toBeLessThan(3); // near the short service line
      for (const side of ['near', 'far'] as const) {
        const [a, b] = r.players[side];
        const sgn = side === 'near' ? 1 : -1;
        const front = side === m.server ? server : receiver;
        const back = a === front ? b : a;
        expect(back.slot).not.toBe(front.slot);
        expect(Math.sign(back.pos.x)).toBe(-Math.sign(front.pos.x)); // other half of its own court
        expect(sgn * back.pos.z).toBeGreaterThan(sgn * front.pos.z); // behind its teammate
        expect(sgn * back.pos.z).toBeLessThan(6.7); // inside its own half
        expect(Math.abs(back.pos.x)).toBeLessThan(3.05);
      }
      m = awardRally(m, winner);
    }
  });

  it('during the serve the server and receiver stay in their doubles boxes, partners roam their half', () => {
    const r = startRally(doublesMatch(), doubles());
    const walk = (x: number, z: number): Intent => ({ ...idle(), move: { x, z } });
    const partnerBefore = { ...r.players.far[1 - r.receiverSlot].pos };
    const intents = all(r, walk(-1, -1)); // everyone walks toward the left and the net
    for (let i = 0; i < 600; i++) stepRally(r, intents, STEP, 0.7);
    expect(r.stage).toBe('serve');
    const nb = serviceBox('near', 'right', true), fb = serviceBox('far', 'right', true);
    const s = r.players.near[r.serverSlot].pos, rc = r.players.far[r.receiverSlot].pos;
    expect(s.x).toBeGreaterThan(nb.xMin);
    expect(s.z).toBeGreaterThan(nb.zMin);
    expect(rc.z).toBeLessThan(fb.zMax);
    expect(rc.x).toBeGreaterThan(fb.xMin);
    // partners are not boxed in: they moved, but never across the net
    const partner = r.players.far[1 - r.receiverSlot].pos;
    expect(Math.hypot(partner.x - partnerBefore.x, partner.z - partnerBefore.z)).toBeGreaterThan(1);
    expect(partner.z).toBeLessThan(0);
    expect(r.players.near[1 - r.serverSlot].pos.z).toBeGreaterThan(0);
  });

  it('feet of server and receiver freeze once the serve starts, partners keep moving', () => {
    const r = startRally(doublesMatch(), doubles());
    const at = (side: Side, slot: Slot) => ({ ...r.players[side][slot].pos });
    const s0 = at('near', r.serverSlot), rc0 = at('far', r.receiverSlot), p0 = at('far', (1 - r.receiverSlot) as Slot);
    const charge: Intent = { ...idle(), move: { x: 1, z: 1 }, charging: 'serveShort', chargeTime: 0.2 };
    const intents = all(r, { ...idle(), move: { x: 1, z: 1 } });
    intents.near[r.serverSlot] = charge;
    for (let i = 0; i < 60; i++) stepRally(r, intents, STEP, 0.7);
    expect(r.players.near[r.serverSlot].pos.x).toBeCloseTo(s0.x, 6);
    expect(r.players.near[r.serverSlot].pos.z).toBeCloseTo(s0.z, 6);
    expect(r.players.far[r.receiverSlot].pos.x).toBeCloseTo(rc0.x, 6);
    expect(r.players.far[r.receiverSlot].pos.z).toBeCloseTo(rc0.z, 6);
    expect(r.players.far[1 - r.receiverSlot].pos.x).not.toBeCloseTo(p0.x, 2);
  });

  it('the designated receiver may return the serve', () => {
    const who = { side: 'far' as Side, slot: doublesMatch().rightCourt.far };
    const r = setUpHit('serveFlight', 'near', who);
    expect(r.receiverSlot).toBe(who.slot);
    swingAt(r, who);
    expect(r.result).toBeNull();
    expect(r.stage).toBe('rally');
    expect(r.lastHitter).toBe('far');
  });

  it("the receiver's partner hitting the serve is a fault: the serving side gets the point", () => {
    const who = { side: 'far' as Side, slot: (1 - doublesMatch().rightCourt.far) as Slot };
    const r = setUpHit('serveFlight', 'near', who);
    expect(r.receiverSlot).not.toBe(who.slot);
    swingAt(r, who);
    expect(r.result).toEqual({ winner: 'near', reason: 'fault' });
  });

  it('after the return either partner may hit, but the same side twice in a row is a fault', () => {
    const rightSlot = doublesMatch().rightCourt.near;
    // far hit last, so either near partner may play it
    for (const slot of [0, 1] as const) {
      const r = setUpHit('rally', 'far', { side: 'near', slot });
      stepRally(r, { ...all(r, idle()), near: r.players.near.map((_, i) => (i === slot ? { ...idle(), basicSwing: 'forehand' as const } : idle())) }, STEP, 1);
      for (let k = 0; k < 60 && r.lastHitter === 'far' && !r.result; k++) stepRally(r, all(r, idle()), STEP, 1);
      expect(r.result).toBeNull();
      expect(r.lastHitter).toBe('near');
    }
    // near hit last: the partner (or the same player) hitting again is a double hit
    const r = setUpHit('rally', 'near', { side: 'near', slot: (1 - rightSlot) as Slot });
    const intents = all(r, idle());
    intents.near[1 - rightSlot] = { ...idle(), basicSwing: 'forehand' };
    stepRally(r, intents, STEP, 1);
    for (let k = 0; k < 60 && !r.result; k++) stepRally(r, all(r, idle()), STEP, 1);
    expect(r.result).toEqual({ winner: 'far', reason: 'fault' });
  });

  it('a long doubles serve lands in the doubles service box, not past the doubles long service line', () => {
    const longServe = (t: number, p: PlayerState): Intent => {
      const i = idle();
      if (t < 0.6) { i.charging = 'serveLong'; i.chargeTime = t; } else if (t < 0.6 + STEP * 1.5) { i.release = 'serveLong'; i.chargeTime = 0.6; }
      return aimServe(i, p);
    };
    for (const r of [0, 0.5, 0.999]) {
      setRandom(() => r);
      const out = runRally({
        match: doublesMatch(), players: doubles(),
        intent: (side, slot, rr, t) => (side === 'near' && slot === rr.serverSlot ? longServe(t, rr.players.near[slot]) : idle()),
      });
      expect(out.result).toEqual({ winner: 'near', reason: 'in' });
    }
    setRandom(Math.random);
  });

  it('a short doubles serve lands in the doubles service box', () => {
    setRandom(() => 0.5);
    const out = runRally({
      match: doublesMatch(), players: doubles(),
      intent: (side, slot, r, t) => (side === 'near' && slot === r.serverSlot ? scriptedServe(t, r.players.near[slot]) : idle()),
    });
    expect(out.result).toEqual({ winner: 'near', reason: 'in' });
  });

  it('a rally with four bots ends with a point', () => {
    setRandom(seeded(1));
    const bots = { near: [createBot('medium', seeded(2)), createBot('medium', seeded(3))], far: [createBot('medium', seeded(4)), createBot('medium', seeded(5))] };
    const out = runRally({
      match: doublesMatch(), players: doubles(), maxSeconds: 90,
      intent: (side, slot, r) => botIntent(bots[side][slot], r.players[side][slot], botContext(r, side, slot), r.shuttle, STEP),
    });
    expect(out.result).not.toBeNull();
    setRandom(Math.random);
  });

  it('four bots play ten points in a row, carrying the players from rally to rally', { timeout: 15_000 }, () => { // ten full 4-bot rallies: ~1 s alone, slower when the CPU is busy
    setRandom(seeded(1));
    const bots = { near: [createBot('medium', seeded(2)), createBot('medium', seeded(3))], far: [createBot('medium', seeded(4)), createBot('medium', seeded(5))] };
    let match = doublesMatch();
    let players = doubles();
    for (let n = 1; n <= 10; n++) {
      const out = runRally({
        match, players, maxSeconds: 90,
        intent: (side, slot, r) => botIntent(bots[side][slot], r.players[side][slot], botContext(r, side, slot), r.shuttle, STEP),
      });
      expect(out.result).not.toBeNull();
      expect(out.rally.serverSlot).toBe(serverSlot(match));
      match = awardRally(match, out.result!.winner);
      expect(match.score.near + match.score.far).toBe(n);
      players = out.rally.players;
      expect(players.near.map((p) => p.slot)).toEqual([0, 1]);
    }
    setRandom(Math.random);
  });

  it('botContext names the partner, the opponents, the server and the designated receiver', () => {
    const r = startRally(doublesMatch(), doubles());
    const c = botContext(r, 'far', r.receiverSlot);
    expect(c.receiving).toBe(true);
    expect(c.serving).toBe(false);
    expect(c.partner).toBe(r.players.far[1 - r.receiverSlot]);
    expect(c.opponents).toBe(r.players.near);
    expect(botContext(r, 'far', (1 - r.receiverSlot) as Slot).receiving).toBe(false);
    expect(botContext(r, 'near', r.serverSlot).serving).toBe(true);
    expect(botContext(r, 'near', (1 - r.serverSlot) as Slot).serving).toBe(false);
    const s = startRally(createMatch(FORMAT_3X15, 'near'), singles());
    expect(botContext(s, 'far', 0)).toMatchObject({ partner: null, serving: false, receiving: true });
  });
});
