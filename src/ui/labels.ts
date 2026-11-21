// Pure labels, key formatting, conflict warning and character summary helpers for the app shell.
import type {
  BodyType,
  CameraPreset,
  Character,
  Gender,
  GraphicsQuality,
  InputAction,
  KeyBindings,
} from '../types';
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
