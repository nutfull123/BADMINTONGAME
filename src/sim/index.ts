// Player movement, stats, stamina, racket plane, swing, hits and dive. Pure: no three, no DOM.
// facing f points along (sin f, 0, netDir * cos f) where netDir = -1 for near, +1 for far.
import type { HitResult, Intent, PlayerAction, PlayerState, ShotType, ShuttleState, Side, Slot, Stats, Vec3 } from '../types';
import { COURT, predictLanding } from '../physics';
import { launchShuttle } from './shots';
import type { FootworkView } from './footwork';
import * as T from './tuning';

export { STAT_BUDGET } from './tuning';
export { setRandom } from './shots';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1); // +1 when the player's right is +x and the net is at -z

export function validateStats(s: Stats): string | null {
  if (!Object.hasOwn(T.HEIGHT, s.gender)) return `unknown gender "${s.gender}"`;
  if (!Object.hasOwn(T.HEIGHT[s.gender], s.body)) return `unknown body "${s.body}"`;
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
  // footwork (see footwork.ts): view for render plus the timers behind it
  fw?: FootworkView;
  fwCycle?: number;      // 0..1 chasse/crossover step cycle
  fwIncoming?: boolean;  // the shuttle was heading at this player last frame
  splitT?: number;       // s of split hop left
  splitDur?: number;     // length of the current hop
  boostT?: number;       // s of reaction boost left
  lungeT?: number;       // s of lunge delay left (no movement)
  lungeDur?: number;     // length of the current lunge delay
  recoverT?: number;     // s of "recover" label left after a swing
}
interface Contact { d: number; pos: Vec3; flick: { x: number; y: number }; rx: number }
interface Swing {
  lungeBest?: Contact | null;          // closest approach of the lunge-extended racket, used only if the normal reach misses
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

export function createPlayer(stats: Stats, side: Side, at: Vec3, slot: Slot = 0): PlayerState {
  const p: SimPlayer = {
    side, slot, stats, pos: { ...at }, vel: { x: 0, y: 0, z: 0 }, facing: 0,
    racketHead: { x: at.x, y: 0, z: at.z }, action: 'idle', staminaNow: 1, fatigue: 0, getUpPressesLeft: 0,
  };
  p.racketHead = racketHeadFor(p, 0, 0, false, false);
  return p;
}

export function racketHeadFor(p: PlayerState, rx: number, ry: number, serve: boolean, diving: boolean): Vec3 {
  const h = T.heightOf(p.stats);
  const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT_REF);
  const top = h * T.RACKET_TOP_FACTOR + T.RACKET_TOP_OFFSET;
  let y = lerp(T.RACKET_LOW, top, (clamp(ry, -1, 1) + 1) / 2) + p.pos.y;
  if (serve) y = Math.min(y, T.SERVE_MAX_CONTACT);
  if (diving) y = Math.min(y, T.DIVE_RACKET_MAX_Y);
  const sgn = sgnOf(p.side);
  return { x: p.pos.x + sgn * clamp(rx, -1, 1) * lateral, y, z: p.pos.z - sgn * T.RACKET_FORWARD };
}

const costScale = (stat: number) => 1 + (T.STAT_MAX / 2 - stat) * T.STAMINA_COST_SPAN;
const jumpHeight = (s: Stats, charge: number) =>
  lerp(T.JUMP_MIN, T.JUMP_MAX, clamp(charge / T.JUMP_CHARGE_FULL, 0, 1)) * T.BODY_JUMP[s.body] *
  (1 + (s.power - T.STAT_MAX / 2) * T.JUMP_POWER_SPAN);
const regenPerSecond = (s: Stats, fatigue: number) =>
  T.STAMINA_REGEN * (1 + (s.stamina - T.STAT_MAX / 2) * T.STAMINA_REGEN_SPAN) * (1 - T.FATIGUE_REGEN_LOSS * fatigue);

// Between points: part of the stamina and fatigue comes back, any dive or swing state is cleared, and the player is
// put back at `at` (the game picks the serve/receive spot).
export function recoverBetweenPoints(p: PlayerState, at: Vec3): PlayerState {
  const q: SimPlayer = {
    ...p, pos: { ...at }, vel: { x: 0, y: 0, z: 0 }, facing: 0, action: 'idle', getUpPressesLeft: 0,
    staminaNow: Math.min(1, p.staminaNow + T.BETWEEN_POINTS_STAMINA),
    fatigue: Math.max(0, p.fatigue - T.BETWEEN_POINTS_FATIGUE),
    swing: null, swingCooldown: 0, diveT: 0, diveSwung: false,
    fw: { kind: 'none', phase: 0, dir: { x: 0, z: -sgnOf(p.side) } }, fwIncoming: false,
    splitT: 0, boostT: 0, lungeT: 0, recoverT: 0,
  };
  q.racketHead = racketHeadFor(q, 0, 0, false, false);
  return q;
}

export function stepPlayer(
  p0: PlayerState, intent: Intent, shuttle: ShuttleState, dt: number, assist: number,
): { player: PlayerState; hit: HitResult | null } {
  const p: SimPlayer = { ...p0 };
  const { stats } = p;
  const sgn = sgnOf(p.side);
  const cost = costScale(stats.stamina);

  // ----- down after a dive: only get-up presses count -----
  if (p.action === 'down') {
    p.getUpPressesLeft = Math.max(0, p.getUpPressesLeft - (intent.dive ? 1 : 0));
    p.action = p.getUpPressesLeft === 0 ? 'idle' : 'down';
    p.vel = { x: 0, y: 0, z: 0 };
    p.staminaNow = clamp(p.staminaNow + regenPerSecond(stats, p.fatigue) * dt, 0, 1);
    p.fatigue = clamp(p.fatigue - T.FATIGUE_DECAY * dt, 0, 1);
    p.swing = null;
    p.fw = { kind: 'none', phase: 0, dir: { x: 0, z: -sgn } };
    p.racketHead = { x: p.pos.x, y: T.DOWN_RACKET_Y, z: p.pos.z };
    return { player: p, hit: null };
  }

  const pos = { ...p.pos };
  const vel = { ...p.vel };
  const grounded = pos.y <= 0;
  let stamina = p.staminaNow;
  let fatigue = p.fatigue;
  const charging = intent.charging !== null;
  let swing: Swing | null = p.swing ? { ...p.swing } : null;
  let cooldown = Math.max(0, (p.swingCooldown ?? 0) - dt);
  let diveT = p.diveT ?? 0;
  let diveDir = p.diveDir ?? { x: 0, z: 0 };
  let diveSwung = p.diveSwung ?? false;
  const hadSwing = !!p.swing;
  const recMul = 1 + ((T.STAT_MAX / 2 - stats.recovery) / (T.STAT_MAX / 2)) * T.FOOTWORK_RECOVERY_SPAN;
  let splitDur = p.splitDur ?? 0;
  let splitT = p.splitT ?? 0;
  let boostT = Math.max(0, (p.boostT ?? 0) - dt);
  let lungeT = Math.max(0, (p.lungeT ?? 0) - dt);
  let lungeDur = p.lungeDur ?? 0;
  let recoverT = Math.max(0, (p.recoverT ?? 0) - dt);
  if (splitT > 0) { // landing inside the window after the opponent's contact earns the reaction boost
    splitT = Math.max(0, splitT - dt);
    if (splitT === 0 && splitDur <= T.SPLIT_WINDOW) boostT = T.SPLIT_BOOST_TIME;
  }

  let mx = clamp(intent.move.x, -1, 1), mz = clamp(intent.move.z, -1, 1);
  const mlen = Math.hypot(mx, mz);
  if (mlen < T.MOVE_DEADZONE) { mx = 0; mz = 0; }
  else if (mlen > 1) { mx /= mlen; mz /= mlen; }

  // ----- dive start: lunge along the move input, or toward the shuttle's landing spot -----
  if (intent.dive && diveT <= 0 && grounded && stamina > 0) {
    let dx = mx, dz = mz;
    if (mx === 0 && mz === 0) {
      const to = predictLanding(shuttle) ?? shuttle.pos;
      dx = to.x - pos.x; dz = to.z - pos.z;
    }
    const len = Math.hypot(dx, dz);
    diveDir = len > 1e-6 ? { x: dx / len, z: dz / len } : { x: 0, z: -sgn };
    diveT = T.DIVE_TIME;
    diveSwung = false;
    swing = null;
    cooldown = 0;
    stamina -= T.DIVE_COST * cost;
  }
  const diving = diveT > 0;

  // ----- split step: a new shot heading at this player starts an automatic hop (not if already running or airborne) -----
  const incomingNow = sgn * shuttle.vel.z > T.SPLIT_INCOMING_SPEED;
  if (incomingNow && !p.fwIncoming && grounded && !diving && !swing && lungeT <= 0 &&
    Math.hypot(vel.x, vel.z) <= T.SPLIT_MAX_SPEED) {
    splitDur = T.SPLIT_HOP_TIME * recMul;
    splitT = splitDur;
  }

  // ----- jump: charge sets the height; takes off when Space is released -----
  if (intent.jumpRelease && grounded && !diving && stamina > 0) {
    vel.y = Math.sqrt(2 * T.GRAVITY * jumpHeight(stats, intent.jumpCharge));
    stamina -= T.JUMP_COST * cost;
  }
  if (vel.y > 0 || pos.y > 0) {
    vel.y -= T.GRAVITY * dt;
    pos.y += vel.y * dt;
    if (pos.y <= 0) { pos.y = 0; vel.y = 0; }
  }

  // ----- horizontal movement -----
  if (diving) {
    const step = Math.min(dt, diveT);
    vel.x = (diveDir.x * T.DIVE_DISTANCE) / T.DIVE_TIME;
    vel.z = (diveDir.z * T.DIVE_DISTANCE) / T.DIVE_TIME;
    pos.x += vel.x * step;
    pos.z += vel.z * step;
    diveT -= step;
    if (diveT < 1e-9) diveT = 0;
  } else {
    const speedMul = 1 + ((stats.speed - T.STAT_MAX / 2) / (T.STAT_MAX / 2)) * T.SPEED_STAT_SPAN;
    const tiredMul = lerp(T.LOW_STAMINA_SPEED, 1, clamp(stamina / T.LOW_STAMINA, 0, 1));
    const top = T.BASE_TOP_SPEED * speedMul * T.BODY_SPEED[stats.body] * tiredMul *
      (1 - T.FATIGUE_SPEED_LOSS * fatigue) * (charging ? T.CHARGE_MOVE_FACTOR : 1);
    const accel = T.BASE_ACCEL * speedMul * T.BODY_ACCEL[stats.body] * (grounded ? 1 : T.AIR_CONTROL) *
      (boostT > 0 ? T.SPLIT_BOOST_ACCEL : 1);
    const turnAccel = accel * T.BODY_TURN[stats.body];
    const frozen = lungeT > 0; // a lunge leaves the player stuck for a moment
    const crossing = sgn * vel.z > T.CROSSOVER_MIN_SPEED && mz * sgn > 0; // crossover steps run a little faster backward
    const tx = frozen ? 0 : mx, tz = frozen ? 0 : mz * (crossing ? T.CROSSOVER_SPEED_MUL : 1);
    let dvx = tx * top - vel.x, dvz = tz * top - vel.z;
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
  }

  // stay inside own half
  const depth = clamp(sgn * pos.z, T.NET_CLEARANCE, COURT.halfLength + T.HALF_MARGIN_BACK);
  if (depth !== sgn * pos.z) { pos.z = sgn * depth; vel.z = 0; }
  const wide = COURT.halfWidthSingles + T.HALF_MARGIN_X;
  if (Math.abs(pos.x) > wide) { pos.x = Math.sign(pos.x) * wide; vel.x = 0; }

  // ----- stamina and fatigue -----
  const running = Math.hypot(vel.x, vel.z);
  if (!diving) {
    if (charging) stamina -= T.CHARGE_DRAIN * cost * dt;
    else stamina += regenPerSecond(stats, fatigue) * dt;
  }
  if (running > T.MOVING_SPEED) fatigue += T.FATIGUE_BUILD * (running / T.BASE_TOP_SPEED) * cost * dt;
  else fatigue -= T.FATIGUE_DECAY * dt;

  // ----- facing: turn toward the shuttle when it is on this side, else toward the net -----
  const onMySide = sgn * shuttle.pos.z > 0;
  const want = onMySide
    ? clamp(Math.atan2(shuttle.pos.x - pos.x, (shuttle.pos.z - pos.z) * -sgn), -T.FACING_LIMIT, T.FACING_LIMIT)
    : 0;
  const turn = T.TURN_RATE * T.BODY_TURN[stats.body] * dt;

  p.pos = pos;
  p.vel = vel;
  p.facing += clamp(want - p.facing, -turn, turn);
  p.staminaNow = clamp(stamina, 0, 1);
  p.fatigue = clamp(fatigue, 0, 1);

  // ----- swing: starts on release / net shot / basic swing, lasts SWING_WINDOW; a dive gets one lift -----
  if (!swing && cooldown <= 0 && !(diving && diveSwung)) {
    const shot: ShotType | null = intent.release ?? (intent.netShot ? 'net' : intent.basicSwing ? 'basic' : null);
    if (shot) {
      const flat = shot === 'basic' || shot === 'net';
      swing = {
        t: 0, shot: diving ? 'clear' : shot, lift: diving, best: null,
        charge: diving ? T.DIVE_LIFT_CHARGE : flat ? 0 : chargeLevel(p, intent.chargeTime),
        basic: shot === 'basic' && !diving ? intent.basicSwing : null,
      };
      if (diving) diveSwung = true;
      cooldown = T.SWING_COOLDOWN;
    }
  }
  const serving = isServe(swing?.shot ?? null) || isServe(intent.charging) || isServe(intent.release);
  p.racketHead = racketHeadFor(p, intent.racket.x, intent.racket.y, serving, diving);

  let hit: HitResult | null = null;
  if (swing) {
    const prev = { x: shuttle.pos.x - shuttle.vel.x * dt, y: shuttle.pos.y - shuttle.vel.y * dt, z: shuttle.pos.z - shuttle.vel.z * dt };
    const { d, point } = nearest(p.racketHead, prev, shuttle.pos);
    const radius = T.HIT_RADIUS_BASE + clamp(assist, 0, 1) * T.HIT_RADIUS_ASSIST + (diving ? T.DIVE_RADIUS_BONUS : 0);
    // lunge: running at the net, a racket that reaches further forward may catch what the normal reach misses
    const lungeHead: Vec3 = { ...p.racketHead, z: p.racketHead.z - sgn * T.LUNGE_REACH * (T.heightOf(stats) / T.HEIGHT_REF) };
    if (!diving && -sgn * vel.z > T.LUNGE_MIN_SPEED) {
      const l = nearest(lungeHead, prev, shuttle.pos);
      if (l.d <= radius && (!swing.lungeBest || l.d < swing.lungeBest.d)) {
        swing.lungeBest = { d: l.d, pos: l.point, flick: { ...intent.racketVel }, rx: intent.racket.x };
      }
    }
    let resolve = false;
    if (d <= radius) {
      // contact is the closest approach: keep the best frame and resolve once the shuttle starts moving away
      if (!swing.best || d < swing.best.d) swing.best = { d, pos: point, flick: { ...intent.racketVel }, rx: intent.racket.x };
      else resolve = true;
    } else if (swing.best) resolve = true;
    swing.t += dt;
    if (swing.t >= T.SWING_WINDOW) resolve = true;
    if (resolve) {
      if (!swing.best && swing.lungeBest) { // only the lunge reached it: take the hit, pay the recovery delay
        swing.best = swing.lungeBest;
        lungeDur = T.SWING_WINDOW + T.LUNGE_RECOVERY * recMul;
        lungeT = lungeDur;
        p.racketHead = lungeHead;
      }
      if (swing.best) hit = makeHit(p, swing, swing.best);
      swing = null;
    }
  }

  // the dive is over: down, with get-up presses set by recovery
  const fellDown = p0.action !== 'down' && (p.diveT ?? 0) > 0 && diveT === 0;
  let action: PlayerAction = charging ? 'charging' : running > T.MOVING_SPEED || mlen >= T.MOVE_DEADZONE ? 'moving' : 'idle';
  if (pos.y > 0) action = 'airborne';
  if (swing) action = 'swinging';
  if (diving) action = 'diving';
  if (fellDown) {
    action = 'down';
    p.getUpPressesLeft = Math.max(T.GET_UP_MIN, Math.round(T.GET_UP_BASE - T.GET_UP_PER_RECOVERY * stats.recovery));
    p.vel = { x: 0, y: 0, z: 0 };
    swing = null;
  }
  if (hadSwing && !swing) recoverT = T.RECOVER_TIME;

  // ----- footwork label for animation: lunge > split > chasse/crossover > recover -----
  const spd = Math.hypot(p.vel.x, p.vel.z);
  let kind: FootworkView['kind'] = 'none';
  let phase = 0;
  let cycle = p.fwCycle ?? 0;
  if (action === 'diving' || action === 'down') { /* no footwork while diving or down */ }
  else if (lungeT > 0) { kind = 'lunge'; phase = 1 - lungeT / lungeDur; }
  else if (splitT > 0) { kind = 'split'; phase = 1 - splitT / splitDur; }
  else if (spd > T.FOOTWORK_MIN_SPEED) {
    if (sgn * p.vel.z > T.CROSSOVER_MIN_SPEED) kind = 'crossover';
    else if (spd <= T.CHASSE_MAX_SPEED && Math.abs(p.vel.x) / spd >= T.CHASSE_SIDEWAYS) kind = 'chasse';
    if (kind !== 'none') { cycle = (cycle + (spd * dt) / T.CHASSE_STEP_LENGTH) % 1; phase = cycle; }
  }
  if (kind === 'none' && recoverT > 0 && mlen < T.MOVE_DEADZONE && action !== 'down') {
    kind = 'recover'; phase = 1 - recoverT / T.RECOVER_TIME;
  }
  const home = { x: 0 - pos.x, z: sgn * T.ASSIST_HOME_DEPTH - pos.z };
  const aim = kind === 'recover' ? home : spd > 0.3 ? p.vel : { x: 0, z: -sgn };
  const aimLen = Math.hypot(aim.x, aim.z) || 1;
  p.fw = { kind, phase: clamp(phase, 0, 1), dir: { x: aim.x / aimLen, z: aim.z / aimLen } };
  p.fwCycle = cycle;
  p.fwIncoming = incomingNow;
  p.splitT = splitT;
  p.splitDur = splitDur;
  p.boostT = boostT;
  p.lungeT = lungeT;
  p.lungeDur = lungeDur;
  p.recoverT = recoverT;

  p.action = action;
  p.swing = swing;
  p.swingCooldown = cooldown;
  p.diveT = diveT;
  p.diveDir = diveDir;
  p.diveSwung = diveSwung;
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
