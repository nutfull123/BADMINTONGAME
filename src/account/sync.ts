// Pure first-sign-in decisions between this browser's save and the account's save (design doc, Phase 5 detail).
import type { Character, SaveData, SyncAction, SyncChoice } from '../types';

// Key-order independent: jsonb in the cloud does not keep key order.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function decideSync(local: SaveData, cloud: SaveData | null): SyncAction {
  const hasLocal = local.characters.length > 0;
  const hasCloud = !!cloud && cloud.characters.length > 0;
  if (!hasCloud) return hasLocal ? 'upload' : 'none';
  if (!hasLocal) return 'download';
  return stable(local.characters) === stable(cloud.characters) ? 'none' : 'ask';
}

const tiers = (c: Character) => c.career?.unlocked ?? 1;

// On a clash by id: more earned points wins, then more tiers unlocked, then the local one.
function better(local: Character, cloud: Character): Character {
  if (cloud.earnedPoints !== local.earnedPoints) return cloud.earnedPoints > local.earnedPoints ? cloud : local;
  return tiers(cloud) > tiers(local) ? cloud : local;
}

export function mergeSaves(local: SaveData, cloud: SaveData): SaveData {
  const cloudById = new Map(cloud.characters.map((c) => [c.id, c]));
  const localIds = new Set(local.characters.map((c) => c.id));
  const characters = [
    ...local.characters.map((c) => { const o = cloudById.get(c.id); return o ? better(c, o) : c; }),
    ...cloud.characters.filter((c) => !localIds.has(c.id)),
  ];
  const wanted = local.activeCharacterId ?? cloud.activeCharacterId;
  const active = characters.some((c) => c.id === wanted) ? wanted : characters[0]?.id ?? null;
  return { version: 1, characters, activeCharacterId: active, settings: local.settings };
}

export function applyChoice(local: SaveData, cloud: SaveData, choice: SyncChoice): SaveData {
  return choice === 'cloud' ? cloud : choice === 'local' ? local : mergeSaves(local, cloud);
}
