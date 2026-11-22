import { describe, expect, it, vi } from 'vitest';
import { emptySave } from '../app/save';
import type { Character, SaveData, SyncChoice } from '../types';
import { runSignInSync, type SyncFlowDeps } from './syncFlow';

function makeChar(id: string, name: string, earnedPoints = 0, unlocked = 1): Character {
  return {
    id,
    name,
    stats: { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
    earnedPoints,
    career: { unlocked, best: {}, current: null },
    createdAt: 1000,
  };
}

function makeSave(chars: Character[]): SaveData {
  return {
    ...emptySave(),
    characters: chars,
    activeCharacterId: chars[0]?.id ?? null,
  };
}

describe('runSignInSync', () => {
  it('catches fetchCloudSave errors and reports message without syncing', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย')]);
    const saveLocal = vi.fn();
    const pushCloudSave = vi.fn();
    const askChoice = vi.fn();

    const res = await runSignInSync('u1', local, {
      fetchCloudSave: vi.fn().mockRejectedValue(new Error('เชื่อมต่ออินเทอร์เน็ตไม่ได้')),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({
      ok: false,
      save: local,
      error: 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
    });
    expect(saveLocal).not.toHaveBeenCalled();
    expect(pushCloudSave).not.toHaveBeenCalled();
    expect(askChoice).not.toHaveBeenCalled();
  });

  it('uploads local save when cloud save is null and local has characters', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย')]);
    const saveLocal = vi.fn();
    const pushCloudSave = vi.fn().mockResolvedValue({ ok: true });
    const askChoice = vi.fn();

    const res = await runSignInSync('u1', local, {
      fetchCloudSave: vi.fn().mockResolvedValue(null),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'upload', save: local });
    expect(pushCloudSave).toHaveBeenCalledWith('u1', local);
    expect(saveLocal).not.toHaveBeenCalled();
    expect(askChoice).not.toHaveBeenCalled();
  });

  it('replaces local save when cloud has characters and local is empty', async () => {
    const local = emptySave();
    const cloud = makeSave([makeChar('c2', 'เมย์', 4, 2)]);
    const saveLocal = vi.fn();
    const pushCloudSave = vi.fn();
    const askChoice = vi.fn();

    const res = await runSignInSync('u1', local, {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'download', save: cloud });
    expect(saveLocal).toHaveBeenCalledWith(cloud);
    expect(pushCloudSave).not.toHaveBeenCalled();
    expect(askChoice).not.toHaveBeenCalled();
  });

  it('does nothing when decideSync returns none', async () => {
    const shared = makeChar('c1', 'สมชาย', 2, 1);
    const local = makeSave([shared]);
    const cloud = makeSave([{ ...shared }]);
    const saveLocal = vi.fn();
    const pushCloudSave = vi.fn();
    const askChoice = vi.fn();

    const res = await runSignInSync('u1', local, {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'none', save: local });
    expect(saveLocal).not.toHaveBeenCalled();
    expect(pushCloudSave).not.toHaveBeenCalled();
    expect(askChoice).not.toHaveBeenCalled();
  });

  it('asks the player on conflict, applies choice (merge), and saves both locally and to cloud', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย', 1, 1)]);
    const cloud = makeSave([makeChar('c2', 'เมย์', 5, 3)]);
    const saveLocal = vi.fn();
    const pushCloudSave = vi.fn().mockResolvedValue({ ok: true });
    const askChoice = vi.fn<(l: SaveData, c: SaveData) => Promise<SyncChoice>>().mockResolvedValue('merge');

    const deps: SyncFlowDeps = {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    };

    const res = await runSignInSync('u1', local, deps);

    expect(askChoice).toHaveBeenCalledWith(local, cloud);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.action).toBe('ask');
      expect(res.save.characters.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(saveLocal).toHaveBeenCalledWith(res.save);
      expect(pushCloudSave).toHaveBeenCalledWith('u1', res.save);
    }
  });

  it('surfaces cloud push error when upload fails', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย')]);
    const res = await runSignInSync('u1', local, {
      fetchCloudSave: vi.fn().mockResolvedValue(null),
      pushCloudSave: vi.fn().mockResolvedValue({ ok: false, message: 'บันทึกคลาวด์ไม่สำเร็จ' }),
      saveLocal: vi.fn(),
      askChoice: vi.fn(),
    });

    expect(res).toEqual({ ok: false, save: local, error: 'บันทึกคลาวด์ไม่สำเร็จ' });
  });
});
