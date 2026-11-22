// The career in a save is untrusted data: check every field and rebuild a clean copy, or reject it all.
import type { BracketMatch, CareerProgress, Entrant, MatchEvent, Stats, TeamPlayer, Tournament } from '../types';
import { validateStats } from '../sim';
import { teamFits } from './events';
import { BOT_BUDGET, TIERS } from './tuning';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const EVENTS: MatchEvent[] = ['MS', 'WS', 'MD', 'WD', 'XD'];
const STATUSES = ['playing', 'won', 'out'];
const MAX_TEXT = 40;

function parseStats(raw: unknown): Stats | null {
  if (!isObject(raw)) return null;
  const s = { gender: raw.gender, body: raw.body, speed: raw.speed, power: raw.power, recovery: raw.recovery, stamina: raw.stamina } as Stats;
  for (const k of ['speed', 'power', 'recovery', 'stamina'] as const) if (typeof s[k] !== 'number') return null;
  return typeof s.gender === 'string' && typeof s.body === 'string' && validateStats(s, BOT_BUDGET) === null ? s : null;
}

function parseEntrant(raw: unknown): Entrant | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || raw.id.length > MAX_TEXT || typeof raw.human !== 'boolean') return null;
  if (!Array.isArray(raw.players)) return null;
  const players: TeamPlayer[] = [];
  for (const p of raw.players) {
    if (!isObject(p) || typeof p.name !== 'string' || p.name.length > MAX_TEXT) return null;
    const stats = parseStats(p.stats);
    if (!stats) return null;
    players.push({ name: p.name, stats });
  }
  return { id: raw.id, human: raw.human, players };
}

function parseMatch(raw: unknown, size: number): BracketMatch | null {
  if (!isObject(raw) || !isInt(raw.a, 0, size - 1) || !isInt(raw.b, 0, size - 1) || raw.a === raw.b) return null;
  if (raw.winner !== null && raw.winner !== raw.a && raw.winner !== raw.b) return null;
  if (raw.score !== null && (typeof raw.score !== 'string' || raw.score.length > MAX_TEXT)) return null;
  return { a: raw.a, b: raw.b, winner: raw.winner, score: raw.score };
}

function parseTournament(raw: unknown): Tournament | null {
  if (!isObject(raw)) return null;
  const tier = TIERS.find((t) => t.id === raw.tier);
  const event = EVENTS.find((e) => e === raw.event);
  if (!tier || !event || !isInt(raw.seed, -(2 ** 31), 2 ** 32) || typeof raw.status !== 'string' || !STATUSES.includes(raw.status)) return null;
  if (!Array.isArray(raw.entrants) || raw.entrants.length !== tier.size || !Array.isArray(raw.rounds)) return null;
  const size = tier.size;
  const total = Math.log2(size);

  const entrants: Entrant[] = [];
  for (const e of raw.entrants) {
    const p = parseEntrant(e);
    if (!p || !teamFits(event, p.players.map((x) => x.stats.gender))) return null;
    entrants.push(p);
  }
  if (new Set(entrants.map((e) => e.id)).size !== size || entrants.filter((e) => e.human).length !== 1) return null;
  const hi = entrants.findIndex((e) => e.human);

  if (raw.rounds.length < 1 || raw.rounds.length > total) return null;
  const rounds: BracketMatch[][] = [];
  for (let r = 0; r < raw.rounds.length; r++) {
    const rawRound: unknown = raw.rounds[r];
    if (!Array.isArray(rawRound) || rawRound.length !== size >> (r + 1)) return null;
    const round: BracketMatch[] = [];
    for (const m of rawRound) {
      const pm = parseMatch(m, size);
      if (!pm) return null;
      round.push(pm);
    }
    if (r === 0 ? new Set(round.flatMap((m) => [m.a, m.b])).size !== size : round.some((m, i) => {
      // later rounds pair the winners of the previous round in order
      const prev = rounds[r - 1]!;
      return m.a !== prev[2 * i]!.winner || m.b !== prev[2 * i + 1]!.winner;
    })) return null;
    if (r < raw.rounds.length - 1 && round.some((m) => m.winner === null)) return null; // earlier rounds are decided
    rounds.push(round);
  }

  const last = rounds[rounds.length - 1]!;
  const status = raw.status as Tournament['status'];
  if (status === 'playing') {
    const mine = last.filter((m) => m.a === hi || m.b === hi);
    if (mine.length !== 1 || mine[0]!.winner !== null) return null;
    if (rounds.slice(0, -1).some((round) => round.some((m) => (m.a === hi || m.b === hi) && m.winner !== hi))) return null;
  } else {
    if (rounds.length !== total || last.some((m) => m.winner === null)) return null;
    if ((last[0]!.winner === hi) !== (status === 'won')) return null;
  }
  return { tier: tier.id, event: event as MatchEvent, seed: raw.seed, entrants, rounds, status };
}

// Returns a clean CareerProgress, or undefined when anything is wrong. Never throws.
export function parseCareer(raw: unknown): CareerProgress | undefined {
  try {
    if (!isObject(raw) || !isInt(raw.unlocked, 1, TIERS.length) || !isObject(raw.best)) return undefined;
    const best: CareerProgress['best'] = {};
    for (const [key, value] of Object.entries(raw.best)) {
      const tier = TIERS.find((t) => t.id === key);
      if (!tier || !isInt(value, 0, Math.log2(tier.size))) return undefined;
      best[tier.id] = value;
    }
    if (raw.current === null) return { unlocked: raw.unlocked, best, current: null };
    const current = parseTournament(raw.current);
    if (!current || TIERS.findIndex((t) => t.id === current.tier) >= raw.unlocked) return undefined; // played a locked tier
    return { unlocked: raw.unlocked, best, current };
  } catch {
    return undefined;
  }
}
