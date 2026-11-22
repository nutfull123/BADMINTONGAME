// Who is on court for an event: the human plus bots, with genders that follow the event. Pure.
import { PRESETS } from '../ui';
import type { BodyType, Gender, MatchEvent, Side, Stats } from '../types';

export const isDoubles = (event: MatchEvent): boolean => event === 'MD' || event === 'WD' || event === 'XD';

export interface GivenTeams {
  partner?: Stats | null;
  opponents?: Stats[];
}

// Stats per side, index = slot: the human is near slot 0, the human's partner is near slot 1.
// Bots get a random body type with that body's preset stats and the gender the event calls for,
// unless given partner / opponent stats are supplied (e.g. from a career tournament).
export function buildTeams(
  event: MatchEvent,
  human: Stats,
  rng: () => number = Math.random,
  given?: GivenTeams,
): Record<Side, Stats[]> {
  const bodies = Object.keys(PRESETS) as BodyType[];
  const bot = (gender: Gender): Stats => ({ ...PRESETS[bodies[Math.floor(rng() * bodies.length)]], gender });
  const g: Gender = event === 'WS' || event === 'WD' ? 'female' : 'male';
  if (!isDoubles(event)) {
    const opp = given?.opponents?.[0] ? { ...given.opponents[0] } : bot(g);
    return { near: [human], far: [opp] };
  }
  const partnerGender: Gender = event === 'XD' ? (human.gender === 'male' ? 'female' : 'male') : g;
  const partner = given?.partner ? { ...given.partner } : bot(partnerGender);
  const farDefaults: [Gender, Gender] = event === 'XD' ? ['male', 'female'] : [g, g];
  const far: Stats[] = [
    given?.opponents?.[0] ? { ...given.opponents[0] } : bot(farDefaults[0]),
    given?.opponents?.[1] ? { ...given.opponents[1] } : bot(farDefaults[1]),
  ];
  return { near: [human, partner], far };
}
