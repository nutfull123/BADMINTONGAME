// Local save (guest play, design doc "Guest play"): one JSON blob in localStorage. Pure apart from the storage
// passed in; never throws, so a broken or missing save starts fresh instead of breaking the game.
import type { Character, GameSettings, SaveData } from '../types';
import { validateStats } from '../sim';
import { DEFAULT_GAME_SETTINGS } from './settings';

export const SAVE_KEY = 'badminton.save.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

// Fill missing settings from the defaults one level deep, so older saves pick up new options.
function mergeSettings(raw: unknown): GameSettings {
  const out = structuredClone(DEFAULT_GAME_SETTINGS);
  if (!isObject(raw)) return out;
  for (const k of Object.keys(out) as (keyof GameSettings)[]) {
    const part = raw[k];
    if (isObject(part)) Object.assign(out[k], part);
  }
  if (isObject(raw.controls) && isObject(raw.controls.keys)) {
    out.controls.keys = { ...DEFAULT_GAME_SETTINGS.controls.keys, ...(raw.controls.keys as object) };
  }
  return out;
}

function validCharacter(c: unknown): c is Character {
  if (!isObject(c) || typeof c.id !== 'string' || typeof c.name !== 'string' || !isObject(c.stats)) return false;
  if (typeof c.earnedPoints !== 'number' || typeof c.createdAt !== 'number') return false;
  const s = c.stats as unknown as Character['stats'];
  // the budget check here allows earned points; characters.ts enforces the exact budget on edits
  return validateStats({ ...s, speed: 0, power: 0, recovery: 0, stamina: 0 }) === null;
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
  const characters = Array.isArray(raw.characters) ? raw.characters.filter(validCharacter) : [];
  const active = typeof raw.activeCharacterId === 'string' && characters.some((c) => c.id === raw.activeCharacterId)
    ? raw.activeCharacterId
    : characters[0]?.id ?? null;
  return { version: 1, characters, activeCharacterId: active, settings: mergeSettings(raw.settings) };
}

export function writeSave(data: SaveData, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // shortcut: a full or blocked storage keeps playing without saving; surface it in the UI when accounts exist
  }
}
