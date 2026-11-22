import { describe, expect, it } from 'vitest';
import { startRally, type Rally } from '../game/rally';
import { FORMAT_3X15, createMatch } from '../rules';
import { createPlayer } from '../sim';
import type { Stats } from '../types';
import { createSnapBuffer, interpDelayTicks, pushSnapshot, sample } from './interpolation';
import type { Snapshot } from './protocol';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const match = createMatch(FORMAT_3X15, 'near', false);
const baseRally = (): Rally =>
  startRally(match, { near: [createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 })], far: [createPlayer(stats, 'far', { x: 0, y: 0, z: -3.5 })] });

function snap(tick: number, o: { farX?: number; shuttle?: [number, number, number]; vel?: [number, number, number]; phase?: Snapshot['phase']; stage?: Rally['stage'] } = {}): Snapshot {
  const rally = baseRally();
  rally.players.far[0] = { ...rally.players.far[0], pos: { x: o.farX ?? 0, y: 0, z: -3.5 } };
  const s = o.shuttle ?? [0, 2, 0];
  const v = o.vel ?? [0, 0, 0];
  rally.shuttle = { pos: { x: s[0], y: s[1], z: s[2] }, vel: { x: v[0], y: v[1], z: v[2] } };
  rally.stage = o.stage ?? 'rally';
  return { tick, ackSeq: 0, phase: o.phase ?? 'rally', match, rally };
}

describe('interpolation', () => {
  it('returns null with no snapshots', () => {
    expect(sample(createSnapBuffer(), 10)).toBeNull();
  });

  it('interpolates players and shuttle at the render tick between two snapshots', () => {
    const buf = createSnapBuffer();
    pushSnapshot(buf, snap(100, { farX: 0, shuttle: [0, 2, 0] }));
    pushSnapshot(buf, snap(104, { farX: 1, shuttle: [2, 2, -4] }));
    const s = sample(buf, 101)!;
    expect(s.players.far[0].pos.x).toBeCloseTo(0.25);
    expect(s.shuttle.pos.x).toBeCloseTo(0.5);
    expect(s.shuttle.pos.z).toBeCloseTo(-1);
    expect(s.snap.tick).toBe(100);
    expect(sample(buf, 104)!.players.far[0].pos.x).toBeCloseTo(1);
  });

  it('picks the right pair among several snapshots', () => {
    const buf = createSnapBuffer();
    for (let i = 0; i < 6; i++) pushSnapshot(buf, snap(100 + i * 4, { farX: i }));
    expect(sample(buf, 110)!.players.far[0].pos.x).toBeCloseTo(2.5);
  });

  it('ignores late and duplicate snapshots', () => {
    const buf = createSnapBuffer();
    pushSnapshot(buf, snap(100));
    pushSnapshot(buf, snap(104));
    pushSnapshot(buf, snap(102));
    pushSnapshot(buf, snap(104));
    expect(buf.snaps.map((s) => s.tick)).toEqual([100, 104]);
  });

  it('holds the last players, and the shuttle after a short run-on, when snapshots stop', () => {
    const buf = createSnapBuffer();
    pushSnapshot(buf, snap(100, { farX: 1, shuttle: [0, 3, 0], vel: [0, 0, -10] }));
    pushSnapshot(buf, snap(104, { farX: 2, shuttle: [0, 3, -0.3], vel: [0, 0, -10] }));
    const soon = sample(buf, 108)!;
    expect(soon.players.far[0].pos.x).toBeCloseTo(2);
    expect(soon.shuttle.pos.z).toBeLessThan(-0.3); // stepped on from the last state
    const late = sample(buf, 500)!;
    const cap = sample(buf, 104 + 12)!;
    expect(late.shuttle).toEqual(cap.shuttle); // held after the cap
    expect(late.players.far[0].pos.x).toBeCloseTo(2);
  });

  it('does not slide players or the shuttle across a new rally', () => {
    const buf = createSnapBuffer();
    pushSnapshot(buf, snap(100, { farX: -2, phase: 'between', shuttle: [3, 0, 5] }));
    pushSnapshot(buf, snap(104, { farX: 2, phase: 'serve', stage: 'serve', shuttle: [0, 1, -3.4] }));
    const s = sample(buf, 102)!;
    expect(s.players.far[0].pos.x).toBeCloseTo(2); // 4 m apart: moved, not walked
    expect(s.shuttle.pos).toEqual({ x: 0, y: 1, z: -3.4 });
  });

  it('draws further back on a slow link, and at least two snapshot intervals', () => {
    expect(interpDelayTicks(0)).toBe(8);
    expect(interpDelayTicks(60)).toBe(9);
    expect(interpDelayTicks(200)).toBeGreaterThan(8);
  });
});
