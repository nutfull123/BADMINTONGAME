// Career: offline knockout tournaments against bots (pure, no DOM, no Math.random, no Date).
// All randomness comes from a generator seeded with Tournament.seed, so a saved tournament replays the same way.
import type {
  BodyType, CareerProgress, Entrant, Character, Gender, BracketMatch, MatchEvent, MatchSettings, Stats, TeamPlayer,
  TierId, Tournament,
} from '../types';
import * as K from './tuning';
import { TIERS, type Tier } from './tuning';
import { eventsFor, isDoubles } from './events';

export { TIERS, eventsFor };
export { parseCareer } from './parse';

export type RoundName = 'R32' | 'R16' | 'QF' | 'SF' | 'F';

export interface HumanMatch {
  round: number;              // index into Tournament.rounds
  roundName: RoundName;
  opponent: Entrant;
  partner: TeamPlayer | null; // the bot partner in doubles
  botLevel: MatchSettings['botLevel'];
  format: '1x15' | '3x15' | '3x21'; // '1x15' before the semi-finals
}

const ROUND_NAMES: RoundName[] = ['F', 'SF', 'QF', 'R16', 'R32']; // counted back from the final

export const tierOf = (id: TierId): Tier => TIERS.find((t) => t.id === id)!;
export const roundCount = (t: Pick<Tournament, 'entrants'>): number => Math.log2(t.entrants.length);

export const newCareer = (): CareerProgress => ({ unlocked: 1, best: {}, current: null });

export const canEnter = (career: CareerProgress, tier: TierId): boolean =>
  TIERS.findIndex((t) => t.id === tier) < career.unlocked;

// ---------- seeded random ----------

type Rng = () => number;
function mulberry32(a: number): Rng {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A generator for (seed, salts...): the same inputs always give the same stream.
function rngFor(seed: number, ...salts: number[]): Rng {
  let h = seed | 0;
  for (const s of salts) h = Math.imul(h ^ s, 0x9e3779b1) + 0x7f4a7c15 | 0;
  return mulberry32(h);
}
const int = (rng: Rng, n: number) => Math.floor(rng() * n); // 0..n-1
const pick = <T>(rng: Rng, list: readonly T[]): T => list[int(rng, list.length)]!;

// ---------- bots ----------

function botStats(rng: Rng, tier: Tier, gender: Gender): Stats {
  const spread = K.BOT_POINTS_SPREAD;
  let total = tier.botPoints + int(rng, 2 * spread + 1) - spread;
  total = Math.max(K.BOT_POINTS_MIN, Math.min(K.BOT_POINTS_MAX, total));
  const s = { speed: 0, power: 0, recovery: 0, stamina: 0 };
  const keys = Object.keys(s) as (keyof typeof s)[];
  for (let left = total; left > 0; ) { // one point at a time to a random stat that is not full yet
    const k = pick(rng, keys);
    if (s[k] < 10) { s[k] += 1; left -= 1; }
  }
  return { gender, body: pick<BodyType>(rng, ['tall', 'balanced', 'short']), ...s };
}

function botName(rng: Rng, taken: Set<string>): string {
  let name = '';
  for (let i = 0; i < 30; i++) {
    name = `${pick(rng, K.FIRST_SYLLABLES)}${pick(rng, K.FIRST_ENDINGS)} ${pick(rng, K.LAST_SYLLABLES)}${pick(rng, K.LAST_ENDINGS)}`;
    if (!taken.has(name)) break;
  }
  taken.add(name);
  return name;
}

// ---------- the draw ----------

export function createTournament(tier: TierId, event: MatchEvent, human: Character, seed: number): Tournament {
  if (!eventsFor(human.stats.gender).includes(event)) throw new Error(`${event} does not fit a ${human.stats.gender} character`);
  const td = tierOf(tier);
  const rng = rngFor(seed);
  const taken = new Set<string>([human.name]);
  const doubles = isDoubles(event);
  // Genders of a bot team. XD: one man and one woman.
  const teamGenders = (): Gender[] =>
    event === 'XD' ? ['male', 'female'] : Array.from({ length: doubles ? 2 : 1 }, () => (event === 'MS' || event === 'MD' ? 'male' : 'female'));
  const bot = (g: Gender): TeamPlayer => ({ name: botName(rng, taken), stats: botStats(rng, td, g) });

  const humanPlayers: TeamPlayer[] = [{ name: human.name, stats: { ...human.stats } }];
  if (doubles) {
    // partner: same gender in MD/WD, the other in XD
    const g: Gender = event === 'XD' ? (human.stats.gender === 'male' ? 'female' : 'male') : human.stats.gender;
    humanPlayers.push(bot(g));
  }
  const entrants: Entrant[] = [];
  const humanSlot = int(rng, td.size);
  for (let i = 0; i < td.size; i++) {
    const players = i === humanSlot ? humanPlayers : teamGenders().map(bot);
    entrants.push({ id: `e${i}`, human: i === humanSlot, players });
  }
  const first: BracketMatch[] = [];
  for (let i = 0; i < td.size; i += 2) first.push({ a: i, b: i + 1, winner: null, score: null });
  return { tier, event, seed, entrants, rounds: [first], status: 'playing' };
}

// ---------- playing ----------

const humanIndex = (t: Tournament) => t.entrants.findIndex((e) => e.human);
const hasHuman = (t: Tournament, m: BracketMatch) => m.a === humanIndex(t) || m.b === humanIndex(t);

export function humanMatch(t: Tournament, fullFormat: '3x15' | '3x21'): HumanMatch | null {
  if (t.status !== 'playing') return null;
  const round = t.rounds.length - 1;
  const m = t.rounds[round]?.find((x) => hasHuman(t, x) && x.winner === null);
  if (!m) return null;
  const hi = humanIndex(t);
  const opponent = t.entrants[m.a === hi ? m.b : m.a]!;
  const left = roundCount(t) - round; // 1 = final
  return {
    round,
    roundName: ROUND_NAMES[left - 1]!,
    opponent,
    partner: t.entrants[hi]!.players[1] ?? null,
    botLevel: tierOf(t.tier).botLevel,
    format: left <= 2 ? fullFormat : '1x15',
  };
}

// Mean total of the team's players; singles is just the player's own total.
const strength = (e: Entrant): number =>
  e.players.reduce((n, p) => n + p.stats.speed + p.stats.power + p.stats.recovery + p.stats.stamina, 0) / e.players.length;

const winChance = (a: Entrant, b: Entrant) => 1 / (1 + 10 ** ((strength(b) - strength(a)) / K.ELO_SCALE));

// One game to 15: the loser's points are mostly 3..13, sometimes a deuce finish (16-14 .. 21-19).
function gamePoints(rng: Rng): [win: number, lose: number] {
  if (rng() < 0.2) { const l = 14 + int(rng, 6); return [l + 2, l]; }
  return [15, 3 + Math.floor((rng() + rng()) * 5.5)];
}

// Score in a-b order, e.g. "15-11" or "13-15 15-9 15-12".
function simScore(rng: Rng, aWins: boolean, games: 1 | 3): string {
  let results = [aWins]; // who took each game
  if (games === 3) {
    results = [aWins, aWins];
    if (rng() < 0.3) results = rng() < 0.5 ? [!aWins, aWins, aWins] : [aWins, !aWins, aWins]; // a 2-1 win
  }
  return results.map((aTook) => {
    const [w, l] = gamePoints(rng);
    return aTook ? `${w}-${l}` : `${l}-${w}`;
  }).join(' ');
}

const flipScore = (score: string) => score.split(' ').map((g) => g.split('-').reverse().join('-')).join(' ');

function copyTournament(t: Tournament): Tournament {
  return { ...t, rounds: t.rounds.map((r) => r.map((m) => ({ ...m }))) };
}

function simulateMatch(t: Tournament, r: number, i: number): void {
  const m = t.rounds[r]![i]!;
  if (m.winner !== null) return;
  const rng = rngFor(t.seed, r + 1, i + 1);
  const aWins = rng() < winChance(t.entrants[m.a]!, t.entrants[m.b]!);
  m.winner = aWins ? m.a : m.b;
  m.score = simScore(rng, aWins, roundCount(t) - r <= 2 ? 3 : 1);
}

function settle(t: Tournament, won: boolean, score: string | null): Tournament {
  const next = copyTournament(t);
  if (next.status !== 'playing') return next;
  const hi = humanIndex(next);
  let r = next.rounds.length - 1;
  const mine = next.rounds[r]!.find((m) => hasHuman(next, m) && m.winner === null);
  if (!mine) return next;
  const opp = mine.a === hi ? mine.b : mine.a;
  mine.winner = won ? hi : opp;
  // stored in a-b order; the caller's score is from the player's side
  mine.score = score === null ? null : mine.a === hi ? score : flipScore(score);
  next.rounds[r]!.forEach((_, i) => simulateMatch(next, r, i));
  for (;;) {
    const round = next.rounds[r]!;
    if (round.length === 1) {
      next.status = round[0]!.winner === hi ? 'won' : 'out';
      return next;
    }
    next.rounds.push(Array.from({ length: round.length / 2 }, (_, i) => (
      { a: round[2 * i]!.winner!, b: round[2 * i + 1]!.winner!, winner: null, score: null }
    )));
    r += 1;
    if (won) return next; // the player plays this round
    next.rounds[r]!.forEach((_, i) => simulateMatch(next, r, i)); // out: finish the bracket
  }
}

// `score` is from the player's side ("15-11" or "13-15 15-9 15-12"); recorded in the bracket in a-b order.
export const recordHumanResult = (t: Tournament, won: boolean, score: string): Tournament => settle(t, won, score);

// Leaving the tournament counts as losing the current round: no score, and finishTournament gives no bonus.
export const abandonTournament = (t: Tournament): Tournament => settle(t, false, null);

// ---------- points and results ----------

// Last round the player took part in: 0 = first round ... roundCount = champion.
export function roundReached(t: Tournament): number {
  if (t.status === 'won') return roundCount(t);
  let last = 0;
  t.rounds.forEach((round, r) => { if (round.some((m) => hasHuman(t, m))) last = r; });
  return last;
}

export const matchPoints = (botLevel: MatchSettings['botLevel'], won: boolean): number =>
  K.WIN_POINTS[botLevel] * (won ? 1 : K.LOSS_FRACTION);

// champion full, finalist half, semi-finalist a quarter, otherwise nothing.
export function placementBonus(tier: TierId, reached: number, rounds: number): number {
  const champion = K.CHAMPION_BONUS[tier];
  if (reached >= rounds) return champion;
  if (reached === rounds - 1) return champion * K.FINALIST_FRACTION;
  if (reached === rounds - 2) return champion * K.SEMI_FRACTION;
  return 0;
}

export function finishTournament(
  career: CareerProgress, t: Tournament,
): { career: CareerProgress; bonus: number; unlocked: TierId | null } {
  if (t.status === 'playing') return { career, bonus: 0, unlocked: null };
  const reached = roundReached(t);
  const rounds = roundCount(t);
  const hi = humanIndex(t);
  const abandoned = t.status === 'out' && t.rounds[reached]!.some((m) => hasHuman(t, m) && m.winner !== hi && m.score === null);
  const bonus = abandoned ? 0 : placementBonus(t.tier, reached, rounds);
  const tierIndex = TIERS.findIndex((x) => x.id === t.tier);
  const opensNext = reached >= rounds - 2 && tierIndex === career.unlocked - 1 && tierIndex < TIERS.length - 1;
  const best = { ...career.best, [t.tier]: Math.max(career.best[t.tier] ?? 0, reached) };
  return {
    career: { unlocked: career.unlocked + (opensNext ? 1 : 0), best, current: null },
    bonus,
    unlocked: opensNext ? TIERS[tierIndex + 1]!.id : null,
  };
}
