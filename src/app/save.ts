// Local save (guest play, design doc "Guest play"): one JSON blob in localStorage. Pure apart from the storage
// passed in. Saved data is untrusted: loadSave validates everything and never throws, so a broken or tampered
// save starts fresh (or drops the broken parts) instead of breaking the game.
import type { Character, SaveData } from '../types';
import { characterBudget, statsError } from './characters';
import { DEFAULT_GAME_SETTINGS, sanitizeSettings } from './settings';

export const SAVE_KEY = 'badminton.save.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// localStorage can be missing or throw (private windows, blocked site data).
function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const emptySave = (): SaveData => ({
  version: 1,
  characters: [],
  activeCharacterId: null,
  settings: structuredClone(DEFAULT_GAME_SETTINGS),
});

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validCharacter(c: unknown): c is Character {
  if (!isObject(c) || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !isObject(c.stats)) return false;
  if (typeof c.earnedPoints !== 'number' || !Number.isFinite(c.earnedPoints) || c.earnedPoints < 0) return false;
  if (typeof c.createdAt !== 'number' || !Number.isFinite(c.createdAt)) return false;
  const stats = c.stats as unknown as Character['stats'];
  return statsError(stats, characterBudget({ earnedPoints: c.earnedPoints })) === null;
}

export function loadSave(storage: StorageLike | null = browserStorage()): SaveData {
  if (!storage) return emptySave();
  let raw: unknown;
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return emptySave();
    raw = JSON.parse(text);
  } catch {
    return emptySave();
  }
  if (!isObject(raw) || raw.version !== 1) return emptySave();
  const seen = new Set<string>();
  const characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .filter(validCharacter)
    .filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)))
    .map((c) => ({ id: c.id, name: c.name, stats: { ...c.stats }, earnedPoints: c.earnedPoints, createdAt: c.createdAt }));
  const active = characters.some((c) => c.id === raw.activeCharacterId)
    ? (raw.activeCharacterId as string)
    : characters[0]?.id ?? null;
  return { version: 1, characters, activeCharacterId: active, settings: sanitizeSettings(raw.settings) };
}

// Returns false when the save could not be written (no storage, full, blocked), so the UI can say so.
export function writeSave(data: SaveData, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
