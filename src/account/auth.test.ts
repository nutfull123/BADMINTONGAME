import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUser, deleteAccount, describeError, isConfigured, onAuthChange, signInEmail, signInGoogle, signOut, signUpEmail } from './auth';

describe('auth without Supabase env variables', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  });

  it('is not configured and every action says so without throwing', async () => {
    expect(isConfigured()).toBe(false);
    for (const r of [await signUpEmail('a@b.c', 'secret1'), await signInEmail('a@b.c', 'secret1'), await signInGoogle(), await signOut(), await deleteAccount()]) {
      expect(r).toEqual({ ok: false, message: 'ยังไม่ได้ตั้งค่าบัญชีออนไลน์' });
    }
  });
  it('has no user and a no-op listener', async () => {
    expect(await currentUser()).toBeNull();
    const off = onAuthChange(() => { throw new Error('must not fire'); });
    expect(() => off()).not.toThrow();
  });
});

describe('describeError', () => {
  it('maps the common errors to short Thai messages', () => {
    expect(describeError({ code: 'invalid_credentials' })).toContain('ไม่ถูกต้อง');
    expect(describeError({ message: 'User already registered' })).toContain('สมัครไว้แล้ว');
    expect(describeError({ code: 'weak_password' })).toContain('ไม่ปลอดภัย');
    expect(describeError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toContain('อินเทอร์เน็ต');
    expect(describeError(new Error('boom'))).toContain('ข้อผิดพลาด');
  });
});
