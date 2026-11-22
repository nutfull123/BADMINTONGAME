import { describe, expect, it, vi } from 'vitest';
import { emptySave } from '../app/save';
import type { Character, SaveData, SyncChoice } from '../types';
import {
  decideAuthEventAction,
  runSignInSync,
  type SyncFlowDeps,
} from './syncFlow';

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

    const res = await runSignInSync('u1', () => local, {
      fetchCloudSave: vi.fn().mockRejectedValue(new Error('เชื่อมต่ออินเทอร์เน็ตไม่ได้')),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({
      ok: false,
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

    const res = await runSignInSync('u1', () => local, {
      fetchCloudSave: vi.fn().mockResolvedValue(null),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'upload' });
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

    const res = await runSignInSync('u1', () => local, {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'download' });
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

    const res = await runSignInSync('u1', () => local, {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    });

    expect(res).toEqual({ ok: true, action: 'none' });
    expect(saveLocal).not.toHaveBeenCalled();
    expect(pushCloudSave).not.toHaveBeenCalled();
    expect(askChoice).not.toHaveBeenCalled();
  });

  it('asks the player on conflict, applies choice (merge), and saves both locally and to cloud', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย', 1, 1)]);
    const cloud = makeSave([makeChar('c2', 'เมย์', 5, 3)]);
    let saved: SaveData = local;
    const saveLocal = vi.fn((next: SaveData) => {
      saved = next;
    });
    const pushCloudSave = vi.fn().mockResolvedValue({ ok: true });
    const askChoice = vi.fn<(l: SaveData, c: SaveData) => Promise<SyncChoice>>().mockResolvedValue('merge');

    const deps: SyncFlowDeps = {
      fetchCloudSave: vi.fn().mockResolvedValue(cloud),
      pushCloudSave,
      saveLocal,
      askChoice,
    };

    const res = await runSignInSync('u1', () => saved, deps);

    expect(askChoice).toHaveBeenCalledWith(local, cloud);
    expect(res).toEqual({ ok: true, action: 'ask' });
    expect(saved.characters.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(saveLocal).toHaveBeenCalledWith(saved);
    expect(pushCloudSave).toHaveBeenCalledWith('u1', saved);
  });

  it('surfaces cloud push error when upload fails', async () => {
    const local = makeSave([makeChar('c1', 'สมชาย')]);
    const res = await runSignInSync('u1', () => local, {
      fetchCloudSave: vi.fn().mockResolvedValue(null),
      pushCloudSave: vi.fn().mockResolvedValue({ ok: false, message: 'บันทึกคลาวด์ไม่สำเร็จ' }),
      saveLocal: vi.fn(),
      askChoice: vi.fn(),
    });

    expect(res).toEqual({ ok: false, error: 'บันทึกคลาวด์ไม่สำเร็จ' });
  });

  it('preserves changes made while fetchCloudSave is in flight for none, upload, and failed sync', async () => {
    // 1. 'none': settings changed while fetch was in flight
    const shared = makeChar('c1', 'สมชาย', 2, 1);
    let current = makeSave([shared]);
    const saveLocalNone = vi.fn((next: SaveData) => {
      current = next;
    });
    const resNone = await runSignInSync('u1', () => current, {
      fetchCloudSave: async () => {
        current = {
          ...current,
          settings: { ...current.settings, graphics: { quality: 'low' } },
        };
        return makeSave([{ ...shared }]);
      },
      pushCloudSave: vi.fn(),
      saveLocal: saveLocalNone,
      askChoice: vi.fn(),
    });
    expect(resNone).toEqual({ ok: true, action: 'none' });
    expect(saveLocalNone).not.toHaveBeenCalled();
    expect(current.settings.graphics.quality).toBe('low');

    // 2. 'upload': character created while fetch was in flight
    let currentUpload = emptySave();
    const saveLocalUpload = vi.fn((next: SaveData) => {
      currentUpload = next;
    });
    const pushUpload = vi.fn().mockResolvedValue({ ok: true });
    const resUpload = await runSignInSync('u1', () => currentUpload, {
      fetchCloudSave: async () => {
        currentUpload = makeSave([makeChar('c-new', 'น้องใหม่')]);
        return null;
      },
      pushCloudSave: pushUpload,
      saveLocal: saveLocalUpload,
      askChoice: vi.fn(),
    });
    expect(resUpload).toEqual({ ok: true, action: 'upload' });
    expect(saveLocalUpload).not.toHaveBeenCalled();
    expect(currentUpload.characters.map((c) => c.id)).toEqual(['c-new']);
    expect(pushUpload).toHaveBeenCalledWith('u1', currentUpload);

    // 3. failed sync: character created while fetch was in flight
    let currentFail = emptySave();
    const saveLocalFail = vi.fn((next: SaveData) => {
      currentFail = next;
    });
    const resFail = await runSignInSync('u1', () => currentFail, {
      fetchCloudSave: async () => {
        currentFail = makeSave([makeChar('c-keep', 'เก็บไว้')]);
        throw new Error('network error');
      },
      pushCloudSave: vi.fn(),
      saveLocal: saveLocalFail,
      askChoice: vi.fn(),
    });
    expect(resFail).toEqual({ ok: false, error: 'network error' });
    expect(saveLocalFail).not.toHaveBeenCalled();
    expect(currentFail.characters.map((c) => c.id)).toEqual(['c-keep']);
  });
});

describe('decideAuthEventAction', () => {
  it('syncs and navigates on first sign-in from home or account page', () => {
    expect(
      decideAuthEventAction('home', 'u1', { syncedUserId: null, attemptedSyncUserId: null }),
    ).toEqual({ kind: 'sync', navigateToMenu: true });

    expect(
      decideAuthEventAction('account', 'u1', { syncedUserId: null, attemptedSyncUserId: null }),
    ).toEqual({ kind: 'sync', navigateToMenu: true });
  });

  it('ignores repeated SIGNED_IN on tab refocus/token refresh when already synced or attempted', () => {
    expect(
      decideAuthEventAction('home', 'u1', { syncedUserId: 'u1', attemptedSyncUserId: 'u1' }),
    ).toEqual({ kind: 'ignore' });

    expect(
      decideAuthEventAction('other', 'u1', { syncedUserId: 'u1', attemptedSyncUserId: 'u1' }),
    ).toEqual({ kind: 'ignore' });

    expect(
      decideAuthEventAction('home', 'u1', { syncedUserId: null, attemptedSyncUserId: 'u1' }),
    ).toEqual({ kind: 'ignore' });
  });

  it('still navigates to menu if account page is open for an already-synced user', () => {
    expect(
      decideAuthEventAction('account', 'u1', { syncedUserId: 'u1', attemptedSyncUserId: 'u1' }),
    ).toEqual({ kind: 'sync', navigateToMenu: true });
  });

  it('defers sync during a match or tutorial', () => {
    expect(
      decideAuthEventAction('playing', 'u1', { syncedUserId: null, attemptedSyncUserId: null }),
    ).toEqual({ kind: 'defer' });
  });
});
