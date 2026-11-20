// Character management on a SaveData. Pure: every function returns a new SaveData.
import type { Character, SaveData, Stats } from '../types';
import { STAT_BUDGET, STAT_MAX } from '../sim/tuning';

const MAX_EARNED = 4 * STAT_MAX - STAT_BUDGET; // 20 earned points take every stat to 10

let counter = 0;
export const newCharacterId = (): string => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export const characterBudget = (c: Pick<Character, 'earnedPoints'>): number =>
  STAT_BUDGET + Math.max(0, Math.min(MAX_EARNED, c.earnedPoints));

const total = (s: Stats) => s.speed + s.power + s.recovery + s.stamina;

function checkStats(s: Stats, budget: number): void {
  for (const k of ['speed', 'power', 'recovery', 'stamina'] as const) {
    if (!Number.isFinite(s[k]) || s[k] < 0 || s[k] > STAT_MAX) throw new Error(`${k} must be 0..${STAT_MAX}`);
  }
  if (total(s) > budget) throw new Error(`stats total ${total(s)} is over the budget ${budget}`);
}

const cleanName = (name: string) => name.trim().slice(0, 24) || 'Player';

export function createCharacter(save: SaveData, name: string, stats: Stats): SaveData {
  checkStats(stats, STAT_BUDGET);
  const c: Character = { id: newCharacterId(), name: cleanName(name), stats: { ...stats }, earnedPoints: 0, createdAt: Date.now() };
  return { ...save, characters: [...save.characters, c], activeCharacterId: save.activeCharacterId ?? c.id };
}

// Gender and body are fixed after creation (design doc); only the name and the four stats change.
export function updateCharacter(save: SaveData, id: string, patch: { name?: string; stats?: Stats }): SaveData {
  return {
    ...save,
    characters: save.characters.map((c) => {
      if (c.id !== id) return c;
      const stats = patch.stats ? { ...patch.stats, gender: c.stats.gender, body: c.stats.body } : c.stats;
      checkStats(stats, characterBudget(c));
      return { ...c, name: patch.name === undefined ? c.name : cleanName(patch.name), stats };
    }),
  };
}

export function deleteCharacter(save: SaveData, id: string): SaveData {
  const characters = save.characters.filter((c) => c.id !== id);
  const activeCharacterId = save.activeCharacterId === id ? characters[0]?.id ?? null : save.activeCharacterId;
  return { ...save, characters, activeCharacterId };
}

export function setActiveCharacter(save: SaveData, id: string): SaveData {
  return save.characters.some((c) => c.id === id) ? { ...save, activeCharacterId: id } : save;
}

export const activeCharacter = (save: SaveData): Character | null =>
  save.characters.find((c) => c.id === save.activeCharacterId) ?? null;
