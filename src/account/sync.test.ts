import { describe, expect, it } from 'vitest';
import type { Character, SaveData } from '../types';
import { emptySave } from '../app/save';
import { DEFAULT_GAME_SETTINGS } from '../app/settings';
import { applyChoice, decideSync, mergeSaves } from './sync';

const stats = { gender: 'female', body: 'short', speed: 5, power: 5, recovery: 5, stamina: 5 } as const;
const ch = (id: string, o: Partial<Character> = {}): Character => ({ id, name: id, stats: { ...stats }, earnedPoints: 0, createdAt: 1, ...o });
const save = (characters: Character[], o: Partial<SaveData> = {}): SaveData =>
  ({ ...emptySave(), characters, activeCharacterId: characters[0]?.id ?? null, ...o });
const career = (unlocked: number) => ({ unlocked, best: {}, current: null });

describe('decideSync', () => {
  it('upload: no cloud save (or none with characters) and local characters', () => {
    expect(decideSync(save([ch('a')]), null)).toBe('upload');
    expect(decideSync(save([ch('a')]), save([]))).toBe('upload');
  });
  it('download: cloud characters and no local characters', () => {
    expect(decideSync(save([]), save([ch('a')]))).toBe('download');
  });
  it('ask: both have characters and they differ', () => {
    expect(decideSync(save([ch('a')]), save([ch('b')]))).toBe('ask');
    expect(decideSync(save([ch('a')]), save([ch('a', { earnedPoints: 3 })]))).toBe('ask');
  });
  it('none: same content (key order ignored) or both empty', () => {
    const reordered = ch('a');
    reordered.stats = Object.fromEntries(Object.entries(reordered.stats).reverse()) as Character['stats'];
    expect(decideSync(save([ch('a')]), save([reordered]))).toBe('none');
    expect(decideSync(save([]), save([]))).toBe('none');
    expect(decideSync(save([]), null)).toBe('none');
  });
});

describe('mergeSaves', () => {
  it('joins by id and keeps characters that exist on one side only', () => {
    expect(mergeSaves(save([ch('a')]), save([ch('b')])).characters.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('a clash goes to the one with more earned points', () => {
    const m = mergeSaves(save([ch('a', { earnedPoints: 2, name: 'local' })]), save([ch('a', { earnedPoints: 5, name: 'cloud' })]));
    expect(m.characters).toHaveLength(1);
    expect(m.characters[0]!.name).toBe('cloud');
    const m2 = mergeSaves(save([ch('a', { earnedPoints: 9, name: 'local' })]), save([ch('a', { earnedPoints: 5, name: 'cloud' })]));
    expect(m2.characters[0]!.name).toBe('local');
  });
  it('a tie on points goes to more tiers unlocked, then to local', () => {
    const pick = (l: Character, c: Character) => mergeSaves(save([l]), save([c])).characters[0]!.name;
    expect(pick(ch('a', { name: 'local', career: career(1) }), ch('a', { name: 'cloud', career: career(3) }))).toBe('cloud');
    expect(pick(ch('a', { name: 'local', career: career(3) }), ch('a', { name: 'cloud', career: career(1) }))).toBe('local');
    expect(pick(ch('a', { name: 'local' }), ch('a', { name: 'cloud' }))).toBe('local');
  });
  it('settings come from local; activeCharacterId from local, else from the cloud', () => {
    const settings = { ...DEFAULT_GAME_SETTINGS, graphics: { ...DEFAULT_GAME_SETTINGS.graphics } };
    const cloud = save([ch('c')], { activeCharacterId: 'c' });
    expect(mergeSaves(save([ch('a')], { settings, activeCharacterId: 'a' }), cloud)).toMatchObject({ settings, activeCharacterId: 'a' });
    expect(mergeSaves(save([], { settings }), cloud)).toMatchObject({ settings, activeCharacterId: 'c' });
  });
});

describe('applyChoice', () => {
  const local = save([ch('a')]);
  const cloud = save([ch('b')]);
  it('cloud and local return that save, merge merges', () => {
    expect(applyChoice(local, cloud, 'cloud')).toBe(cloud);
    expect(applyChoice(local, cloud, 'local')).toBe(local);
    expect(applyChoice(local, cloud, 'merge').characters.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
