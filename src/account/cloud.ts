// Cloud save: one user_saves row per user, holding the same SaveData as localStorage.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaveData } from '../types';
import { parseSave } from '../app/save';
import { describeError, type AccountResult } from './auth';
import { getSupabase } from './client';

export const MAX_SAVE_BYTES = 256 * 1024;
const PUSH_DELAY_MS = 2000;

type Client = Pick<SupabaseClient, 'from'>;

// Missing or invalid cloud data gives null (one console.warn when invalid). A failed request THROWS instead:
// treating "could not reach the cloud" as "no cloud save" would let the caller upload over the real one.
export async function fetchCloudSave(userId: string, client: Client | null = getSupabase()): Promise<SaveData | null> {
  if (!client) return null;
  const { data, error } = await client.from('user_saves').select('save_data').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(describeError(error));
  if (!data) return null;
  const raw = (data as { save_data: unknown }).save_data;
  const save = parseSave(raw);
  if (!(typeof raw === 'object' && raw !== null && (raw as { version?: unknown }).version === 1)) {
    console.warn('cloud save is invalid, ignoring it');
    return null;
  }
  return save;
}

export async function pushCloudSave(userId: string, save: SaveData, client: Client | null = getSupabase()): Promise<AccountResult> {
  if (!client) return { ok: false, message: 'ยังไม่ได้ตั้งค่าบัญชีออนไลน์' };
  if (new TextEncoder().encode(JSON.stringify(save)).length > MAX_SAVE_BYTES) {
    return { ok: false, message: 'ข้อมูลเซฟใหญ่เกินไป (เกิน 256 KB)' };
  }
  try {
    const { error } = await client.from('user_saves').upsert({ user_id: userId, save_data: save, updated_at: new Date().toISOString() });
    return error ? { ok: false, message: describeError(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

// Debounced pusher: every local write may call push(); only the latest save is sent, about 2 s after the last call.
export function createCloudSync(userId: string, client: Client | null = getSupabase(), delayMs = PUSH_DELAY_MS) {
  let pending: SaveData | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = async (): Promise<AccountResult> => {
    clearTimeout(timer);
    timer = undefined;
    const save = pending;
    pending = null;
    return save ? pushCloudSave(userId, save, client) : { ok: true };
  };
  return {
    push(save: SaveData): void {
      pending = save;
      clearTimeout(timer);
      timer = setTimeout(() => void send(), delayMs);
    },
    flush: send,
  };
}
