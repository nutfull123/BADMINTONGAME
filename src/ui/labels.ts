// Pure labels, key formatting, conflict warning and character summary helpers for the app shell.
import type {
  AccountUser,
  BodyType,
  CameraPreset,
  Character,
  GameScore,
  Gender,
  GraphicsQuality,
  InputAction,
  KeyBindings,
  SaveData,
  TierId,
} from '../types';
import type { RoundName } from '../career';
import { heightOf } from '../sim/tuning';

export const ACTION_ORDER: readonly InputAction[] = [
  'up',
  'down',
  'left',
  'right',
  'backhand',
  'forehand',
  'smash',
  'drop',
  'clear',
  'jump',
  'dive',
  'net',
  'fullscreen',
  'zoomIn',
  'zoomOut',
];

export const ACTION_LABELS: Record<InputAction, string> = {
  up: 'เดินหน้า (Move Forward)',
  down: 'ถอยหลัง (Move Back)',
  left: 'เดินซ้าย (Move Left)',
  right: 'เดินขวา (Move Right)',
  backhand: 'ตีแบ็กแฮนด์ (Backhand)',
  forehand: 'ตีโฟร์แฮนด์ (Forehand)',
  smash: 'ตบชาร์จ (Smash)',
  drop: 'หยอด / เสิร์ฟสั้น (Drop / Short Serve)',
  clear: 'เคลียร์ / เสิร์ฟยาว (Clear / Long Serve)',
  jump: 'กระโดด (Jump)',
  dive: 'พุ่งรับ / กดรัวลุก (Dive / Get Up)',
  net: 'ลูกหน้าเน็ต (Net Shot)',
  fullscreen: 'เต็มจอ (Fullscreen)',
  zoomIn: 'ซูมเข้า (Zoom In)',
  zoomOut: 'ซูมออก (Zoom Out)',
};

export const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  shoulder: 'หลังไหล่ เล็งแบบ FPS',
  behindLow: 'หลังผู้เล่น มุมต่ำ',
  behindHigh: 'หลังผู้เล่น มุมสูง',
  broadcast: 'มุมถ่ายทอดสด',
};

export const GRAPHICS_QUALITY_LABELS: Record<GraphicsQuality, string> = {
  low: 'ต่ำ (Low)',
  medium: 'กลาง (Medium)',
  high: 'สูง (High)',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'ชาย (Male)',
  female: 'หญิง (Female)',
};

export const BODY_LABELS: Record<BodyType, string> = {
  tall: 'ตัวสูง (Tall)',
  balanced: 'สมดุล (Balanced)',
  short: 'ตัวเล็ก (Short)',
};

const SPECIAL_KEY_NAMES: Record<string, string> = {
  Mouse0: 'คลิกซ้าย (LMB)',
  Mouse2: 'คลิกขวา (RMB)',
  ShiftLeft: 'LShift',
  ShiftRight: 'RShift',
  AltLeft: 'LAlt',
  AltRight: 'RAlt',
  ControlLeft: 'LCtrl',
  ControlRight: 'RCtrl',
  Space: 'Space',
  Equal: '=',
  Minus: '-',
  NumpadAdd: 'Num+',
  NumpadSubtract: 'Num-',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function formatKeyCode(code: string): string {
  if (SPECIAL_KEY_NAMES[code]) return SPECIAL_KEY_NAMES[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}

export function formatBindingList(codes: readonly string[]): string {
  return codes.map(formatKeyCode).join(' / ');
}

// Movement reads best as "WASD" / "↑←↓→": single-character keys are joined without separators.
export function formatMovementHint(keys: KeyBindings): string {
  const shown = [...keys.up, ...keys.left, ...keys.down, ...keys.right].map(formatKeyCode);
  return shown.every((code) => code.length === 1) ? shown.join('') : shown.join(' / ');
}

// The Home screen hint, built from the saved bindings so it stays true after a rebind.
export function formatControlHints(keys: KeyBindings): string {
  return [
    'เมาส์เล็งหน้าไม้ + สะบัดทิศทาง',
    `${formatMovementHint(keys)} เคลื่อนที่`,
    `${formatBindingList(keys.backhand)}/${formatBindingList(keys.forehand)} ตีพื้นฐาน`,
    `${formatBindingList(keys.smash)} ค้าง = ตบ (Smash)`,
    `${formatBindingList(keys.drop)} ค้าง = หยอด/เสิร์ฟสั้น`,
    `${formatBindingList(keys.clear)} ค้าง = เคลียร์/เสิร์ฟยาว`,
    `${formatBindingList(keys.net)} = ลูกหน้าเน็ต`,
    `${formatBindingList(keys.jump)} ค้าง = กระโดด`,
    `${formatBindingList(keys.dive)} = พุ่งรับ/กดรัวเพื่อลุก`,
    `${formatBindingList(keys.fullscreen)} เต็มจอ · ${formatBindingList(keys.zoomIn)}/${formatBindingList(keys.zoomOut)} ซูม`,
  ].join(' · ');
}

export function formatConflictMessage(conflict: InputAction | null, code: string): string | null {
  if (!conflict) return null;
  return `คำเตือน: ปุ่ม "${formatKeyCode(code)}" ซ้ำกับ "${ACTION_LABELS[conflict]}"`;
}

export function formatCharacterSummary(c: Character): string {
  const h = heightOf(c.stats).toFixed(2);
  const g = c.stats.gender === 'male' ? 'ชาย' : 'หญิง';
  const b = BODY_LABELS[c.stats.body];
  return `${c.name} · ${g} · ${b} (${h}m)`;
}

export function matchesBinding(keys: KeyBindings, action: InputAction, code: string): boolean {
  return keys[action]?.includes(code) ?? false;
}

// ---------- Career & Progression labels ----------

export const TIER_LABELS: Record<TierId, string> = {
  club: 'คลับโอเพ่น (Club Open)',
  regional: 'รีเจียนนัลคัพ (Regional Cup)',
  national: 'เนชันแนลแชมเปียนชิพ (National Championship)',
  masters: 'แกรนด์มาสเตอร์ส (Grand Masters)',
};

export const ROUND_LABELS: Record<RoundName, string> = {
  R32: 'รอบ 32 ทีม (R32)',
  R16: 'รอบ 16 ทีม (R16)',
  QF: 'รอบก่อนรองฯ (QF)',
  SF: 'รอบรองชนะเลิศ (SF)',
  F: 'รอบชิงชนะเลิศ (Final)',
};

const ROUND_ORDER_FROM_FINAL: readonly RoundName[] = ['F', 'SF', 'QF', 'R16', 'R32'];

export function roundNameFor(roundIndex: number, totalRounds: number): RoundName {
  const left = Math.max(1, Math.min(ROUND_ORDER_FROM_FINAL.length, totalRounds - roundIndex));
  return ROUND_ORDER_FROM_FINAL[left - 1]!;
}

export function formatRoundReachedLabel(reached: number | undefined, bracketSize: 8 | 16 | 32): string {
  if (reached === undefined) return 'ยังไม่เคยลงแข่ง (Not played)';
  const totalRounds = Math.log2(bracketSize);
  if (reached >= totalRounds) return 'แชมป์ (Champion)';
  const rn = roundNameFor(reached, totalRounds);
  return ROUND_LABELS[rn];
}

export interface EarnedPointsSummary {
  earned: number;
  whole: number;
  progressPct: number;
  text: string;
  progressText: string;
}

export function formatEarnedPointsSummary(earnedPoints: number, maxEarned = 20): EarnedPointsSummary {
  const safe = Number.isFinite(earnedPoints) ? Math.max(0, Math.min(maxEarned, earnedPoints)) : 0;
  const whole = Math.floor(safe + 1e-9);
  const frac = Math.max(0, safe - whole);
  const isMax = whole >= maxEarned;
  const progressPct = isMax ? 100 : Math.round(frac * 100);
  const formatted = Number.isInteger(Math.round(safe * 1000) / 1000)
    ? String(Math.round(safe))
    : Number(safe.toFixed(4)).toString();
  return {
    earned: safe,
    whole,
    progressPct,
    text: `แต้มสะสม: ${formatted} / ${maxEarned} (+${whole} แต้มพลัง)`,
    progressText: isMax
      ? 'แต้มสะสมเต็มแล้ว (Max 20/20)'
      : `ความคืบหน้าแต้มถัดไป ${progressPct}%`,
  };
}

export function formatPlayerSideScore(storedScore: string | null, playerIsEntrantA: boolean): string {
  if (!storedScore) return '—';
  if (playerIsEntrantA) return storedScore;
  return storedScore
    .split(' ')
    .map((game) => game.split('-').reverse().join('-'))
    .join(' ');
}

export function formatMatchScoreForCareer(games: readonly GameScore[]): string {
  return games.map((g) => `${g.near}-${g.far}`).join(' ');
}

// ---------- Account & Cloud Sync labels ----------

export function formatAccountBadge(user: AccountUser | null | undefined): string {
  if (!user) return 'ผู้เล่นทั่วไป (Guest)';
  return user.email ? `บัญชี: ${user.email}` : 'บัญชีออนไลน์ (Signed In)';
}

export function validateAccountForm(
  mode: 'signin' | 'signup',
  email: string,
  password: string,
  consentChecked: boolean,
): string | null {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) {
    return 'กรุณากรอกอีเมลให้ถูกต้อง (Please enter a valid email)';
  }
  if (password.length < 8) {
    return 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร (Password must be at least 8 characters)';
  }
  if (mode === 'signup' && !consentChecked) {
    return 'กรุณาอ่านและยอมรับนโยบายความเป็นส่วนตัวก่อนสมัครสมาชิก';
  }
  return null;
}

export function formatSaveSyncSummary(save: SaveData): string {
  if (save.characters.length === 0) return 'ไม่มีตัวละคร (0 ตัวละคร)';
  return save.characters
    .map((c) => {
      const pts = Number.isInteger(Math.round(c.earnedPoints * 1000) / 1000)
        ? String(Math.round(c.earnedPoints))
        : Number(c.earnedPoints.toFixed(2)).toString();
      const tiers = c.career?.unlocked ?? 1;
      return `${c.name} (+${pts}/20 แต้ม · ทัวร์นาเมนต์เปิด ${tiers}/4 ระดับ)`;
    })
    .join(' · ');
}
