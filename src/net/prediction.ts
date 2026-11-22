// Client-side prediction of the player's own movement. Inputs are stepped locally at once with the same code the
// server runs, kept by seq, and replayed on top of each authoritative snapshot (inputs with seq <= ackSeq are
// already in the server's state). Pure: no DOM, no timers. Works in world axes: the caller un-mirrors the intent
// and mirrors the result for a far seat.
import { aimServe, serveStance, type Rally } from '../game/rally';
import { stepPlayer } from '../sim';
import { applyAssist, type AssistMode } from '../sim/assist';
import type { Intent, PlayerState, ShuttleState, Vec3 } from '../types';
import { TICK_HZ } from './protocol';

export const STEP = 1 / TICK_HZ;
export const SNAP_DISTANCE = 1.0; // m: a correction bigger than this snaps; smaller ones are blended away
const BLEND_TAU = 0.1;            // s: time constant of the blend
const MAX_PENDING = 480;          // 4 s of inputs; beyond that the server has stopped acknowledging

export interface PredCtx {
  shuttle: ShuttleState; // the shuttle as drawn
  rally: Rally;          // the newest snapshot's rally: stage, server, receiver, court, doubles
  mode: AssistMode;      // the room's assist mode (the server applies the same one)
  hitAssist: number;     // 0..1
}

export interface PendingInput { seq: number; intent: Intent }

export interface Predictor {
  player: PlayerState | null; // the predicted state "now" (null until the first snapshot)
  pending: PendingInput[];    // sent, not yet acknowledged
  error: Vec3;                // draw offset that shrinks to zero: a small correction shown as a glide
  seq: number;                // last seq handed out
}

export const createPredictor = (): Predictor => ({ player: null, pending: [], error: { x: 0, y: 0, z: 0 }, seq: 0 });

const IDLE: Intent = {
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
};

// One tick for this player, the way stepRally does it: assists, the sim, then the feet-still rule of a serve.
// The hit (if any) is ignored here: the server decides contacts.
export function localStep(p: PlayerState, raw: Intent, ctx: PredCtx): PlayerState {
  const r = ctx.rally;
  const isServer = p.side === r.server && p.slot === r.serverSlot;
  const isReceiver = p.side !== r.server && p.slot === r.receiverSlot;
  const intent = isServer && r.stage === 'serve' ? aimServe(raw, p) : applyAssist(raw, p, ctx.shuttle, ctx.mode);
  const out = stepPlayer(p, intent, ctx.shuttle, STEP, ctx.hitAssist, r.doubles).player;
  return r.stage === 'serve' && (isServer || isReceiver)
    ? serveStance(out, p, r.court, isServer ? intent : IDLE, r.doubles) : out;
}

// Step the player with a new input now. Returns the seq to send it under, or null before the first snapshot.
export function predict(pr: Predictor, intent: Intent, ctx: PredCtx): number | null {
  if (!pr.player) return null;
  const seq = ++pr.seq;
  pr.pending.push({ seq, intent });
  if (pr.pending.length > MAX_PENDING) pr.pending.shift();
  pr.player = localStep(pr.player, intent, ctx);
  return seq;
}

export function drawnPlayer(pr: Predictor): PlayerState | null {
  const p = pr.player;
  if (!p) return null;
  const { x, y, z } = pr.error;
  if (x === 0 && y === 0 && z === 0) return p;
  return { ...p, pos: { x: p.pos.x + x, y: p.pos.y + y, z: p.pos.z + z }, racketHead: { x: p.racketHead.x + x, y: p.racketHead.y + y, z: p.racketHead.z + z } };
}

// A snapshot arrived: start from the server's player, drop what it has applied, replay the rest.
// `live` is false between points, when the server is not applying inputs: just follow the server.
export function reconcile(pr: Predictor, server: PlayerState, ackSeq: number, ctx: PredCtx, live = true): void {
  const before = drawnPlayer(pr);
  pr.pending = live ? pr.pending.filter((i) => i.seq > ackSeq) : [];
  let p = server;
  for (const i of pr.pending) p = localStep(p, i.intent, ctx);
  pr.player = p;
  if (!before) { pr.error = { x: 0, y: 0, z: 0 }; return; }
  const ex = before.pos.x - p.pos.x, ey = before.pos.y - p.pos.y, ez = before.pos.z - p.pos.z;
  // big miss (a hit knocked the player, a new rally moved them): snap. small: keep drawing where it was and glide
  pr.error = Math.hypot(ex, ez) > SNAP_DISTANCE || !live ? { x: 0, y: 0, z: 0 } : { x: ex, y: ey, z: ez };
}

export function decayError(pr: Predictor, dt: number): void {
  const k = Math.exp(-dt / BLEND_TAU);
  const e = pr.error;
  pr.error = Math.hypot(e.x, e.y, e.z) < 1e-4 ? { x: 0, y: 0, z: 0 } : { x: e.x * k, y: e.y * k, z: e.z * k };
}
