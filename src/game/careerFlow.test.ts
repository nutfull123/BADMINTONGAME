import { describe, expect, it } from 'vitest';
import { createCharacter, setCareer } from '../app/characters';
import { emptySave } from '../app/save';
import { createTournament, newCareer } from '../career';
import { PRESETS } from '../ui';
import { formatPlayerSideScore } from '../ui/labels';
import type { SaveData, TierId } from '../types';
import { applyCareerResult } from './careerFlow';

function makeSaveWithTournament(tier: TierId = 'club', seed = 1): { save: SaveData; charId: string } {
  let save = createCharacter(emptySave(), 'Hero', { ...PRESETS.balanced, gender: 'male' });
  const char = save.characters[0]!;
  const tour = createTournament(tier, 'MS', char, seed);
  save = setCareer(save, char.id, { ...newCareer(), current: tour });
  return { save, charId: char.id };
}

function findSeedForEntrantSide(wantEntrantA: boolean): number {
  const dummy = createCharacter(emptySave(), 'Hero', { ...PRESETS.balanced, gender: 'male' }).characters[0]!;
  for (let seed = 1; seed < 200; seed++) {
    const t = createTournament('club', 'MS', dummy, seed);
    const hi = t.entrants.findIndex((e) => e.human);
    const m = t.rounds[0]!.find((x) => x.a === hi || x.b === hi)!;
    if ((m.a === hi) === wantEntrantA) return seed;
  }
  return 1;
}

describe('applyCareerResult', () => {
  it('records the player score in a-b order and displays it from the player side whether the player is entrant a or entrant b', () => {
    const seedA = findSeedForEntrantSide(true);
    const seedB = findSeedForEntrantSide(false);

    for (const [seed, isA] of [
      [seedA, true],
      [seedB, false],
    ] as const) {
      const { save, charId } = makeSaveWithTournament('club', seed);
      const res = applyCareerResult(save, charId, { won: true, score: '15-9' });
      const hi = res.tournament.entrants.findIndex((e) => e.human);
      const m = res.tournament.rounds[0]!.find((x) => x.a === hi || x.b === hi)!;
      expect(m.a === hi).toBe(isA);
      expect(m.winner).toBe(hi);
      // Bracket stores a-b order; formatPlayerSideScore always shows '15-9' from the player's side
      expect(m.score).toBe(isA ? '15-9' : '9-15');
      expect(formatPlayerSideScore(m.score, m.a === hi)).toBe('15-9');
    }
  });

  it('a win advances the player to the next round, awards match points, and keeps the tournament in career.current', () => {
    const { save, charId } = makeSaveWithTournament('club', 4);
    const res = applyCareerResult(save, charId, { won: true, score: '15-11' }, '3x15');

    expect(res.earned).toBe(0.25); // club = easy bot = 0.25
    expect(res.bonus).toBe(0);
    expect(res.unlocked).toBeNull();
    expect(res.tournament.status).toBe('playing');
    expect(res.tournament.rounds).toHaveLength(2); // QF done, SF created

    const updated = res.save.characters.find((c) => c.id === charId)!;
    expect(updated.earnedPoints).toBe(0.25);
    expect(updated.career?.current).toEqual(res.tournament);
    expect(res.extras.tournament).toEqual({
      outcome: 'advanced',
      roundName: 'SF',
    });
  });

  it('a loss in the semi-finals ends the tournament, awards match points + placement bonus, unlocks the next tier, and clears career.current', () => {
    const { save, charId } = makeSaveWithTournament('club', 4);
    // Win QF (round 0) -> reach SF (round 1)
    const afterQf = applyCareerResult(save, charId, { won: true, score: '15-8' }, '3x15');
    // Lose SF (round 1)
    const afterSf = applyCareerResult(afterQf.save, charId, { won: false, score: '10-15 12-15' }, '3x15');

    expect(afterSf.tournament.status).toBe('out');
    expect(afterSf.earned).toBe(0.0625); // easy loss = 0.25 * 0.25
    expect(afterSf.bonus).toBe(0.125);   // club SF bonus = 0.5 * 0.25
    expect(afterSf.unlocked).toBe('regional');

    const updated = afterSf.save.characters.find((c) => c.id === charId)!;
    expect(updated.earnedPoints).toBeCloseTo(0.25 + 0.0625 + 0.125, 5);
    expect(updated.career?.current).toBeNull();
    expect(updated.career?.unlocked).toBe(2);
    expect(updated.career?.best.club).toBe(1);
    expect(afterSf.extras.tournament).toEqual({
      outcome: 'out',
      roundName: 'SF',
      placementBonus: 0.125,
      unlockedTier: 'regional',
    });
  });

  it('a champion run wins all rounds, awards the full champion bonus, and unlocks the next tier', () => {
    const { save, charId } = makeSaveWithTournament('club', 7);
    const r1 = applyCareerResult(save, charId, { won: true, score: '15-7' }, '3x15');   // QF
    const r2 = applyCareerResult(r1.save, charId, { won: true, score: '15-9 15-11' }, '3x15'); // SF
    const r3 = applyCareerResult(r2.save, charId, { won: true, score: '15-12 15-10' }, '3x15'); // F

    expect(r3.tournament.status).toBe('won');
    expect(r3.earned).toBe(0.25);
    expect(r3.bonus).toBe(0.5); // club champion bonus = 0.5
    expect(r3.unlocked).toBe('regional');

    const updated = r3.save.characters.find((c) => c.id === charId)!;
    expect(updated.earnedPoints).toBeCloseTo(0.25 * 3 + 0.5, 5); // 1.25 total
    expect(updated.career?.current).toBeNull();
    expect(updated.career?.unlocked).toBe(2);
    expect(updated.career?.best.club).toBe(3);
    expect(r3.extras.tournament).toEqual({
      outcome: 'champion',
      roundName: 'F',
      placementBonus: 0.5,
      unlockedTier: 'regional',
    });
  });
});
