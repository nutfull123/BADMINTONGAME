// Player movement, stats, stamina, racket plane, swing, hits and dive. Pure: no three, no DOM.
// facing f points along (sin f, 0, netDir * cos f) where netDir = -1 for near, +1 for far.
import type { HitResult, Intent, PlayerAction, PlayerState, ShuttleState, Side, Stats, Vec3 } from '../types';
import { COURT } from '../physics';
import * as T from './tuning';

export { STAT_BUDGET } from './tuning';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1); // +1 when the player's right is +x and the net is at -z

export function validateStats(s: Stats): string | null {
  if (!Object.hasOwn(T.HEIGHT, s.body)) return `unknown body "${s.body}"`;
  for (const k of ['speed', 'power', 'recovery', 'stamina'] as const) {
    if (!Number.isFinite(s[k]) || s[k] < 0 || s[k] > T.STAT_MAX) return `${k} must be between 0 and ${T.STAT_MAX}`;
  }
  const total = s.speed + s.power + s.recovery + s.stamina;
  return total > T.STAT_BUDGET ? `stats total ${total}, the budget is ${T.STAT_BUDGET}` : null;
}

// Hidden bookkeeping carried on the player between frames. Optional so a plain PlayerState still works.
export interface SimPlayer extends PlayerState {
  swing?: Swing | null;
  swingCooldown?: number;
  diveT?: number;
  diveDir?: { x: number; z: number };
  diveSwung?: boolean;
}
interface Swing { t: number }

export function createPlayer(stats: Stats, side: Side, at: Vec3): PlayerState {
  const p: SimPlayer = {
    side, stats, pos: { ...at }, vel: { x: 0, y: 0, z: 0 }, facing: 0,
    racketHead: { x: at.x, y: 0, z: at.z }, action: 'idle', staminaNow: 1, fatigue: 0, getUpPressesLeft: 0,
  };
  p.racketHead = racketHeadFor(p, 0, 0, false, false);
  return p;
}

function racketHeadFor(p: PlayerState, rx: number, ry: number, serve: boolean, diving: boolean): Vec3 {
  const h = T.HEIGHT[p.stats.body];
  const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT.balanced);
  const top = h * T.RACKET_TOP_FACTOR + T.RACKET_TOP_OFFSET;
  let y = lerp(T.RACKET_LOW, top, (clamp(ry, -1, 1) + 1) / 2) + p.pos.y;
  if (serve) y = Math.min(y, T.SERVE_MAX_CONTACT);
  if (diving) y = Math.min(y, T.DIVE_RACKET_MAX_Y);
  const sgn = sgnOf(p.side);
  return { x: p.pos.x + sgn * clamp(rx, -1, 1) * lateral, y, z: p.pos.z - sgn * T.RACKET_FORWARD };
}

const costScale = (stat: number) => 1 + (T.STAT_MAX / 2 - stat) * T.STAMINA_COST_SPAN;

export function stepPlayer(
  p0: PlayerState, intent: Intent, shuttle: ShuttleState, dt: number, assist: number,
): { player: PlayerState; hit: HitResult | null } {
  const p: SimPlayer = { ...p0 };
  const { stats } = p;
  const sgn = sgnOf(p.side);
  const pos = { ...p.pos };
  const vel = { ...p.vel };
  const grounded = pos.y <= 0;
  let stamina = p.staminaNow;
  let fatigue = p.fatigue;
  const charging = intent.charging !== null;

  // ----- horizontal movement -----
  const speedMul = 1 + ((stats.speed - T.STAT_MAX / 2) / (T.STAT_MAX / 2)) * T.SPEED_STAT_SPAN;
  const tiredMul = lerp(T.LOW_STAMINA_SPEED, 1, clamp(stamina / T.LOW_STAMINA, 0, 1));
  const top = T.BASE_TOP_SPEED * speedMul * T.BODY_SPEED[stats.body] * tiredMul *
    (1 - T.FATIGUE_SPEED_LOSS * fatigue) * (charging ? T.CHARGE_MOVE_FACTOR : 1);
  const accel = T.BASE_ACCEL * speedMul * T.BODY_ACCEL[stats.body] * (grounded ? 1 : T.AIR_CONTROL);
  const turnAccel = accel * T.BODY_TURN[stats.body];

  let mx = clamp(intent.move.x, -1, 1), mz = clamp(intent.move.z, -1, 1);
  const mlen = Math.hypot(mx, mz);
  if (mlen < T.MOVE_DEADZONE) { mx = 0; mz = 0; }
  else if (mlen > 1) { mx /= mlen; mz /= mlen; }
  let dvx = mx * top - vel.x, dvz = mz * top - vel.z;
  const sp = Math.hypot(vel.x, vel.z);
  if (sp > 0.5) {
    // speeding up/braking along the current heading uses accel; changing heading is slower for heavy bodies
    const ux = vel.x / sp, uz = vel.z / sp;
    const along = dvx * ux + dvz * uz;
    let px = dvx - along * ux, pz = dvz - along * uz;
    const plen = Math.hypot(px, pz);
    if (plen > turnAccel * dt) { px *= (turnAccel * dt) / plen; pz *= (turnAccel * dt) / plen; }
    const a = clamp(along, -accel * dt, accel * dt);
    dvx = a * ux + px; dvz = a * uz + pz;
  } else {
    const len = Math.hypot(dvx, dvz);
    if (len > accel * dt) { dvx *= (accel * dt) / len; dvz *= (accel * dt) / len; }
  }
  vel.x += dvx; vel.z += dvz;
  pos.x += vel.x * dt; pos.z += vel.z * dt;

  // stay inside own half
  const depth = clamp(sgn * pos.z, T.NET_CLEARANCE, COURT.halfLength + T.HALF_MARGIN_BACK);
  if (depth !== sgn * pos.z) { pos.z = sgn * depth; vel.z = 0; }
  const wide = COURT.halfWidthSingles + T.HALF_MARGIN_X;
  if (Math.abs(pos.x) > wide) { pos.x = Math.sign(pos.x) * wide; vel.x = 0; }

  // ----- stamina and fatigue -----
  const cost = costScale(stats.stamina);
  const running = Math.hypot(vel.x, vel.z);
  if (charging) stamina -= T.CHARGE_DRAIN * cost * dt;
  else stamina += T.STAMINA_REGEN * (1 + (stats.stamina - T.STAT_MAX / 2) * T.STAMINA_REGEN_SPAN) *
    (1 - T.FATIGUE_REGEN_LOSS * fatigue) * dt;
  if (running > T.MOVING_SPEED) fatigue += T.FATIGUE_BUILD * (running / T.BASE_TOP_SPEED) * cost * dt;
  else fatigue -= T.FATIGUE_DECAY * dt;

  // ----- facing: turn toward the shuttle when it is on this side, else toward the net -----
  const netDir = -sgn;
  const onMySide = sgn * shuttle.pos.z > 0;
  const want = onMySide
    ? clamp(Math.atan2(shuttle.pos.x - pos.x, (shuttle.pos.z - pos.z) * netDir), -T.FACING_LIMIT, T.FACING_LIMIT)
    : 0;
  const turn = T.TURN_RATE * T.BODY_TURN[stats.body] * dt;
  const facing = p.facing + clamp(want - p.facing, -turn, turn);

  let action: PlayerAction = charging ? 'charging' : running > T.MOVING_SPEED || mlen >= T.MOVE_DEADZONE ? 'moving' : 'idle';
  if (!grounded) action = 'airborne';

  p.pos = pos;
  p.vel = vel;
  p.facing = facing;
  p.staminaNow = clamp(stamina, 0, 1);
  p.fatigue = clamp(fatigue, 0, 1);
  p.action = action;
  p.racketHead = racketHeadFor(p, intent.racket.x, intent.racket.y, false, false);
  void assist;
  return { player: p, hit: null };
}
