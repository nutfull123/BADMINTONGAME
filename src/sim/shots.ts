// Shot launch: turns a contact (shot, charge, flick, perfect) into a shuttle state by searching for the
// launch speed (or angle) whose predicted landing is the target. Pure: no three, no DOM.
import { COURT, predictLanding } from '../physics';
import type { ShotType, ShuttleState, Side, Stats, Vec3 } from '../types';
import * as T from './tuning';

let rng: () => number = Math.random;
// Tests (and replays) can pin the randomness. rng() = 0.5 means "no spread".
export function setRandom(f: () => number): void { rng = f; }
const jitter = () => rng() * 2 - 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (d: number) => (d * Math.PI) / 180;

export interface LaunchInput {
  shot: ShotType;
  side: Side;
  contact: Vec3;
  flick: { x: number; y: number }; // racketVel at contact
  charge: number;                  // 0..1
  perfect: boolean;
  weak: boolean;                   // wrong-side basic swing
  stats: Stats;
}

export function launchShuttle(i: LaunchInput): ShuttleState {
  const { side, contact, charge, stats } = i;
  const sgn = side === 'near' ? 1 : -1; // player's right is +x for near; the net is at -sgn * z
  const spread = i.perfect ? T.PERFECT_SPREAD : 1;
  const cap = T.SPEED_CAP * (1 + (stats.power - T.STAT_MAX / 2) * T.SPEED_CAP_POWER_SPAN);
  const az = clamp(i.flick.x / T.FLICK_FULL, -1, 1) * T.FLICK_MAX_ANGLE + jitter() * T.RANDOM_SPREAD_ANGLE * spread;
  const mine = sgn * contact.z; // contact depth on the hitter's own side of the net
  const flatten = i.perfect ? T.PERFECT_FLATTEN : 0;
  const deg = (list: number[]) => list.map((d) => rad(d) - flatten);

  const velocity = (speed: number, elev: number): Vec3 => {
    const h = speed * Math.cos(elev);
    return { x: sgn * h * Math.sin(az), y: speed * Math.sin(elev), z: -sgn * h * Math.cos(az) };
  };
  // forward distance (toward the opponent, along z) the shuttle covers before landing; -Infinity if the net stops it
  const reach = (speed: number, elev: number) => {
    const l = predictLanding({ pos: contact, vel: velocity(speed, elev) });
    return l ? sgn * (contact.z - l.z) : -Infinity;
  };
  // forward distance needed to land `depth` metres past the net (the jitter is the non-perfect depth error)
  const target = (depth: number) => mine + clamp(depth + jitter() * T.RANDOM_SPREAD_DEPTH * spread, 0.2, COURT.halfLength);

  const bisect = (f: (x: number) => number, lo: number, hi: number, want: number) => {
    for (let n = 0; n < T.SOLVE_ITERATIONS; n++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < want) lo = mid; else hi = mid;
    }
    return hi; // hi always satisfies f(hi) >= want (or is the bound), so it never lands on the net side of the jump
  };
  // try each launch angle, solve the speed; the first within tolerance wins, else the closest
  const bySpeed = (elevs: number[], want: number): ShuttleState => {
    let best = { err: Infinity, speed: cap / 2, elev: elevs[elevs.length - 1] };
    for (const elev of elevs) {
      const speed = bisect((v) => reach(v, elev), T.SPEED_MIN, cap, want);
      const err = Math.abs(reach(speed, elev) - want);
      if (err < T.SOLVE_TOLERANCE) { best = { err, speed, elev }; break; }
      if (err < best.err) best = { err, speed, elev };
    }
    return { pos: contact, vel: velocity(best.speed, best.elev) };
  };
  // fixed speed, solve the angle (smash, kill)
  const byAngle = (speed: number, want: number): ShuttleState => {
    const elev = bisect((e) => reach(speed, e), rad(T.ANGLE_SEARCH_MIN_DEG), rad(T.ANGLE_SEARCH_MAX_DEG), want);
    return { pos: contact, vel: velocity(speed, elev) };
  };

  switch (i.shot) {
    case 'clear':
      return bySpeed(deg(T.CLEAR_ELEVATIONS_DEG), target(COURT.halfLength - lerp(T.CLEAR_DEPTH_NEAR, T.CLEAR_DEPTH_FAR, charge)));
    case 'drop':
      return bySpeed(deg(T.DROP_ELEVATIONS_DEG), target(lerp(T.DROP_DEPTH_MIN, T.DROP_DEPTH_MAX, charge)));
    case 'smash': {
      const speed = Math.min(
        T.SMASH_SPEED_HARD_CAP,
        lerp(T.SMASH_SPEED_MIN, T.SMASH_SPEED_MAX, charge) * (1 + (stats.power - T.STAT_MAX / 2) * T.SMASH_POWER_SPAN) *
          (i.perfect ? T.SMASH_PERFECT_BONUS : 1),
      );
      const steep = clamp((contact.y - T.SMASH_STEEP_FROM) / (T.SMASH_STEEP_TO - T.SMASH_STEEP_FROM), 0, 1);
      return byAngle(speed, target(lerp(T.SMASH_DEPTH_FLAT, T.SMASH_DEPTH_STEEP, steep)));
    }
    case 'basic':
      return i.weak
        ? bySpeed(deg(T.WEAK_ELEVATIONS_DEG), target(T.WEAK_DEPTH))
        : bySpeed(deg(T.BASIC_ELEVATIONS_DEG), target(T.BASIC_DEPTH));
    case 'net':
      if (i.flick.y >= T.PUSH_FLICK_UP) return bySpeed(deg(T.PUSH_ELEVATIONS_DEG), target(T.PUSH_DEPTH));
      if (contact.y > T.NET_TAPE_HEIGHT) return byAngle(T.KILL_SPEED, target(T.KILL_DEPTH));
      return bySpeed(deg(T.TUMBLE_ELEVATIONS_DEG), target(T.TUMBLE_DEPTH));
    case 'serveShort':
      return bySpeed(deg(T.SERVE_SHORT_ELEVATIONS_DEG), target(COURT.shortServiceLine + lerp(T.SERVE_SHORT_PAST_LINE_MIN, T.SERVE_SHORT_PAST_LINE_MAX, charge)));
    case 'serveLong':
      return bySpeed(deg(T.SERVE_LONG_ELEVATIONS_DEG), target(COURT.halfLength - lerp(T.SERVE_LONG_FROM_LINE_MIN, T.SERVE_LONG_FROM_LINE_MAX, charge)));
  }
}
