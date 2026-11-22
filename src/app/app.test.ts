import { describe, expect, it } from 'vitest';
import type { SaveData, Stats } from '../types';
import { createTournament } from '../career';
import {
  activeCharacter, awardPoints, setCareer, characterBudget, createCharacter, deleteCharacter, setActiveCharacter, statsError, updateCharacter,
} from './characters';
import { SAVE_KEY, emptySave, loadSave, parseSave, writeSave, type StorageLike } from './save';
import { DEFAULT_GAME_SETTINGS, rebindKey, toMatchSettings } from './settings';

const memory = (init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
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
    const broken: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
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

describe('parseSave', () => {
  it('is what loadSave uses: same result, and junk gives an empty save', () => {
    const save = createCharacter(emptySave(), 'Nut', stats());
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
    expect(parseSave(null)).toEqual(emptySave());
    expect(parseSave({ version: 2 })).toEqual(emptySave());
    expect(parseSave([])).toEqual(emptySave());
  });
});

describe('save hardening (untrusted local data)', () => {
  const char = (o: Record<string, unknown>) => ({ id: 'x', name: 'X', stats: stats(), earnedPoints: 0, createdAt: 1, ...o });
  const loadWith = (raw: unknown) => loadSave(memory({ [SAVE_KEY]: JSON.stringify(raw) }));

  it('drops characters with missing, non-numeric, out-of-range or over-budget stats, or a bad earnedPoints', () => {
    const save = loadWith({
      version: 1, activeCharacterId: null, settings: {},
      characters: [
        char({ id: 'ok' }),
        char({ id: 'missing', stats: { gender: 'male', body: 'tall' } }),
        char({ id: 'text', stats: stats({ speed: 'x' as unknown as number }) }),
        char({ id: 'range', stats: stats({ power: 99 }) }),
        char({ id: 'over', stats: stats({ speed: 10, power: 10, recovery: 5 }) }),
        char({ id: 'earned', stats: stats({ speed: 10, power: 10, recovery: 5, stamina: 0 }), earnedPoints: 5 }),
        char({ id: 'nanEarned', earnedPoints: 'lots' }),
        char({ id: 'ok' }),
      ],
    });
    expect(save.characters.map((c) => c.id)).toEqual(['ok', 'earned']);
  });

  it('replaces wrong-typed or out-of-range settings with defaults or clamps them', () => {
    const save = loadWith({
      version: 1, characters: [], activeCharacterId: null,
      settings: {
        camera: { preset: 'bogus', zoom: 'big', height: 5, follow: 'yes' },
        controls: { mouseSensitivity: 99, keys: { jump: ['KeyJ'], up: null, smash: 'Mouse0', dive: [] } },
        graphics: { quality: 'ultra' },
        assists: { hitAssist: -5, mode: 'god', racketAid: false },
        match: { event: 'XX', format: '3x15' },
      },
    });
    const d = DEFAULT_GAME_SETTINGS;
    expect(save.settings.camera).toEqual({ ...d.camera, height: 1 });
    expect(save.settings.controls.mouseSensitivity).toBe(3);
    expect(save.settings.controls.keys.jump).toEqual(['KeyJ']);
    expect(save.settings.controls.keys.up).toEqual(d.controls.keys.up);
    expect(save.settings.controls.keys.smash).toEqual(d.controls.keys.smash);
    expect(save.settings.controls.keys.dive).toEqual(d.controls.keys.dive);
    expect(save.settings.graphics.quality).toBe(d.graphics.quality);
    expect(save.settings.assists).toEqual({ ...d.assists, hitAssist: 0, racketAid: false });
    expect(save.settings.match.event).toBe(d.match.event);
    const keysNotAnObject = loadWith({ version: 1, characters: [], activeCharacterId: null, settings: { controls: { keys: 'x' } } });
    expect(keysNotAnObject.settings.controls.keys).toEqual(d.controls.keys);
  });

  it('never shares key arrays with the defaults', () => {
    const save = loadWith({ version: 1, characters: [], activeCharacterId: null, settings: { controls: { keys: { jump: ['KeyJ'] } } } });
    expect(save.settings.controls.keys.up).not.toBe(DEFAULT_GAME_SETTINGS.controls.keys.up);
    expect(emptySave().settings.controls.keys.up).not.toBe(DEFAULT_GAME_SETTINGS.controls.keys.up);
  });

  it('writeSave reports whether it saved', () => {
    expect(writeSave(emptySave(), memory())).toBe(true);
    expect(writeSave(emptySave(), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toBe(false);
    expect(writeSave(emptySave(), null)).toBe(false);
  });
});

describe('ui helpers in app', () => {
  it('statsError explains a bad stat set without throwing', () => {
    expect(statsError(stats(), 20)).toBeNull();
    expect(statsError(stats({ speed: 10, power: 10, recovery: 5 }), 20)).toMatch(/budget/);
    expect(statsError(stats({ gender: 'robot' as never }), 20)).toMatch(/gender/);
  });

  it('rebindKey sets the action to one code and reports the action already using it', () => {
    const out = rebindKey(DEFAULT_GAME_SETTINGS.controls.keys, 'jump', 'KeyQ');
    expect(out.keys.jump).toEqual(['KeyQ']);
    expect(out.conflict).toBe('backhand');
    expect(DEFAULT_GAME_SETTINGS.controls.keys.jump).toEqual(['Space']);
    expect(rebindKey(DEFAULT_GAME_SETTINGS.controls.keys, 'jump', 'KeyJ').conflict).toBeNull();
  });
});

describe('career in the save', () => {
  const withCareer = () => {
    const save = createCharacter(emptySave(), 'Nut', stats({ gender: 'male' }));
    const c = save.characters[0]!;
    const career = { unlocked: 1, best: {}, current: createTournament('club', 'MS', c, 5) };
    return { save: setCareer(save, c.id, career), career, id: c.id };
  };

  it('round-trips a real career', () => {
    const { save, career } = withCareer();
    const store = memory();
    writeSave(save, store);
    expect(loadSave(store).characters[0]!.career).toEqual(career);
  });

  it('drops a tampered career but keeps the character', () => {
    const { save } = withCareer();
    const raw = JSON.parse(JSON.stringify(save));
    raw.characters[0].career.current.entrants.pop();
    const loaded = loadSave(memory({ [SAVE_KEY]: JSON.stringify(raw) }));
    expect(loaded.characters).toHaveLength(1);
    expect(loaded.characters[0]!.name).toBe('Nut');
    expect('career' in loaded.characters[0]!).toBe(false);
  });

  it('awardPoints adds, caps at 20, ignores bad numbers and unknown ids, and never mutates', () => {
    const { save, id } = withCareer();
    const before = JSON.stringify(save);
    const a = awardPoints(save, id, 0.75);
    expect(a.characters[0]!.earnedPoints).toBe(0.75);
    expect(awardPoints(a, id, 0.25).characters[0]!.earnedPoints).toBe(1);
    expect(awardPoints(save, id, 99).characters[0]!.earnedPoints).toBe(20);
    expect(awardPoints(awardPoints(save, id, 19.5), id, 3).characters[0]!.earnedPoints).toBe(20);
    for (const bad of [NaN, Infinity, -1, 0]) expect(awardPoints(save, id, bad).characters[0]!.earnedPoints).toBe(0);
    expect(awardPoints(save, 'nope', 5)).toEqual(save);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('setCareer returns a new save and leaves other characters alone', () => {
    let save = createCharacter(emptySave(), 'A', stats());
    save = createCharacter(save, 'B', stats());
    const [a, b] = save.characters;
    const next = setCareer(save, a!.id, { unlocked: 2, best: { club: 1 }, current: null });
    expect(next.characters[0]!.career).toEqual({ unlocked: 2, best: { club: 1 }, current: null });
    expect(next.characters[1]).toBe(b);
    expect(save.characters[0]!.career).toBeUndefined();
  });
});
