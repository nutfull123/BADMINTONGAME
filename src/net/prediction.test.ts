import { describe, expect, it } from 'vitest';
import { startRally, type Rally } from '../game/rally';
import { FORMAT_3X15, createMatch } from '../rules';
import { createPlayer } from '../sim';
import type { Intent, PlayerState, Stats } from '../types';
import {
  SNAP_DISTANCE, createPredictor, decayError, drawnPlayer, localStep, predict, reconcile, type PredCtx,
} from './prediction';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 6, power: 5, recovery: 5, stamina: 4 };
const idle = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});
const match = createMatch(FORMAT_3X15, 'near', false);
const me = (): PlayerState => createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });

function ctx(): PredCtx {
  const rally: Rally = startRally(match, { near: [me()], far: [createPlayer(stats, 'far', { x: 0, y: 0, z: -3.5 })] });
  rally.stage = 'rally';
  rally.lastHitter = 'far';
  // the shuttle is far away on the other half, so the sim only walks the player
  return { shuttle: { pos: { x: 0, y: 3, z: -4 }, vel: { x: 0, y: 0, z: 0 } }, rally, mode: 'pro', hitAssist: 0.5 };
}

// A scripted input stream: runs right, then diagonally, with a stop.
const input = (n: number): Intent => ({ ...idle(), move: n < 40 ? { x: 1, z: 0 } : n < 70 ? { x: -0.6, z: -0.8 } : { x: 0, z: 0 } });

// What the server does with the same inputs.
function serverAfter(n: number, c: PredCtx): PlayerState {
  let p = me();
  for (let i = 1; i <= n; i++) p = localStep(p, input(i), c);
  return p;
}

function started(c: PredCtx) {
  const pr = createPredictor();
  reconcile(pr, me(), 0, c);
  return pr;
}

describe('prediction', () => {
  it('does nothing before the first snapshot', () => {
    expect(predict(createPredictor(), idle(), ctx())).toBeNull();
  });

  it('moves at once and hands out increasing seqs', () => {
    const c = ctx();
    const pr = started(c);
    const z0 = pr.player!.pos.x;
    expect(predict(pr, input(1), c)).toBe(1);
    expect(predict(pr, input(2), c)).toBe(2);
    expect(pr.player!.pos.x).toBeGreaterThan(z0);
    expect(pr.pending.map((i) => i.seq)).toEqual([1, 2]);
  });

  it('replays unacknowledged inputs and matches the server when nothing is lost', () => {
    const c = ctx();
    const pr = started(c);
    for (let i = 1; i <= 90; i++) predict(pr, input(i), c);
    // a snapshot that has applied 60 of the 90 inputs arrives
    reconcile(pr, serverAfter(60, c), 60, c);
    expect(pr.pending.map((i) => i.seq)[0]).toBe(61);
    expect(pr.pending).toHaveLength(30);
    const want = serverAfter(90, c);
    expect(pr.player!.pos.x).toBeCloseTo(want.pos.x, 9);
    expect(pr.player!.pos.z).toBeCloseTo(want.pos.z, 9);
    expect(Math.hypot(pr.error.x, pr.error.z)).toBeLessThan(1e-9); // no visible correction at all
    expect(drawnPlayer(pr)!.pos.x).toBeCloseTo(want.pos.x, 9);
  });

  it('blends a small correction over a few frames', () => {
    const c = ctx();
    const pr = started(c);
    for (let i = 1; i <= 60; i++) predict(pr, input(i), c);
    const shown = drawnPlayer(pr)!.pos.x;
    const server = serverAfter(40, c);
    server.pos = { ...server.pos, x: server.pos.x + 0.2 }; // the server disagrees by 20 cm
    reconcile(pr, server, 40, c);
    const target = pr.player!.pos.x;
    expect(Math.abs(target - shown)).toBeGreaterThan(0.15);
    expect(drawnPlayer(pr)!.pos.x).toBeCloseTo(shown, 6); // nothing jumps on screen
    for (let f = 0; f < 12; f++) decayError(pr, 1 / 60); // 0.2 s later
    expect(Math.abs(drawnPlayer(pr)!.pos.x - target)).toBeLessThan(0.04);
    for (let f = 0; f < 120; f++) decayError(pr, 1 / 60);
    expect(drawnPlayer(pr)!.pos.x).toBe(target);
  });

  it('snaps on a big correction', () => {
    const c = ctx();
    const pr = started(c);
    for (let i = 1; i <= 60; i++) predict(pr, input(i), c);
    const server = serverAfter(60, c);
    server.pos = { ...server.pos, z: server.pos.z - (SNAP_DISTANCE + 2) };
    reconcile(pr, server, 60, c);
    expect(pr.error).toEqual({ x: 0, y: 0, z: 0 });
    expect(drawnPlayer(pr)!.pos.z).toBeCloseTo(server.pos.z, 9);
  });

  it('follows the server and forgets inputs when it is not live (between points)', () => {
    const c = ctx();
    const pr = started(c);
    for (let i = 1; i <= 10; i++) predict(pr, input(i), c);
    const server = { ...me(), pos: { x: 1.5, y: 0, z: 3.5 } };
    reconcile(pr, server, 3, c, false);
    expect(pr.pending).toEqual([]);
    expect(drawnPlayer(pr)!.pos).toEqual(server.pos);
  });

  it('keeps the serving player\'s feet still during a serve swing, as the server does', () => {
    const c = ctx();
    c.rally.stage = 'serve';
    c.rally.server = 'near';
    c.rally.serverSlot = 0;
    const p = me();
    const serve: Intent = { ...idle(), charging: 'serveShort', chargeTime: 0.2, move: { x: 1, z: 0 } };
    expect(localStep(p, serve, c).pos).toEqual(p.pos);
  });
});
