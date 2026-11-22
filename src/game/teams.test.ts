import { describe, expect, it } from 'vitest';
import { PRESETS } from '../ui';
import type { MatchEvent, Stats } from '../types';
import { buildTeams, isDoubles } from './teams';

const human = (gender: Stats['gender']): Stats => ({ ...PRESETS.balanced, gender });
const genders = (event: MatchEvent, h: Stats) => {
  const t = buildTeams(event, h);
  return { near: t.near.map((s) => s.gender), far: t.far.map((s) => s.gender) };
};

describe('buildTeams', () => {
  it('singles: one bot of the event gender', () => {
    expect(genders('MS', human('male'))).toEqual({ near: ['male'], far: ['male'] });
    expect(genders('WS', human('female'))).toEqual({ near: ['female'], far: ['female'] });
  });
  it('same-gender doubles: every bot has the event gender', () => {
    expect(genders('MD', human('male'))).toEqual({ near: ['male', 'male'], far: ['male', 'male'] });
    expect(genders('WD', human('female'))).toEqual({ near: ['female', 'female'], far: ['female', 'female'] });
  });
  it('mixed doubles: one man and one woman per side, the human partner is the other gender', () => {
    expect(genders('XD', human('male'))).toEqual({ near: ['male', 'female'], far: ['male', 'female'] });
    expect(genders('XD', human('female'))).toEqual({ near: ['female', 'male'], far: ['male', 'female'] });
  });
  it('keeps the human stats in near slot 0 and gives bots a preset body', () => {
    const h = { ...PRESETS.tall, gender: 'female' as const };
    const t = buildTeams('WD', h, () => 0.99);
    expect(t.near[0]).toBe(h);
    expect(t.far[0]).toEqual({ ...PRESETS.short, gender: 'female' });
    expect(buildTeams('MS', human('male'), () => 0).far[0].body).toBe('tall');
  });
  it('uses given partner and opponents stats when provided for career tournament matches', () => {
    const h = human('male');
    const partner: Stats = { gender: 'female', body: 'short', speed: 9, power: 6, recovery: 8, stamina: 7 };
    const oppA: Stats = { gender: 'male', body: 'tall', speed: 7, power: 9, recovery: 6, stamina: 8 };
    const oppB: Stats = { gender: 'female', body: 'balanced', speed: 8, power: 7, recovery: 8, stamina: 7 };

    const xd = buildTeams('XD', h, () => 0, { partner, opponents: [oppA, oppB] });
    expect(xd.near).toEqual([h, partner]);
    expect(xd.far).toEqual([oppA, oppB]);

    const ms = buildTeams('MS', h, () => 0, { opponents: [oppA] });
    expect(ms.near).toEqual([h]);
    expect(ms.far).toEqual([oppA]);
  });
  it('isDoubles', () => {
    expect(['MS', 'WS'].some((e) => isDoubles(e as MatchEvent))).toBe(false);
    expect(['MD', 'WD', 'XD'].every((e) => isDoubles(e as MatchEvent))).toBe(true);
  });
});
