import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacter } from '../app/characters';
import { emptySave } from '../app/save';
import { createCloudSync, fetchCloudSave, pushCloudSave } from './cloud';

const stats = { gender: 'female', body: 'short', speed: 5, power: 5, recovery: 5, stamina: 5 } as const;

function fakeClient(row: { data: unknown; error?: unknown }) {
  const upsert = vi.fn(async () => ({ error: null }));
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row.data, error: row.error ?? null }) }) }), upsert }),
  };
  return { client: client as never, upsert };
}

describe('fetchCloudSave', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the validated save', async () => {
    const save = createCharacter(emptySave(), 'Nut', { ...stats });
    const { client } = fakeClient({ data: { save_data: JSON.parse(JSON.stringify(save)) } });
    expect(await fetchCloudSave('u1', client)).toEqual(save);
  });
  it('invalid JSON gives null with one warning; a missing row gives null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchCloudSave('u1', fakeClient({ data: { save_data: { version: 7, characters: 'x' } } }).client)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await fetchCloudSave('u1', fakeClient({ data: null }).client)).toBeNull();
  });
  it('a failed request throws instead of looking like "no cloud save"', async () => {
    await expect(fetchCloudSave('u1', fakeClient({ data: null, error: { message: 'Failed to fetch' } }).client)).rejects.toThrow();
  });
  it('no client gives null', async () => {
    expect(await fetchCloudSave('u1', null)).toBeNull();
  });
});

describe('pushCloudSave', () => {
  it('upserts the row with updated_at', async () => {
    const { client, upsert } = fakeClient({ data: null });
    expect(await pushCloudSave('u1', emptySave(), client)).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', save_data: emptySave(), updated_at: expect.any(String) }));
  });
  it('refuses a save over 256 KB', async () => {
    const { client, upsert } = fakeClient({ data: null });
    const big = { ...emptySave(), characters: [{ id: 'a', name: 'x'.repeat(300 * 1024), stats: { ...stats }, earnedPoints: 0, createdAt: 1 }] };
    expect((await pushCloudSave('u1', big, client)).ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('createCloudSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends once, with the latest save, for several quick pushes', async () => {
    const { client, upsert } = fakeClient({ data: null });
    const sync = createCloudSync('u1', client);
    const a = createCharacter(emptySave(), 'A', { ...stats });
    sync.push(emptySave());
    sync.push(a);
    sync.push(a);
    expect(upsert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ save_data: a }));
  });
  it('flush sends the pending save now, and nothing twice', async () => {
    const { client, upsert } = fakeClient({ data: null });
    const sync = createCloudSync('u1', client);
    sync.push(emptySave());
    await sync.flush();
    await vi.advanceTimersByTimeAsync(5000);
    await sync.flush();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
