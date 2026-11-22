// Shows the other players and the shuttle a little in the past, between the two snapshots around the render
// time, so 30 Hz snapshots look smooth. Pure: no DOM, no timers; the caller supplies the render tick.
import { stepShuttle } from '../physics';
import type { PlayerState, ShuttleState, Side, Vec3 } from '../types';
import { SNAPSHOT_HZ, TICK_HZ, type Snapshot } from './protocol';

const MAX_SNAPS = 32;
const TELEPORT_M = 2.5;        // a player further than this between two snapshots was moved (new rally), not walking
const EXTRAP_MAX_TICKS = 12;   // the shuttle is stepped on past the newest snapshot for at most this long, then held
const RESET_TICKS = 600;       // the tick went backwards by this much: a new match, drop the old snapshots

export interface SnapBuffer { snaps: Snapshot[] } // ascending by tick

export const createSnapBuffer = (): SnapBuffer => ({ snaps: [] });

export function pushSnapshot(buf: SnapBuffer, snap: Snapshot): void {
  const last = buf.snaps[buf.snaps.length - 1];
  if (last && snap.tick <= last.tick) {
    if (snap.tick > last.tick - RESET_TICKS) return; // late or duplicate packet
    buf.snaps.length = 0;
  }
  buf.snaps.push(snap);
  if (buf.snaps.length > MAX_SNAPS) buf.snaps.shift();
}

// How far behind the newest data to draw: two snapshot intervals, and never so little that the newest snapshot
// is still in flight (one-way time plus one interval, plus a tick of slack).
export function interpDelayTicks(rttMs: number): number {
  const interval = TICK_HZ / SNAPSHOT_HZ;
  return Math.max(2 * interval, Math.ceil((rttMs / 2) * (TICK_HZ / 1000)) + interval + 1);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
const dist2d = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

export function lerpPlayer(a: PlayerState, b: PlayerState, t: number): PlayerState {
  if (dist2d(a.pos, b.pos) > TELEPORT_M) return b;
  const near = t < 0.5 ? a : b; // discrete parts (action, hidden swing state) switch at the midpoint
  return {
    ...near,
    pos: lerpVec(a.pos, b.pos, t),
    vel: lerpVec(a.vel, b.vel, t),
    racketHead: lerpVec(a.racketHead, b.racketHead, t),
    facing: lerp(a.facing, b.facing, t),
    staminaNow: lerp(a.staminaNow, b.staminaNow, t),
    fatigue: lerp(a.fatigue, b.fatigue, t),
  };
}

const jumped = (a: Snapshot, b: Snapshot) =>
  a.phase === 'between' || a.phase === 'interval' || a.phase === 'finished' || (a.phase !== b.phase && b.phase === 'serve');

function stepOn(s: ShuttleState, ticks: number): ShuttleState {
  let cur = s;
  let left = ticks;
  while (left > 1e-9) {
    const dt = Math.min(1, left) / TICK_HZ;
    const { state, event } = stepShuttle(cur, dt);
    cur = state;
    left -= 1;
    if (event.kind !== 'none') break; // hit the net or the floor: hold there
  }
  return cur;
}

export interface Sampled {
  players: Record<Side, PlayerState[]>;
  shuttle: ShuttleState;
  snap: Snapshot; // the snapshot at or just before the render tick: phase, match, rally stage and the like
}

export function sample(buf: SnapBuffer, renderTick: number): Sampled | null {
  const { snaps } = buf;
  if (snaps.length === 0) return null;
  const last = snaps[snaps.length - 1];
  if (renderTick >= last.tick) {
    const over = Math.min(renderTick - last.tick, EXTRAP_MAX_TICKS);
    const live = last.phase === 'rally' && last.rally.stage !== 'serve';
    return {
      players: last.rally.players,
      shuttle: live && over > 0 ? stepOn(last.rally.shuttle, over) : last.rally.shuttle,
      snap: last,
    };
  }
  if (renderTick <= snaps[0].tick) return { players: snaps[0].rally.players, shuttle: snaps[0].rally.shuttle, snap: snaps[0] };
  let i = snaps.length - 1;
  while (snaps[i].tick > renderTick) i--;
  const a = snaps[i];
  const b = snaps[i + 1];
  const t = (renderTick - a.tick) / (b.tick - a.tick);
  const mix = (side: Side) => a.rally.players[side].map((p, k) => (b.rally.players[side][k] ? lerpPlayer(p, b.rally.players[side][k], t) : p));
  const shuttle = jumped(a, b)
    ? b.rally.shuttle
    : { pos: lerpVec(a.rally.shuttle.pos, b.rally.shuttle.pos, t), vel: lerpVec(a.rally.shuttle.vel, b.rally.shuttle.vel, t) };
  return { players: { near: mix('near'), far: mix('far') }, shuttle, snap: a };
}
