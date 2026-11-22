// Career numbers (design doc "Phase 4 detail"). Fictional tier names, no real events or brands.
import type { MatchSettings, TierId } from '../types';

export interface Tier { id: TierId; name: string; size: 8 | 16 | 32; botLevel: MatchSettings['botLevel']; botPoints: number }

export const TIERS: readonly Tier[] = [
  { id: 'club', name: 'Club Open', size: 8, botLevel: 'easy', botPoints: 20 },
  { id: 'regional', name: 'Regional Cup', size: 16, botLevel: 'medium', botPoints: 26 },
  { id: 'national', name: 'National Championship', size: 16, botLevel: 'hard', botPoints: 32 },
  { id: 'masters', name: 'Grand Masters', size: 32, botLevel: 'hard', botPoints: 38 },
];

export const BOT_POINTS_SPREAD = 2; // each bot's stat total is within +-2 of the tier's botPoints
export const BOT_POINTS_MIN = 20;
export const BOT_POINTS_MAX = 40;

export const WIN_POINTS: Record<MatchSettings['botLevel'], number> = { easy: 0.25, medium: 0.5, hard: 0.75 };
export const LOSS_FRACTION = 0.25; // a loss earns this share of the win points
export const CHAMPION_BONUS: Record<TierId, number> = { club: 0.5, regional: 1, national: 1.5, masters: 2 };
export const FINALIST_FRACTION = 0.5; // of the champion bonus
export const SEMI_FRACTION = 0.25;
export const MAX_EARNED_POINTS = 20; // earned points cap (20 base + 20 = 40 total)

export const BOT_BUDGET = 40;
export const ELO_SCALE = 8; // win chance of A over B = 1 / (1 + 10^((totalB - totalA) / ELO_SCALE))

// Syllables for generated names (fictional).
export const FIRST_SYLLABLES = ['Ka', 'Ren', 'Mi', 'Tao', 'Lu', 'Sa', 'Dev', 'Nor', 'Yu', 'Ari', 'Bo', 'Cai', 'Ela', 'Fen', 'Hi', 'Ivo', 'Jun', 'Kel', 'Lia', 'Mar'];
export const FIRST_ENDINGS = ['n', 'ra', 'ko', 'lo', 'mi', 'to', 'na', 'ri', 'sen', 'vi'];
export const LAST_SYLLABLES = ['Vor', 'Han', 'Zel', 'Bran', 'Quil', 'Mor', 'Tek', 'Sund', 'Pel', 'Dax', 'Wen', 'Orl', 'Fay', 'Grim', 'Lok'];
export const LAST_ENDINGS = ['son', 'ley', 'ova', 'ard', 'in', 'ez', 'sky', 'ton', 'wick', 'o'];
