// Login actions. Every action resolves to { ok } and never throws; messages are short Thai text for the UI.
import type { AccountUser } from '../types';
import { getSupabase } from './client';

export type AccountResult = { ok: true } | { ok: false; message: string };

export const NOT_CONFIGURED = 'ยังไม่ได้ตั้งค่าบัญชีออนไลน์';
const NETWORK = 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง';

export const isConfigured = (): boolean => getSupabase() !== null;

function toUser(u: { id: string; email?: string | null } | null | undefined): AccountUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null;
}

export function describeError(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  const msg = (err.message ?? '').toLowerCase();
  if (err.code === 'invalid_credentials' || msg.includes('invalid login')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (err.code === 'user_already_exists' || err.code === 'email_exists' || msg.includes('already registered')) return 'อีเมลนี้สมัครไว้แล้ว';
  if (err.code === 'weak_password' || msg.includes('password should be')) return 'รหัสผ่านไม่ปลอดภัยพอ (อย่างน้อย 6 ตัวอักษร)';
  if (err.name === 'AuthRetryableFetchError' || err.status === 0 || msg.includes('fetch') || msg.includes('network')) return NETWORK;
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

// Runs one Supabase call; turns a returned error or a thrown one into { ok: false }.
async function run(call: (c: NonNullable<ReturnType<typeof getSupabase>>) => PromiseLike<{ error: unknown }>): Promise<AccountResult> {
  const c = getSupabase();
  if (!c) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await call(c);
    return error ? { ok: false, message: describeError(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

export async function currentUser(): Promise<AccountUser | null> {
  const c = getSupabase();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession(); // reads the stored session, no network
    return toUser(data.session?.user);
  } catch {
    return null;
  }
}

// The current Supabase access token (refreshed by supabase-js when needed) for the game server's 'hello'.
export async function getAccessToken(): Promise<string | null> {
  const c = getSupabase();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export function onAuthChange(cb: (user: AccountUser | null) => void): () => void {
  const c = getSupabase();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
  return () => data.subscription.unsubscribe();
}

export const signUpEmail = (email: string, password: string): Promise<AccountResult> =>
  run((c) => c.auth.signUp({ email, password }));

export const signInEmail = (email: string, password: string): Promise<AccountResult> =>
  run((c) => c.auth.signInWithPassword({ email, password }));

export const signInGoogle = (): Promise<AccountResult> =>
  run((c) => c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));

export const signOut = (): Promise<AccountResult> => run((c) => c.auth.signOut());

export async function deleteAccount(): Promise<AccountResult> {
  const deleted = await run((c) => c.rpc('delete_own_account'));
  if (deleted.ok) await signOut(); // the account is gone: a failed local sign-out must not report failure
  return deleted;
}
