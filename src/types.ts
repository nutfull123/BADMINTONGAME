// Shared contract between modules. Change only through claude (lead).
// Units: metres, seconds, m/s. Axes: x = across the court (+x is the near
// player's right when facing the net), y = up, z = along the court.
// Net plane is z = 0. Near (human) half is z > 0, far half is z < 0.

export interface Vec3 { x: number; y: number; z: number }

export type Side = 'near' | 'far';
export type ServiceCourt = 'right' | 'left';

// ---------- rules/ (pure, no imports outside rules/ except this file) ----------

export interface MatchConfig {
  pointsToWin: number; // 15 or 21
  deuceAt: number;     // 14 or 20: from deuceAt-all, win by 2
  cap: number;         // 21 or 30: first to cap wins
  gamesToWin: number;  // 2 (best of 3)
  intervalAt: number;  // 8 or 11: interval when leader first reaches it; end change in deciding game
}

export interface GameScore { near: number; far: number }

export interface MatchState {
  config: MatchConfig;
  score: GameScore;            // current game
  completedGames: GameScore[];
  gamesWon: GameScore;
  server: Side;
  serviceCourt: ServiceCourt;  // court the server serves from (right on even own score)
  endsSwapped: boolean;        // true when players stand on the opposite ends from game 1
  intervalNow: boolean;        // true right after the rally that triggered an interval
  winner: Side | null;
}

// rules/index.ts must export:
//   FORMAT_3X15: MatchConfig; FORMAT_3X21: MatchConfig
//   createMatch(config: MatchConfig, firstServer: Side): MatchState
//   awardRally(state: MatchState, rallyWinner: Side): MatchState   // pure, returns a new object

// ---------- physics/ (pure) ----------

export interface ShuttleState { pos: Vec3; vel: Vec3 }

export type ShuttleEvent =
  | { kind: 'none' }
  | { kind: 'net' }                       // hit the net, rally ends on its side
  | { kind: 'floor'; at: Vec3 };          // touched the floor at `at`

// physics/index.ts must export:
//   COURT: { halfLength: 6.70; halfWidthSingles: 2.59; shortServiceLine: 1.98;
//            netHeightCentre: 1.524; netHeightPost: 1.55 }
//   stepShuttle(s: ShuttleState, dt: number): { state: ShuttleState; event: ShuttleEvent }
//   predictLanding(s: ShuttleState): Vec3 | null     // where it will touch the floor, null if it hits the net
//   isInSingles(at: Vec3, side: Side): boolean       // inside that side's singles court (lines are in)
//   isInServiceBox(at: Vec3, receiverSide: Side, court: ServiceCourt): boolean

// ---------- sim/ ----------

export type BodyType = 'tall' | 'balanced' | 'short';

export interface Stats {
  body: BodyType;      // fixes height: tall 1.95 m, balanced 1.78 m, short 1.63 m
  speed: number;       // 0..10
  power: number;       // 0..10
  recovery: number;    // 0..10
  stamina: number;     // 0..10   speed+power+recovery+stamina <= STAT_BUDGET (20)
}

export type ShotType = 'basic' | 'smash' | 'drop' | 'clear' | 'net' | 'serveShort' | 'serveLong';

// One frame of player intent. Produced by input/ for the human and by the bot.
export interface Intent {
  move: { x: number; z: number };      // -1..1 each, camera-relative already resolved to court axes
  racket: { x: number; y: number };    // -1..1: x backhand(-1)..forehand(+1), y low(-1)..overhead(+1)
  racketVel: { x: number; y: number }; // racket motion per second in the same units (the "flick")
  charging: ShotType | null;           // shot whose button is held (smash/drop/clear/serve*)
  chargeTime: number;                  // seconds the current charge has been held
  release: ShotType | null;            // shot released this frame (swing now)
  basicSwing: 'forehand' | 'backhand' | null; // E / Q pressed this frame
  jumpCharge: number;                  // seconds Space has been held, 0 if not
  jumpRelease: boolean;                // Space released this frame
  dive: boolean;                       // C pressed this frame (also mash to get up)
  netShot: boolean;                    // Alt pressed this frame
}

export type PlayerAction = 'idle' | 'moving' | 'charging' | 'swinging' | 'airborne' | 'diving' | 'down';

export interface PlayerState {
  side: Side;
  stats: Stats;
  pos: Vec3;                 // feet
  vel: Vec3;
  facing: number;            // radians, 0 = facing the net
  racketHead: Vec3;          // world position of the racket head
  action: PlayerAction;
  staminaNow: number;        // 0..1
  fatigue: number;           // 0..1, builds over long rallies
  getUpPressesLeft: number;  // while action === 'down'
}

export interface HitResult {
  shot: ShotType;
  perfect: boolean;
  launch: ShuttleState;      // shuttle state right after contact
}

// sim/index.ts must export:
//   STAT_BUDGET = 20
//   createPlayer(stats: Stats, side: Side, at: Vec3): PlayerState
//   stepPlayer(p: PlayerState, intent: Intent, shuttle: ShuttleState, dt: number, assist: number):
//     { player: PlayerState; hit: HitResult | null }
//   bot: createBot(level: 'easy'|'medium'|'hard'), botIntent(bot, me: PlayerState, opp: PlayerState, shuttle, dt): Intent

// ---------- render/ and ui/ ----------

export interface WorldView {
  players: PlayerState[];
  shuttle: ShuttleState;
  landing: Vec3 | null;       // null when the marker is off
  timingRing: number | null;  // 0..1 closeness to perfect, null when off
  charge: number | null;      // 0..1 charge of the human player
}
