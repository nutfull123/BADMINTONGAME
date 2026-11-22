import { describe, expect, it } from 'vitest';
import { makeVerifier, type AuthClient } from './auth';

const client = (res: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>): AuthClient => ({ auth: { getUser: res } });

describe('makeVerifier', () => {
  it('returns the user id of a valid token', async () => {
    const v = makeVerifier(client(async () => ({ data: { user: { id: 'u1' } }, error: null })));
    expect(await v('tok')).toEqual({ userId: 'u1' });
  });
  it('refuses an invalid token, an empty token, a missing client and a thrown error', async () => {
    expect(await makeVerifier(client(async () => ({ data: { user: null }, error: { message: 'bad' } })))('tok')).toBeNull();
    expect(await makeVerifier(client(async () => ({ data: { user: { id: 'u' } }, error: null })))('')).toBeNull();
    expect(await makeVerifier(null)('tok')).toBeNull();
    expect(await makeVerifier(client(async () => { throw new Error('down'); }))('tok')).toBeNull();
  });
});
