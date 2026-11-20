import { describe, expect, it } from 'vitest';
import type { SaveData, Stats } from '../types';
import {
  activeCharacter, characterBudget, createCharacter, deleteCharacter, setActiveCharacter, updateCharacter,
} from './characters';
import { SAVE_KEY, emptySave, loadSave, writeSave, type StorageLike } from './save';
import { DEFAULT_GAME_SETTINGS, toMatchSettings } from './settings';

const memory = (init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
};
const stats = (o: Partial<Stats> = {}): Stats =>
  ({ gender: 'female', body: 'short', speed: 5, power: 5, recovery: 5, stamina: 5, ...o });

describe('save', () => {
  it('starts empty with default settings when nothing is stored, the JSON is broken, or storage is missing', () => {
    expect(loadSave(memory())).toEqual(emptySave());
    expect(loadSave(memory({ [SAVE_KEY]: '{not json' }))).toEqual(emptySave());
    expect(loadSave(memory({ [SAVE_KEY]: JSON.stringify({ version: 99 }) }))).toEqual(emptySave());
    expect(loadSave(null)).toEqual(emptySave());
  });

  it('round-trips characters, the active character and settings', () => {
    const store = memory();
    let save = createCharacter(emptySave(), 'Nut', stats());
    save = { ...save, settings: { ...save.settings, camera: { ...save.settings.camera, preset: 'broadcast' } } };
    writeSave(save, store);
    expect(loadSave(store)).toEqual(save);
  });

  it('fills settings added after the save was written, and drops broken characters', () => {
    const old = {
      version: 1,
      activeCharacterId: 'gone',
      characters: [{ id: 'a', name: 'A', stats: stats(), earnedPoints: 0, createdAt: 1 }, { id: 'b', name: 7 }],
      settings: { camera: { preset: 'behindLow' }, controls: { keys: { jump: ['KeyJ'] } } },
    };
    const save = loadSave(memory({ [SAVE_KEY]: JSON.stringify(old) }));
    expect(save.characters.map((c) => c.id)).toEqual(['a']);
    expect(save.activeCharacterId).toBe('a');
    expect(save.settings.camera).toEqual({ ...DEFAULT_GAME_SETTINGS.camera, preset: 'behindLow' });
    expect(save.settings.controls.keys.jump).toEqual(['KeyJ']);
    expect(save.settings.controls.keys.smash).toEqual(DEFAULT_GAME_SETTINGS.controls.keys.smash);
    expect(save.settings.graphics).toEqual(DEFAULT_GAME_SETTINGS.graphics);
  });

  it('never throws when the storage write fails', () => {
    const broken: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(() => writeSave(emptySave(), broken)).not.toThrow();
  });
});

describe('characters', () => {
  it('creates, activates the first one, and rejects stats over the 20-point budget', () => {
    let save: SaveData = createCharacter(emptySave(), '  Ann  ', stats());
    expect(save.characters[0].name).toBe('Ann');
    expect(activeCharacter(save)?.id).toBe(save.characters[0].id);
    save = createCharacter(save, 'Ben', stats({ gender: 'male', body: 'tall' }));
    expect(activeCharacter(save)?.name).toBe('Ann');
    expect(() => createCharacter(save, 'X', stats({ speed: 10, power: 10, recovery: 1 }))).toThrow();
  });

  it('keeps gender and body fixed on edits and allows earned points on top of 20', () => {
    let save = createCharacter(emptySave(), 'Ann', stats());
    const id = save.characters[0].id;
    save = updateCharacter(save, id, { stats: stats({ gender: 'male', body: 'tall', speed: 8, power: 2 }) });
    expect(save.characters[0].stats).toMatchObject({ gender: 'female', body: 'short', speed: 8, power: 2 });
    expect(() => updateCharacter(save, id, { stats: stats({ speed: 10, power: 10, recovery: 4 }) })).toThrow();
    save = { ...save, characters: [{ ...save.characters[0], earnedPoints: 5 }] };
    expect(characterBudget(save.characters[0])).toBe(25);
    expect(() => updateCharacter(save, id, { stats: stats({ speed: 10, power: 10, recovery: 5, stamina: 0 }) })).not.toThrow();
    expect(characterBudget({ earnedPoints: 999 })).toBe(40);
  });

  it('deleting the active character activates another; setActive ignores unknown ids', () => {
    let save = createCharacter(createCharacter(emptySave(), 'A', stats()), 'B', stats());
    const [a, b] = save.characters.map((c) => c.id);
    save = deleteCharacter(save, a);
    expect(save.activeCharacterId).toBe(b);
    expect(setActiveCharacter(save, 'nope')).toBe(save);
    expect(deleteCharacter(save, b).activeCharacterId).toBeNull();
  });
});

describe('settings', () => {
  it('flattens game settings into what a match reads', () => {
    expect(toMatchSettings(DEFAULT_GAME_SETTINGS)).toEqual({
      hitAssist: 70, landingMarker: true, timingRing: true, format: '3x15', botLevel: 'medium', mode: 'easy', event: 'MS',
    });
  });
});
