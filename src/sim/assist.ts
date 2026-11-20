// Demo assists: auto racket, move pull and full auto-move. Pure: no three, no DOM.
import type { AimView, Intent, PlayerState, ShuttleState, Side, Vec3 } from '../types';
import { predictLanding, stepShuttle } from '../physics';
import * as T from './tuning';

export type AssistMode = 'easy' | 'normal' | 'pro' | 'timing';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1);

// Inverse of racketHeadFor in index.ts: the racket input that puts the head closest to `target`.
export function racketInputFor(p: PlayerState, target: Vec3): { x: number; y: number } {
  const h = T.heightOf(p.stats);
  const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT_REF);
  const top = h * T.RACKET_TOP_FACTOR + T.RACKET_TOP_OFFSET;
  return {
    x: clamp(((target.x - p.pos.x) * sgnOf(p.side)) / lateral, -1, 1),
    y: clamp(((target.y - p.pos.y - T.RACKET_LOW) / (top - T.RACKET_LOW)) * 2 - 1, -1, 1),
  };
}

const incoming = (p: PlayerState, s: ShuttleState) => sgnOf(p.side) * s.vel.z > T.ASSIST_INCOMING_SPEED;

// Where the incoming shuttle crosses the racket plane (stepShuttle look-ahead), null when nothing is coming.
function intercept(p: PlayerState, shuttle: ShuttleState): Vec3 | null {
  if (!incoming(p, shuttle)) return null;
  const sgn = sgnOf(p.side);
  const planeZ = p.pos.z - sgn * T.RACKET_FORWARD; // fixed in front of the feet whatever the racket input
  const gap = (z: number) => sgn * (planeZ - z); // > 0 while the plane is still ahead of the shuttle
  if (gap(shuttle.pos.z) <= 0) return shuttle.pos;
  let s = shuttle;
  for (let t = 0; t < T.ASSIST_LOOKAHEAD; t += T.ASSIST_LOOKAHEAD_STEP) {
    const { state, event } = stepShuttle(s, T.ASSIST_LOOKAHEAD_STEP);
    if (event.kind !== 'none') return state.pos; // shortcut: lands or hits the net first, aim at the end point
    if (gap(state.pos.z) <= 0) {
      const f = gap(s.pos.z) / (gap(s.pos.z) - gap(state.pos.z));
      return {
        x: s.pos.x + (state.pos.x - s.pos.x) * f,
        y: s.pos.y + (state.pos.y - s.pos.y) * f,
        z: planeZ,
      };
    }
    s = state;
  }
  return s.pos;
}

// On-screen racket aid: racket.x > 0 (own right for near, own right for far) is the forehand side. The target is
// the live shuttle while it travels toward this player (not a prediction), so it can be met anywhere in the air.
export function aimView(p: PlayerState, shuttle: ShuttleState, assist: number): AimView {
  const target = sgnOf(p.side) * shuttle.vel.z > 0 ? shuttle.pos : null;
  const h = p.racketHead;
  const reach = T.HIT_RADIUS_BASE + clamp(assist, 0, 1) * T.HIT_RADIUS_ASSIST; // same radius as the sim's hit test
  return {
    racket: h,
    target,
    side: sgnOf(p.side) * (h.x - p.pos.x) >= 0 ? 'forehand' : 'backhand',
    onTarget: !!target && Math.hypot(target.x - h.x, target.y - h.y, target.z - h.z) <= reach,
  };
}

export function autoRacket(p: PlayerState, shuttle: ShuttleState): { x: number; y: number } {
  const at = intercept(p, shuttle);
  return at ? racketInputFor(p, at) : { x: 0, y: 0 };
}

export function moveToward(p: PlayerState, target: Vec3, strength: number): { x: number; z: number } {
  const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return { x: 0, z: 0 };
  const mag = clamp(strength, 0, 1) * Math.min(1, d / T.ASSIST_SLOW_RADIUS);
  return { x: (dx / d) * mag, z: (dz / d) * mag };
}

// pro: unchanged. Others: racket position is automatic (the human's flick still aims the shot).
export function applyAssist(intent: Intent, p: PlayerState, shuttle: ShuttleState, mode: AssistMode): Intent {
  if (mode === 'pro') return intent;
  const next: Intent = { ...intent, racket: autoRacket(p, shuttle) };
  if (mode === 'normal') return next;
  const landing = incoming(p, shuttle) ? predictLanding(shuttle) : null;
  if (mode === 'timing') {
    const home = { x: 0, y: 0, z: sgnOf(p.side) * T.ASSIST_HOME_DEPTH };
    next.move = moveToward(p, landing ?? home, 1);
  } else if (landing) {
    const pull = moveToward(p, landing, T.ASSIST_PULL);
    next.move = { x: intent.move.x + pull.x, z: intent.move.z + pull.z };
  }
  return next;
}
