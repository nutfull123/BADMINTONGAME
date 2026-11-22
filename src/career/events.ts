import type { Gender, MatchEvent } from '../types';

export const isDoubles = (event: MatchEvent): boolean => event === 'MD' || event === 'WD' || event === 'XD';

// MS/MD for men, WS/WD for women, XD for both.
export const eventsFor = (gender: Gender): MatchEvent[] => (gender === 'male' ? ['MS', 'MD', 'XD'] : ['WS', 'WD', 'XD']);

// True when a team with these player genders may enter the event (XD is one man and one woman).
export function teamFits(event: MatchEvent, genders: Gender[]): boolean {
  if (genders.length !== (isDoubles(event) ? 2 : 1)) return false;
  if (event === 'XD') return genders.includes('male') && genders.includes('female');
  const want: Gender = event === 'MS' || event === 'MD' ? 'male' : 'female';
  return genders.every((g) => g === want);
}
