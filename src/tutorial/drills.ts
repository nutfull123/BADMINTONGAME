// The eight tutorial drills: Thai instructions, a feeder and a success test for each.
// Pure: no DOM, no three. The game layer drives these; tests can too.
import { COURT, isInServiceBox, isInSingles } from '../physics';
import { launchShuttle } from '../sim/shots';
import type { HitResult, PlayerState, ServiceCourt, ShuttleState, ShotType, Stats, Vec3 } from '../types';

export type DrillId = 'move' | 'basic' | 'clear' | 'drop' | 'smash' | 'net' | 'dive' | 'serve';

export const DRILL_IDS: readonly DrillId[] = [
  'move', 'basic', 'clear', 'drop', 'smash', 'net', 'dive', 'serve',
];

export const SUCCESSES_TO_PASS = 3;

// What the game observed during one attempt. Everything is optional so a drill only reads
// the fields it cares about (a move attempt has `reached`, a shot attempt has `hit` + `landing`).
export interface Attempt {
  hit?: HitResult | null;
  landing?: Vec3 | null;             // predictLanding(hit.launch)
  airborne?: boolean;                // player's feet were off the floor at contact
  basicSide?: 'forehand' | 'backhand' | null; // which Q/E key started the basic swing
  reached?: boolean;                 // move drill: the marked spot was reached
  dived?: boolean;                   // dive drill: the player dived
  gotUp?: boolean;                   // dive drill: the player mashed C and stood up
  court?: ServiceCourt;              // serve drill: the service court being served from
}

export interface FeedContext {
  player: PlayerState; // the human, always the near player in the tutorial
}

export interface Drill {
  id: DrillId;
  title: string;
  instruction: string; // Thai, shown in the HUD message line
  keys: string;
  successesNeeded: number;
  feed: (ctx: FeedContext) => ShuttleState | null; // null when the player serves / there is no shuttle
  target?: (successes: number) => Vec3 | null;     // move drill: the spot to walk to
  hint?: (successes: number) => string | null;     // optional extra Thai hint for the next success
  passes: (attempt: Attempt, successes: number) => boolean;
}

// ---------- feeder ----------

const FEED_STATS: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };

interface FeedOptions {
  shot: ShotType;
  y: number;
  z: number;
  charge: number;
  flickX?: number;
}

// A shuttle launched from the far side toward the human. `contact.x` follows the player a little,
// so the feed stays reachable instead of always landing on the centre line.
function feedFrom(ctx: FeedContext, o: FeedOptions): ShuttleState {
  return launchShuttle({
    shot: o.shot,
    side: 'far',
    contact: { x: ctx.player.pos.x * 0.25, y: o.y, z: o.z },
    flick: { x: o.flickX ?? 0, y: 0 },
    charge: o.charge,
    perfect: true,
    weak: false,
    stats: FEED_STATS,
  });
}

const noFeed = (): ShuttleState | null => null;

// ---------- success helpers ----------

// The far half is z < 0; `depth` is metres past the net on the far side.
const depth = (p: Vec3): number => -p.z;
const inFarCourt = (p: Vec3 | null | undefined): p is Vec3 => !!p && isInSingles(p, 'far');

const wantsForehand = (successes: number): 'forehand' | 'backhand' | null =>
  successes === 0 ? 'forehand' : successes === 1 ? 'backhand' : null;

// ---------- move spots ----------

const MOVE_SPOTS: readonly Vec3[] = [
  { x: -2.1, y: 0, z: 2.8 },
  { x: 2.1, y: 0, z: 4.6 },
  { x: 0, y: 0, z: 1.6 },
];

// ---------- the drills ----------

export const DRILLS: readonly Drill[] = [
  {
    id: 'move',
    title: 'เคลื่อนที่ (Move)',
    instruction: 'เดินไปแตะจุดที่ทำเครื่องหมายไว้ด้วย WASD ให้ครบ 3 จุด',
    keys: 'WASD',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: noFeed,
    target: (successes) => MOVE_SPOTS[successes] ?? null,
    passes: (a) => a.reached === true,
  },
  {
    id: 'basic',
    title: 'ตีพื้นฐาน (Basic Q/E)',
    instruction: 'ตีลูกพื้นฐานให้ลงคอร์ตฝั่งตรงข้าม: Q = แบ็คแฮนด์, E = ฟอร์แฮนด์',
    keys: 'Q / E',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'drop', y: 2, z: -2, charge: 0.8 }),
    hint: (n) => (n === 0 ? 'ใช้ E (ฟอร์แฮนด์)' : n === 1 ? 'ใช้ Q (แบ็คแฮนด์)' : 'ใช้ได้ทั้งสองข้าง'),
    passes: (a, successes) => {
      const want = wantsForehand(successes);
      return a.hit?.shot === 'basic' && inFarCourt(a.landing) && (want === null || a.basicSide === want);
    },
  },
  {
    id: 'clear',
    title: 'ลูกเคลียร์ (Clear)',
    instruction: 'กด Shift ค้างแล้วปล่อย เพื่อตีลูกเคลียร์ให้ลอยลึกไปท้ายคอร์ตฝั่งตรงข้าม',
    keys: 'Shift',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'clear', y: 1.9, z: -2.5, charge: 0.5 }),
    passes: (a) => a.hit?.shot === 'clear' && inFarCourt(a.landing) && depth(a.landing) >= COURT.halfLength - 2,
  },
  {
    id: 'drop',
    title: 'ลูกหยอด (Drop)',
    instruction: 'คลิกขวาค้างแล้วปล่อย เพื่อตีลูกหยอดให้ตกลงใกล้เน็ตฝั่งตรงข้าม',
    keys: 'Right click',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'clear', y: 1.9, z: -2, charge: 0.4 }),
    passes: (a) => a.hit?.shot === 'drop' && inFarCourt(a.landing) && depth(a.landing) <= 3.2,
  },
  {
    id: 'smash',
    title: 'กระโดดตบ (Jump Smash)',
    instruction: 'กด Space ค้างแล้วปล่อยเพื่อกระโดด แล้วคลิกซ้ายค้างปล่อยเพื่อตบ',
    keys: 'Space + Left click',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'clear', y: 1.9, z: -1.5, charge: 0.2 }),
    passes: (a) => a.hit?.shot === 'smash' && a.airborne === true && inFarCourt(a.landing),
  },
  {
    id: 'net',
    title: 'ลูกหน้าเน็ต (Net Shot)',
    instruction: 'กด Alt เพื่อตีลูกหน้าเน็ต ให้ลูกลงในคอร์ตฝั่งตรงข้าม',
    keys: 'Alt',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'drop', y: 1.8, z: -0.8, charge: 0 }),
    passes: (a) => a.hit?.shot === 'net' && inFarCourt(a.landing),
  },
  {
    id: 'dive',
    title: 'พุ่งรับและลุก (Dive & Get Up)',
    instruction: 'กด C เพื่อพุ่งรับ แล้วกด C รัว ๆ เพื่อลุกขึ้น',
    keys: 'C (mash)',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: (ctx) => feedFrom(ctx, { shot: 'drop', y: 1.8, z: -1.5, charge: 0.3, flickX: -2.2 }),
    passes: (a) => a.dived === true && a.gotUp === true,
  },
  {
    id: 'serve',
    title: 'เสิร์ฟ (Serve)',
    instruction: 'เสิร์ฟให้ลงกล่องทแยงมุม: คลิกขวา = เสิร์ฟสั้น, Shift = เสิร์ฟยาว',
    keys: 'Right click / Shift',
    successesNeeded: SUCCESSES_TO_PASS,
    feed: noFeed,
    hint: (n) => (n === 0 ? 'เสิร์ฟสั้นก่อน (คลิกขวา)' : n === 1 ? 'เสิร์ฟยาว (Shift)' : 'เสิร์ฟได้ทั้งสองแบบ'),
    passes: (a, successes) => {
      const shot = a.hit?.shot;
      if (!a.landing || (shot !== 'serveShort' && shot !== 'serveLong')) return false;
      if (successes === 0 && shot !== 'serveShort') return false;
      if (successes === 1 && shot !== 'serveLong') return false;
      return isInServiceBox(a.landing, 'far', a.court ?? 'right');
    },
  },
];
