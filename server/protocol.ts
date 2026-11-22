// The trust boundary: every websocket text frame goes through parseClientMessage. It builds a fresh,
// clamped object from the known fields only, so nothing a client sends reaches the rest of the server unchecked.
import { MAX_INPUT_FRAMES, type ClientMessage, type InputFrame, type RoomSettings, type SeatIndex } from '../src/net/protocol';
import { validateStats } from '../src/sim';
import type { Intent, MatchEvent, ShotType, Stats } from '../src/types';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I, L
export const CODE_LENGTH = 6;
export const MAX_NAME = 24;
const MAX_RAW = 32 * 1024; // chars; a full 16-frame input message is about 6 KB
const MAX_TOKEN = 4096;
const MAX_INT = 2 ** 31 - 1;

const EVENTS: readonly MatchEvent[] = ['MS', 'WS', 'MD', 'WD', 'XD'];
const MODES = ['easy', 'normal', 'pro', 'timing'] as const;
const SHOTS: readonly ShotType[] = ['basic', 'smash', 'drop', 'clear', 'net', 'serveShort', 'serveLong'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isInt = (v: unknown, lo = 0, hi = MAX_INT): v is number => isNum(v) && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

// Returns the code in upper case when it has exactly 6 characters from the allowed alphabet, else null.
export function parseCode(v: unknown): string | null {
  if (typeof v !== 'string' || v.length !== CODE_LENGTH) return null;
  const code = v.toUpperCase();
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

function parseName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  // eslint-disable-next-line no-control-regex
  return name.length >= 1 && v.length <= MAX_NAME * 2 && name.length <= MAX_NAME && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

export function parseStats(v: unknown, budget = 40): Stats | null {
  if (!isObj(v) || typeof v.gender !== 'string' || typeof v.body !== 'string') return null;
  if (![v.speed, v.power, v.recovery, v.stamina].every(isNum)) return null;
  const stats = {
    gender: v.gender, body: v.body, speed: v.speed, power: v.power, recovery: v.recovery, stamina: v.stamina,
  } as Stats;
  return validateStats(stats, budget) === null ? stats : null;
}

export function parseSettings(v: unknown): RoomSettings | null {
  if (!isObj(v) || !isObj(v.assists)) return null;
  const { event, format, points } = v;
  const { mode, hitAssist } = v.assists;
  if (!oneOf(EVENTS, event) || !(format === '3x15' || format === '3x21') || !(points === 'real' || points === 'twenty')) return null;
  if (!oneOf(MODES, mode) || !isNum(hitAssist) || hitAssist < 0 || hitAssist > 100) return null;
  return { event, format, assists: { mode, hitAssist }, points };
}

const pair = (v: unknown, lim: number): { x: number; z: number } | null =>
  isObj(v) && isNum(v.x) && isNum(v.z) ? { x: clamp(v.x, -lim, lim), z: clamp(v.z, -lim, lim) } : null;
const pairXY = (v: unknown, lim: number): { x: number; y: number } | null =>
  isObj(v) && isNum(v.x) && isNum(v.y) ? { x: clamp(v.x, -lim, lim), y: clamp(v.y, -lim, lim) } : null;

export function parseIntent(v: unknown): Intent | null {
  if (!isObj(v)) return null;
  const move = pair(v.move, 1), racket = pairXY(v.racket, 1), racketVel = pairXY(v.racketVel, 100);
  if (!move || !racket || !racketVel) return null;
  const { charging, release, basicSwing } = v;
  if (charging !== null && !oneOf(SHOTS, charging)) return null;
  if (release !== null && !oneOf(SHOTS, release)) return null;
  if (basicSwing !== null && basicSwing !== 'forehand' && basicSwing !== 'backhand') return null;
  if (!isNum(v.chargeTime) || !isNum(v.jumpCharge)) return null;
  if (typeof v.jumpRelease !== 'boolean' || typeof v.dive !== 'boolean' || typeof v.netShot !== 'boolean') return null;
  return {
    move: { x: move.x, z: move.z }, racket, racketVel, charging, chargeTime: clamp(v.chargeTime, 0, 10), release, basicSwing,
    jumpCharge: clamp(v.jumpCharge, 0, 10), jumpRelease: v.jumpRelease, dive: v.dive, netShot: v.netShot,
  };
}

function parseFrames(v: unknown): InputFrame[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_INPUT_FRAMES) return null;
  const frames: InputFrame[] = [];
  for (const f of v) {
    if (!isObj(f) || !isInt(f.seq) || !isInt(f.tick)) return null;
    const intent = parseIntent(f.intent);
    if (!intent) return null;
    frames.push({ seq: f.seq, tick: f.tick, intent });
  }
  return frames;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_RAW) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'hello': {
      const c = m.character;
      if (!isInt(m.v) || typeof m.token !== 'string' || m.token.length < 1 || m.token.length > MAX_TOKEN || !isObj(c)) return null;
      const name = parseName(c.name), stats = parseStats(c.stats);
      return name && stats ? { t: 'hello', v: m.v, token: m.token, character: { name, stats } } : null;
    }
    case 'create': {
      const settings = parseSettings(m.settings);
      return settings ? { t: 'create', settings } : null;
    }
    case 'settings': {
      const settings = parseSettings(m.settings);
      return settings ? { t: 'settings', settings } : null;
    }
    case 'join': {
      const code = parseCode(m.code);
      return code ? { t: 'join', code } : null;
    }
    case 'rejoin': {
      const code = parseCode(m.code);
      const tok = m.resumeToken;
      return code && typeof tok === 'string' && tok.length >= 1 && tok.length <= 128 ? { t: 'rejoin', code, resumeToken: tok } : null;
    }
    case 'seat': return isInt(m.seat, 0, 3) ? { t: 'seat', seat: m.seat as SeatIndex } : null;
    case 'ready': return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'start': return { t: 'start' };
    case 'leave': return { t: 'leave' };
    case 'ping': return isNum(m.at) ? { t: 'ping', at: m.at } : null;
    case 'input': {
      const frames = parseFrames(m.frames);
      return frames ? { t: 'input', frames } : null;
    }
    default: return null;
  }
}
