// Orchestrates first-sign-in cloud sync using account/ pure decisions and injected side effects.
import type { AccountResult } from '../account/auth';
import { applyChoice, decideSync } from '../account/sync';
import type { SaveData, SyncAction, SyncChoice } from '../types';

export type AppScreen = 'home' | 'account' | 'privacy' | 'menu' | 'playing' | 'other';

export interface AuthSyncState {
  syncedUserId: string | null;
  attemptedSyncUserId: string | null;
}

export type AuthEventAction =
  | { kind: 'ignore' }
  | { kind: 'defer' }
  | { kind: 'sync'; navigateToMenu: boolean };

// Pure decision for an auth SIGNED_IN / INITIAL_SESSION event:
// - Never interrupt a match or tutorial (defer until back on a menu page).
// - Ignore repeated events on tab focus or token refresh once this user was already handled
//   (except when the account page is explicitly open).
export function decideAuthEventAction(
  screen: AppScreen,
  userId: string,
  state: AuthSyncState,
): AuthEventAction {
  const alreadyHandled =
    state.syncedUserId === userId || state.attemptedSyncUserId === userId;

  if (screen === 'playing') {
    return alreadyHandled ? { kind: 'ignore' } : { kind: 'defer' };
  }
  if (screen === 'account') {
    return { kind: 'sync', navigateToMenu: true };
  }
  if (alreadyHandled) {
    return { kind: 'ignore' };
  }
  return {
    kind: 'sync',
    navigateToMenu: screen === 'home' || screen === 'menu',
  };
}

export interface SyncFlowDeps {
  fetchCloudSave: (userId: string) => Promise<SaveData | null>;
  pushCloudSave: (userId: string, save: SaveData) => Promise<AccountResult>;
  saveLocal: (save: SaveData) => void;
  askChoice: (local: SaveData, cloud: SaveData) => Promise<SyncChoice>;
}

export type SyncFlowResult =
  | { ok: true; action: SyncAction }
  | { ok: false; error: string };

export async function runSignInSync(
  userId: string,
  getLocal: () => SaveData,
  deps: SyncFlowDeps,
): Promise<SyncFlowResult> {
  let cloud: SaveData | null;
  try {
    cloud = await deps.fetchCloudSave(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'เชื่อมต่อคลาวด์ไม่สำเร็จ ลองใหม่อีกครั้ง';
    return { ok: false, error: message };
  }

  // Read the latest local save AFTER the cloud fetch so edits made in flight are never wiped.
  const local = getLocal();
  const action = decideSync(local, cloud);
  if (action === 'none') {
    return { ok: true, action };
  }

  if (action === 'upload') {
    const pushed = await deps.pushCloudSave(userId, local);
    if (!pushed.ok) return { ok: false, error: pushed.message };
    return { ok: true, action };
  }

  if (action === 'download' && cloud) {
    deps.saveLocal(cloud);
    return { ok: true, action };
  }

  // action === 'ask' (both local and cloud have differing characters)
  const choice = await deps.askChoice(local, cloud!);
  const chosen = applyChoice(local, cloud!, choice);
  deps.saveLocal(chosen);
  const pushed = await deps.pushCloudSave(userId, chosen);
  if (!pushed.ok) return { ok: false, error: pushed.message };
  return { ok: true, action: 'ask' };
}
