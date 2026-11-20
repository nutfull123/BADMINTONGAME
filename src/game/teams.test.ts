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
  it('isDoubles', () => {
    expect(['MS', 'WS'].some((e) => isDoubles(e as MatchEvent))).toBe(false);
    expect(['MD', 'WD', 'XD'].every((e) => isDoubles(e as MatchEvent))).toBe(true);
  });
});
