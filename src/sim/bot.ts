import type { Intent, PlayerState, ShotType, ShuttleState, Side, Vec3 } from '../types';
import { COURT, predictLanding, stepShuttle } from '../physics';
import * as T from './tuning';

export type BotLevel = 'easy' | 'medium' | 'hard';

export const BOT_TUNING = {
  baseDepth: 3.5,               // m behind the net when drifting back to base
  chargeStartDist: 4.2,         // m distance to shuttle at which charging starts
  releaseDist: 0.72,            // m distance to racketHead at which charge releases / shot fires
  highShuttleY: 2.05,           // m shuttle height threshold for clear / smash
  backCourtDepth: 3.0,          // m depth from net considered back/mid-back court for high shots
  netShotDepth: 2.1,            // m depth from net considered near the net
  netShotMaxY: 1.75,            // m max shuttle height for a net shot
  serveChargeDuration: 0.45,    // s bot holds serve charge before releasing
  serveFlickSpeed: 1.6,         // fallback racketVel.x magnitude to aim cross-court into diagonal service box
  serveTargetBoxX: 0.9,         // m lateral target inside receiver's diagonal service box
  shortServeChance: 0.65,       // probability of picking serveShort over serveLong
  dropBasicSplit: 0.5,          // probability of picking drop over basic on mid-court shots
  arriveThreshold: 0.08,        // m distance below which bot stops moving
  slowDownRadius: 0.5,          // m distance inside which move vector scales down smoothly
  velEpsilon: 1e-4,             // m/s threshold below which velocity / speed counts as zero (dead shuttle)
  missRacketOffset: 1.8,        // racket offset when bot rolls a miss (aims off target)
  // Doubles (only used when BotContext.partner is set)
  doublesShortServeChance: 0.85, // probability of picking serveShort when serving in doubles
  doublesLiftVy: 5,             // m/s shuttle vel.y above which a hit counts as a lift (the hitter's side is defending)
  doublesFrontDepth: 2.4,       // m behind the net of the front player in front-and-back
  doublesBackDepth: 4.6,        // m behind the net of the back player in front-and-back
  doublesFrontBackX: 0.6,       // m sideways offset of each partner in front-and-back (opposite sides)
  doublesSideDepth: 3.6,        // m behind the net of both players in side-by-side
  doublesSideX: 1.5,            // m from the centre line of each player in side-by-side
  doublesFasterMargin: 0.5,     // s of arrival time by which one partner is clearly faster and takes any shuttle
  doublesFlightStep: 1 / 60,    // s step when timing the shuttle's flight to the floor
  doublesFlightMax: 6,          // s longest flight timed
  easy: {
    reactionDelay: 0.45,
    missChance: 0.30,
    flickSpeed: 0,
    allowAllShots: false,
    smashChanceOnHigh: 0,
  },
  medium: {
    reactionDelay: 0.25,
    missChance: 0.12,
    flickSpeed: 1.4,
    allowAllShots: true,
    smashChanceOnHigh: 0.45,
  },
  hard: {
    reactionDelay: 0.12,
    missChance: 0.04,
    flickSpeed: 2.8,
    allowAllShots: true,
    smashChanceOnHigh: 0.85,
  },
} as const;

export interface Bot {
  level: BotLevel;
  rng: () => number;
  lastVelZSign: number;
  cachedLanding: Vec3 | null;
  reactionTimer: number;
  willMiss: boolean;
  plannedShot: ShotType | null;
  chargeTime: number;
  hasReleasedThisRally: boolean;
  serveTimer: number;
  serveChoice: 'serveShort' | 'serveLong' | null;
  // doubles only (singles leaves these at their defaults)
  owns: boolean;           // this bot plays the incoming shuttle (decided once, when it is hit)
  attacking: boolean;      // this side is attacking (front-and-back) rather than defending (side-by-side)
  firstShot: boolean;      // no shuttle flight seen yet this rally, so the next incoming one is the serve
  receiverLatch: boolean;  // ctx.receiving as seen while the shuttle was held for the serve
  hold: boolean;           // stand still (serve stage, or sitting out the serve as the receiver's partner)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1);

export function createBot(level: BotLevel, rng: () => number = Math.random): Bot {
  return {
    level,
    rng,
    lastVelZSign: 0,
    cachedLanding: null,
    reactionTimer: 0,
    willMiss: false,
    plannedShot: null,
    chargeTime: 0,
    hasReleasedThisRally: false,
    serveTimer: 0,
    serveChoice: null,
    owns: true,
    attacking: true,
    firstShot: true,
    receiverLatch: false,
    hold: false,
  };
}

function emptyIntent(): Intent {
  return {
    move: { x: 0, z: 0 },
    racket: { x: 0, y: 0 },
    racketVel: { x: 0, y: 0 },
    charging: null,
    chargeTime: 0,
    release: null,
    basicSwing: null,
    jumpCharge: 0,
    jumpRelease: false,
    dive: false,
    netShot: false,
  };
}

function computeRacketAim(me: PlayerState, target: Vec3, serving: boolean): { x: number; y: number } {
  const sgn = sgnOf(me.side);
  const h = T.heightOf(me.stats);
  const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT_REF);
  const top = h * T.RACKET_TOP_FACTOR + T.RACKET_TOP_OFFSET;
  const rx = clamp(((target.x - me.pos.x) * sgn) / lateral, -1, 1);
  const desiredY = serving ? Math.min(target.y, T.SERVE_MAX_CONTACT) : target.y;
  const ry = clamp(((desiredY - me.pos.y - T.RACKET_LOW) / (top - T.RACKET_LOW)) * 2 - 1, -1, 1);
  return { x: rx, y: ry };
}

function chooseShotForSituation(
  bot: Bot,
  me: PlayerState,
  shuttle: ShuttleState,
  landing: Vec3 | null,
): ShotType {
  const cfg = BOT_TUNING[bot.level];
  const sgn = sgnOf(me.side);
  const refZ = landing ? sgn * landing.z : sgn * shuttle.pos.z;
  const high = shuttle.pos.y >= BOT_TUNING.highShuttleY;

  if (!cfg.allowAllShots) {
    // Easy level: only clear and basic
    return high || refZ >= BOT_TUNING.backCourtDepth ? 'clear' : 'basic';
  }

  // Low near net -> netShot
  if (refZ < BOT_TUNING.netShotDepth && shuttle.pos.y <= BOT_TUNING.netShotMaxY) {
    return 'net';
  }

  // High shuttle near back (or mid-back) -> smash or clear
  if (high || refZ >= BOT_TUNING.backCourtDepth) {
    return bot.rng() < cfg.smashChanceOnHigh ? 'smash' : 'clear';
  }

  // Otherwise drop or basic
  return bot.rng() < BOT_TUNING.dropBasicSplit ? 'drop' : 'basic';
}

function computeServeFlickX(
  me: PlayerState,
  shuttle: ShuttleState,
  serveChoice: 'serveShort' | 'serveLong',
  chargeTime: number,
): number {
  const sgn = sgnOf(me.side);
  const charge = clamp(chargeTime / T.CHARGE_FULL_TIME, 0, 1);
  const targetDepth =
    serveChoice === 'serveShort'
      ? COURT.shortServiceLine + lerp(T.SERVE_SHORT_PAST_LINE_MIN, T.SERVE_SHORT_PAST_LINE_MAX, charge)
      : COURT.halfLength - lerp(T.SERVE_LONG_FROM_LINE_MIN, T.SERVE_LONG_FROM_LINE_MAX, charge);
  const forwardDist = Math.max(1, sgn * shuttle.pos.z + targetDepth);
  const targetWorldXDir = me.pos.x >= 0 ? -1 : 1;
  const targetWorldX = targetWorldXDir * BOT_TUNING.serveTargetBoxX;
  const dx = targetWorldX - shuttle.pos.x;
  const az = Math.atan2(sgn * dx, forwardDist);
  const flickX = clamp(az / T.FLICK_MAX_ANGLE, -1, 1) * T.FLICK_FULL;
  return Math.abs(flickX) > BOT_TUNING.velEpsilon
    ? flickX
    : sgn * targetWorldXDir * BOT_TUNING.serveFlickSpeed;
}

// Where the incoming shuttle will come down (the shuttle itself if no landing is known on this side).
const landingFor = (bot: Bot, sgn: number, shuttle: ShuttleState): Vec3 =>
  bot.cachedLanding && sgn * bot.cachedLanding.z > 0 ? bot.cachedLanding : shuttle.pos;

// ---------- doubles helpers ----------
// Both partners run these on the same positions, so they take opposite roles and exactly one claims a shuttle.
// shortcut: ties break by slot, so two partners with the same slot and position would both claim; upgrade if slots stop being unique.

const topSpeedOf = (p: PlayerState) =>
  T.BASE_TOP_SPEED * (1 + ((p.stats.speed - T.STAT_MAX / 2) / (T.STAT_MAX / 2)) * T.SPEED_STAT_SPAN) * T.BODY_SPEED[p.stats.body];

// The lower-x partner of a pair (left in side-by-side).
const isLow = (a: PlayerState, b: PlayerState) => a.pos.x < b.pos.x || (a.pos.x === b.pos.x && a.slot < b.slot);
// The partner nearer the net (front in front-and-back).
const isFront = (a: PlayerState, b: PlayerState) => {
  const za = Math.abs(a.pos.z), zb = Math.abs(b.pos.z);
  return za < zb || (za === zb && a.slot < b.slot);
};

// Seconds the shuttle takes to reach the floor (or net) from `s`.
function flightTime(s: ShuttleState): number {
  const step = BOT_TUNING.doublesFlightStep;
  for (let t = 0; t < BOT_TUNING.doublesFlightMax; t += step) {
    const r = stepShuttle(s, step);
    if (r.event.kind !== 'none') return t + step;
    s = r.state;
  }
  return BOT_TUNING.doublesFlightMax;
}

// Where a partner stands while the other one plays the shuttle: front-and-back when attacking (opposite
// sides, so the pair covers the open court), side-by-side when defending.
function formationSpot(me: PlayerState, mate: PlayerState, attacking: boolean): Vec3 {
  const sgn = sgnOf(me.side);
  if (!attacking) {
    return { x: (isLow(me, mate) ? -1 : 1) * BOT_TUNING.doublesSideX, y: 0, z: sgn * BOT_TUNING.doublesSideDepth };
  }
  const front = isFront(me, mate);
  const side = Math.abs(mate.pos.x) > BOT_TUNING.arriveThreshold ? -Math.sign(mate.pos.x) : front ? -1 : 1;
  return {
    x: side * BOT_TUNING.doublesFrontBackX,
    y: 0,
    z: sgn * (front ? BOT_TUNING.doublesFrontDepth : BOT_TUNING.doublesBackDepth),
  };
}

// Should `me` play the shuttle coming down at `land`? Whoever can reach it in time and the other cannot; else the clearly
// faster one; else the one whose zone it is (left/right in side-by-side, front/back in front-and-back).
function claims(me: PlayerState, mate: PlayerState, land: Vec3, flight: number, frontBack: boolean): boolean {
  const sgn = sgnOf(me.side);
  const contactZ = land.z + sgn * T.RACKET_FORWARD;
  const eta = (p: PlayerState) =>
    p.action === 'down' ? Infinity : Math.hypot(land.x - p.pos.x, contactZ - p.pos.z) / topSpeedOf(p);
  const tMe = eta(me), tMate = eta(mate);
  const canMe = tMe <= flight, canMate = tMate <= flight;
  if (canMe !== canMate) return canMe;
  if (Math.abs(tMe - tMate) > BOT_TUNING.doublesFasterMargin) return tMe < tMate;
  if (frontBack) {
    const mid = (Math.abs(me.pos.z) + Math.abs(mate.pos.z)) / 2; // zones split halfway between the partners
    return isFront(me, mate) === (sgn * land.z < mid);
  }
  return isLow(me, mate) === (land.x <= (me.pos.x + mate.pos.x) / 2);
}

// World-x direction (-1, 0, 1) to flick from contact point `fromX`: away from the only opponent in singles;
// in doubles toward the middle of the widest gap between the opponents and the side lines.
function aimDirX(opps: PlayerState[], fromX: number): number {
  if (opps.length < 2) return opps[0].pos.x >= 0 ? -1 : 1;
  const edge = COURT.halfWidthDoubles;
  const xs = [-edge, ...opps.map((o) => clamp(o.pos.x, -edge, edge)).sort((a, b) => a - b), edge];
  let widest = 0, centre = 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > widest) { widest = xs[i] - xs[i - 1]; centre = (xs[i] + xs[i - 1]) / 2; }
  }
  return Math.sign(centre - fromX);
}

// What the bot knows about the others on court. Singles: partner null, one opponent.
// receiving: this bot is the designated receiver of the current serve (only it may return the serve).
export interface BotContext {
  partner: PlayerState | null;
  opponents: PlayerState[];
  serving: boolean;
  receiving: boolean;
}

// Singles: no partner, one opponent; the bot receives every serve it does not make.
export const solo = (opponent: PlayerState, serving: boolean): BotContext =>
  ({ partner: null, opponents: [opponent], serving, receiving: !serving });

export function botIntent(bot: Bot, me: PlayerState, ctx: BotContext, shuttle: ShuttleState, dt: number): Intent {
  const mate = ctx.partner; // null in singles: every doubles branch below is skipped
  const serving = ctx.serving;
  const intent = emptyIntent();
  const sgn = sgnOf(me.side);
  const cfg = BOT_TUNING[bot.level];

  // If down after a dive, mash dive to get up
  if (me.action === 'down') {
    intent.dive = true;
    return intent;
  }

  // ---------- SERVING ----------
  if (serving) {
    bot.lastVelZSign = 0;
    bot.hasReleasedThisRally = false;
    if (!bot.serveChoice) {
      const shortChance = mate ? BOT_TUNING.doublesShortServeChance : BOT_TUNING.shortServeChance;
      bot.serveChoice = !cfg.allowAllShots || bot.rng() < shortChance ? 'serveShort' : 'serveLong';
      bot.serveTimer = 0;
    }
    const aim = computeRacketAim(me, shuttle.pos, true);
    intent.racket = aim;
    bot.serveTimer += dt;

    if (bot.serveTimer >= BOT_TUNING.serveChargeDuration) {
      const flickLocalX = computeServeFlickX(me, shuttle, bot.serveChoice, bot.serveTimer);
      intent.release = bot.serveChoice;
      intent.chargeTime = bot.serveTimer;
      intent.racketVel = { x: flickLocalX, y: 0 };
      bot.serveChoice = null;
      bot.serveTimer = 0;
    } else {
      intent.charging = bot.serveChoice;
      intent.chargeTime = bot.serveTimer;
    }
    return intent;
  }

  bot.serveChoice = null;
  bot.serveTimer = 0;

  // ---------- DEAD SHUTTLE RESET & NEW-HIT DETECTION ----------
  const speed = Math.hypot(shuttle.vel.x, shuttle.vel.y, shuttle.vel.z);
  if (speed <= BOT_TUNING.velEpsilon) {
    bot.lastVelZSign = 0;
    bot.hasReleasedThisRally = false;
    bot.cachedLanding = null;
    bot.plannedShot = null;
    bot.chargeTime = 0;
    bot.firstShot = true; // the shuttle is held for a serve: the next flight is the serve
    bot.receiverLatch = ctx.receiving;
    bot.hold = mate !== null;
  }

  const velZSign = Math.abs(shuttle.vel.z) > BOT_TUNING.velEpsilon ? Math.sign(shuttle.vel.z) : 0;
  // Shuttle is coming toward `me` when sgn * shuttle.vel.z > 0
  const incoming = sgn * shuttle.vel.z > 0;

  if (velZSign !== 0 && velZSign !== bot.lastVelZSign) {
    bot.lastVelZSign = velZSign;
    bot.hold = false;
    // A lift (shuttle going up) hands the attack to the side that did not hit it.
    bot.attacking = (shuttle.vel.y > BOT_TUNING.doublesLiftVy) === incoming;
    if (incoming) {
      bot.cachedLanding = predictLanding(shuttle);
      bot.reactionTimer = cfg.reactionDelay;
      bot.willMiss = bot.rng() < cfg.missChance;
      bot.plannedShot = chooseShotForSituation(bot, me, shuttle, bot.cachedLanding);
      bot.chargeTime = 0;
      bot.hasReleasedThisRally = false;
      if (mate) {
        // Decided once, from one snapshot both partners see, so exactly one of two bots goes for it. The serve goes
        // to the designated receiver only; its partner holds its spot.
        const mayReturn = ctx.receiving || bot.receiverLatch;
        bot.owns = bot.firstShot
          ? mayReturn
          : claims(me, mate, landingFor(bot, sgn, shuttle), flightTime(shuttle), bot.attacking);
        bot.hold = bot.firstShot && !mayReturn;
      }
    } else {
      bot.cachedLanding = null;
      bot.plannedShot = null;
      bot.chargeTime = 0;
      bot.hasReleasedThisRally = false;
    }
    bot.firstShot = false;
  }

  // ---------- MOVEMENT ----------
  const basePos = mate ? formationSpot(me, mate, bot.attacking) : { x: 0, y: 0, z: sgn * BOT_TUNING.baseDepth };
  let moveTarget = bot.hold ? me.pos : basePos;

  if (incoming && !bot.hasReleasedThisRally && bot.owns) {
    if (bot.reactionTimer > 0) {
      bot.reactionTimer = Math.max(0, bot.reactionTimer - dt);
    }
    if (bot.reactionTimer <= 0) {
      const land = landingFor(bot, sgn, shuttle);
      // Stand slightly behind the shuttle's contact point so the racket plane (RACKET_FORWARD in front) meets it
      moveTarget = {
        x: land.x,
        y: 0,
        z: land.z + sgn * T.RACKET_FORWARD,
      };
    } else {
      // Still in reaction delay: stand still
      moveTarget = me.pos;
    }
  }

  const dx = moveTarget.x - me.pos.x;
  const dz = moveTarget.z - me.pos.z;
  const distToTarget = Math.hypot(dx, dz);
  if (distToTarget > BOT_TUNING.arriveThreshold) {
    const scale = Math.min(1, distToTarget / BOT_TUNING.slowDownRadius);
    intent.move = {
      x: clamp((dx / distToTarget) * scale, -1, 1),
      z: clamp((dz / distToTarget) * scale, -1, 1),
    };
  }

  // ---------- RACKET AIM & SHOTS ----------
  const aim = computeRacketAim(me, shuttle.pos, false);
  if (incoming && bot.willMiss) {
    // Aim racket off target so the swing misses
    intent.racket = {
      x: aim.x >= 0 ? clamp(aim.x - BOT_TUNING.missRacketOffset, -1, 1) : clamp(aim.x + BOT_TUNING.missRacketOffset, -1, 1),
      y: aim.y >= 0 ? clamp(aim.y - BOT_TUNING.missRacketOffset, -1, 1) : clamp(aim.y + BOT_TUNING.missRacketOffset, -1, 1),
    };
  } else {
    intent.racket = aim;
  }

  if (incoming && bot.owns && bot.reactionTimer <= 0 && !bot.hasReleasedThisRally) {
    const shot = bot.plannedShot ?? chooseShotForSituation(bot, me, shuttle, bot.cachedLanding);
    bot.plannedShot = shot;

    // Predict racket head world position for this frame's aim
    const h = T.heightOf(me.stats);
    const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT_REF);
    const top = h * T.RACKET_TOP_FACTOR + T.RACKET_TOP_OFFSET;
    const expectedHead: Vec3 = {
      x: me.pos.x + sgn * intent.racket.x * lateral,
      y: T.RACKET_LOW + (top - T.RACKET_LOW) * ((intent.racket.y + 1) / 2) + me.pos.y,
      z: me.pos.z - sgn * T.RACKET_FORWARD,
    };

    const distToShuttle = Math.hypot(
      shuttle.pos.x - expectedHead.x,
      shuttle.pos.y - expectedHead.y,
      shuttle.pos.z - expectedHead.z,
    );
    const nextPos = {
      x: shuttle.pos.x + shuttle.vel.x * dt,
      y: shuttle.pos.y + shuttle.vel.y * dt,
      z: shuttle.pos.z + shuttle.vel.z * dt,
    };
    const nextDist = Math.hypot(
      nextPos.x - expectedHead.x,
      nextPos.y - expectedHead.y,
      nextPos.z - expectedHead.z,
    );

    const isChargeable = shot === 'clear' || shot === 'smash' || shot === 'drop';
    const closeEnoughToSwing =
      distToShuttle <= BOT_TUNING.releaseDist || nextDist <= BOT_TUNING.releaseDist;

    // Flick away from the opponent (singles) or into the widest gap between the opponents (doubles)
    const awayWorldX = aimDirX(ctx.opponents, shuttle.pos.x);
    const flickX = cfg.flickSpeed > 0 ? sgn * awayWorldX * cfg.flickSpeed : 0;

    if (closeEnoughToSwing) {
      intent.racketVel = { x: flickX, y: 0 };
      if (isChargeable) {
        const finalCharge = bot.chargeTime + dt;
        intent.release = shot;
        intent.chargeTime = finalCharge;
        intent.charging = null;
      } else if (shot === 'net') {
        intent.netShot = true;
      } else {
        intent.basicSwing = intent.racket.x >= 0 ? 'forehand' : 'backhand';
      }
      bot.hasReleasedThisRally = true;
      bot.chargeTime = 0;
    } else if (isChargeable && distToShuttle <= BOT_TUNING.chargeStartDist) {
      bot.chargeTime += dt;
      intent.charging = shot;
      intent.chargeTime = bot.chargeTime;
    }
  }

  return intent;
}
