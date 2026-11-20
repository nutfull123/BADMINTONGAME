// Who is on court for an event: the human plus bots, with genders that follow the event. Pure.
import { PRESETS } from '../ui';
import type { BodyType, Gender, MatchEvent, Side, Stats } from '../types';

export const isDoubles = (event: MatchEvent): boolean => event === 'MD' || event === 'WD' || event === 'XD';

// Stats per side, index = slot: the human is near slot 0, the human's partner is near slot 1.
// Bots get a random body type with that body's preset stats and the gender the event calls for.
export function buildTeams(event: MatchEvent, human: Stats, rng: () => number = Math.random): Record<Side, Stats[]> {
  const bodies = Object.keys(PRESETS) as BodyType[];
  const bot = (gender: Gender): Stats => ({ ...PRESETS[bodies[Math.floor(rng() * bodies.length)]], gender });
  const g: Gender = event === 'WS' || event === 'WD' ? 'female' : 'male';
  if (!isDoubles(event)) return { near: [human], far: [bot(g)] };
  if (event === 'XD') return { near: [human, bot(human.gender === 'male' ? 'female' : 'male')], far: [bot('male'), bot('female')] };
  return { near: [human, bot(g)], far: [bot(g), bot(g)] };
}
