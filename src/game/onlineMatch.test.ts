import { describe, expect, it } from 'vitest';
import { FORMAT_3X15, awardRally, createMatch } from '../rules';
import { createPlayer } from '../sim';
import type { InputFrame } from '../net/protocol';
import type { Intent, PlayerState, Slot, Stats } from '../types';
import { batchFrames, buildOnlineView, hudMatch, type ViewArgs } from './onlineMatch';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const idle = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});
const frame = (seq: number): InputFrame => ({ seq, tick: 100, intent: idle() });

describe('batchFrames', () => {
  it('splits into messages of at most 16 frames, in order', () => {
    const frames = Array.from({ length: 35 }, (_, i) => frame(i + 1));
    const out = batchFrames(frames);
    expect(out.map((b) => b.length)).toEqual([16, 16, 3]);
    expect(out.flat().map((f) => f.seq)).toEqual(frames.map((f) => f.seq));
    expect(batchFrames([])).toEqual([]);
    expect(batchFrames(frames, 10)).toHaveLength(4);
  });
});

// doubles court: near slot 0/1 at +z, far slot 0/1 at -z, each at a distinct x
const team = (side: 'near' | 'far'): PlayerState[] =>
  [0, 1].map((i) => createPlayer(stats, side, { x: i === 0 ? -1 : 1.5, y: 0, z: side === 'near' ? 3.5 : -3.5 }, i as Slot));

function args(seat: ViewArgs['seat'], over: Partial<ViewArgs> = {}): ViewArgs {
  const players = { near: team('near'), far: team('far') };
  const side = seat % 2 === 0 ? 'near' : 'far';
  const slot = seat >> 1;
  const mine = { ...players[side][slot], pos: { ...players[side][slot].pos, x: 0.7 } }; // predicted: not where the snapshot has it
  return {
    seat, world: { players, shuttle: { pos: { x: 1, y: 2, z: -3 }, vel: { x: 2, y: 0, z: -5 } } }, mine,
    human: null, stage: 'rally', hitAssist: 0.5, landingMarker: false, timingRing: false, racketAid: false, ...over,
  };
}

describe('buildOnlineView', () => {
  it('near seat: world as is, near players first, human is the predicted player', () => {
    const v = buildOnlineView(args(2)); // near, slot 1
    expect(v.players).toHaveLength(4);
    expect(v.players.map((p) => p.side)).toEqual(['near', 'near', 'far', 'far']);
    expect(v.human).toBe(1);
    expect(v.players[1].pos.x).toBe(0.7);
    expect(v.shuttle.pos).toEqual({ x: 1, y: 2, z: -3 });
  });

  it('far seat: court turned around, viewer is near, the real near team is now far', () => {
    const v = buildOnlineView(args(1)); // far, slot 0
    expect(v.players.map((p) => p.side)).toEqual(['near', 'near', 'far', 'far']);
    const me = v.players[v.human!];
    expect(me.side).toBe('near');
    expect(me.slot).toBe(0);
    expect(me.pos).toEqual({ x: -0.7, y: 0, z: 3.5 }); // predicted (0.7, -3.5) turned around
    // the far team (world) is first: x -1/1.5 at z -3.5 become 1/-1.5 at z +3.5
    expect(v.players[1].pos.x).toBeCloseTo(-1.5);
    expect(v.players[2].pos.z).toBeCloseTo(-3.5); // a world near player is now at the far end
    expect(v.shuttle.pos).toEqual({ x: -1, y: 2, z: 3 });
    expect(v.shuttle.vel).toEqual({ x: -2, y: 0, z: 5 });
  });

  it('every seat sees itself at the near end heading the same way for the same world situation', () => {
    for (const seat of [0, 1, 2, 3] as const) {
      const v = buildOnlineView(args(seat));
      expect(v.players[v.human!].side).toBe('near');
      expect(v.players[v.human!].pos.z).toBeGreaterThan(0);
    }
  });

  it('shows the landing marker only when asked and not during the serve; aid only when asked', () => {
    expect(buildOnlineView(args(0)).landing).toBeNull();
    const on = buildOnlineView(args(0, { landingMarker: true, racketAid: true }));
    expect(on.landing).not.toBeNull();
    expect(on.aim).toBeTruthy();
    expect(buildOnlineView(args(0, { landingMarker: true, stage: 'serve' })).landing).toBeNull();
  });

  it('charge meter follows the human input', () => {
    const v = buildOnlineView(args(0, { human: { ...idle(), charging: 'smash', chargeTime: 0.3 } }));
    expect(v.charge).toBeGreaterThan(0);
    expect(buildOnlineView(args(0)).charge).toBeNull();
  });

  it('works for singles (two players)', () => {
    const a = args(1);
    a.world = { ...a.world, players: { near: [team('near')[0]], far: [team('far')[0]] } };
    const v = buildOnlineView(a);
    expect(v.players).toHaveLength(2);
    expect(v.human).toBe(0);
  });
});

describe('hudMatch', () => {
  it('swaps the score for a far seat and keeps it for a near seat', () => {
    let m = createMatch(FORMAT_3X15, 'near', false);
    m = awardRally(awardRally(m, 'near'), 'near');
    expect(hudMatch(m, 'rally', 0).score).toEqual({ near: 2, far: 0 });
    expect(hudMatch(m, 'rally', 1).score).toEqual({ near: 0, far: 2 });
  });

  it('shows the interval banner only between points', () => {
    const m = { ...createMatch(FORMAT_3X15, 'near', false), intervalNow: true };
    expect(hudMatch(m, 'rally', 0).intervalNow).toBe(false);
    expect(hudMatch(m, 'interval', 0).intervalNow).toBe(true);
  });
});
