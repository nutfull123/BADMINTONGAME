// One rally: serve placement, hit handling and the in/out/net/fault calls. Pure: no three, no DOM.
import { isInServiceBox, isInSingles, serviceBox, stepShuttle } from '../physics';
import { recoverBetweenPoints, stepPlayer } from '../sim';
import { SERVE_MAX_CONTACT } from '../sim/tuning';
import type { Intent, MatchState, PlayerState, ServiceCourt, ShuttleState, Side, Vec3 } from '../types';

export const STEP = 1 / 120; // fixed simulation step
const SERVE_AIM_FLICK = 2.4; // racketVel.x bias (~20 degrees): lands both short and long serves in the diagonal box
const SERVE_FEET_MARGIN = 0.12; // m: feet stay inside the service court without touching its lines (BWF Law 9.1.2)

const other = (s: Side): Side => (s === 'near' ? 'far' : 'near');
const sgnOf = (s: Side) => (s === 'near' ? 1 : -1);
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export type RallyReason = 'in' | 'out' | 'net' | 'fault' | 'serve-fault';
export interface RallyResult { winner: Side; reason: RallyReason }

export interface Rally {
  near: PlayerState;
  far: PlayerState;
  shuttle: ShuttleState;
  server: Side;
  court: ServiceCourt;
  // serve: shuttle held, waiting for the serve; serveFlight: served, not yet returned; rally: after the first return
  stage: 'serve' | 'serveFlight' | 'rally';
  lastHitter: Side | null;
  result: RallyResult | null;
}

// Server stands in their own service court, the receiver in the diagonal one (same court name from their own view).
export function serveSpots(server: Side, court: ServiceCourt): { server: Vec3; receiver: Vec3 } {
  const s = sgnOf(server);
  const x = (court === 'right' ? 1 : -1) * s * 1.3;
  return { server: { x, y: 0, z: s * 2.6 }, receiver: { x: -x, y: 0, z: -s * 3.5 } };
}

export function startRally(match: MatchState, near: PlayerState, far: PlayerState): Rally {
  const spots = serveSpots(match.server, match.serviceCourt);
  const r: Rally = {
    near: recoverBetweenPoints(near, match.server === 'near' ? spots.server : spots.receiver),
    far: recoverBetweenPoints(far, match.server === 'far' ? spots.server : spots.receiver),
    shuttle: { pos: ZERO, vel: ZERO },
    server: match.server, court: match.serviceCourt, stage: 'serve', lastHitter: null, result: null,
  };
  r.shuttle = heldShuttle(r[r.server]);
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

export function judgeFloor(at: Vec3, hitter: Side, serveFlight: boolean, court: ServiceCourt): RallyResult {
  const receiver = other(hitter);
  const good = serveFlight ? isInServiceBox(at, receiver, court) : isInSingles(at, receiver);
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
// player's own view), and their feet stay still from the start of the serve until the shuttle is struck.
export function serveStance(p: PlayerState, before: PlayerState, court: ServiceCourt, serverIntent: Intent): PlayerState {
  if (isServe(serverIntent.charging) || isServe(serverIntent.release)) return placeFeet(p, before.pos.x, before.pos.z);
  const b = serviceBox(p.side, court);
  const m = SERVE_FEET_MARGIN;
  return placeFeet(p, clamp(p.pos.x, b.xMin + m, b.xMax - m), clamp(p.pos.z, b.zMin + m, b.zMax - m));
}

export function stepRally(r: Rally, intents: Record<Side, Intent>, dt: number, assist: number): void {
  if (r.result) return;
  let hitBy: Side | null = null;
  let launch: ShuttleState | null = null;
  for (const side of ['near', 'far'] as const) {
    const before = r[side];
    const out = stepPlayer(before, intents[side], r.shuttle, dt, assist);
    r[side] = r.stage === 'serve' ? serveStance(out.player, before, r.court, intents[r.server]) : out.player;
    if (out.hit && !hitBy && (r.stage !== 'serve' || side === r.server)) { hitBy = side; launch = out.hit.launch; }
  }

  if (hitBy && launch) {
    if (r.stage !== 'serve' && hitBy === r.lastHitter) { r.result = { winner: other(hitBy), reason: 'fault' }; return; }
    r.stage = r.stage === 'serve' ? 'serveFlight' : 'rally';
    r.lastHitter = hitBy;
    r.shuttle = launch;
  } else if (r.stage === 'serve') {
    r.shuttle = heldShuttle(r[r.server]);
    return;
  }

  const { state, event } = stepShuttle(r.shuttle, dt);
  r.shuttle = state;
  const hitter = r.lastHitter!;
  if (event.kind === 'net') r.result = { winner: other(hitter), reason: 'net' };
  else if (event.kind === 'floor') r.result = judgeFloor(event.at, hitter, r.stage === 'serveFlight', r.court);
}

// Headless rally for tests and bots: intent(side, rally, secondsSoFar) is asked every step.
export function runRally(o: {
  match: MatchState; near: PlayerState; far: PlayerState;
  intent: (side: Side, r: Rally, t: number) => Intent;
  assist?: number; maxSeconds?: number;
}): { rally: Rally; result: RallyResult | null; seconds: number } {
  const r = startRally(o.match, o.near, o.far);
  let t = 0;
  while (!r.result && t < (o.maxSeconds ?? 60)) {
    stepRally(r, { near: o.intent('near', r, t), far: o.intent('far', r, t) }, STEP, o.assist ?? 0.7);
    t += STEP;
  }
  return { rally: r, result: r.result, seconds: t };
}
