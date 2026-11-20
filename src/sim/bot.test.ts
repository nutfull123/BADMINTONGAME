import { describe, it, expect } from 'vitest';
import { createBot, botIntent, BOT_TUNING } from './bot';
import { createPlayer, stepPlayer } from './index';
import { predictLanding, stepShuttle } from '../physics';
import type { ShotType, ShuttleState, Stats } from '../types';

const balancedStats: Stats = { body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };

function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('bot AI', () => {
  it('moves toward the predicted landing point after reaction delay and drifts back to base after shuttle leaves', () => {
    const bot = createBot('hard', () => 0.99);
    const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -3.5 });
    const opp = createPlayer(balancedStats, 'near', { x: -1, y: 0, z: 3.5 });
    const shuttle: ShuttleState = {
      pos: { x: 0.5, y: 2.5, z: 1.0 },
      vel: { x: 1.5, y: 3.0, z: -10.0 },
    };
    const landing = predictLanding(shuttle);
    expect(landing).not.toBeNull();
    expect(landing!.z).toBeLessThan(0);

    const intent = botIntent(bot, me, opp, shuttle, BOT_TUNING.hard.reactionDelay + 0.05, false);
    expect(Math.sign(intent.move.x)).toBe(Math.sign(landing!.x - me.pos.x));

    // When shuttle travels back toward opponent (vel.z > 0), bot drifts back to base (x=0, z=-3.5)
    const offCourtMe = createPlayer(balancedStats, 'far', { x: 1.8, y: 0, z: -5.5 });
    const outgoing: ShuttleState = {
      pos: { x: 1.5, y: 2.0, z: -2.0 },
      vel: { x: -1.0, y: 4.0, z: 12.0 },
    };
    const returnIntent = botIntent(bot, offCourtMe, opp, outgoing, 0.05, false);
    expect(returnIntent.move.x).toBeLessThan(0); // moving back toward x = 0
    expect(returnIntent.move.z).toBeGreaterThan(0); // moving from -5.5 toward -3.5
  });

  it('hard reacts faster than easy to an incoming shuttle', () => {
    const easyBot = createBot('easy', () => 0.99);
    const hardBot = createBot('hard', () => 0.99);
    const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -3.5 });
    const opp = createPlayer(balancedStats, 'near', { x: 0, y: 0, z: 3.5 });
    const shuttle: ShuttleState = {
      pos: { x: 1.2, y: 2.5, z: 0.5 },
      vel: { x: 1.0, y: 2.0, z: -9.0 },
    };

    // At t = 0.20 s (past hard's 0.12 s delay, but before easy's 0.45 s delay):
    const dt = 0.20;
    const hardIntent = botIntent(hardBot, me, opp, shuttle, dt, false);
    const easyIntent = botIntent(easyBot, me, opp, shuttle, dt, false);

    expect(Math.hypot(hardIntent.move.x, hardIntent.move.z)).toBeGreaterThan(0);
    expect(Math.hypot(easyIntent.move.x, easyIntent.move.z)).toBe(0);
  });

  it('easy never smashes even on high shuttles near the back court (only clear and basic)', () => {
    const rng = makeLcg(42);
    const easyBot = createBot('easy', rng);
    const opp = createPlayer(balancedStats, 'near', { x: 0.5, y: 0, z: 3.5 });

    const seenShots = new Set<ShotType>();
    for (let trial = 0; trial < 30; trial++) {
      // Alternate velocity sign so each trial triggers a fresh incoming shot evaluation
      botIntent(
        easyBot,
        createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -4.2 }),
        opp,
        { pos: { x: 0, y: 2, z: -2 }, vel: { x: 0, y: 2, z: 8 } },
        0.05,
        false,
      );

      const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -4.5 });
      const highShuttle: ShuttleState = {
        pos: { x: 0, y: trial % 2 === 0 ? 2.4 : 1.4, z: -4.0 },
        vel: { x: 0, y: -1.0, z: -2.0 },
      };

      // Step past easy reaction delay and right up to contact
      const intent = botIntent(easyBot, me, opp, highShuttle, 0.5, false);
      if (intent.charging) seenShots.add(intent.charging);
      if (intent.release) seenShots.add(intent.release);
      if (intent.basicSwing) seenShots.add('basic');
      if (intent.netShot) seenShots.add('net');
      expect(intent.racketVel.x).toBe(0); // easy has no flick
    }

    expect(seenShots.has('smash')).toBe(false);
    expect(seenShots.has('drop')).toBe(false);
    expect(seenShots.has('net')).toBe(false);
    expect(seenShots.has('clear') || seenShots.has('basic')).toBe(true);
  });

  it('hard smashes on high shuttles and uses cross-court flicks away from the opponent', () => {
    const hardBot = createBot('hard', () => 0.1); // < smashChanceOnHigh (0.85) and >= missChance (0.04)
    const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -4.5 });
    const opp = createPlayer(balancedStats, 'near', { x: 1.5, y: 0, z: 3.5 });
    const highAtRacket: ShuttleState = {
      pos: { x: 0, y: 2.3, z: -4.0 },
      vel: { x: 0, y: -0.5, z: -2.0 },
    };

    const intent = botIntent(hardBot, me, opp, highAtRacket, 0.2, false);
    expect(intent.release).toBe('smash');
    expect(intent.racketVel.x).not.toBe(0);
  });

  it('serving produces charging followed by a release of serveShort or serveLong with cross-court flick', () => {
    const bot = createBot('medium', () => 0.2);
    const me = createPlayer(balancedStats, 'far', { x: -1.0, y: 0, z: -2.5 });
    const opp = createPlayer(balancedStats, 'near', { x: 1.0, y: 0, z: 3.0 });
    const heldShuttle: ShuttleState = {
      pos: { x: -1.0, y: 1.0, z: -2.0 },
      vel: { x: 0, y: 0, z: 0 },
    };

    const chargingFrame = botIntent(bot, me, opp, heldShuttle, 0.1, true);
    expect(chargingFrame.charging === 'serveShort' || chargingFrame.charging === 'serveLong').toBe(true);
    expect(chargingFrame.release).toBeNull();

    const releaseFrame = botIntent(bot, me, opp, heldShuttle, BOT_TUNING.serveChargeDuration, true);
    expect(releaseFrame.release === 'serveShort' || releaseFrame.release === 'serveLong').toBe(true);
    expect(releaseFrame.chargeTime).toBeGreaterThan(0);
    expect(releaseFrame.racketVel.x).not.toBe(0);
  });

  it('can return an incoming shot through stepPlayer in a live rally step', () => {
    const bot = createBot('hard', () => 0.5);
    let me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -3.5 });
    const opp = createPlayer(balancedStats, 'near', { x: 0, y: 0, z: 3.5 });
    let shuttle: ShuttleState = {
      pos: { x: 0.2, y: 1.8, z: 1.5 },
      vel: { x: 0.2, y: 5.5, z: -13.0 },
    };

    const dt = 1 / 120;
    let hitOccurred = false;
    for (let i = 0; i < 240; i++) {
      const intent = botIntent(bot, me, opp, shuttle, dt, false);
      // Put racket on forehand side when shuttle is on forehand side
      if (shuttle.pos.x < me.pos.x - 0.1) {
        // For 'far' side (sgn = -1), world x < me.pos.x is forehand (+racket.x)
        expect(intent.racket.x).toBeGreaterThan(0);
      }
      const stepped = stepPlayer(me, intent, shuttle, dt, 0.7);
      me = stepped.player;
      if (stepped.hit) {
        hitOccurred = true;
        shuttle = stepped.hit.launch;
        break;
      }
      shuttle = stepShuttle(shuttle, dt).state;
    }

    expect(hitOccurred).toBe(true);
    expect(shuttle.vel.z).toBeGreaterThan(0); // returned back toward near side
  });
});
