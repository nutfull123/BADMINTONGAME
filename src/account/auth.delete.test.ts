import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ rpc: vi.fn(), auth: { signOut: vi.fn() } }));
vi.mock('./client', () => ({ getSupabase: () => client }));

import { deleteAccount } from './auth';

describe('deleteAccount', () => {
  beforeEach(() => { client.rpc.mockReset(); client.auth.signOut.mockReset(); });

  it('ok after the RPC succeeds even if signOut then fails or throws', async () => {
    client.rpc.mockResolvedValue({ error: null });
    client.auth.signOut.mockResolvedValue({ error: { code: 'session_not_found', message: 'Session not found' } });
    expect(await deleteAccount()).toEqual({ ok: true });
    client.auth.signOut.mockRejectedValue(new Error('Failed to fetch'));
    expect(await deleteAccount()).toEqual({ ok: true });
    expect(client.auth.signOut).toHaveBeenCalledTimes(2);
  });
  it('a failed RPC is a failure and does not sign out', async () => {
    client.rpc.mockResolvedValue({ error: { message: 'boom' } });
    expect((await deleteAccount()).ok).toBe(false);
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
});
