// Orchestrates first-sign-in cloud sync using account/ pure decisions and injected side effects.
import type { AccountResult } from '../account/auth';
import { applyChoice, decideSync } from '../account/sync';
import type { SaveData, SyncAction, SyncChoice } from '../types';

export interface SyncFlowDeps {
  fetchCloudSave: (userId: string) => Promise<SaveData | null>;
  pushCloudSave: (userId: string, save: SaveData) => Promise<AccountResult>;
  saveLocal: (save: SaveData) => void;
  askChoice: (local: SaveData, cloud: SaveData) => Promise<SyncChoice>;
}

export type SyncFlowResult =
  | { ok: true; action: SyncAction; save: SaveData }
  | { ok: false; save: SaveData; error: string };

export async function runSignInSync(
  userId: string,
  local: SaveData,
  deps: SyncFlowDeps,
): Promise<SyncFlowResult> {
  let cloud: SaveData | null;
  try {
    cloud = await deps.fetchCloudSave(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'เชื่อมต่อคลาวด์ไม่สำเร็จ ลองใหม่อีกครั้ง';
    return { ok: false, save: local, error: message };
  }

  const action = decideSync(local, cloud);
  if (action === 'none') {
    return { ok: true, action, save: local };
  }

  if (action === 'upload') {
    const pushed = await deps.pushCloudSave(userId, local);
    if (!pushed.ok) return { ok: false, save: local, error: pushed.message };
    return { ok: true, action, save: local };
  }

  if (action === 'download' && cloud) {
    deps.saveLocal(cloud);
    return { ok: true, action, save: cloud };
  }

  // action === 'ask' (both local and cloud have differing characters)
  const choice = await deps.askChoice(local, cloud!);
  const chosen = applyChoice(local, cloud!, choice);
  deps.saveLocal(chosen);
  const pushed = await deps.pushCloudSave(userId, chosen);
  if (!pushed.ok) return { ok: false, save: chosen, error: pushed.message };
  return { ok: true, action: 'ask', save: chosen };
}
