import type { Intent, PlayerState, ShotType, ShuttleState, Side, Vec3 } from '../types';
import { COURT, predictLanding } from '../physics';
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
  const h = T.HEIGHT[me.stats.body];
  const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT.balanced);
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

export function botIntent(
  bot: Bot,
  me: PlayerState,
  opp: PlayerState,
  shuttle: ShuttleState,
  dt: number,
  serving: boolean,
): Intent {
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
      bot.serveChoice =
        !cfg.allowAllShots || bot.rng() < BOT_TUNING.shortServeChance ? 'serveShort' : 'serveLong';
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
  }

  const velZSign = Math.abs(shuttle.vel.z) > BOT_TUNING.velEpsilon ? Math.sign(shuttle.vel.z) : 0;
  // Shuttle is coming toward `me` when sgn * shuttle.vel.z > 0
  const incoming = sgn * shuttle.vel.z > 0;

  if (velZSign !== 0 && velZSign !== bot.lastVelZSign) {
    bot.lastVelZSign = velZSign;
    if (incoming) {
      bot.cachedLanding = predictLanding(shuttle);
      bot.reactionTimer = cfg.reactionDelay;
      bot.willMiss = bot.rng() < cfg.missChance;
      bot.plannedShot = chooseShotForSituation(bot, me, shuttle, bot.cachedLanding);
      bot.chargeTime = 0;
      bot.hasReleasedThisRally = false;
    } else {
      bot.cachedLanding = null;
      bot.plannedShot = null;
      bot.chargeTime = 0;
      bot.hasReleasedThisRally = false;
    }
  }

  // ---------- MOVEMENT ----------
  const basePos = { x: 0, y: 0, z: sgn * BOT_TUNING.baseDepth };
  let moveTarget = basePos;

  if (incoming && !bot.hasReleasedThisRally) {
    if (bot.reactionTimer > 0) {
      bot.reactionTimer = Math.max(0, bot.reactionTimer - dt);
    }
    if (bot.reactionTimer <= 0) {
      const land =
        bot.cachedLanding && sgn * bot.cachedLanding.z > 0
          ? bot.cachedLanding
          : shuttle.pos;
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

  if (incoming && bot.reactionTimer <= 0 && !bot.hasReleasedThisRally) {
    const shot = bot.plannedShot ?? chooseShotForSituation(bot, me, shuttle, bot.cachedLanding);
    bot.plannedShot = shot;

    // Predict racket head world position for this frame's aim
    const h = T.HEIGHT[me.stats.body];
    const lateral = T.REACH_LATERAL_BASE + T.REACH_LATERAL_PER_M * (h - T.HEIGHT.balanced);
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

    // Flick away from opponent's X position
    const awayWorldX = opp.pos.x >= 0 ? -1 : 1;
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
