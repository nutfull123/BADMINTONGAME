// Player movement, stats, stamina, racket plane, swing, hits and dive. Pure: no three, no DOM.
// facing f points along (sin f, 0, netDir * cos f) where netDir = -1 for near, +1 for far.
import type { HitResult, Intent, PlayerAction, PlayerState, ShotType, ShuttleState, Side, Stats, Vec3 } from '../types';
import { COURT } from '../physics';
import { launchShuttle } from './shots';
import * as T from './tuning';

export { STAT_BUDGET } from './tuning';
export { setRandom } from './shots';

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
interface Contact { d: number; pos: Vec3; flick: { x: number; y: number }; rx: number }
interface Swing {
  t: number;                           // seconds since release
  shot: ShotType;
  charge: number;                      // 0..1, fixed at release
  basic: 'forehand' | 'backhand' | null;
  lift: boolean;                       // the one-chance lift from a dive
  best: Contact | null;                // closest approach inside the hit radius so far
}

// 0..1 charge reached after holding `chargeTime` seconds; low stamina and fatigue lower the ceiling.
export function chargeLevel(p: Pick<PlayerState, 'staminaNow' | 'fatigue'>, chargeTime: number): number {
  const cap = lerp(T.LOW_STAMINA_CHARGE_CAP, 1, clamp(p.staminaNow / T.STAMINA_FULL_CHARGE, 0, 1)) *
    (1 - T.FATIGUE_CHARGE_LOSS * p.fatigue);
  return Math.min(clamp(chargeTime / T.CHARGE_FULL_TIME, 0, 1), cap);
}

// Closest point of segment a-b to c, so a fast shuttle cannot tunnel through the hit radius between frames.
function nearest(c: Vec3, a: Vec3, b: Vec3): { d: number; point: Vec3 } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 0 ? clamp(((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2, 0, 1) : 1;
  const point = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
  return { d: Math.hypot(c.x - point.x, c.y - point.y, c.z - point.z), point };
}

const isServe = (s: ShotType | null) => s === 'serveShort' || s === 'serveLong';

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

  p.pos = pos;
  p.vel = vel;
  p.facing = facing;
  p.staminaNow = clamp(stamina, 0, 1);
  p.fatigue = clamp(fatigue, 0, 1);

  // ----- swing: starts on release / net shot / basic swing, lasts SWING_WINDOW -----
  let swing: Swing | null = p.swing ? { ...p.swing } : null;
  let cooldown = Math.max(0, (p.swingCooldown ?? 0) - dt);
  if (!swing && cooldown <= 0) {
    const shot: ShotType | null = intent.release ?? (intent.netShot ? 'net' : intent.basicSwing ? 'basic' : null);
    if (shot) {
      const flat = shot === 'basic' || shot === 'net';
      swing = { t: 0, shot, charge: flat ? 0 : chargeLevel(p, intent.chargeTime), basic: shot === 'basic' ? intent.basicSwing : null, lift: false, best: null };
      cooldown = T.SWING_COOLDOWN;
    }
  }
  const serving = isServe(swing?.shot ?? null) || isServe(intent.charging) || isServe(intent.release);
  p.racketHead = racketHeadFor(p, intent.racket.x, intent.racket.y, serving, false);

  let hit: HitResult | null = null;
  if (swing) {
    const prev = { x: shuttle.pos.x - shuttle.vel.x * dt, y: shuttle.pos.y - shuttle.vel.y * dt, z: shuttle.pos.z - shuttle.vel.z * dt };
    const { d, point } = nearest(p.racketHead, prev, shuttle.pos);
    const radius = T.HIT_RADIUS_BASE + clamp(assist, 0, 1) * T.HIT_RADIUS_ASSIST;
    let resolve = false;
    if (d <= radius) {
      // contact is the closest approach: keep the best frame and resolve once the shuttle starts moving away
      if (!swing.best || d < swing.best.d) swing.best = { d, pos: point, flick: { ...intent.racketVel }, rx: intent.racket.x };
      else resolve = true;
    } else if (swing.best) resolve = true;
    swing.t += dt;
    if (swing.t >= T.SWING_WINDOW) resolve = true;
    if (resolve) {
      if (swing.best) hit = makeHit(p, swing, swing.best);
      swing = null;
    }
  }

  let action: PlayerAction = charging ? 'charging' : running > T.MOVING_SPEED || mlen >= T.MOVE_DEADZONE ? 'moving' : 'idle';
  if (!grounded) action = 'airborne';
  if (swing) action = 'swinging';
  p.action = action;
  p.swing = swing;
  p.swingCooldown = cooldown;
  return { player: p, hit };
}

function makeHit(p: PlayerState, swing: Swing, c: Contact): HitResult {
  const wrongSide = (swing.basic === 'forehand' && c.rx < -T.WRONG_SIDE_DEADZONE) ||
    (swing.basic === 'backhand' && c.rx > T.WRONG_SIDE_DEADZONE);
  const perfect = !wrongSide && !swing.lift && c.d < T.SWEET_RADIUS;
  const shot: ShotType = swing.lift ? 'clear' : swing.shot;
  const launch = launchShuttle({
    shot, side: p.side, contact: c.pos, flick: c.flick, charge: swing.charge, perfect, weak: wrongSide, stats: p.stats,
  });
  return { shot, perfect, launch };
}
