import { describe, expect, it } from 'vitest';
import { botContext } from '../src/game/rally';
import { REWIND_MAX_TICKS, SNAPSHOT_HZ, TICK_HZ, type RoomSettings, type ServerMessage, type Snapshot } from '../src/net/protocol';
import { createBot, botIntent } from '../src/sim/bot';
import type { Intent, ShuttleState, Stats } from '../src/types';
import { MatchLoop, ShuttleHistory, seatSide, seatSlot } from './match';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const settings = (o: Partial<RoomSettings> = {}): RoomSettings => ({
  event: 'MS', format: '3x15', assists: { mode: 'pro', hitAssist: 50 }, points: 'real', ...o,
});
const idle: Intent = {
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
};
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

// A fake human that plays by running a bot on every snapshot it receives and answers with one input frame.
function fakeHuman(loop: MatchLoop, seat: 0 | 1 | 2 | 3, seed: number) {
  const rng = seeded(seed);
  const side = seatSide(seat), slot = seatSlot(seat);
  let bot = createBot('medium', rng);
  let wasServing = false;
  let seq = 0;
  const out = { snaps: [] as Snapshot[], ends: [] as ServerMessage[], sent: [] as number[] };
  loop.attach(seat, (m) => {
    if (m.t === 'end') out.ends.push(m);
    if (m.t !== 'snap') return;
    const { rally } = m.snap;
    out.snaps.push({ ...m.snap, rally: undefined as never, match: undefined as never }); // keep the numbers, not the live state
    if (rally.stage === 'serve' && !wasServing) bot = createBot('medium', rng);
    wasServing = rally.stage === 'serve';
    const intent = botIntent(bot, rally.players[side][slot], botContext(rally, side, slot), rally.shuttle, 1 / SNAPSHOT_HZ);
    out.sent.push(seq);
    loop.input(seat, [{ seq: seq++, tick: m.snap.tick, intent }]);
  });
  return out;
}

describe('MatchLoop', () => {
  it('plays a whole match: bots and two fake humans, a fake clock, a winner at the end', () => {
    const ends: unknown[] = [];
    const loop = new MatchLoop({ settings: settings({ event: 'MD' }), stats: [stats, stats, stats, stats], rng: seeded(7), onEnd: (w, g) => ends.push([w, g]) });
    const a = fakeHuman(loop, 0, 1), b = fakeHuman(loop, 1, 2);
    let now = 0;
    loop.update(now);
    for (let i = 0; i < 60 * 60 * 20 && loop.phase !== 'finished'; i++) loop.update((now += 1000 / 60)); // up to 20 minutes
    expect(loop.phase).toBe('finished');
    expect(loop.match.winner).not.toBeNull();
    expect(ends).toHaveLength(1);
    for (const h of [a, b]) {
      expect(h.ends).toHaveLength(1);
      const end = h.ends[0] as Extract<ServerMessage, { t: 'end' }>;
      expect(end.winner).toBe(loop.match.winner);
      expect(Math.max(...end.games.map((g) => Math.max(g.near, g.far)))).toBeGreaterThanOrEqual(15);
      expect(h.snaps.at(-1)!.phase).toBe('finished');
    }
  }, 60_000);

  it('sends snapshots at SNAPSHOT_HZ with each client\'s own ackSeq', () => {
    const loop = new MatchLoop({ settings: settings(), stats: [stats, stats], rng: seeded(3) });
    const a = fakeHuman(loop, 0, 1), b = fakeHuman(loop, 1, 2);
    let now = 0;
    loop.update(now);
    for (let i = 0; i < 60 * 10; i++) loop.update((now += 1000 / 60)); // 10 s
    expect(loop.tick).toBeGreaterThanOrEqual(TICK_HZ * 10 - 2);
    expect(loop.tick).toBeLessThanOrEqual(TICK_HZ * 10 + 2);
    for (const h of [a, b]) {
      expect(h.snaps).toHaveLength(Math.floor(loop.tick / (TICK_HZ / SNAPSHOT_HZ)));
      expect(h.snaps.map((s) => s.tick)).toEqual(h.snaps.map((_, i) => (i + 1) * 4));
      const acks = h.snaps.map((s) => s.ackSeq);
      expect(acks[0]).toBe(-1); // nothing is applied during the 3 s before the first serve
      expect([...acks].sort((x, y) => x - y)).toEqual(acks);
      let checked = 0;
      h.snaps.forEach((s, i) => {
        const inPlay = (k: number) => h.snaps[k]?.phase === 'serve' || h.snaps[k]?.phase === 'rally';
        // one frame per tick, one frame sent per snapshot: in continuous play the ack is the frame sent a snapshot ago
        if (i >= 2 && inPlay(i) && inPlay(i - 1) && inPlay(i - 2)) { expect(s.ackSeq).toBe(i - 1); checked++; }
      });
      expect(checked).toBeGreaterThan(50);
    }
    expect(b.snaps.at(-1)!.ackSeq).not.toBe(-1);
  });

  it('a stalled clock does not simulate more than a quarter second at once', () => {
    const loop = new MatchLoop({ settings: settings(), stats: [stats, stats] });
    loop.update(0);
    loop.update(60_000);
    expect(loop.tick).toBeLessThanOrEqual(Math.ceil(0.25 * TICK_HZ) + 1);
  });

  it('drops repeated or older input frames and ignores a seat nobody holds', () => {
    const loop = new MatchLoop({ settings: settings(), stats: [stats, stats] });
    const got: Snapshot[] = [];
    loop.attach(0, (m) => { if (m.t === 'snap') got.push(m.snap); });
    loop.input(0, [{ seq: 1, tick: 0, intent: idle }]); // between points: dropped, not acknowledged
    for (let i = 0; i < 8; i++) loop.step();
    expect(got.at(-1)!.ackSeq).toBe(-1);
    loop.phase = 'play';
    loop.input(1, [{ seq: 5, tick: 0, intent: idle }]); // seat 1 is a bot: nothing happens
    loop.input(0, [{ seq: 5, tick: 0, intent: idle }, { seq: 3, tick: 0, intent: idle }, { seq: 5, tick: 0, intent: idle }]);
    for (let i = 0; i < 8; i++) loop.step();
    expect(got.at(-1)!.ackSeq).toBe(5);
    // a client that rejoins keeps counting: seqs above the last one seen are accepted, and the ack does not go back
    loop.detach(0);
    const again: Snapshot[] = [];
    loop.attach(0, (m) => { if (m.t === 'snap') again.push(m.snap); });
    loop.input(0, [{ seq: 5, tick: 0, intent: idle }, { seq: 9, tick: 0, intent: idle }]);
    for (let i = 0; i < 4; i++) loop.step();
    expect(again[0].ackSeq).toBe(9);
  });

  it('a detached seat is played by a bot (the match goes on)', () => {
    const loop = new MatchLoop({ settings: settings(), stats: [stats, stats], rng: seeded(11) });
    loop.attach(0, () => {});
    loop.detach(0);
    let now = 0;
    loop.update(now);
    for (let i = 0; i < 60 * 60 * 20 && loop.phase !== 'finished'; i++) loop.update((now += 1000 / 60));
    expect(loop.phase).toBe('finished');
  }, 60_000);
});

describe('lag compensation', () => {
  const sh = (z: number): ShuttleState => ({ pos: { x: 0, y: 1, z }, vel: { x: 0, y: 0, z: -30 } });

  it('ShuttleHistory: finds the state a number of ticks back, clamps to the window, null for no lag', () => {
    const h = new ShuttleHistory();
    for (let t = 100; t < 130; t++) h.push(t, sh(t));
    expect(h.view(130, 0)).toBeNull();
    expect(h.view(130, 5)).toMatchObject({ ticks: 5, shuttle: { pos: { z: 125 } } });
    expect(h.view(130, 500)).toMatchObject({ ticks: REWIND_MAX_TICKS, shuttle: { pos: { z: 130 - REWIND_MAX_TICKS } } });
    expect(h.view(130, -4)).toBeNull();
    const short = new ShuttleHistory();
    short.push(128, sh(128));
    expect(short.view(130, 10)).toMatchObject({ ticks: 2 }); // only what is recorded
  });

  // A rally in progress: the shuttle flies away from the near human at 20 m/s (0.17 m per tick). The player swings with a
  // frame that says it was looking at the tick `claim` ticks ago, after the shuttle has flown for `flown` ticks.
  function scenario(flown: number, claim: number) {
    const loop = new MatchLoop({ settings: settings({ assists: { mode: 'normal', hitAssist: 100 } }), stats: [stats, stats], rng: seeded(5) });
    loop.attach(0, () => {});
    loop.phase = 'play';
    const r = loop.rally;
    r.stage = 'rally';
    r.lastHitter = 'far';
    r.players.near[0].pos = { x: 0, y: 0, z: 3 };
    r.shuttle = { pos: { x: 0, y: 1.0, z: 2.8 }, vel: { x: 0, y: 0, z: 20 } };
    for (let i = 0; i < flown; i++) loop.step();
    loop.input(0, [{ seq: 1, tick: Math.max(0, loop.tick - claim), intent: { ...idle, basicSwing: 'forehand' } }]);
    const lastHitter = () => r.lastHitter as string | null; // changes inside step()
    for (let i = 0; i < 20 && lastHitter() !== 'near'; i++) loop.step();
    return { hit: lastHitter() === 'near', loop };
  }

  it('hits a shuttle the player saw a few ticks ago, and launches it from there', () => {
    const { hit, loop } = scenario(10, 10);
    expect(hit).toBe(true);
    expect(loop.rally.shuttle.vel.z).toBeLessThan(0); // returned toward the far court
  });

  it('the oldest tick inside the window still counts', () => {
    expect(scenario(REWIND_MAX_TICKS, REWIND_MAX_TICKS).hit).toBe(true);
  });

  it('refuses it when the frame claims a tick outside the rewind window', () => {
    expect(scenario(40, 40).hit).toBe(false); // claims 40 ticks back; only 14 count, and by then it was out of reach
  });

  it('without lag information (the current tick) the same swing misses', () => {
    expect(scenario(10, 0).hit).toBe(false);
  });
});
