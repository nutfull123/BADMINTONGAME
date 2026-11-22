import { describe, expect, it } from 'vitest';
import type { CareerProgress, Character, MatchEvent, Stats, TierId, Tournament } from '../types';
import { validateStats } from '../sim';
import {
  TIERS, abandonTournament, canEnter, createTournament, eventsFor, finishTournament, humanMatch, matchPoints, newCareer,
  parseCareer, placementBonus, recordHumanResult, roundCount, roundReached,
} from './index';

const hero = (gender: Stats['gender'] = 'male'): Character => ({
  id: 'h', name: 'Hero', earnedPoints: 0, createdAt: 0,
  stats: { gender, body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
});
const total = (s: Stats) => s.speed + s.power + s.recovery + s.stamina;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function playOut(t: Tournament, winRounds: number): Tournament { // win the first `winRounds` matches, then lose
  let n = 0;
  while (t.status === 'playing') t = recordHumanResult(t, n++ < winRounds, n <= winRounds ? '15-10' : '10-15');
  return t;
}

describe('points', () => {
  it('match points by bot level, a loss is a quarter', () => {
    expect(matchPoints('easy', true)).toBe(0.25);
    expect(matchPoints('medium', true)).toBe(0.5);
    expect(matchPoints('hard', true)).toBe(0.75);
    expect(matchPoints('hard', false)).toBe(0.1875);
  });
  it('placement bonus: champion, finalist half, semi-finalist a quarter', () => {
    const rows: [TierId, number][] = [['club', 0.5], ['regional', 1], ['national', 1.5], ['masters', 2]];
    for (const [tier, champ] of rows) {
      expect(placementBonus(tier, 3, 3)).toBe(champ);
      expect(placementBonus(tier, 2, 3)).toBe(champ / 2);
      expect(placementBonus(tier, 1, 3)).toBe(champ / 4);
      expect(placementBonus(tier, 0, 3)).toBe(0);
    }
  });
});

describe('createTournament', () => {
  it('builds a full bracket of the tier size with exactly one human, for every tier', () => {
    for (const tier of TIERS) {
      const t = createTournament(tier.id, 'MS', hero(), 7);
      expect(t.entrants).toHaveLength(tier.size);
      expect(t.entrants.filter((e) => e.human)).toHaveLength(1);
      expect(t.rounds[0]).toHaveLength(tier.size / 2);
      expect(roundCount(t)).toBe(Math.log2(tier.size));
      expect(t.status).toBe('playing');
    }
  });

  it('human slot is random: differs across seeds', () => {
    const slots = new Set(Array.from({ length: 20 }, (_, s) => createTournament('club', 'MS', hero(), s).entrants.findIndex((e) => e.human)));
    expect(slots.size).toBeGreaterThan(2);
  });

  it('bot stats are valid, near the tier total, with generated names', () => {
    for (const tier of TIERS) {
      const t = createTournament(tier.id, 'MD', hero(), 3);
      for (const e of t.entrants.filter((x) => !x.human)) {
        for (const p of e.players) {
          expect(validateStats(p.stats, 40)).toBeNull();
          expect(Math.abs(total(p.stats) - tier.botPoints)).toBeLessThanOrEqual(2);
          expect(total(p.stats)).toBeGreaterThanOrEqual(20);
          expect(p.name.length).toBeGreaterThan(2);
          expect(p.name.length).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it('follows the gender rules of all five events', () => {
    const cases: [MatchEvent, Stats['gender'], number, string[]][] = [
      ['MS', 'male', 1, ['male']], ['WS', 'female', 1, ['female']],
      ['MD', 'male', 2, ['male', 'male']], ['WD', 'female', 2, ['female', 'female']],
    ];
    for (const [event, gender, size, genders] of cases) {
      const t = createTournament('club', event, hero(gender), 5);
      for (const e of t.entrants) {
        expect(e.players).toHaveLength(size);
        expect(e.players.map((p) => p.stats.gender)).toEqual(genders);
      }
    }
    for (const g of ['male', 'female'] as const) {
      const t = createTournament('club', 'XD', hero(g), 5);
      for (const e of t.entrants) expect(e.players.map((p) => p.stats.gender).sort()).toEqual(['female', 'male']);
      expect(t.entrants.find((x) => x.human)!.players[0]!.stats).toEqual(hero(g).stats);
    }
    expect(eventsFor('male')).toEqual(['MS', 'MD', 'XD']);
    expect(eventsFor('female')).toEqual(['WS', 'WD', 'XD']);
    expect(() => createTournament('club', 'WS', hero('male'), 1)).toThrow();
  });

  it('gives the human a bot partner in doubles', () => {
    const t = createTournament('regional', 'MD', hero(), 9);
    const m = humanMatch(t, '3x15')!;
    expect(m.partner).not.toBeNull();
    expect(humanMatch(createTournament('club', 'MS', hero(), 9), '3x15')!.partner).toBeNull();
  });
});

describe('playing a tournament', () => {
  it('uses one game before the semi-finals and the full format in the semi-finals and the final', () => {
    let t = createTournament('masters', 'MS', hero(), 4); // 5 rounds: R32 R16 QF SF F
    const seen: [string, string][] = [];
    while (t.status === 'playing') {
      const m = humanMatch(t, '3x21')!;
      seen.push([m.roundName, m.format]);
      t = recordHumanResult(t, true, '21-10 21-10');
    }
    expect(seen).toEqual([['R32', '1x15'], ['R16', '1x15'], ['QF', '1x15'], ['SF', '3x21'], ['F', '3x21']]);
    const club = createTournament('club', 'MS', hero(), 4);
    expect(humanMatch(club, '3x15')).toMatchObject({ roundName: 'QF', format: '1x15', botLevel: 'easy' });
  });

  it('a player who wins every match is champion', () => {
    for (const tier of TIERS) {
      const t = playOut(createTournament(tier.id, 'MS', hero(), 11), 99);
      expect(t.status).toBe('won');
      expect(t.rounds).toHaveLength(Math.log2(tier.size));
      expect(t.rounds.at(-1)![0]!.winner).toBe(t.entrants.findIndex((e) => e.human));
      expect(roundReached(t)).toBe(Math.log2(tier.size));
      expect(humanMatch(t, '3x15')).toBeNull();
    }
  });

  it('a player who loses in round 1 is out and the bracket is fully simulated', () => {
    const t = playOut(createTournament('national', 'MS', hero(), 12), 0);
    expect(t.status).toBe('out');
    expect(t.rounds).toHaveLength(4);
    expect(t.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
    for (const r of t.rounds) for (const m of r) {
      expect(m.winner === m.a || m.winner === m.b).toBe(true);
      expect(m.score).toMatch(/^\d+-\d+( \d+-\d+){0,2}$/);
    }
    expect(roundReached(t)).toBe(0);
    expect(t.rounds.at(-1)![0]!.winner).not.toBe(t.entrants.findIndex((e) => e.human));
  });

  it('simulated scores look like real games', () => {
    const t = playOut(createTournament('masters', 'MS', hero(), 21), 0);
    for (const m of t.rounds[0]!) {
      if (m.score === '10-15' || m.score === null) continue;
      const [w, l] = m.score.split('-').map(Number) as [number, number];
      const hi = Math.max(w, l), lo = Math.min(w, l);
      expect(hi === 15 ? lo <= 13 : hi <= 21 && hi - lo === 2).toBe(true);
    }
    // semi-finals and final: best of three
    for (const m of t.rounds.at(-1)!) {
      const games = m.score!.split(' ');
      expect(games.length === 2 || games.length === 3).toBe(true);
    }
  });

  it('is deterministic for a seed and never mutates its input', () => {
    const t0 = createTournament('regional', 'XD', hero('female'), 33);
    const before = JSON.stringify(t0);
    const a = recordHumanResult(t0, true, '15-9');
    expect(JSON.stringify(t0)).toBe(before);
    expect(recordHumanResult(t0, true, '15-9')).toEqual(a);
    expect(createTournament('regional', 'XD', hero('female'), 33)).toEqual(t0);
    expect(createTournament('regional', 'XD', hero('female'), 34)).not.toEqual(t0);
    const b = recordHumanResult(a, false, '9-15');
    expect(JSON.stringify(a)).toBe(JSON.stringify(recordHumanResult(t0, true, '15-9')));
    expect(b.status).toBe('out');
  });

  it('stores the score in a-b order whichever side the player is on', () => {
    const t = createTournament('club', 'MS', hero(), 2);
    const hi = t.entrants.findIndex((e) => e.human);
    const done = recordHumanResult(t, true, '15-9');
    const m = done.rounds[0]!.find((x) => x.a === hi || x.b === hi)!;
    expect(m.winner).toBe(hi);
    expect(m.score).toBe(m.a === hi ? '15-9' : '9-15');
  });

  it('stronger entrants win more often', () => {
    let strongWins = 0;
    for (let seed = 0; seed < 60; seed++) {
      const strong: Character = { ...hero(), stats: { ...hero().stats, speed: 10, power: 10, recovery: 10, stamina: 10 } };
      const t = createTournament('club', 'MS', strong, seed);
      const done = recordHumanResult(t, true, '15-1');
      const sim = done.rounds[0]!.filter((m) => !(m.a === done.entrants.findIndex((e) => e.human) || m.b === done.entrants.findIndex((e) => e.human)));
      for (const m of sim) {
        const w = done.entrants[m.winner!]!, l = done.entrants[m.winner === m.a ? m.b : m.a]!;
        if (total(w.players[0]!.stats) >= total(l.players[0]!.stats)) strongWins++; else strongWins--;
      }
    }
    expect(strongWins).toBeGreaterThan(0);
  });
});

describe('finishing', () => {
  it('unlocks the next tier by reaching the semi-finals, not before', () => {
    const career = newCareer();
    expect(canEnter(career, 'club')).toBe(true);
    expect(canEnter(career, 'regional')).toBe(false);
    const early = finishTournament(career, playOut(createTournament('club', 'MS', hero(), 1), 0)); // out in QF
    expect(early.unlocked).toBeNull();
    expect(early.career.unlocked).toBe(1);
    expect(early.bonus).toBe(0);
    const semi = finishTournament(career, playOut(createTournament('club', 'MS', hero(), 1), 1)); // lost the SF
    expect(semi.unlocked).toBe('regional');
    expect(semi.career).toEqual({ unlocked: 2, best: { club: 1 }, current: null });
    expect(semi.bonus).toBe(0.125);
    expect(canEnter(semi.career, 'regional')).toBe(true);
  });

  it('champion bonus, best only goes up, and replaying an open tier unlocks nothing new', () => {
    const t = playOut(createTournament('club', 'MS', hero(), 1), 3);
    const r1 = finishTournament({ unlocked: 2, best: { club: 1 }, current: t }, t);
    expect(r1.bonus).toBe(0.5);
    expect(r1.unlocked).toBeNull();
    expect(r1.career).toEqual({ unlocked: 2, best: { club: 3 }, current: null });
    const out = playOut(createTournament('club', 'MS', hero(), 1), 0);
    expect(finishTournament(r1.career, out).career.best.club).toBe(3);
    const finalist = finishTournament(newCareer(), playOut(createTournament('club', 'MS', hero(), 5), 2));
    expect(finalist.bonus).toBe(0.25);
  });

  it('the last tier unlocks nothing further', () => {
    const t = playOut(createTournament('masters', 'MS', hero(), 1), 99);
    const r = finishTournament({ unlocked: 4, best: {}, current: t }, t);
    expect(r.unlocked).toBeNull();
    expect(r.career.unlocked).toBe(4);
    expect(r.bonus).toBe(2);
  });

  it('abandoning counts as out in the current round with no bonus', () => {
    let t = createTournament('club', 'MS', hero(), 6);
    t = recordHumanResult(t, true, '15-5');
    t = recordHumanResult(t, true, '15-5');
    const before = JSON.stringify(t);
    const out = abandonTournament(t); // abandon the final
    expect(JSON.stringify(t)).toBe(before);
    expect(out.status).toBe('out');
    expect(roundReached(out)).toBe(2);
    expect(finishTournament(newCareer(), out).bonus).toBe(0);
    expect(finishTournament(newCareer(), out).career.best.club).toBe(2);
  });
});

describe('parseCareer', () => {
  const real = (): CareerProgress => ({
    unlocked: 2,
    best: { club: 2 },
    current: recordHumanResult(createTournament('regional', 'MD', hero(), 8), true, '15-12'),
  });

  it('accepts a real career, and the new and finished ones', () => {
    const c = real();
    expect(parseCareer(clone(c))).toEqual(c);
    expect(parseCareer(clone(newCareer()))).toEqual(newCareer());
    const won = playOut(createTournament('club', 'MS', hero(), 1), 99);
    expect(parseCareer(clone({ unlocked: 1, best: {}, current: won }))).toEqual({ unlocked: 1, best: {}, current: won });
    const out = playOut(createTournament('masters', 'XD', hero('female'), 2), 1);
    const oc = { unlocked: 4, best: { club: 3 }, current: out };
    expect(parseCareer(clone(oc))).toEqual(oc);
  });

  const tamper = (fn: (c: any) => void): unknown => { const c = clone(real()); fn(c); return c; }; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('rejects tampered careers', () => {
    const bad: [string, unknown][] = [
      ['not an object', 5],
      ['null', null],
      ['array', []],
      ['unlocked 0', tamper((c) => { c.unlocked = 0; })],
      ['unlocked 5', tamper((c) => { c.unlocked = 5; })],
      ['unlocked fraction', tamper((c) => { c.unlocked = 1.5; })],
      ['best out of range', tamper((c) => { c.best.club = 9; })],
      ['best fraction', tamper((c) => { c.best.club = 0.5; })],
      ['best unknown tier', tamper((c) => { c.best.pro = 1; })],
      ['current missing', tamper((c) => { delete c.current; })],
      ['locked tier played', tamper((c) => { c.unlocked = 1; })],
      ['match index out of range', tamper((c) => { c.current.rounds[0][0].a = 99; })],
      ['negative index', tamper((c) => { c.current.rounds[0][0].a = -1; })],
      ['winner not a or b', tamper((c) => { c.current.rounds[0][1].winner = 5; })],
      ['stats over budget', tamper((c) => { c.current.entrants[0].players[0].stats.speed = 11; })],
      ['stats NaN', tamper((c) => { c.current.entrants[1].players[0].stats.speed = 'x'; })],
      ['unknown body', tamper((c) => { c.current.entrants[1].players[0].stats.body = 'giant'; })],
      ['wrong bracket size', tamper((c) => { c.current.entrants.pop(); })],
      ['two humans', tamper((c) => { c.current.entrants.forEach((e: { human: boolean }) => { e.human = true; }); })],
      ['no human', tamper((c) => { c.current.entrants.forEach((e: { human: boolean }) => { e.human = false; }); })],
      ['bad status', tamper((c) => { c.current.status = 'draw'; })],
      ['won but not the champion', tamper((c) => { c.current.status = 'won'; })],
      ['bad tier', tamper((c) => { c.current.tier = 'pro'; })],
      ['bad event', tamper((c) => { c.current.event = 'XX'; })],
      ['event does not fit the players', tamper((c) => { c.current.event = 'WD'; })],
      ['one player in doubles', tamper((c) => { c.current.entrants[3].players.pop(); })],
      ['name too long', tamper((c) => { c.current.entrants[3].players[0].name = 'x'.repeat(41); })],
      ['name not a string', tamper((c) => { c.current.entrants[3].players[0].name = 7; })],
      ['round too short', tamper((c) => { c.current.rounds[0].pop(); })],
      ['too many rounds', tamper((c) => { c.current.rounds.push([...c.current.rounds[0]]); c.current.rounds.push([...c.current.rounds[0]]); c.current.rounds.push([...c.current.rounds[0]]); c.current.rounds.push([...c.current.rounds[0]]); })],
      ['next round not from winners', tamper((c) => { c.current.rounds[1][0].a = c.current.rounds[1][0].b; })],
      ['entrant twice in round 0', tamper((c) => { c.current.rounds[0][1].a = c.current.rounds[0][0].a; })],
      ['unplayed human match decided early', tamper((c) => { const hi = c.current.entrants.findIndex((e: { human: boolean }) => e.human); const m = c.current.rounds[1].find((x: { a: number; b: number }) => x.a === hi || x.b === hi); m.winner = hi; })],
      ['score not a string', tamper((c) => { c.current.rounds[0][0].score = 12; })],
      ['seed not an integer', tamper((c) => { c.current.seed = 1.5; })],
    ];
    for (const [name, raw] of bad) expect(parseCareer(raw), name).toBeUndefined();
  });

  it('never throws on odd input', () => {
    for (const v of [undefined, 'x', 1, true, { unlocked: 1, best: {}, current: { entrants: null } }, { unlocked: 1, best: {}, current: { tier: 'club', event: 'MS', seed: 1, status: 'playing', entrants: [{}, {}, {}, {}, {}, {}, {}, {}], rounds: [[null]] } }]) {
      expect(() => parseCareer(v)).not.toThrow();
      expect(parseCareer(v)).toBeUndefined();
    }
  });
});
