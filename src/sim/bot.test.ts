import { describe, it, expect } from 'vitest';
import { createBot, botIntent, BOT_TUNING, solo, type Bot, type BotContext } from './bot';
import { createPlayer, stepPlayer, setRandom } from './index';
import { COURT, predictLanding, stepShuttle, isInServiceBox } from '../physics';
import type { HitResult, Intent, PlayerState, ServiceCourt, ShotType, ShuttleState, Side, Slot, Stats } from '../types';

const balancedStats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };

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

    const intent = botIntent(bot, me, solo(opp, false), shuttle, BOT_TUNING.hard.reactionDelay + 0.05);
    expect(Math.sign(intent.move.x)).toBe(Math.sign(landing!.x - me.pos.x));

    // When shuttle travels back toward opponent (vel.z > 0), bot drifts back to base (x=0, z=-3.5)
    const offCourtMe = createPlayer(balancedStats, 'far', { x: 1.8, y: 0, z: -5.5 });
    const outgoing: ShuttleState = {
      pos: { x: 1.5, y: 2.0, z: -2.0 },
      vel: { x: -1.0, y: 4.0, z: 12.0 },
    };
    const returnIntent = botIntent(bot, offCourtMe, solo(opp, false), outgoing, 0.05);
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
    const hardIntent = botIntent(hardBot, me, solo(opp, false), shuttle, dt);
    const easyIntent = botIntent(easyBot, me, solo(opp, false), shuttle, dt);

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
      botIntent(easyBot, createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -4.2 }), solo(opp, false), { pos: { x: 0, y: 2, z: -2 }, vel: { x: 0, y: 2, z: 8 } }, 0.05);

      const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -4.5 });
      const highShuttle: ShuttleState = {
        pos: { x: 0, y: trial % 2 === 0 ? 2.4 : 1.4, z: -4.0 },
        vel: { x: 0, y: -1.0, z: -2.0 },
      };

      // Step past easy reaction delay and right up to contact
      const intent = botIntent(easyBot, me, solo(opp, false), highShuttle, 0.5);
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

    const intent = botIntent(hardBot, me, solo(opp, false), highAtRacket, 0.2);
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

    const chargingFrame = botIntent(bot, me, solo(opp, true), heldShuttle, 0.1);
    expect(chargingFrame.charging === 'serveShort' || chargingFrame.charging === 'serveLong').toBe(true);
    expect(chargingFrame.release).toBeNull();

    const releaseFrame = botIntent(bot, me, solo(opp, true), heldShuttle, BOT_TUNING.serveChargeDuration);
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
      const intent = botIntent(bot, me, solo(opp, false), shuttle, dt);
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

  it('does not freeze after swinging and missing when a new serve comes from the same direction after a dead shuttle', () => {
    const bot = createBot('hard', () => 0.5);
    const me = createPlayer(balancedStats, 'far', { x: 0, y: 0, z: -3.5 });
    const opp = createPlayer(balancedStats, 'near', { x: 0, y: 0, z: 3.5 });

    // Point 1: incoming shuttle toward far court (vel.z < 0), close enough that the bot releases a swing (and misses/rally ends)
    const incoming1: ShuttleState = {
      pos: { x: 0, y: 2.2, z: -3.1 },
      vel: { x: 0, y: -1.0, z: -4.0 },
    };
    const firstSwing = botIntent(bot, me, solo(opp, false), incoming1, 0.2);
    expect(firstSwing.release !== null || firstSwing.basicSwing !== null || firstSwing.netShot).toBe(true);

    // Point ends: shuttle is dead (speed ~ 0) between points
    const deadShuttle: ShuttleState = {
      pos: { x: 0.8, y: 1.0, z: 2.0 },
      vel: { x: 0, y: 0, z: 0 },
    };
    botIntent(bot, me, solo(opp, false), deadShuttle, 0.05);

    // Point 2: opponent serves again from the same direction (vel.z < 0)
    const incoming2: ShuttleState = {
      pos: { x: 0.8, y: 2.2, z: 0.5 },
      vel: { x: 0.4, y: 2.5, z: -9.0 },
    };
    const afterDelay = botIntent(bot, me, solo(opp, false), incoming2, BOT_TUNING.hard.reactionDelay + 0.05);
    expect(Math.hypot(afterDelay.move.x, afterDelay.move.z)).toBeGreaterThan(0);

    // When the second shuttle reaches the racket head, the bot releases a swing again
    const atRacket2: ShuttleState = {
      pos: { x: 0, y: 2.2, z: -3.1 },
      vel: { x: 0, y: -1.0, z: -4.0 },
    };
    const secondSwing = botIntent(bot, me, solo(opp, false), atRacket2, 0.05);
    expect(secondSwing.release !== null || secondSwing.basicSwing !== null || secondSwing.netShot).toBe(true);
  });

  it('bot serve launched via stepPlayer lands inside the receiver diagonal service box for both service courts', () => {
    setRandom(() => 0.5);
    const courts: ServiceCourt[] = ['right', 'left'];
    for (const court of courts) {
      for (const serveRoll of [0.1, 0.9]) {
        // For far side: right service court is x < 0, left service court is x > 0
        const serverX = court === 'right' ? -1.1 : 1.1;
        const bot = createBot('medium', () => serveRoll);
        let me = createPlayer(balancedStats, 'far', { x: serverX, y: 0, z: -2.4 });
        const opp = createPlayer(balancedStats, 'near', { x: -serverX, y: 0, z: 3.0 });
        const shuttleAtRacket: ShuttleState = {
          pos: { x: serverX, y: 1.05, z: -1.9 },
          vel: { x: 0, y: 0, z: 0 },
        };

        // Charge frame then release frame
        const dt = 0.05;
        let hitLaunch: ShuttleState | null = null;
        for (let step = 0; step < 20; step++) {
          const intent = botIntent(bot, me, solo(opp, true), shuttleAtRacket, dt);
          const res = stepPlayer(me, intent, shuttleAtRacket, dt, 1.0);
          me = res.player;
          if (res.hit) {
            hitLaunch = res.hit.launch;
            break;
          }
        }

        expect(hitLaunch).not.toBeNull();
        expect(hitLaunch!.pos.y).toBeLessThanOrEqual(1.15); // BWF Law 9.1.6: serve contact below 1.15 m
        const landing = predictLanding(hitLaunch!);
        expect(landing).not.toBeNull();
        expect(isInServiceBox(landing!, 'near', court)).toBe(true);
      }
    }
  });
});

// ---------- doubles ----------

const at = (side: Side, slot: Slot, x: number, z: number) => createPlayer(balancedStats, side, { x, y: 0, z }, slot);
const swings = (i: Intent) => i.release !== null || i.basicSwing !== null || i.netShot;
const dblCtx = (mate: PlayerState, opps: PlayerState[], receiving = false, serving = false): BotContext =>
  ({ partner: mate, opponents: opps, serving, receiving });
const oppsNear = () => [at('near', 0, -1.5, 3.6), at('near', 1, 1.5, 3.6)];
// Shuttle the far side has just hit away from itself: a smash (vy < 0) or a lift (vy > 0).
const outgoing = (vy: number): ShuttleState => ({ pos: { x: 0, y: 3, z: 1 }, vel: { x: 0, y: vy, z: 8 } });

// Two bots on the far side, both intents read from the same pre-step state (as the game loop does).
class Pair {
  p: [PlayerState, PlayerState];
  bots: [Bot, Bot];
  constructor(a: PlayerState, b: PlayerState, level: 'easy' | 'medium' | 'hard' = 'hard') {
    this.p = [a, b];
    this.bots = [createBot(level, () => 0.5), createBot(level, () => 0.5)];
  }
  step(shuttle: ShuttleState, dt: number, opps: PlayerState[], receiving: [boolean, boolean] = [false, false]) {
    const intents = [0, 1].map((k) =>
      botIntent(this.bots[k], this.p[k], dblCtx(this.p[1 - k], opps, receiving[k]), shuttle, dt)) as [Intent, Intent];
    const stepped = [0, 1].map((k) => stepPlayer(this.p[k], intents[k], shuttle, dt, 0.7));
    this.p = [stepped[0].player, stepped[1].player];
    return { intents, hit: (stepped[0].hit ?? stepped[1].hit) as HitResult | null };
  }
  hold(shuttle: ShuttleState, seconds: number, opps: PlayerState[]) {
    for (let i = 0; i < seconds * 60; i++) this.step(shuttle, 1 / 60, opps);
  }
}

describe('doubles bot', () => {
  it('stands front-and-back when attacking and side-by-side when defending', () => {
    for (const [vy, frontBack] of [[-8, true], [8, false]] as const) {
      const pair = new Pair(at('far', 0, -0.5, -3.5), at('far', 1, 0.5, -3.5));
      pair.hold(outgoing(vy), 5, oppsNear());
      const [a, b] = pair.p;
      if (frontBack) {
        expect(Math.abs(Math.abs(a.pos.z) - Math.abs(b.pos.z))).toBeGreaterThan(1.5);
      } else {
        expect(Math.abs(Math.abs(a.pos.z) - Math.abs(b.pos.z))).toBeLessThan(0.3);
        expect(Math.abs(a.pos.x - b.pos.x)).toBeGreaterThan(2.5);
      }
    }
  });

  it('switches formation when the opponents lift the shuttle versus when they hit it down', () => {
    const opps = oppsNear();
    // Both settle side by side after our lift; the frame after the opponents hit, the owner is still in its
    // reaction delay, so any movement is the other partner changing formation.
    const firstMove = (incoming: ShuttleState) => {
      const pair = new Pair(at('far', 0, -1.5, -3.6), at('far', 1, 1.5, -3.6));
      pair.hold(outgoing(8), 3, opps);
      const r = pair.step(incoming, 1 / 120, opps);
      return Math.max(...r.intents.map((i) => Math.hypot(i.move.x, i.move.z)));
    };
    expect(firstMove({ pos: { x: 0, y: 2.6, z: 3 }, vel: { x: 0, y: 9, z: -12 } })).toBeGreaterThan(0.5); // lift: attack
    expect(firstMove({ pos: { x: 0, y: 2.6, z: 3 }, vel: { x: 0, y: -6, z: -30 } })).toBe(0); // smash: stay side by side
  });

  it('never has both partners swing at the same incoming shuttle over a scripted rally', () => {
    const opps = oppsNear();
    const launches: ShuttleState[] = [
      [0, 0, 9, -12], [0, -2, 9, -12], [0, 3, 9, -12], [0, 0, 12, -16], [0, -4, 5, -14],
      [0, 5, 6, -10], [1, 0, 4, -9], [-1, 0, 3, -8], [0, 0, 2, -6], [2, -3, 6, -9],
      [0.5, 1, 2, -22], [1.5, -3, 0, -24], [0, 0, 3, -18], [0, 0, 0, -16],
    ].map(([x, vx, vy, vz]) => ({ pos: { x, y: 2.6, z: 3 }, vel: { x: vx, y: vy, z: vz } }));
    const pair = new Pair(at('far', 0, -1.5, -3.6), at('far', 1, 1.5, -3.6));
    let handled = 0;
    const everSwung = new Set<number>();
    launches.forEach((launch, n) => {
      pair.hold(outgoing(n % 2 ? 8 : -8), 1.5, opps); // recover to formation after our last shot
      const swingers = new Set<number>();
      let shuttle = launch;
      for (let i = 0; i < 400; i++) {
        const r = pair.step(shuttle, 1 / 120, opps);
        r.intents.forEach((it, k) => { if (swings(it)) { swingers.add(k); everSwung.add(k); } });
        if (r.hit) { handled++; break; }
        const s = stepShuttle(shuttle, 1 / 120);
        if (s.event.kind !== 'none') break;
        shuttle = s.state;
      }
      expect(swingers.size, `launch ${n}`).toBeLessThanOrEqual(1);
    });
    expect(handled).toBeGreaterThanOrEqual(launches.length - 3);
    expect(everSwung.size).toBe(2); // the work is shared, not left to one partner
  });

  it('the receiver plays the serve and the receiving partner holds its spot without swinging', () => {
    const opps = [at('near', 0, 1.0, 2.4), at('near', 1, -1.5, 5)];
    const receiver = at('far', 0, -1.2, -4.4);
    const partner = at('far', 1, 0.5, -3.0); // nearer to where the serve lands (x 0.27, z -3.3)
    const pair = new Pair(receiver, partner);
    const serve: ShuttleState = { pos: { x: 1.0, y: 1.1, z: 2.2 }, vel: { x: -1.2, y: 8, z: -9 } };
    const landing = predictLanding(serve);
    expect(landing).not.toBeNull();
    expect(landing!.z).toBeLessThan(-COURT.shortServiceLine);
    const rest: ShuttleState = { pos: serve.pos, vel: { x: 0, y: 0, z: 0 } };
    for (let i = 0; i < 30; i++) pair.step(rest, 1 / 60, opps, [true, false]); // serve stage: shuttle held
    const start = { ...pair.p[1].pos };
    let shuttle = serve;
    let receiverSwung = false;
    for (let i = 0; i < 400; i++) {
      const r = pair.step(shuttle, 1 / 120, opps, [false, false]); // receiving flag drops once the serve is in the air
      expect(swings(r.intents[1])).toBe(false);
      expect(r.intents[1].charging).toBeNull();
      if (swings(r.intents[0])) receiverSwung = true;
      if (r.hit) break;
      shuttle = stepShuttle(shuttle, 1 / 120).state;
    }
    expect(receiverSwung).toBe(true);
    expect(pair.p[1].pos.x).toBeCloseTo(start.x, 5);
    expect(pair.p[1].pos.z).toBeCloseTo(start.z, 5);
  });

  // Plays one incoming shuttle with a bot whose partner never moves (a human we cannot see into).
  const playWithStaticMate = (mate: PlayerState) => {
    const bot = createBot('hard', () => 0.5);
    let me = at('far', 0, -1.5, -3.6);
    const ctx = dblCtx(mate, oppsNear());
    botIntent(bot, me, ctx, outgoing(-8), 0.05);
    let shuttle: ShuttleState = { pos: { x: 0, y: 2.6, z: 3 }, vel: { x: 3, y: 9, z: -12 } }; // lands about x = 1.7
    let swung = false;
    for (let i = 0; i < 400; i++) {
      const intent = botIntent(bot, me, ctx, shuttle, 1 / 120);
      if (swings(intent)) swung = true;
      const r = stepPlayer(me, intent, shuttle, 1 / 120, 0.7);
      me = r.player;
      if (r.hit) break;
      const s = stepShuttle(shuttle, 1 / 120);
      if (s.event.kind !== 'none') break;
      shuttle = s.state;
    }
    return { swung, me };
  };

  it('with a partner it cannot see into (human), leaves shuttles in the partner zone', () => {
    const { swung, me } = playWithStaticMate(at('far', 1, 1.5, -3.6));
    expect(swung).toBe(false);
    expect(me.pos.x).toBeLessThan(0); // stayed on its own half
  });

  it('takes a shuttle in the partner zone when the partner cannot reach it', () => {
    const { swung } = playWithStaticMate({ ...at('far', 1, 1.5, -3.6), action: 'down' });
    expect(swung).toBe(true);
  });

  it('doubles serves are mostly short', () => {
    const rng = makeLcg(7);
    const server = at('far', 0, -1.0, -2.5);
    const mate = at('far', 1, 1.0, -4.5);
    const opps = oppsNear();
    const held: ShuttleState = { pos: { x: -1.0, y: 1.0, z: -2.0 }, vel: { x: 0, y: 0, z: 0 } };
    const share = (ctxOf: () => BotContext) => {
      let short = 0;
      for (let i = 0; i < 400; i++) {
        const intent = botIntent(createBot('medium', rng), server, ctxOf(), held, 0.01);
        if (intent.charging === 'serveShort') short++;
      }
      return short / 400;
    };
    const doubles = share(() => dblCtx(mate, opps, false, true));
    expect(doubles).toBeGreaterThan(0.75);
    expect(doubles).toBeLessThan(0.95);
    expect(doubles).toBeGreaterThan(share(() => solo(opps[0], true)));
  });

  it('flicks toward the widest gap between the opponents', () => {
    const flick = (xs: [number, number], contactX: number) => {
      const bot = createBot('hard', () => 0.1);
      const me = at('far', 0, contactX, -4.5);
      const mate = at('far', 1, contactX + 2.2, -4.5);
      const opps = [at('near', 0, xs[0], 3.6), at('near', 1, xs[1], 3.6)];
      const ctx = dblCtx(mate, opps);
      botIntent(bot, me, ctx, outgoing(-8), 0.05);
      const shuttle: ShuttleState = { pos: { x: contactX, y: 2.3, z: -4.0 }, vel: { x: 0, y: -0.5, z: -2.0 } };
      const intent = botIntent(bot, me, ctx, shuttle, 0.2);
      expect(intent.release).not.toBeNull();
      return intent.racketVel.x;
    };
    // the far side looks toward +z, so a world-x move toward -x is a positive racketVel.x
    expect(flick([2, 2.5], 0.2)).toBeGreaterThan(0);    // opponents right: the widest gap is left of them
    expect(flick([-2.5, -2], -0.2)).toBeLessThan(0);    // opponents left: the gap is right of them
    expect(flick([-1.5, 1.5], 0.4)).toBeGreaterThan(0); // widest gap is the middle (x = 0)
    expect(flick([-1, 2.5], -0.5)).toBeLessThan(0);     // widest gap is the middle, centred at 0.75
  });
});
