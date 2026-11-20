import { describe, expect, it } from 'vitest';
import { FORMAT_3X15, awardRally, createMatch } from '../rules';
import { createPlayer, setRandom } from '../sim';
import { botIntent, createBot } from '../sim/bot';
import type { Intent, PlayerState, Stats } from '../types';
import { serviceBox } from '../physics';
import { STEP, aimServe, judgeFloor, runRally, serveSpots, startRally, stepRally } from './rally';

const stats: Stats = { body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const idle = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});
const players = (): [PlayerState, PlayerState] => [
  createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 }), createPlayer(stats, 'far', { x: 0, y: 0, z: -3.5 }),
];

// a human-like serve: hold the short serve for 0.3 s, then release
const scriptedServe = (t: number, p: PlayerState): Intent => {
  const i = idle();
  if (t < 0.3) { i.charging = 'serveShort'; i.chargeTime = t; } else if (t < 0.3 + STEP * 1.5) { i.release = 'serveShort'; i.chargeTime = 0.3; }
  return aimServe(i, p);
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
});

describe('runRally', () => {
  it('a diagonal serve the receiver never touches scores for the server', () => {
    setRandom(() => 0.5);
    const [near, far] = players();
    const out = runRally({
      match: createMatch(FORMAT_3X15, 'near'), near, far,
      intent: (side, r, t) => (side === 'near' ? scriptedServe(t, r.near) : idle()),
    });
    expect(out.result).toEqual({ winner: 'near', reason: 'in' });
  });

  it('places the server and receiver in the diagonal courts', () => {
    const r = startRally(awardRally(createMatch(FORMAT_3X15, 'near'), 'near'), ...players());
    expect(r.court).toBe('left');
    expect(r.near.pos.x).toBeLessThan(0);
    expect(r.far.pos.x).toBeGreaterThan(0);
    expect(serveSpots('far', 'right').server.x).toBeLessThan(0);
  });

  it('during the serve both players stay inside their own service court, off the lines', () => {
    const r = startRally(createMatch(FORMAT_3X15, 'near'), ...players()); // near serves from the right (+x)
    const walk = (x: number, z: number): Intent => ({ ...idle(), move: { x, z } });
    // the server walks hard toward the left court and the net; the receiver walks toward the far left court and back
    for (let i = 0; i < 360; i++) stepRally(r, { near: walk(-1, -1), far: walk(1, -1) }, STEP, 0.7);
    expect(r.stage).toBe('serve');
    const nb = serviceBox('near', 'right'), fb = serviceBox('far', 'right');
    expect(r.near.pos.x).toBeGreaterThan(nb.xMin);
    expect(r.near.pos.z).toBeGreaterThan(nb.zMin);
    expect(r.far.pos.x).toBeLessThan(fb.xMax);
    expect(r.far.pos.z).toBeGreaterThan(fb.zMin);
  });

  it('feet are stationary once the server starts the serve', () => {
    const r = startRally(createMatch(FORMAT_3X15, 'near'), ...players());
    const nearAt = { ...r.near.pos }, farAt = { ...r.far.pos };
    const charge: Intent = { ...idle(), move: { x: 1, z: 1 }, charging: 'serveShort', chargeTime: 0.2 };
    for (let i = 0; i < 60; i++) stepRally(r, { near: charge, far: { ...idle(), move: { x: -1, z: 1 } } }, STEP, 0.7);
    expect(r.near.pos.x).toBeCloseTo(nearAt.x, 6);
    expect(r.near.pos.z).toBeCloseTo(nearAt.z, 6);
    expect(r.far.pos.x).toBeCloseTo(farAt.x, 6);
    expect(r.far.pos.z).toBeCloseTo(farAt.z, 6);
  });

  it('a full rally against the bot ends with a point', () => {
    setRandom(() => 0.5);
    const [near, far] = players();
    const bot = createBot('medium', () => 0.5);
    let match = createMatch(FORMAT_3X15, 'near');
    const out = runRally({
      match, near, far,
      intent: (side, r, t) => (side === 'near'
        ? scriptedServe(t, r.near)
        : botIntent(bot, r.far, r.near, r.shuttle, STEP, r.stage === 'serve' && r.server === 'far')),
    });
    expect(out.result).not.toBeNull();
    match = awardRally(match, out.result!.winner);
    expect(match.score.near + match.score.far).toBe(1);
  });
});
