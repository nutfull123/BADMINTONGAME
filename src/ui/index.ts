import type {
  BodyType,
  CameraPreset,
  Character,
  GameSettings,
  Gender,
  GraphicsQuality,
  InputAction,
  MatchEvent,
  MatchSettings,
  MatchState,
  SaveData,
  Side,
  Stats,
} from '../types';
import {
  activeCharacter,
  characterBudget,
  createCharacter,
  deleteCharacter,
  setActiveCharacter,
  statsError,
  updateCharacter,
} from '../app/characters';
import { loadSave } from '../app/save';
import {
  CAMERA_PRESETS,
  DEFAULT_KEYS,
  GRAPHICS_QUALITIES,
  LIMITS,
  rebindKey,
  toMatchSettings,
} from '../app/settings';
import { heightOf } from '../sim/tuning';
import { EVENTS, eventsFor, fitEvent } from './events';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  BODY_LABELS,
  CAMERA_PRESET_LABELS,
  formatBindingList,
  formatCharacterSummary,
  formatConflictMessage,
  GENDER_LABELS,
  GRAPHICS_QUALITY_LABELS,
  matchesBinding,
} from './labels';

export const STAT_BUDGET = 20;

export type StatKey = 'speed' | 'power' | 'recovery' | 'stamina';

// The flat settings a match reads; the full settings model lives in app/ (GameSettings).
export type Settings = MatchSettings;

export const DEFAULT_SETTINGS: Settings = {
  hitAssist: 70,
  landingMarker: true,
  timingRing: true,
  format: '3x15',
  botLevel: 'medium',
  mode: 'easy',
  event: 'MS',
};

const MODE_DESC: Record<Settings['mode'], string> = {
  easy: 'ไม้ตีอัตโนมัติ + WASD ช่วยดึงไปจุดตก + เกมช้าลง 0.75x',
  normal: 'ไม้ตีอัตโนมัติ + เดินเองด้วย WASD',
  pro: 'คุมไม้ด้วยเมาส์เอง + เดินด้วย WASD (แบบเดิม)',
  timing: 'เดินและไม้อัตโนมัติทั้งหมด แค่กดจังหวะตี (WASD ไม่ทำงาน)',
};

export const PRESETS: Record<BodyType, Stats> = {
  tall: { gender: 'male', body: 'tall', speed: 3, power: 8, recovery: 3, stamina: 6 },
  balanced: { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
  short: { gender: 'male', body: 'short', speed: 8, power: 3, recovery: 4, stamina: 5 },
};

export function budgetLeft(stats: Stats, budget = STAT_BUDGET): number {
  return budget - (stats.speed + stats.power + stats.recovery + stats.stamina);
}

export function clampStatToBudget(
  stats: Stats,
  key: StatKey,
  requestedValue: number,
  budget = STAT_BUDGET,
): Stats {
  const clamped0To10 = Math.max(0, Math.min(10, Math.round(requestedValue)));
  const othersTotal =
    stats.speed + stats.power + stats.recovery + stats.stamina - stats[key];
  const maxAllowed = Math.max(0, Math.min(10, budget - othersTotal));
  const finalVal = Math.min(clamped0To10, maxAllowed);
  return { ...stats, [key]: finalVal };
}

const STYLE_ID = 'badminton-ui-styles';

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .bm-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, rgba(16, 28, 56, 0.88), rgba(6, 10, 22, 0.96));
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif;
      z-index: 30;
      user-select: none;
    }
    .bm-panel {
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 16px;
      padding: 32px 36px;
      width: min(780px, 92vw);
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
    }
    .bm-title {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      color: #f8fafc;
    }
    .bm-subtitle {
      font-size: 16px;
      color: #94a3b8;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }
    .bm-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }
    .bm-active-char-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: rgba(30, 41, 59, 0.72);
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 24px;
    }
    .bm-active-char-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bm-active-char-tag {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #38bdf8;
    }
    .bm-active-char-name {
      font-size: 20px;
      font-weight: 800;
      color: #f8fafc;
    }
    .bm-btn-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bm-menu-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .bm-btn {
      cursor: pointer;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: #1e293b;
      color: #f8fafc;
      font-size: 16px;
      font-weight: 700;
      padding: 13px 22px;
      border-radius: 10px;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .bm-btn:hover:not(:disabled) {
      background: #334155;
      border-color: #64748b;
    }
    .bm-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .bm-btn-primary {
      background: #22c55e;
      color: #052e16;
      border-color: #4ade80;
    }
    .bm-btn-primary:hover:not(:disabled) {
      background: #4ade80;
      border-color: #86efac;
    }
    .bm-btn-danger {
      background: rgba(239, 68, 68, 0.18);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.45);
    }
    .bm-btn-danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.32);
      border-color: #f87171;
    }
    .bm-btn-active {
      background: #38bdf8;
      color: #082f49;
      border-color: #7dd3fc;
    }
    .bm-btn-sm {
      font-size: 14px;
      padding: 8px 14px;
      border-radius: 8px;
    }
    .bm-btn:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }
    .bm-soon-pill {
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
    }
    .bm-section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin: 22px 0 12px 0;
    }
    .bm-budget-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 20px 0 10px 0;
    }
    .bm-budget-badge {
      font-variant-numeric: tabular-nums;
      font-size: 20px;
      font-weight: 800;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      padding: 4px 14px;
      border-radius: 999px;
    }
    .bm-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 20px;
    }
    .bm-slider-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: rgba(30, 41, 59, 0.55);
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.14);
    }
    .bm-slider-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 600;
    }
    .bm-slider-val {
      font-variant-numeric: tabular-nums;
      font-size: 22px;
      font-weight: 800;
      color: #f8fafc;
    }
    .bm-slider {
      width: 100%;
      accent-color: #38bdf8;
      cursor: pointer;
    }
    .bm-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(30, 41, 59, 0.55);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      font-size: 15px;
      flex-wrap: wrap;
    }
    .bm-chip-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .bm-chip {
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: #0f172a;
      color: #cbd5e1;
      font-size: 14px;
      font-weight: 600;
    }
    .bm-chip.active {
      background: #38bdf8;
      color: #082f49;
      border-color: #7dd3fc;
    }
    .bm-input {
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #f8fafc;
      font-size: 16px;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 8px;
      width: 100%;
      box-sizing: border-box;
    }
    .bm-input:focus {
      outline: 2px solid #38bdf8;
      border-color: transparent;
    }
    .bm-notice {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: rgba(245, 158, 11, 0.16);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fde68a;
    }
    .bm-error {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
    }
    .bm-char-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
    }
    .bm-char-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      background: rgba(30, 41, 59, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
      flex-wrap: wrap;
    }
    .bm-char-card.active {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
    }
    .bm-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      padding-bottom: 12px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .bm-key-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    /* HUD */
    .bm-fs-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 30;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      background: rgba(15,23,42,0.6);
      color: #f8fafc;
      font-size: 20px;
      cursor: pointer;
    }
    .bm-fs-btn:hover { background: rgba(15,23,42,0.85); }
    .bm-hud {
      position: fixed;
      inset: 0;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif;
      color: #f8fafc;
      z-index: 20;
      user-select: none;
    }
    .bm-scoreboard {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 14px;
      padding: 10px 24px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .bm-side-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bm-side-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bm-side-label {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bm-serve-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      background: #22c55e;
      color: #052e16;
    }
    .bm-games-pill {
      font-size: 13px;
      font-weight: 700;
      color: #cbd5e1;
    }
    .bm-big-score {
      font-size: 46px;
      font-weight: 900;
      line-height: 1;
      color: #f8fafc;
      min-width: 56px;
      text-align: center;
    }
    .bm-score-divider {
      font-size: 28px;
      font-weight: 700;
      color: #64748b;
    }
    .bm-hud-bars {
      position: absolute;
      bottom: 24px;
      left: 28px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 260px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 12px;
      padding: 12px 16px;
    }
    .bm-bar-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bm-bar-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 700;
      color: #cbd5e1;
      font-variant-numeric: tabular-nums;
    }
    .bm-bar-track {
      width: 100%;
      height: 12px;
      background: rgba(30, 41, 59, 0.95);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .bm-bar-fill {
      height: 100%;
      width: 100%;
      transform-origin: left center;
      transition: width 60ms linear;
    }
    .bm-center-msg {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 14px;
      padding: 18px 32px;
      font-size: 26px;
      font-weight: 800;
      color: #f8fafc;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      max-width: 80vw;
    }
    .bm-keys-hint {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}

function clearOverlays(root: HTMLElement): void {
  const existing = root.querySelectorAll('.bm-overlay');
  existing.forEach((el) => el.remove());
}

function mountOverlay(root: HTMLElement): { overlay: HTMLElement; panel: HTMLElement } {
  ensureStyles();
  clearOverlays(root);
  const overlay = document.createElement('div');
  overlay.className = 'bm-overlay';
  const panel = document.createElement('div');
  panel.className = 'bm-panel';
  overlay.appendChild(panel);
  root.appendChild(overlay);
  return { overlay, panel };
}

function appendStorageNotice(parent: HTMLElement, savedOk: boolean): void {
  const existing = parent.querySelector('[data-testid="storage-warning"]');
  if (savedOk) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const warn = document.createElement('div');
  warn.className = 'bm-notice';
  warn.dataset.testid = 'storage-warning';
  warn.textContent = 'ไม่สามารถบันทึกการตั้งค่าลงเบราว์เซอร์นี้ได้ (Storage unavailable)';
  parent.appendChild(warn);
}

// ---------- 1. Home screen ----------

export function showHome(root: HTMLElement, onPlayGuest: () => void): void {
  const { overlay, panel } = mountOverlay(root);

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.textContent = 'BADMINTON 3D · แบดมินตัน 3 มิติ';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.textContent =
    'ควบคุมหน้าไม้ด้วยเมาส์ · ฟุตเวิร์กสมจริง (Split Step / Chasse / Lunge) · เดี่ยวและคู่ครบทั้ง 5 ประเภท (MS · WS · MD · WD · XD)';

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'bm-btn bm-btn-primary';
  playBtn.dataset.testid = 'home-play-guest';
  playBtn.textContent = 'เล่นเลย (ไม่ต้องล็อกอิน)';
  playBtn.addEventListener('click', () => {
    overlay.remove();
    onPlayGuest();
  });

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'bm-btn';
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span>เข้าสู่ระบบ / สมัคร</span><span class="bm-soon-pill">เร็วๆ นี้</span>';

  btnRow.append(playBtn, loginBtn);

  const hint = document.createElement('div');
  hint.className = 'bm-keys-hint';
  hint.textContent =
    'WASD เคลื่อนที่ · เมาส์เล็งหน้าไม้ + สะบัดทิศทาง · Q/E ตีพื้นฐาน · คลิกซ้ายค้าง = ตบ (Smash) · คลิกขวาค้าง = หยอด/เสิร์ฟสั้น · LShift ค้าง = เคลียร์/เสิร์ฟยาว · Alt = ลูกหน้าเน็ต · Space ค้าง = กระโดด · C = พุ่งรับ/กดรัวเพื่อลุก';

  panel.append(title, sub, btnRow, hint);
}

// ---------- 2. Main menu ----------

export interface MainMenuActions {
  onPlayMatch: () => void;
  onTutorial: () => void;
  onCharacters: () => void;
  onSettings: () => void;
}

export function showMainMenu(root: HTMLElement, save: SaveData, actions: MainMenuActions): void {
  const active = activeCharacter(save);
  if (!active) {
    actions.onCharacters();
    return;
  }

  const { overlay, panel } = mountOverlay(root);

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '32px';
  title.textContent = 'เมนูหลัก (Main Menu)';

  // Active character header
  const charBar = document.createElement('div');
  charBar.className = 'bm-active-char-bar';

  const charInfo = document.createElement('div');
  charInfo.className = 'bm-active-char-info';
  const charTag = document.createElement('div');
  charTag.className = 'bm-active-char-tag';
  charTag.textContent = 'นักกีฬาที่ใช้งาน (Active Character)';
  const charName = document.createElement('div');
  charName.className = 'bm-active-char-name';
  charName.dataset.testid = 'active-character-summary';
  charName.textContent = formatCharacterSummary(active);
  charInfo.append(charTag, charName);

  const changeCharBtn = document.createElement('button');
  changeCharBtn.type = 'button';
  changeCharBtn.className = 'bm-btn bm-btn-sm';
  changeCharBtn.textContent = 'เปลี่ยน';
  changeCharBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onCharacters();
  });

  charBar.append(charInfo, changeCharBtn);

  // Menu buttons
  const grid = document.createElement('div');
  grid.className = 'bm-menu-grid';

  const matchBtn = document.createElement('button');
  matchBtn.type = 'button';
  matchBtn.className = 'bm-btn bm-btn-primary';
  matchBtn.dataset.testid = 'menu-play-bots';
  matchBtn.textContent = 'แข่งกับบอท';
  matchBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onPlayMatch();
  });

  const tutBtn = document.createElement('button');
  tutBtn.type = 'button';
  tutBtn.className = 'bm-btn';
  tutBtn.dataset.testid = 'menu-tutorial';
  tutBtn.textContent = 'ฝึกสอน 8 ท่า';
  tutBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onTutorial();
  });

  const onlineBtn = document.createElement('button');
  onlineBtn.type = 'button';
  onlineBtn.className = 'bm-btn';
  onlineBtn.disabled = true;
  onlineBtn.innerHTML = '<span>ออนไลน์</span><span class="bm-soon-pill">เร็วๆ นี้</span>';

  const tourBtn = document.createElement('button');
  tourBtn.type = 'button';
  tourBtn.className = 'bm-btn';
  tourBtn.disabled = true;
  tourBtn.innerHTML = '<span>ทัวร์นาเมนต์</span><span class="bm-soon-pill">เร็วๆ นี้</span>';

  const charsBtn = document.createElement('button');
  charsBtn.type = 'button';
  charsBtn.className = 'bm-btn';
  charsBtn.dataset.testid = 'menu-characters';
  charsBtn.textContent = 'ตัวละครของฉัน';
  charsBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onCharacters();
  });

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'bm-btn';
  settingsBtn.dataset.testid = 'menu-settings';
  settingsBtn.textContent = 'ตั้งค่า';
  settingsBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onSettings();
  });

  grid.append(matchBtn, tutBtn, onlineBtn, tourBtn, charsBtn, settingsBtn);
  panel.append(title, charBar, grid);
}

// ---------- 3. Play vs Bots (แข่งกับบอท) ----------

export function showMatchSetup(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onStartMatch: (cfg: { stats: Stats; settings: MatchSettings }) => void,
  onBack: () => void,
): void {
  const active = activeCharacter(save);
  if (!active) {
    onBack();
    return;
  }

  const { overlay, panel } = mountOverlay(root);
  let currentSave = save;
  const fittedEvent = fitEvent(currentSave.settings.match.event, active.stats.gender);
  if (fittedEvent !== currentSave.settings.match.event) {
    currentSave = {
      ...currentSave,
      settings: {
        ...currentSave.settings,
        match: { ...currentSave.settings.match, event: fittedEvent },
      },
    };
    const ok = onSaveChange(currentSave);
    appendStorageNotice(panel, ok);
  }

  const headerBar = document.createElement('div');
  headerBar.className = 'bm-header-bar';
  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '30px';
  title.style.margin = '0';
  title.textContent = 'แข่งกับบอท (Play vs Bots)';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'bm-btn bm-btn-sm';
  backBtn.textContent = '← กลับเมนูหลัก';
  backBtn.addEventListener('click', () => {
    overlay.remove();
    onBack();
  });
  headerBar.append(title, backBtn);

  const charSummary = document.createElement('div');
  charSummary.className = 'bm-subtitle';
  charSummary.style.marginBottom = '16px';
  charSummary.textContent = `นักกีฬา: ${formatCharacterSummary(active)}`;

  const persistMatchPatch = (patch: Partial<GameSettings['match']>) => {
    currentSave = {
      ...currentSave,
      settings: {
        ...currentSave.settings,
        match: { ...currentSave.settings.match, ...patch },
      },
    };
    const ok = onSaveChange(currentSave);
    appendStorageNotice(panel, ok);
  };

  // Event picker filtered by active character gender
  const eventHeader = document.createElement('div');
  eventHeader.className = 'bm-section-title';
  eventHeader.textContent = 'ประเภทการแข่งขัน (Event)';
  const eventRow = document.createElement('div');
  eventRow.className = 'bm-btn-row';
  const validEvents = eventsFor(active.stats.gender);
  const eventButtons = new Map<MatchEvent, HTMLButtonElement>();

  EVENTS.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bm-btn${currentSave.settings.match.event === value ? ' bm-btn-active' : ''}`;
    btn.dataset.event = value;
    btn.textContent = label;
    btn.disabled = !validEvents.includes(value);
    btn.addEventListener('click', () => {
      if (!validEvents.includes(value)) return;
      persistMatchPatch({ event: value });
      eventButtons.forEach((b, e) => b.classList.toggle('bm-btn-active', e === value));
    });
    eventButtons.set(value, btn);
    eventRow.appendChild(btn);
  });

  const grid = document.createElement('div');
  grid.className = 'bm-grid-2';
  grid.style.marginTop = '18px';

  const botRow = buildChipSetting<'easy' | 'medium' | 'hard'>(
    'ความเก่งบอท (Bot Level)',
    [
      { value: 'easy', label: 'ง่าย (Easy)' },
      { value: 'medium', label: 'กลาง (Medium)' },
      { value: 'hard', label: 'ยาก (Hard)' },
    ],
    currentSave.settings.match.botLevel,
    (v) => persistMatchPatch({ botLevel: v }),
  );

  const formatRow = buildChipSetting<'3x15' | '3x21'>(
    'ระบบแต้ม (Format)',
    [
      { value: '3x15', label: '3×15 (BWF ใหม่)' },
      { value: '3x21', label: '3×21 (ดั้งเดิม)' },
    ],
    currentSave.settings.match.format,
    (v) => persistMatchPatch({ format: v }),
  );

  grid.append(botRow, formatRow);

  const footer = document.createElement('div');
  footer.className = 'bm-btn-row';
  footer.style.marginTop = '28px';
  footer.style.justifyContent = 'flex-end';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'bm-btn bm-btn-primary';
  startBtn.dataset.testid = 'match-start';
  startBtn.textContent = 'ลงสนาม (Start Match)';
  startBtn.addEventListener('click', () => {
    overlay.remove();
    onStartMatch({
      stats: { ...active.stats },
      settings: toMatchSettings(currentSave.settings),
    });
  });

  footer.appendChild(startBtn);
  panel.append(headerBar, charSummary, eventHeader, eventRow, grid, footer);
}

// ---------- 5. My Characters (ตัวละครของฉัน) ----------

export function showCharacters(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onBackToMenu: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  let currentSave = save;
  let editingId: string | 'new' | null = currentSave.characters.length === 0 ? 'new' : null;
  let confirmingDeleteId: string | null = null;

  function commitSave(next: SaveData): void {
    currentSave = next;
    const ok = onSaveChange(currentSave);
    appendStorageNotice(panel, ok);
  }

  function renderPage(): void {
    panel.innerHTML = '';

    const headerBar = document.createElement('div');
    headerBar.className = 'bm-header-bar';
    const title = document.createElement('h1');
    title.className = 'bm-title';
    title.style.fontSize = '30px';
    title.style.margin = '0';
    title.textContent = 'ตัวละครของฉัน (My Characters)';

    if (currentSave.characters.length > 0) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'bm-btn bm-btn-sm';
      backBtn.textContent = '← กลับเมนูหลัก';
      backBtn.addEventListener('click', () => {
        overlay.remove();
        onBackToMenu();
      });
      headerBar.append(title, backBtn);
    } else {
      headerBar.appendChild(title);
    }
    panel.appendChild(headerBar);

    if (currentSave.characters.length === 0) {
      const welcome = document.createElement('p');
      welcome.className = 'bm-subtitle';
      welcome.textContent = 'สร้างนักกีฬาคนแรกของคุณเพื่อเริ่มเล่น';
      panel.appendChild(welcome);
    } else {
      const list = document.createElement('div');
      list.className = 'bm-char-list';

      currentSave.characters.forEach((c) => {
        const isActive = c.id === currentSave.activeCharacterId;
        const card = document.createElement('div');
        card.className = `bm-char-card${isActive ? ' active' : ''}`;

        const info = document.createElement('div');
        const nameLine = document.createElement('div');
        nameLine.style.fontSize = '18px';
        nameLine.style.fontWeight = '800';
        nameLine.textContent = formatCharacterSummary(c);
        const statsLine = document.createElement('div');
        statsLine.style.fontSize = '13px';
        statsLine.style.color = '#94a3b8';
        statsLine.textContent = `ความเร็ว ${c.stats.speed} · พลังตบ ${c.stats.power} · ฟื้นตัว ${c.stats.recovery} · ความอึด ${c.stats.stamina}`;
        info.append(nameLine, statsLine);

        const actionsRow = document.createElement('div');
        actionsRow.className = 'bm-btn-row';

        if (confirmingDeleteId === c.id) {
          const confirmLabel = document.createElement('span');
          confirmLabel.style.fontSize = '14px';
          confirmLabel.style.color = '#fca5a5';
          confirmLabel.style.alignSelf = 'center';
          confirmLabel.textContent = 'ยืนยันการลบ?';

          const yesBtn = document.createElement('button');
          yesBtn.type = 'button';
          yesBtn.className = 'bm-btn bm-btn-sm bm-btn-danger';
          yesBtn.dataset.testid = `confirm-delete-${c.id}`;
          yesBtn.textContent = 'ลบเลย';
          yesBtn.addEventListener('click', () => {
            confirmingDeleteId = null;
            commitSave(deleteCharacter(currentSave, c.id));
            if (editingId === c.id) editingId = null;
            if (currentSave.characters.length === 0) editingId = 'new';
            renderPage();
          });

          const noBtn = document.createElement('button');
          noBtn.type = 'button';
          noBtn.className = 'bm-btn bm-btn-sm';
          noBtn.textContent = 'ยกเลิก';
          noBtn.addEventListener('click', () => {
            confirmingDeleteId = null;
            renderPage();
          });

          actionsRow.append(confirmLabel, yesBtn, noBtn);
        } else {
          const useBtn = document.createElement('button');
          useBtn.type = 'button';
          useBtn.className = `bm-btn bm-btn-sm${isActive ? ' bm-btn-active' : ''}`;
          useBtn.textContent = isActive ? 'กำลังใช้งาน' : 'เลือกใช้';
          useBtn.disabled = isActive;
          useBtn.addEventListener('click', () => {
            commitSave(setActiveCharacter(currentSave, c.id));
            renderPage();
          });

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'bm-btn bm-btn-sm';
          editBtn.textContent = 'แก้ไข';
          editBtn.addEventListener('click', () => {
            editingId = c.id;
            confirmingDeleteId = null;
            renderPage();
          });

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'bm-btn bm-btn-sm bm-btn-danger';
          delBtn.textContent = 'ลบ';
          delBtn.addEventListener('click', () => {
            confirmingDeleteId = c.id;
            renderPage();
          });

          actionsRow.append(useBtn, editBtn, delBtn);
        }

        card.append(info, actionsRow);
        list.appendChild(card);
      });

      panel.appendChild(list);

      if (editingId === null) {
        const createNewBtn = document.createElement('button');
        createNewBtn.type = 'button';
        createNewBtn.className = 'bm-btn bm-btn-primary';
        createNewBtn.textContent = '+ สร้างตัวละครใหม่';
        createNewBtn.addEventListener('click', () => {
          editingId = 'new';
          renderPage();
        });
        panel.appendChild(createNewBtn);
      }
    }

    if (editingId !== null) {
      const targetChar =
        editingId === 'new'
          ? null
          : currentSave.characters.find((c) => c.id === editingId) ?? null;
      renderCharacterForm(targetChar);
    }
  }

  function renderCharacterForm(existing: Character | null): void {
    const isNew = existing === null;
    const budget = existing ? characterBudget(existing) : STAT_BUDGET;
    let draftName = existing ? existing.name : 'Player 1';
    let draftStats: Stats = existing ? { ...existing.stats } : { ...PRESETS.balanced };

    const formBox = document.createElement('div');
    formBox.style.marginTop = '20px';
    formBox.style.paddingTop = '18px';
    formBox.style.borderTop = '1px solid rgba(148, 163, 184, 0.2)';

    const formTitle = document.createElement('div');
    formTitle.className = 'bm-section-title';
    formTitle.style.marginTop = '0';
    formTitle.textContent = isNew ? 'สร้างตัวละครใหม่ (Create Character)' : `แก้ไขตัวละคร: ${existing.name}`;
    formBox.appendChild(formTitle);

    // Name input
    const nameRow = document.createElement('div');
    nameRow.style.marginBottom = '16px';
    const nameLabel = document.createElement('div');
    nameLabel.style.fontSize = '14px';
    nameLabel.style.fontWeight = '600';
    nameLabel.style.marginBottom = '6px';
    nameLabel.textContent = 'ชื่อนักกีฬา (Name)';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.className = 'bm-input';
    nameInput.value = draftName;
    nameInput.placeholder = 'ชื่อนักกีฬา';
    nameInput.addEventListener('input', () => {
      draftName = nameInput.value;
    });
    nameRow.append(nameLabel, nameInput);
    formBox.appendChild(nameRow);

    // Gender & Body (editable on create, locked on edit)
    const genderHeader = document.createElement('div');
    genderHeader.className = 'bm-section-title';
    genderHeader.textContent = isNew ? 'เพศ (Gender)' : 'เพศ (Gender · ล็อกหลังสร้าง)';
    const genderRow = document.createElement('div');
    genderRow.className = 'bm-btn-row';
    const genderButtons = new Map<Gender, HTMLButtonElement>();
    (['male', 'female'] as Gender[]).forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bm-btn bm-btn-sm';
      btn.dataset.gender = g;
      btn.textContent = GENDER_LABELS[g];
      btn.disabled = !isNew;
      btn.addEventListener('click', () => {
        if (!isNew) return;
        draftStats = { ...draftStats, gender: g };
        refreshFormUI();
      });
      genderButtons.set(g, btn);
      genderRow.appendChild(btn);
    });

    const bodyHeader = document.createElement('div');
    bodyHeader.className = 'bm-section-title';
    bodyHeader.textContent = isNew ? 'รูปร่าง (Body Preset)' : 'รูปร่าง (Body · ล็อกหลังสร้าง)';
    const bodyRow = document.createElement('div');
    bodyRow.className = 'bm-btn-row';
    const bodyButtons = new Map<BodyType, HTMLButtonElement>();
    (['tall', 'balanced', 'short'] as BodyType[]).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bm-btn bm-btn-sm';
      btn.dataset.preset = b;
      btn.disabled = !isNew;
      btn.addEventListener('click', () => {
        if (!isNew) return;
        draftStats = { ...PRESETS[b], gender: draftStats.gender };
        refreshFormUI();
      });
      bodyButtons.set(b, btn);
      bodyRow.appendChild(btn);
    });

    // Budget header
    const budgetHeader = document.createElement('div');
    budgetHeader.className = 'bm-budget-header';
    const budgetTitle = document.createElement('div');
    budgetTitle.className = 'bm-section-title';
    budgetTitle.style.margin = '0';
    budgetTitle.textContent = `ค่าพลัง (Stats 0–10 · งบ ${budget} แต้ม)`;
    const budgetBadge = document.createElement('div');
    budgetBadge.className = 'bm-budget-badge';
    budgetBadge.dataset.testid = 'points-left';
    budgetHeader.append(budgetTitle, budgetBadge);

    // 4 stat sliders
    const slidersGrid = document.createElement('div');
    slidersGrid.className = 'bm-grid-2';
    const statMeta: Array<{ key: StatKey; label: string }> = [
      { key: 'speed', label: 'ความเร็ว (Speed)' },
      { key: 'power', label: 'พลังตบ (Power)' },
      { key: 'recovery', label: 'ฟื้นตัว/ลุกเร็ว (Recovery)' },
      { key: 'stamina', label: 'ความอึด (Stamina)' },
    ];
    const sliderInputs: Partial<Record<StatKey, HTMLInputElement>> = {};
    const sliderValues: Partial<Record<StatKey, HTMLElement>> = {};

    statMeta.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'bm-slider-row';
      const top = document.createElement('div');
      top.className = 'bm-slider-top';
      const lbl = document.createElement('label');
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = 'bm-slider-val';
      sliderValues[key] = val;
      top.append(lbl, val);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '10';
      input.step = '1';
      input.className = 'bm-slider';
      input.dataset.stat = key;
      sliderInputs[key] = input;
      input.addEventListener('input', () => {
        draftStats = clampStatToBudget(draftStats, key, Number(input.value), budget);
        refreshFormUI();
      });
      row.append(top, input);
      slidersGrid.appendChild(row);
    });

    const errBox = document.createElement('div');
    errBox.className = 'bm-error';
    errBox.dataset.testid = 'stats-error';
    errBox.style.display = 'none';

    const footer = document.createElement('div');
    footer.className = 'bm-btn-row';
    footer.style.marginTop = '22px';
    footer.style.justifyContent = 'flex-end';

    if (currentSave.characters.length > 0) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'bm-btn';
      cancelBtn.textContent = 'ยกเลิก';
      cancelBtn.addEventListener('click', () => {
        editingId = null;
        renderPage();
      });
      footer.appendChild(cancelBtn);
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'bm-btn bm-btn-primary';
    saveBtn.dataset.testid = 'character-save';
    saveBtn.textContent = isNew ? 'สร้างตัวละคร' : 'บันทึกการแก้ไข';
    saveBtn.addEventListener('click', () => {
      const err = statsError(draftStats, budget);
      if (err !== null) {
        refreshFormUI();
        return;
      }
      const hadNone = currentSave.characters.length === 0;
      if (isNew) {
        const created = createCharacter(currentSave, draftName, draftStats);
        const newest = created.characters[created.characters.length - 1];
        commitSave(newest ? setActiveCharacter(created, newest.id) : created);
      } else {
        commitSave(updateCharacter(currentSave, existing.id, { name: draftName, stats: draftStats }));
      }
      editingId = null;
      if (hadNone) {
        overlay.remove();
        onBackToMenu();
      } else {
        renderPage();
      }
    });
    footer.appendChild(saveBtn);

    function refreshFormUI(): void {
      const left = budgetLeft(draftStats, budget);
      budgetBadge.textContent = `แต้มคงเหลือ: ${left} / ${budget}`;
      genderButtons.forEach((btn, g) => btn.classList.toggle('bm-btn-active', draftStats.gender === g));
      bodyButtons.forEach((btn, b) => {
        btn.classList.toggle('bm-btn-active', draftStats.body === b);
        btn.textContent = `${BODY_LABELS[b]} ${heightOf({ gender: draftStats.gender, body: b }).toFixed(2)}m`;
      });
      statMeta.forEach(({ key }) => {
        const inp = sliderInputs[key];
        const valEl = sliderValues[key];
        if (inp) inp.value = String(draftStats[key]);
        if (valEl) valEl.textContent = String(draftStats[key]);
      });

      const err = statsError(draftStats, budget);
      if (err) {
        errBox.style.display = 'block';
        errBox.textContent = err;
        saveBtn.disabled = true;
      } else {
        errBox.style.display = 'none';
        errBox.textContent = '';
        saveBtn.disabled = false;
      }
    }

    refreshFormUI();
    formBox.append(
      genderHeader,
      genderRow,
      bodyHeader,
      bodyRow,
      budgetHeader,
      slidersGrid,
      errBox,
      footer,
    );
    panel.appendChild(formBox);
  }

  renderPage();
}

// ---------- 6. Settings with tabs (ตั้งค่า) ----------

type SettingsTab = 'camera' | 'controls' | 'assists' | 'graphics';

export function showSettingsPage(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onBack: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  let currentSave = save;
  let activeTab: SettingsTab = 'camera';
  let listeningAction: InputAction | null = null;
  let conflictNotice: string | null = null;
  let cleanupCapture: (() => void) | null = null;

  function stopListening(): void {
    if (cleanupCapture) {
      cleanupCapture();
      cleanupCapture = null;
    }
    listeningAction = null;
  }

  function updateSettings(mutator: (s: GameSettings) => GameSettings): void {
    const cloned = structuredClone(currentSave.settings);
    currentSave = { ...currentSave, settings: mutator(cloned) };
    const ok = onSaveChange(currentSave);
    appendStorageNotice(panel, ok);
  }

  function renderTabs(): void {
    stopListening();
    panel.innerHTML = '';

    const headerBar = document.createElement('div');
    headerBar.className = 'bm-header-bar';
    const title = document.createElement('h1');
    title.className = 'bm-title';
    title.style.fontSize = '30px';
    title.style.margin = '0';
    title.textContent = 'ตั้งค่า (Settings)';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'bm-btn bm-btn-sm';
    backBtn.textContent = '← กลับเมนูหลัก';
    backBtn.addEventListener('click', () => {
      stopListening();
      overlay.remove();
      onBack();
    });
    headerBar.append(title, backBtn);

    const tabsBar = document.createElement('div');
    tabsBar.className = 'bm-tabs';
    const tabs: Array<{ id: SettingsTab; label: string }> = [
      { id: 'camera', label: 'กล้อง (Camera)' },
      { id: 'controls', label: 'การควบคุม (Controls)' },
      { id: 'assists', label: 'ตัวช่วย (Assists)' },
      { id: 'graphics', label: 'ภาพ (Graphics)' },
    ];
    tabs.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bm-btn bm-btn-sm${activeTab === t.id ? ' bm-btn-active' : ''}`;
      btn.dataset.tab = t.id;
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        activeTab = t.id;
        conflictNotice = null;
        renderTabs();
      });
      tabsBar.appendChild(btn);
    });

    const body = document.createElement('div');
    if (activeTab === 'camera') renderCameraTab(body);
    else if (activeTab === 'controls') renderControlsTab(body);
    else if (activeTab === 'assists') renderAssistsTab(body);
    else renderGraphicsTab(body);

    panel.append(headerBar, tabsBar, body);
  }

  function renderCameraTab(container: HTMLElement): void {
    const cam = currentSave.settings.camera;
    const presetRow = buildChipSetting<CameraPreset>(
      'มุมกล้อง (Camera Preset)',
      CAMERA_PRESETS.map((p) => ({ value: p, label: CAMERA_PRESET_LABELS[p] })),
      cam.preset,
      (v) => updateSettings((s) => ({ ...s, camera: { ...s.camera, preset: v } })),
    );

    const grid = document.createElement('div');
    grid.className = 'bm-grid-2';
    grid.style.marginTop = '14px';

    const heightSlider = buildRangeSlider(
      'ความสูงกล้อง (Height Offset)',
      LIMITS.cameraOffset[0],
      LIMITS.cameraOffset[1],
      0.05,
      cam.height,
      (v) => v.toFixed(2),
      (v) => updateSettings((s) => ({ ...s, camera: { ...s.camera, height: v } })),
    );

    const distSlider = buildRangeSlider(
      'ระยะห่างกล้อง (Distance Offset)',
      LIMITS.cameraOffset[0],
      LIMITS.cameraOffset[1],
      0.05,
      cam.distance,
      (v) => v.toFixed(2),
      (v) => updateSettings((s) => ({ ...s, camera: { ...s.camera, distance: v } })),
    );

    const zoomSlider = buildRangeSlider(
      'ซูมเริ่มต้น (Starting Zoom)',
      LIMITS.zoom[0],
      LIMITS.zoom[1],
      0.05,
      cam.zoom,
      (v) => `${v.toFixed(2)}×`,
      (v) => updateSettings((s) => ({ ...s, camera: { ...s.camera, zoom: v } })),
    );

    const followToggle = buildToggleSetting(
      'กล้องตามผู้เล่นซ้าย-ขวา (Follow Player)',
      cam.follow,
      (v) => updateSettings((s) => ({ ...s, camera: { ...s.camera, follow: v } })),
    );

    grid.append(heightSlider, distSlider, zoomSlider, followToggle);
    container.append(presetRow, grid);
  }

  function renderControlsTab(container: HTMLElement): void {
    const ctl = currentSave.settings.controls;
    const sensSlider = buildRangeSlider(
      'ความไวเมาส์ (Mouse Sensitivity)',
      LIMITS.mouseSensitivity[0],
      LIMITS.mouseSensitivity[1],
      0.05,
      ctl.mouseSensitivity,
      (v) => `${v.toFixed(2)}×`,
      (v) => updateSettings((s) => ({ ...s, controls: { ...s.controls, mouseSensitivity: v } })),
    );
    container.appendChild(sensSlider);

    if (conflictNotice) {
      const warn = document.createElement('div');
      warn.className = 'bm-notice';
      warn.dataset.testid = 'key-conflict-warning';
      warn.textContent = conflictNotice;
      container.appendChild(warn);
    }

    const keysHeader = document.createElement('div');
    keysHeader.className = 'bm-budget-header';
    const keysTitle = document.createElement('div');
    keysTitle.className = 'bm-section-title';
    keysTitle.style.margin = '0';
    keysTitle.textContent = 'ปุ่มบังคับ (Key Bindings · กด Escape เพื่อยกเลิก)';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'bm-btn bm-btn-sm';
    resetBtn.dataset.testid = 'reset-keys';
    resetBtn.textContent = 'คืนค่าเริ่มต้น';
    resetBtn.addEventListener('click', () => {
      conflictNotice = null;
      updateSettings((s) => ({
        ...s,
        controls: { ...s.controls, keys: structuredClone(DEFAULT_KEYS) },
      }));
      renderTabs();
    });
    keysHeader.append(keysTitle, resetBtn);
    container.appendChild(keysHeader);

    const keyList = document.createElement('div');
    keyList.className = 'bm-key-list';

    ACTION_ORDER.forEach((action) => {
      const row = document.createElement('div');
      row.className = 'bm-setting-row';

      const lbl = document.createElement('span');
      lbl.textContent = ACTION_LABELS[action];

      const right = document.createElement('div');
      right.className = 'bm-btn-row';
      right.style.alignItems = 'center';

      const codeText = document.createElement('span');
      codeText.style.fontWeight = '800';
      codeText.style.color = '#38bdf8';
      codeText.textContent =
        listeningAction === action
          ? 'กดปุ่มหรือคลิกเมาส์... (Esc ยกเลิก)'
          : formatBindingList(currentSave.settings.controls.keys[action]);

      const changeBtn = document.createElement('button');
      changeBtn.type = 'button';
      changeBtn.className = `bm-btn bm-btn-sm${listeningAction === action ? ' bm-btn-active' : ''}`;
      changeBtn.dataset.rebind = action;
      changeBtn.textContent = listeningAction === action ? 'กำลังรอ...' : 'เปลี่ยน';
      changeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        startListeningForAction(action);
      });

      right.append(codeText, changeBtn);
      row.append(lbl, right);
      keyList.appendChild(row);
    });

    container.appendChild(keyList);
  }

  function startListeningForAction(action: InputAction): void {
    stopListening();
    listeningAction = action;
    renderTabs();
    listeningAction = action;

    const applyCode = (code: string) => {
      stopListening();
      const res = rebindKey(currentSave.settings.controls.keys, action, code);
      conflictNotice = formatConflictMessage(res.conflict, code);
      updateSettings((s) => ({
        ...s,
        controls: { ...s.controls, keys: res.keys },
      }));
      renderTabs();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        stopListening();
        renderTabs();
        return;
      }
      applyCode(e.code);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      applyCode(e.button === 0 ? 'Mouse0' : 'Mouse2');
    };

    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('contextmenu', onContext, true);
    cleanupCapture = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }

  function renderAssistsTab(container: HTMLElement): void {
    const as = currentSave.settings.assists;
    const MODES: Array<{ value: MatchSettings['mode']; label: string }> = [
      { value: 'easy', label: 'A-ง่าย' },
      { value: 'normal', label: 'A-ปกติ' },
      { value: 'pro', label: 'A-โปร (= C)' },
      { value: 'timing', label: 'B กดจังหวะ' },
    ];
    const modeRow = buildChipSetting<MatchSettings['mode']>(
      'โหมดตัวช่วย (Assist Mode)',
      MODES,
      as.mode,
      (v) => {
        updateSettings((s) => ({ ...s, assists: { ...s.assists, mode: v } }));
        descLines.forEach((line, k) => {
          line.style.fontWeight = MODES[k].value === v ? '700' : '400';
        });
      },
    );
    const modeDesc = document.createElement('div');
    modeDesc.style.width = '100%';
    modeDesc.style.marginTop = '8px';
    modeDesc.style.fontSize = '14px';
    modeDesc.style.color = '#cbd5e1';
    const descLines = MODES.map((m) => {
      const line = document.createElement('div');
      line.textContent = `${m.label}: ${MODE_DESC[m.value]}`;
      line.style.fontWeight = m.value === as.mode ? '700' : '400';
      modeDesc.appendChild(line);
      return line;
    });
    modeRow.appendChild(modeDesc);

    const grid = document.createElement('div');
    grid.className = 'bm-grid-2';
    grid.style.marginTop = '14px';

    const hitSlider = buildRangeSlider(
      'ช่วยตีโดน (Hit Assist)',
      LIMITS.hitAssist[0],
      LIMITS.hitAssist[1],
      1,
      as.hitAssist,
      (v) => `${Math.round(v)}%`,
      (v) => updateSettings((s) => ({ ...s, assists: { ...s.assists, hitAssist: Math.round(v) } })),
    );

    const landingToggle = buildToggleSetting(
      'จุดตกพื้น (Landing Marker)',
      as.landingMarker,
      (v) => updateSettings((s) => ({ ...s, assists: { ...s.assists, landingMarker: v } })),
    );

    const ringToggle = buildToggleSetting(
      'วงแหวนจังหวะชาร์จ (Timing Ring)',
      as.timingRing,
      (v) => updateSettings((s) => ({ ...s, assists: { ...s.assists, timingRing: v } })),
    );

    const aidToggle = buildToggleSetting(
      'เป้าช่วยเล็งหน้าไม้ (Racket Aid)',
      as.racketAid,
      (v) => updateSettings((s) => ({ ...s, assists: { ...s.assists, racketAid: v } })),
    );

    grid.append(hitSlider, landingToggle, ringToggle, aidToggle);
    container.append(modeRow, grid);
  }

  function renderGraphicsTab(container: HTMLElement): void {
    const gfx = currentSave.settings.graphics;
    const row = buildChipSetting<GraphicsQuality>(
      'คุณภาพกราฟิก (Graphics Quality)',
      GRAPHICS_QUALITIES.map((q) => ({ value: q, label: GRAPHICS_QUALITY_LABELS[q] })),
      gfx.quality,
      (v) => updateSettings((s) => ({ ...s, graphics: { quality: v } })),
    );
    container.appendChild(row);
  }

  renderTabs();
}

function buildRangeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bm-slider-row';
  const top = document.createElement('div');
  top.className = 'bm-slider-top';
  const lbl = document.createElement('span');
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'bm-slider-val';
  val.textContent = format(initial);
  top.append(lbl, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.className = 'bm-slider';
  input.addEventListener('input', () => {
    const num = Number(input.value);
    val.textContent = format(num);
    onChange(num);
  });
  row.append(top, input);
  return row;
}

function buildChipSetting<T extends string>(
  label: string,
  options: Array<{ value: T; label: string }>,
  initial: T,
  onChange: (value: T) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bm-setting-row';

  const lbl = document.createElement('span');
  lbl.textContent = label;

  const group = document.createElement('div');
  group.className = 'bm-chip-group';

  const buttons: HTMLButtonElement[] = [];
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bm-chip${opt.value === initial ? ' active' : ''}`;
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(opt.value);
    });
    buttons.push(btn);
    group.appendChild(btn);
  });

  row.append(lbl, group);
  return row;
}

function buildToggleSetting(
  label: string,
  initial: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  return buildChipSetting<'on' | 'off'>(
    label,
    [
      { value: 'on', label: 'เปิด (On)' },
      { value: 'off', label: 'ปิด (Off)' },
    ],
    initial ? 'on' : 'off',
    (v) => onChange(v === 'on'),
  );
}

// ---------- 7. HUD, Result screen & View Controls ----------

export function createHud(root: HTMLElement): {
  update(view: {
    match: MatchState;
    stamina: number;
    charge: number | null;
    message: string | null;
  }): void;
  dispose(): void;
} {
  ensureStyles();

  const hud = document.createElement('div');
  hud.className = 'bm-hud';

  const board = document.createElement('div');
  board.className = 'bm-scoreboard';

  const nearBox = document.createElement('div');
  nearBox.className = 'bm-side-box';
  const nearMeta = document.createElement('div');
  nearMeta.className = 'bm-side-meta';
  const nearLabel = document.createElement('div');
  nearLabel.className = 'bm-side-label';
  const nearTitle = document.createElement('span');
  nearTitle.textContent = 'คุณ (YOU)';
  const nearServe = document.createElement('span');
  nearServe.className = 'bm-serve-badge';
  nearLabel.append(nearTitle, nearServe);
  const nearGames = document.createElement('div');
  nearGames.className = 'bm-games-pill';
  nearMeta.append(nearLabel, nearGames);
  const nearScore = document.createElement('div');
  nearScore.className = 'bm-big-score';
  nearScore.dataset.testid = 'score-near';
  nearBox.append(nearMeta, nearScore);

  const divider = document.createElement('div');
  divider.className = 'bm-score-divider';
  divider.textContent = ':';

  const farBox = document.createElement('div');
  farBox.className = 'bm-side-box';
  const farScore = document.createElement('div');
  farScore.className = 'bm-big-score';
  farScore.dataset.testid = 'score-far';
  const farMeta = document.createElement('div');
  farMeta.className = 'bm-side-meta';
  const farLabel = document.createElement('div');
  farLabel.className = 'bm-side-label';
  const farTitle = document.createElement('span');
  farTitle.textContent = 'บอท (BOT)';
  const farServe = document.createElement('span');
  farServe.className = 'bm-serve-badge';
  farLabel.append(farTitle, farServe);
  const farGames = document.createElement('div');
  farGames.className = 'bm-games-pill';
  farMeta.append(farLabel, farGames);
  farBox.append(farScore, farMeta);

  board.append(nearBox, divider, farBox);

  const bars = document.createElement('div');
  bars.className = 'bm-hud-bars';

  const stamGroup = document.createElement('div');
  stamGroup.className = 'bm-bar-group';
  const stamLabelRow = document.createElement('div');
  stamLabelRow.className = 'bm-bar-label';
  const stamName = document.createElement('span');
  stamName.textContent = 'แรง (STAMINA)';
  const stamPct = document.createElement('span');
  stamLabelRow.append(stamName, stamPct);
  const stamTrack = document.createElement('div');
  stamTrack.className = 'bm-bar-track';
  const stamFill = document.createElement('div');
  stamFill.className = 'bm-bar-fill';
  stamFill.dataset.testid = 'stamina-fill';
  stamTrack.appendChild(stamFill);
  stamGroup.append(stamLabelRow, stamTrack);

  const chargeGroup = document.createElement('div');
  chargeGroup.className = 'bm-bar-group';
  const chargeLabelRow = document.createElement('div');
  chargeLabelRow.className = 'bm-bar-label';
  const chargeName = document.createElement('span');
  chargeName.textContent = 'ชาร์จ (CHARGE)';
  const chargePct = document.createElement('span');
  chargeLabelRow.append(chargeName, chargePct);
  const chargeTrack = document.createElement('div');
  chargeTrack.className = 'bm-bar-track';
  const chargeFill = document.createElement('div');
  chargeFill.className = 'bm-bar-fill';
  chargeFill.dataset.testid = 'charge-fill';
  chargeTrack.appendChild(chargeFill);
  chargeGroup.append(chargeLabelRow, chargeTrack);

  bars.append(stamGroup, chargeGroup);

  const centerMsg = document.createElement('div');
  centerMsg.className = 'bm-center-msg';
  centerMsg.dataset.testid = 'hud-message';
  centerMsg.style.display = 'none';

  hud.append(board, bars, centerMsg);
  root.appendChild(hud);

  return {
    update({ match, stamina, charge, message }) {
      nearScore.textContent = String(match.score.near);
      farScore.textContent = String(match.score.far);
      nearGames.textContent = `เกม (Games): ${match.gamesWon.near}`;
      farGames.textContent = `เกม (Games): ${match.gamesWon.far}`;

      const courtLabel = match.serviceCourt === 'right' ? 'R' : 'L';
      if (match.server === 'near') {
        nearServe.style.display = 'inline-block';
        nearServe.textContent = `เสิร์ฟ (${courtLabel})`;
        farServe.style.display = 'none';
      } else {
        farServe.style.display = 'inline-block';
        farServe.textContent = `เสิร์ฟ (${courtLabel})`;
        nearServe.style.display = 'none';
      }

      const clampedStam = Math.max(0, Math.min(1, stamina));
      const stamPercent = Math.round(clampedStam * 100);
      stamPct.textContent = `${stamPercent}%`;
      stamFill.style.width = `${stamPercent}%`;
      stamFill.style.background =
        clampedStam > 0.35 ? '#22c55e' : clampedStam > 0.15 ? '#f59e0b' : '#ef4444';

      if (charge === null) {
        chargePct.textContent = '—';
        chargeFill.style.width = '0%';
        chargeFill.style.background = '#38bdf8';
      } else {
        const clampedCharge = Math.max(0, Math.min(1, charge));
        const chargePercent = Math.round(clampedCharge * 100);
        chargePct.textContent = `${chargePercent}%`;
        chargeFill.style.width = `${chargePercent}%`;
        chargeFill.style.background = clampedCharge >= 0.85 ? '#facc15' : '#38bdf8';
      }

      const activeMessage =
        message ?? (match.intervalNow ? 'พักครึ่งเกม (Interval Break)' : null);
      if (activeMessage) {
        centerMsg.style.display = 'block';
        centerMsg.textContent = activeMessage;
      } else {
        centerMsg.style.display = 'none';
        centerMsg.textContent = '';
      }
    },
    dispose() {
      hud.remove();
    },
  };
}

export function showResult(
  root: HTMLElement,
  match: MatchState,
  onAgain: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  panel.style.textAlign = 'center';

  const winnerSide: Side | null = match.winner;
  const youWon = winnerSide === 'near';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.color = youWon ? '#4ade80' : '#f87171';
  title.textContent =
    winnerSide === null
      ? 'จบการแข่งขัน (Match Ended)'
      : youWon
        ? 'คุณชนะ! (YOU WIN)'
        : 'บอทชนะ (BOT WINS)';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.style.fontSize = '24px';
  sub.style.fontWeight = '800';
  sub.style.color = '#f8fafc';
  sub.textContent = `ผลรวมเกม (Games): คุณ ${match.gamesWon.near} - ${match.gamesWon.far} บอท`;

  const gamesList = document.createElement('div');
  gamesList.style.margin = '18px 0 28px 0';
  gamesList.style.fontSize = '18px';
  gamesList.style.color = '#cbd5e1';
  gamesList.style.fontVariantNumeric = 'tabular-nums';

  const gamesToDisplay =
    match.completedGames.length > 0 ? match.completedGames : [match.score];
  gamesList.textContent = gamesToDisplay
    .map((g, idx) => `เกมที่ ${idx + 1}: ${g.near}–${g.far}`)
    .join('   ·   ');

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';
  btnRow.style.justifyContent = 'center';

  const againBtn = document.createElement('button');
  againBtn.type = 'button';
  againBtn.className = 'bm-btn bm-btn-primary';
  againBtn.textContent = 'กลับสู่เมนูหลัก (Main Menu)';
  againBtn.addEventListener('click', () => {
    overlay.remove();
    onAgain();
  });

  btnRow.appendChild(againBtn);
  panel.append(title, sub, gamesList, btnRow);
}

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1; // per key press
const WHEEL_STEP = 0.0015; // zoom per wheel delta unit

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Fullscreen button (corner, bound fullscreen key) and zoom (wheel, bound zoomIn / zoomOut keys) for match and tutorial.
export function createViewControls(root: HTMLElement, onZoom: (z: number) => void): { dispose(): void } {
  ensureStyles();
  const saved = loadSave();
  const keys = saved.settings.controls.keys;
  let zoom = clampZoom(saved.settings.camera.zoom);
  const setZoom = (z: number) => {
    zoom = clampZoom(Math.round(z * 1000) / 1000);
    onZoom(zoom);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
    else void root.requestFullscreen?.()?.catch(() => {});
  };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bm-fs-btn';
  btn.title = 'เต็มจอ';
  btn.setAttribute('aria-label', 'เต็มจอ');
  btn.textContent = '⛶';
  btn.addEventListener('click', toggleFullscreen);
  root.appendChild(btn);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (matchesBinding(keys, 'fullscreen', e.code)) toggleFullscreen();
    else if (matchesBinding(keys, 'zoomIn', e.code)) setZoom(zoom + ZOOM_STEP);
    else if (matchesBinding(keys, 'zoomOut', e.code)) setZoom(zoom - ZOOM_STEP);
  };
  const onWheel = (e: WheelEvent) => {
    setZoom(zoom - e.deltaY * WHEEL_STEP);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  onZoom(zoom);

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      btn.remove();
    },
  };
}
