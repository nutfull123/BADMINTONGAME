// One rally: serve placement, hit handling and the in/out/net/fault calls. Pure: no three, no DOM.
import { isInCourt, isInServiceBox, serviceBox, stepShuttle } from '../physics';
import { receiverSlot, serverSlot } from '../rules';
import { recoverBetweenPoints, stepPlayer } from '../sim';
import type { BotContext } from '../sim/bot';
import { SERVE_MAX_CONTACT } from '../sim/tuning';
import type { Intent, MatchState, PlayerState, ServiceCourt, ShuttleState, Side, Slot, Vec3 } from '../types';

export const STEP = 1 / 120; // fixed simulation step
const SERVE_AIM_FLICK = 2.4; // racketVel.x bias (~20 degrees): lands both short and long serves in the diagonal box
const SERVE_FEET_MARGIN = 0.12; // m: feet stay inside the service court without touching its lines (BWF Law 9.1.2)
const PARTNER_BEHIND = 1.8; // m: a doubles partner starts this far behind its teammate

const SIDES = ['near', 'far'] as const;
const other = (s: Side): Side => (s === 'near' ? 'far' : 'near');
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1);
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export type RallyReason = 'in' | 'out' | 'net' | 'fault' | 'serve-fault';
export interface RallyResult { winner: Side; reason: RallyReason }

export interface Rally {
  players: Record<Side, PlayerState[]>; // index = slot: 1 player per side in singles, 2 in doubles
  doubles: boolean;
  shuttle: ShuttleState;
  server: Side;
  serverSlot: Slot;   // the serving side's player who serves
  receiverSlot: Slot; // the receiving side's player who must return the serve (the other one may not touch it)
  court: ServiceCourt;
  // serve: shuttle held, waiting for the serve; serveFlight: served, not yet returned; rally: after the first return
  stage: 'serve' | 'serveFlight' | 'rally';
  lastHitter: Side | null;
  result: RallyResult | null;
}

// Server stands in their own service court, the receiver in the diagonal one (same court name from their own view).
// Doubles partners stand in the other half of their own court, a step behind their teammate.
export function serveSpots(server: Side, court: ServiceCourt, doubles = false) {
  const s = sgnOf(server);
  const x = (court === 'right' ? 1 : -1) * s * (doubles ? 1.5 : 1.3);
  const sz = doubles ? 2.4 : 2.6, rz = 3.5;
  return {
    server: { x, y: 0, z: s * sz } as Vec3,
    receiver: { x: -x, y: 0, z: -s * rz } as Vec3,
    serverPartner: { x: -x, y: 0, z: s * (sz + PARTNER_BEHIND) } as Vec3,
    receiverPartner: { x, y: 0, z: -s * (rz + PARTNER_BEHIND) } as Vec3,
  };
}

export function startRally(match: MatchState, players: Record<Side, PlayerState[]>): Rally {
  const spots = serveSpots(match.server, match.serviceCourt, match.doubles);
  const sSlot = serverSlot(match), rSlot = receiverSlot(match);
  const place = (side: Side, slot: Slot, at: Vec3, partnerAt: Vec3) =>
    players[side].map((p, i) => recoverBetweenPoints(p, i === slot ? at : partnerAt));
  const placed = {} as Record<Side, PlayerState[]>;
  placed[match.server] = place(match.server, sSlot, spots.server, spots.serverPartner);
  placed[other(match.server)] = place(other(match.server), rSlot, spots.receiver, spots.receiverPartner);
  const r: Rally = {
    players: placed, doubles: match.doubles,
    shuttle: { pos: ZERO, vel: ZERO },
    server: match.server, serverSlot: sSlot, receiverSlot: rSlot, court: match.serviceCourt,
    stage: 'serve', lastHitter: null, result: null,
  };
  r.shuttle = heldShuttle(r.players[r.server][r.serverSlot]);
  return r;
}

// The held shuttle sits where the server's racket is, so a serve always has something to hit.
const heldShuttle = (server: PlayerState): ShuttleState => ({
  pos: { x: server.racketHead.x, y: Math.min(server.racketHead.y, SERVE_MAX_CONTACT), z: server.racketHead.z },
  vel: ZERO,
});

// The serve flick caps at 25 degrees, so a straight serve lands in the wrong box: bias it toward the diagonal.
export function aimServe(intent: Intent, me: PlayerState): Intent {
  const toward = me.pos.x >= 0 ? -1 : 1; // world x of the diagonal box
  const bias = sgnOf(me.side) * toward * SERVE_AIM_FLICK;
  return { ...intent, racketVel: { x: intent.racketVel.x + bias, y: intent.racketVel.y } };
}

export function judgeFloor(
  at: Vec3, hitter: Side, serveFlight: boolean, court: ServiceCourt, doubles = false,
): RallyResult {
  const receiver = other(hitter);
  const good = serveFlight ? isInServiceBox(at, receiver, court, doubles) : isInCourt(at, receiver, doubles);
  if (good) return { winner: hitter, reason: 'in' };
  return { winner: receiver, reason: serveFlight ? 'serve-fault' : 'out' };
}

// Move the feet to (x, z), carrying the racket head along so it stays where the player holds it.
function placeFeet(p: PlayerState, x: number, z: number): PlayerState {
  if (x === p.pos.x && z === p.pos.z) return p;
  const dx = x - p.pos.x, dz = z - p.pos.z;
  return {
    ...p, // keeps the sim's hidden swing/dive/footwork state
    pos: { ...p.pos, x, z },
    vel: { ...p.vel, x: 0, z: 0 },
    racketHead: { ...p.racketHead, x: p.racketHead.x + dx, z: p.racketHead.z + dz },
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isServe = (s: Intent['charging']) => s === 'serveShort' || s === 'serveLong';

// BWF Law 9.1: server and receiver stand inside diagonally opposite service courts (court names match from each
// player's own view; doubles boxes are wider and shorter), and their feet stay still from the start of the serve
// until the shuttle is struck.
export function serveStance(
  p: PlayerState, before: PlayerState, court: ServiceCourt, serverIntent: Intent, doubles = false,
): PlayerState {
  if (isServe(serverIntent.charging) || isServe(serverIntent.release)) return placeFeet(p, before.pos.x, before.pos.z);
  const b = serviceBox(p.side, court, doubles);
  const m = SERVE_FEET_MARGIN;
  return placeFeet(p, clamp(p.pos.x, b.xMin + m, b.xMax - m), clamp(p.pos.z, b.zMin + m, b.zMax - m));
}

export function stepRally(r: Rally, intents: Record<Side, Intent[]>, dt: number, assist: number): void {
  if (r.result) return;
  const receiverSide = other(r.server);
  const serverIntent = intents[r.server][r.serverSlot];
  const hits: { side: Side; slot: Slot; launch: ShuttleState }[] = [];
  for (const side of SIDES) {
    r.players[side] = r.players[side].map((before, i) => {
      const slot = i as Slot;
      const out = stepPlayer(before, intents[side][i], r.shuttle, dt, assist);
      const isServer = side === r.server && slot === r.serverSlot;
      const isReceiver = side === receiverSide && slot === r.receiverSlot;
      if (out.hit && (r.stage !== 'serve' || isServer)) hits.push({ side, slot, launch: out.hit.launch });
      // partners are free to roam their own half during the serve (BWF Law 9.5); the sim keeps them off the net
      return r.stage === 'serve' && (isServer || isReceiver)
        ? serveStance(out.player, before, r.court, serverIntent, r.doubles) : out.player;
    });
  }

  // two players can hit in the same step: the legal one counts (only the designated receiver may return the serve)
  const hit = hits.find((h) => r.stage !== 'serveFlight' || (h.side === receiverSide && h.slot === r.receiverSlot)) ?? hits[0];
  if (hit) {
    // BWF Law 13.2.3: the receiver's partner hitting the served shuttle is a fault; Law 13.3.7/13.3.8: so is a second
    // hit by the same side (the same player or the partner) in a row
    const partnerHit = r.stage === 'serveFlight' && hit.side === receiverSide && hit.slot !== r.receiverSlot;
    if (partnerHit || (r.stage !== 'serve' && hit.side === r.lastHitter)) {
      r.result = { winner: other(hit.side), reason: 'fault' };
      return;
    }
    r.stage = r.stage === 'serve' ? 'serveFlight' : 'rally';
    r.lastHitter = hit.side;
    r.shuttle = hit.launch;
  } else if (r.stage === 'serve') {
    r.shuttle = heldShuttle(r.players[r.server][r.serverSlot]);
    return;
  }

  const { state, event } = stepShuttle(r.shuttle, dt);
  r.shuttle = state;
  const hitter = r.lastHitter!;
  if (event.kind === 'net') r.result = { winner: other(hitter), reason: 'net' };
  else if (event.kind === 'floor') r.result = judgeFloor(event.at, hitter, r.stage === 'serveFlight', r.court, r.doubles);
}

// What a bot player knows: its partner, the opponents, and whether it serves or must return the serve.
// `receiving` stays true until the serve is returned: after that either partner may play the shuttle.
export function botContext(r: Rally, side: Side, slot: Slot): BotContext {
  return {
    partner: r.players[side][1 - slot] ?? null,
    opponents: r.players[other(side)],
    serving: r.stage === 'serve' && side === r.server && slot === r.serverSlot,
    receiving: r.stage !== 'rally' && side !== r.server && slot === r.receiverSlot,
  };
}

// Headless rally for tests and bots: intent(side, slot, rally, secondsSoFar) is asked every step for every player.
export function runRally(o: {
  match: MatchState; players: Record<Side, PlayerState[]>;
  intent: (side: Side, slot: Slot, r: Rally, t: number) => Intent;
  assist?: number; maxSeconds?: number;
}): { rally: Rally; result: RallyResult | null; seconds: number } {
  const r = startRally(o.match, o.players);
  const ask = (side: Side, t: number) => r.players[side].map((_, i) => o.intent(side, i as Slot, r, t));
  let t = 0;
  while (!r.result && t < (o.maxSeconds ?? 60)) {
    stepRally(r, { near: ask('near', t), far: ask('far', t) }, STEP, o.assist ?? 0.7);
    t += STEP;
  }
  return { rally: r, result: r.result, seconds: t };
}
