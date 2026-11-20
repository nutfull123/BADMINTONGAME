// Shared contract between modules. Change only through claude (lead).
// Units: metres, seconds, m/s. Axes: x = across the court (+x is the near
// player's right when facing the net), y = up, z = along the court.
// Net plane is z = 0. Near (human) half is z > 0, far half is z < 0.

export interface Vec3 { x: number; y: number; z: number }

export type Side = 'near' | 'far';
export type ServiceCourt = 'right' | 'left';
export type Slot = 0 | 1;  // partner index within a side; singles uses 0 only

// MS men's singles, WS women's singles, MD men's doubles, WD women's doubles, XD mixed doubles.
export type MatchEvent = 'MS' | 'WS' | 'MD' | 'WD' | 'XD';

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
  doubles: boolean;
  // Doubles (BWF Law 11): which partner of each side stands in that side's right service court.
  // The server is the serving side's player in `serviceCourt`; the receiver is the receiving side's player
  // in the same-named court. Serving side wins a rally: its partners swap courts. Receiving side wins: no swap.
  // Singles: always { near: 0, far: 0 } and slot 0 serves and receives.
  rightCourt: Record<Side, Slot>;
}

// rules/index.ts must export:
//   FORMAT_3X15: MatchConfig; FORMAT_3X21: MatchConfig
//   createMatch(config: MatchConfig, firstServer: Side, doubles = false): MatchState
//   awardRally(state: MatchState, rallyWinner: Side): MatchState   // pure, returns a new object
//   serverSlot(state: MatchState): Slot; receiverSlot(state: MatchState): Slot

// ---------- physics/ (pure) ----------

export interface ShuttleState { pos: Vec3; vel: Vec3 }

export type ShuttleEvent =
  | { kind: 'none' }
  | { kind: 'net' }                       // hit the net, rally ends on its side
  | { kind: 'floor'; at: Vec3 };          // touched the floor at `at`

// physics/index.ts must export:
//   COURT: { halfLength: 6.70; halfWidthSingles: 2.59; halfWidthDoubles: 3.05; shortServiceLine: 1.98;
//            longServiceLineDoubles: 5.94; netHeightCentre: 1.524; netHeightPost: 1.55 }
//   stepShuttle(s: ShuttleState, dt: number): { state: ShuttleState; event: ShuttleEvent }
//   predictLanding(s: ShuttleState): Vec3 | null     // where it will touch the floor, null if it hits the net
//   isInSingles(at: Vec3, side: Side): boolean       // inside that side's singles court (lines are in)
//   isInCourt(at: Vec3, side: Side, doubles: boolean): boolean
//   serviceBox(side, court, doubles = false); isInServiceBox(at, receiverSide, court, doubles = false)

// ---------- sim/ ----------

export type BodyType = 'tall' | 'balanced' | 'short';
export type Gender = 'male' | 'female';

export interface Stats {
  gender: Gender;      // look and height range only; the stat budget is the same
  body: BodyType;      // with gender fixes height (sim/tuning HEIGHT): male 1.95/1.78/1.63, female 1.82/1.68/1.58 m
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
  slot: Slot;                // partner index on its side (0 in singles)
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
//   createPlayer(stats: Stats, side: Side, at: Vec3, slot: Slot = 0): PlayerState
//   stepPlayer(p: PlayerState, intent: Intent, shuttle: ShuttleState, dt: number, assist: number):
//     { player: PlayerState; hit: HitResult | null }
//   bot (sim/bot.ts): createBot(level, rng?), botIntent(bot, me: PlayerState, ctx: BotContext, shuttle, dt): Intent
//     BotContext { partner: PlayerState | null; opponents: PlayerState[]; serving: boolean; receiving: boolean }

// ---------- render/ and ui/ ----------

export interface WorldView {
  players: PlayerState[];     // 2 in singles, 4 in doubles
  human?: number;             // index in players of the human (camera, rings, aid); default: first near player
  shuttle: ShuttleState;
  landing: Vec3 | null;       // null when the marker is off
  timingRing: number | null;  // 0..1 closeness to perfect, null when off
  charge: number | null;      // 0..1 charge of the human player
  aim?: AimView | null;       // human racket aid; omitted or null hides it
}

// Racket aid for the human: where the racket face is, where the incoming shuttle is right now,
// which side the racket is on, and whether it is close enough to hit.
export interface AimView {
  racket: Vec3;
  target: Vec3 | null;
  side: 'forehand' | 'backhand';
  onTarget: boolean;
}

// ---------- app/ (pure: settings, characters, local save). ui/ draws the pages, game/ applies them ----------

// The flat settings a match or tutorial reads (built from GameSettings by app/settings toMatchSettings).
export interface MatchSettings {
  hitAssist: number;        // 0..100
  landingMarker: boolean;
  timingRing: boolean;
  format: '3x15' | '3x21';
  botLevel: 'easy' | 'medium' | 'hard';
  mode: 'easy' | 'normal' | 'pro' | 'timing'; // assist mode
  event: MatchEvent;        // must fit the character's gender
}

export type CameraPreset = 'behindLow' | 'behindHigh' | 'broadcast';
export interface CameraSettings {
  preset: CameraPreset;
  height: number;   // -1..1 offset from the preset's camera height
  distance: number; // -1..1 offset from the preset's distance (+ = farther)
  zoom: number;     // 0.6..1.6 starting zoom
  follow: boolean;  // follow the human sideways
}

export type InputAction =
  | 'up' | 'down' | 'left' | 'right' | 'backhand' | 'forehand' | 'smash' | 'drop' | 'clear'
  | 'jump' | 'dive' | 'net' | 'fullscreen' | 'zoomIn' | 'zoomOut';
export type KeyBindings = Record<InputAction, string[]>; // KeyboardEvent.code values, or 'Mouse0' / 'Mouse2'

export interface ControlSettings {
  mouseSensitivity: number; // 0.25..3, 1 = default
  keys: KeyBindings;
}

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GameSettings {
  camera: CameraSettings;
  controls: ControlSettings;
  assists: { mode: MatchSettings['mode']; hitAssist: number; landingMarker: boolean; timingRing: boolean; racketAid: boolean };
  graphics: { quality: GraphicsQuality };
  match: { event: MatchEvent; format: MatchSettings['format']; botLevel: MatchSettings['botLevel'] };
}

export interface Character {
  id: string;
  name: string;
  stats: Stats;        // gender and body fixed after creation
  earnedPoints: number; // extra stat points from offline play (phase 4); budget = 20 + earnedPoints, max 40
  createdAt: number;   // ms since epoch
}

export interface SaveData {
  version: 1;
  characters: Character[];
  activeCharacterId: string | null;
  settings: GameSettings;
}

// app/ must export:
//   settings.ts: DEFAULT_GAME_SETTINGS, DEFAULT_KEYS (both frozen: clone before editing), LIMITS (slider ranges),
//            CAMERA_PRESETS, GRAPHICS_QUALITIES, sanitizeSettings(raw): GameSettings,
//            rebindKey(keys, action, code): { keys; conflict: InputAction | null },
//            toMatchSettings(s): MatchSettings (caller fits match.event to the character's gender first;
//            camera, controls, graphics and racketAid are read from GameSettings by the game itself)
//   save.ts: interface StorageLike { getItem; setItem }; loadSave(storage?): SaveData (never throws; validates
//            every field of the untrusted saved data); writeSave(data, storage?): boolean; emptySave(); SAVE_KEY
//   characters.ts: statsError(stats, budget): string | null; characterBudget(c): number (20 + earned, max 40);
//            createCharacter(save, name, stats): SaveData; updateCharacter(save, id, { name?, stats? }): SaveData
//            (gender/body cannot change); deleteCharacter; setActiveCharacter (unknown id: unchanged);
//            activeCharacter(save): Character | null. create/update throw on invalid stats: check statsError first.
// Camera offsets: height +1 = about 2 m higher, distance +1 = about 3 m farther than the preset (render decides).
