// Every sim/ tuning number lives here. Units: metres, seconds, m/s, radians unless noted.
// Tweak the feel in this one file.
import type { BodyType } from '../types';

export const STAT_BUDGET = 20; // speed + power + recovery + stamina must not exceed this
export const STAT_MAX = 10; // each stat is 0..10

// ---------- body ----------
export const HEIGHT: Record<BodyType, number> = { tall: 1.95, balanced: 1.78, short: 1.63 }; // metres
export const BODY_SPEED: Record<BodyType, number> = { tall: 0.92, balanced: 1, short: 1.08 }; // top-speed multiplier
export const BODY_ACCEL: Record<BodyType, number> = { tall: 0.7, balanced: 1, short: 1.25 }; // acceleration multiplier
export const BODY_TURN: Record<BodyType, number> = { tall: 0.55, balanced: 1, short: 1.3 }; // how fast velocity direction can change
export const BODY_JUMP: Record<BodyType, number> = { tall: 0.95, balanced: 1, short: 1.05 }; // jump height multiplier

// ---------- movement ----------
export const BASE_TOP_SPEED = 4; // m/s at speed stat 5 on a balanced body
export const SPEED_STAT_SPAN = 0.25; // speed stat 0 / 10 gives -25% / +25% top speed
export const BASE_ACCEL = 22; // m/s^2 at speed stat 5 on a balanced body
export const CHARGE_MOVE_FACTOR = 0.6; // moving while a shot is charging runs at 60% speed
export const AIR_CONTROL = 0.2; // share of ground acceleration available in the air
export const TURN_RATE = 9; // rad/s the visual facing turns toward the shuttle (scaled by body turn)
export const FACING_LIMIT = 1.2; // facing never turns more than this far from the net direction
export const MOVE_DEADZONE = 0.05; // move input below this counts as no input
export const MOVING_SPEED = 0.3; // m/s above which action reads 'moving'
export const HALF_MARGIN_X = 0.6; // how far outside the side line a player may stand
export const HALF_MARGIN_BACK = 0.8; // how far behind the back line a player may stand
export const NET_CLEARANCE = 0.45; // closest a player's feet may get to the net plane

// ---------- racket plane ----------
export const RACKET_FORWARD = 0.5; // plane distance in front of the feet, toward the net
export const REACH_LATERAL_BASE = 0.9; // sideways reach at balanced height (racket.x = +-1)
export const REACH_LATERAL_PER_M = 1.0; // extra sideways reach per metre of height above 1.78
export const RACKET_LOW = 0.3; // racket head height at racket.y = -1 (about knee)
export const RACKET_TOP_FACTOR = 1.3; // overhead head height = height * this + RACKET_TOP_OFFSET
export const RACKET_TOP_OFFSET = 0.15;
export const SERVE_MAX_CONTACT = 1.15; // serve contact must be below this height (racket head is clamped)

// ---------- swing and hit ----------
export const SWING_WINDOW = 0.12; // s the swing can make contact after release
export const SWING_COOLDOWN = 0.35; // s after a swing starts before the next one may start
export const HIT_RADIUS_BASE = 0.35; // m, hit radius with assist 0
export const HIT_RADIUS_ASSIST = 0.45; // m, extra hit radius at assist 1
export const SWEET_RADIUS = 0.12; // m, contact closer than this to the racket head is perfect
export const WRONG_SIDE_DEADZONE = 0.1; // racket.x past this on the wrong side makes a basic swing weak

// ---------- charge ----------
export const CHARGE_FULL_TIME = 1.2; // s of holding for a full charge
export const LOW_STAMINA_CHARGE_CAP = 0.5; // max charge at zero stamina (1 at STAMINA_FULL_CHARGE or more)
export const STAMINA_FULL_CHARGE = 0.4; // stamina level at which the charge cap reaches 1

// ---------- stamina and fatigue (stamina 0..1) ----------
export const CHARGE_DRAIN = 0.06; // stamina per second of holding a charge
export const JUMP_COST = 0.03; // stamina per jump
export const DIVE_COST = 0.08; // stamina per dive
export const STAMINA_COST_SPAN = 0.1; // drain scales by 1 + (5 - stamina stat) * this (stat 0 = x1.5, 10 = x0.5)
export const STAMINA_REGEN = 0.03; // stamina per second when not charging or diving
export const STAMINA_REGEN_SPAN = 0.06; // regen scales by 1 + (stamina stat - 5) * this
export const LOW_STAMINA = 0.3; // below this stamina, speed starts to drop
export const LOW_STAMINA_SPEED = 0.75; // speed multiplier at zero stamina
export const FATIGUE_BUILD = 0.01; // fatigue per second spent running at full speed
export const FATIGUE_DECAY = 0.01; // fatigue lost per second standing still
export const FATIGUE_SPEED_LOSS = 0.12; // top speed lost at full fatigue
export const FATIGUE_REGEN_LOSS = 0.6; // regen lost at full fatigue
export const FATIGUE_CHARGE_LOSS = 0.2; // max charge lost at full fatigue
export const BETWEEN_POINTS_STAMINA = 0.25; // stamina restored by recoverBetweenPoints
export const BETWEEN_POINTS_FATIGUE = 0.25; // fatigue removed by recoverBetweenPoints

// ---------- jump ----------
export const JUMP_MIN = 0.3; // m, jump height at no charge
export const JUMP_MAX = 0.7; // m, jump height at full charge
export const JUMP_CHARGE_FULL = 0.6; // s of holding Space for the full jump
export const JUMP_POWER_SPAN = 0.02; // jump scales by 1 + (power - 5) * this
export const GRAVITY = 9.81; // m/s^2 for the player's jump arc

// ---------- dive ----------
export const DIVE_DISTANCE = 1.8; // m lunged
export const DIVE_TIME = 0.35; // s the lunge lasts (the one chance to lift)
export const DIVE_RACKET_MAX_Y = 0.5; // racket head height cap while diving
export const DOWN_RACKET_Y = 0.15; // racket head height while lying down
export const DIVE_RADIUS_BONUS = 0.3; // m of extra hit radius while diving
export const DIVE_LIFT_CHARGE = 0.5; // the lift from a dive is a clear at this charge
export const GET_UP_BASE = 12; // presses to get up at recovery 0
export const GET_UP_PER_RECOVERY = 0.8; // presses saved per recovery point
export const GET_UP_MIN = 4; // fewest presses ever needed

// ---------- shot launch ----------
export const RANDOM_SPREAD_ANGLE = (3 * Math.PI) / 180; // rad of aim error on a non-perfect shot
export const RANDOM_SPREAD_DEPTH = 0.8; // m of landing-depth error on a non-perfect shot
export const PERFECT_SPREAD = 0.15; // perfect shots keep this share of the spread
export const PERFECT_FLATTEN = (6 * Math.PI) / 180; // rad flatter (so quicker) arc on a perfect shot
export const FLICK_MAX_ANGLE = (25 * Math.PI) / 180; // rad of left/right aim at full flick
export const FLICK_FULL = 3; // racketVel.x (units/s) that counts as a full flick
export const SPEED_CAP = 62; // m/s launch speed cap at power 5
export const SPEED_CAP_POWER_SPAN = 0.02; // cap scales by 1 + (power - 5) * this
export const SPEED_MIN = 3; // m/s lowest launch speed the solver tries

export const CLEAR_DEPTH_NEAR = 1.5; // m from the back line at zero charge
export const CLEAR_DEPTH_FAR = 0.3; // m from the back line at full charge
export const CLEAR_ELEVATIONS_DEG = [48, 56, 40, 64, 34]; // clear launch angles tried, preferred first

export const DROP_DEPTH_MIN = 0.5; // m past the net at zero charge
export const DROP_DEPTH_MAX = 3; // m past the net at full charge
export const DROP_ELEVATIONS_DEG = [-5, 0, 8, 16, 25, 35, 50, 65]; // launch angles tried, flattest first

export const SMASH_SPEED_MIN = 45; // m/s at zero charge, power 5
export const SMASH_SPEED_MAX = 80; // m/s at full charge, power 5
export const SMASH_POWER_SPAN = 0.03; // speed scales by 1 + (power - 5) * this
export const SMASH_PERFECT_BONUS = 1.1; // speed multiplier on a perfect smash
export const SMASH_SPEED_HARD_CAP = 90; // m/s, never faster
export const SMASH_DEPTH_FLAT = 5; // m past the net when hit from a low contact
export const SMASH_DEPTH_STEEP = 2.8; // m past the net when hit from a high contact
export const SMASH_STEEP_FROM = 2; // m contact height where the smash starts to steepen
export const SMASH_STEEP_TO = 3.4; // m contact height of the steepest smash

export const BASIC_DEPTH = 5; // m past the net of a flat drive
export const BASIC_ELEVATIONS_DEG = [3, 7, 12, 18, 26, 38, 50]; // flat drive launch angles tried, flattest first
export const WEAK_DEPTH = 2.5; // m past the net of a wrong-side basic swing
export const WEAK_ELEVATIONS_DEG = [35, 45, 55]; // weak shot launch angles tried (lobbed and slow)

export const NET_TAPE_HEIGHT = 1.524; // m, contact above this is a kill
export const KILL_SPEED = 22; // m/s of a net kill
export const KILL_DEPTH = 2.2; // m past the net where a kill lands
export const TUMBLE_DEPTH = 0.5; // m past the net where a tumble lands
export const TUMBLE_ELEVATIONS_DEG = [20, 30, 40, 50, 60, 70, 80]; // tumble launch angles tried
export const PUSH_FLICK_UP = 3; // racketVel.y (units/s) that counts as strongly up (push deep)
export const PUSH_DEPTH = 5; // m past the net of a net push
export const PUSH_ELEVATIONS_DEG = [20, 30, 40, 50, 60, 70]; // push launch angles tried, flattest first

export const SERVE_SHORT_PAST_LINE_MIN = 0.15; // m past the short service line at zero charge
export const SERVE_SHORT_PAST_LINE_MAX = 0.7; // m past the short service line at full charge
export const SERVE_SHORT_ELEVATIONS_DEG = [15, 25, 35, 45, 60]; // short serve launch angles tried
export const SERVE_LONG_FROM_LINE_MIN = 0.6; // m before the back line at zero charge
export const SERVE_LONG_FROM_LINE_MAX = 0.15; // m before the back line at full charge
export const SERVE_LONG_ELEVATIONS_DEG = [55, 48, 62, 40]; // long serve launch angles tried

export const SOLVE_TOLERANCE = 0.25; // m landing error the solver accepts
export const SOLVE_ITERATIONS = 20; // bisection steps per search
export const ANGLE_SEARCH_MIN_DEG = -85; // steepest downward angle the smash/kill solver tries
export const ANGLE_SEARCH_MAX_DEG = 60; // steepest upward angle the smash/kill solver tries (low contacts must still clear the net)
