import type { Gender, MatchEvent } from '../types';

export const EVENTS: Array<{ value: MatchEvent; label: string }> = [
  { value: 'MS', label: 'ชายเดี่ยว MS' },
  { value: 'WS', label: 'หญิงเดี่ยว WS' },
  { value: 'MD', label: 'ชายคู่ MD' },
  { value: 'WD', label: 'หญิงคู่ WD' },
  { value: 'XD', label: 'คู่ผสม XD' },
];

const FOR: Record<Gender, MatchEvent[]> = { male: ['MS', 'MD', 'XD'], female: ['WS', 'WD', 'XD'] };

export const eventsFor = (g: Gender): MatchEvent[] => FOR[g];

/** Keep `e` if the gender can play it, else the first valid event. */
export const fitEvent = (e: MatchEvent, g: Gender): MatchEvent => (FOR[g].includes(e) ? e : FOR[g][0]);
