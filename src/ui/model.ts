// Pure UI model: the stat budget and body presets the character form uses, plus the flat settings
// shape a match reads (Settings = MatchSettings). No DOM.
import type { BodyType, MatchSettings, Stats } from '../types';

export const STAT_BUDGET = 20;

export type StatKey = 'speed' | 'power' | 'recovery' | 'stamina';

// The flat settings a match reads; the full settings model lives in app/ (GameSettings).
export type Settings = MatchSettings;

export const DEFAULT_SETTINGS: Settings = {
  hitAssist: 70,
  landingMarker: true,
  timingRing: true,
  format: '3x15',
  botLevel: 'medium',
  mode: 'easy',
  event: 'MS',
};

export const PRESETS: Record<BodyType, Stats> = {
  tall: { gender: 'male', body: 'tall', speed: 3, power: 8, recovery: 3, stamina: 6 },
  balanced: { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
  short: { gender: 'male', body: 'short', speed: 8, power: 3, recovery: 4, stamina: 5 },
};

export function budgetLeft(stats: Stats, budget = STAT_BUDGET): number {
  return budget - (stats.speed + stats.power + stats.recovery + stats.stamina);
}

export function clampStatToBudget(
  stats: Stats,
  key: StatKey,
  requestedValue: number,
  budget = STAT_BUDGET,
): Stats {
  const clamped0To10 = Math.max(0, Math.min(10, Math.round(requestedValue)));
  const othersTotal =
    stats.speed + stats.power + stats.recovery + stats.stamina - stats[key];
  const maxAllowed = Math.max(0, Math.min(10, budget - othersTotal));
  const finalVal = Math.min(clamped0To10, maxAllowed);
  return { ...stats, [key]: finalVal };
}
