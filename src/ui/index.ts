import type { BodyType, Gender, MatchEvent, MatchSettings, MatchState, Side, Stats } from '../types';
import { heightOf } from '../sim/tuning';
import { EVENTS, eventsFor, fitEvent } from './events';

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

export function budgetLeft(stats: Stats): number {
  return STAT_BUDGET - (stats.speed + stats.power + stats.recovery + stats.stamina);
}

export function clampStatToBudget(stats: Stats, key: StatKey, requestedValue: number): Stats {
  const clamped0To10 = Math.max(0, Math.min(10, Math.round(requestedValue)));
  const othersTotal =
    stats.speed + stats.power + stats.recovery + stats.stamina - stats[key];
  const maxAllowed = Math.max(0, Math.min(10, STAT_BUDGET - othersTotal));
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
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 16px;
      padding: 32px 36px;
      width: min(720px, 92vw);
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
    }
    .bm-title {
      font-size: 44px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      color: #f8fafc;
    }
    .bm-subtitle {
      font-size: 16px;
      color: #94a3b8;
      margin: 0 0 28px 0;
      line-height: 1.5;
    }
    .bm-btn-row {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .bm-btn {
      cursor: pointer;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: #1e293b;
      color: #f8fafc;
      font-size: 17px;
      font-weight: 700;
      padding: 14px 26px;
      border-radius: 10px;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }
    .bm-btn:hover {
      background: #334155;
      border-color: #64748b;
    }
    .bm-btn:active {
      transform: scale(0.98);
    }
    .bm-btn-primary {
      background: #22c55e;
      color: #052e16;
      border-color: #4ade80;
    }
    .bm-btn-primary:hover {
      background: #4ade80;
      border-color: #86efac;
    }
    .bm-btn-active {
      background: #38bdf8;
      color: #082f49;
      border-color: #7dd3fc;
    }
    .bm-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
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
      font-size: 22px;
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
      gap: 14px 24px;
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
      font-size: 24px;
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
    }
    .bm-chip-group {
      display: flex;
      gap: 6px;
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

export function showTitle(
  root: HTMLElement,
  onStart: (mode: 'match' | 'tutorial') => void,
): void {
  ensureStyles();
  clearOverlays(root);

  const overlay = document.createElement('div');
  overlay.className = 'bm-overlay';

  const panel = document.createElement('div');
  panel.className = 'bm-panel';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.textContent = 'BADMINTON 3D · แบดมินตันเดี่ยว';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.textContent =
    'ควบคุมหน้าไม้ด้วยเมาส์ · ชาร์จตีลูกตบ/หยอด/เคลียร์ · ทดสอบความต่างของรูปร่างและค่าพลัง';

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';

  const matchBtn = document.createElement('button');
  matchBtn.type = 'button';
  matchBtn.className = 'bm-btn bm-btn-primary';
  matchBtn.textContent = 'แข่งกับบอท (Start Match)';
  matchBtn.addEventListener('click', () => {
    overlay.remove();
    onStart('match');
  });

  const tutBtn = document.createElement('button');
  tutBtn.type = 'button';
  tutBtn.className = 'bm-btn';
  tutBtn.textContent = 'ฝึกสอน 8 ท่า (Tutorial)';
  tutBtn.addEventListener('click', () => {
    overlay.remove();
    onStart('tutorial');
  });

  btnRow.append(matchBtn, tutBtn);

  const hint = document.createElement('div');
  hint.className = 'bm-keys-hint';
  hint.textContent =
    'WASD เคลื่อนที่ · เมาส์เล็งหน้าไม้ + สะบัดทิศทาง · Q/E ตีพื้นฐาน · คลิกซ้ายค้าง = ตบ (Smash) · คลิกขวาค้าง = หยอด/เสิร์ฟสั้น · LShift ค้าง = เคลียร์/เสิร์ฟยาว · Alt = ลูกหน้าเน็ต · Space ค้าง = กระโดด · C = พุ่งรับ/กดรัวเพื่อลุก';

  panel.append(title, sub, btnRow, hint);
  overlay.appendChild(panel);
  root.appendChild(overlay);
}

export function showSetup(
  root: HTMLElement,
  onDone: (cfg: { stats: Stats; settings: Settings }) => void,
): void {
  ensureStyles();
  clearOverlays(root);

  let currentStats: Stats = { ...PRESETS.balanced };
  const currentSettings: Settings = { ...DEFAULT_SETTINGS };

  const overlay = document.createElement('div');
  overlay.className = 'bm-overlay';

  const panel = document.createElement('div');
  panel.className = 'bm-panel';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '32px';
  title.textContent = 'ตั้งค่านักกีฬา & กติกา (Player Setup)';

  // Presets section
  const presetHeader = document.createElement('div');
  presetHeader.className = 'bm-section-title';
  presetHeader.textContent = 'รูปร่างนักกีฬา (Body Preset)';

  const presetRow = document.createElement('div');
  presetRow.className = 'bm-btn-row';

  const presetButtons: Record<BodyType, HTMLButtonElement> = {
    tall: document.createElement('button'),
    balanced: document.createElement('button'),
    short: document.createElement('button'),
  };

  const presetNames: Record<BodyType, string> = {
    tall: 'ตัวสูง (Tall)',
    balanced: 'สมดุล (Balanced)',
    short: 'ตัวเล็ก (Short)',
  };
  const presetLabel = (body: BodyType, gender: Gender) =>
    `${presetNames[body]} ${heightOf({ gender, body }).toFixed(2)}m`;

  // Gender + event pickers; refreshed together so only fitting events are enabled
  const genderHeader = document.createElement('div');
  genderHeader.className = 'bm-section-title';
  genderHeader.textContent = 'เพศ (Gender)';
  const genderRow = document.createElement('div');
  genderRow.className = 'bm-btn-row';
  const genderButtons = new Map<Gender, HTMLButtonElement>();
  (
    [['male', 'ชาย (Male)'], ['female', 'หญิง (Female)']] as Array<[Gender, string]>
  ).forEach(([g, text]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bm-btn';
    btn.dataset.gender = g;
    btn.textContent = text;
    btn.addEventListener('click', () => {
      currentStats = { ...currentStats, gender: g };
      currentSettings.event = fitEvent(currentSettings.event, g);
      refreshStatsUI();
    });
    genderButtons.set(g, btn);
    genderRow.appendChild(btn);
  });

  const eventHeader = document.createElement('div');
  eventHeader.className = 'bm-section-title';
  eventHeader.textContent = 'ประเภท (Event)';
  const eventRow = document.createElement('div');
  eventRow.className = 'bm-btn-row';
  const eventButtons = new Map<MatchEvent, HTMLButtonElement>();
  EVENTS.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bm-btn';
    btn.dataset.event = value;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      currentSettings.event = value;
      refreshStatsUI();
    });
    eventButtons.set(value, btn);
    eventRow.appendChild(btn);
  });

  // Budget header
  const budgetHeader = document.createElement('div');
  budgetHeader.className = 'bm-budget-header';

  const budgetTitle = document.createElement('div');
  budgetTitle.className = 'bm-section-title';
  budgetTitle.style.margin = '0';
  budgetTitle.textContent = 'ค่าพลัง (Stats 0–10 · รวมไม่เกิน 20)';

  const budgetBadge = document.createElement('div');
  budgetBadge.className = 'bm-budget-badge';
  budgetBadge.dataset.testid = 'points-left';

  budgetHeader.append(budgetTitle, budgetBadge);

  // Sliders
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

  function refreshStatsUI(): void {
    const left = budgetLeft(currentStats);
    budgetBadge.textContent = `แต้มคงเหลือ (Points Left): ${left} / ${STAT_BUDGET}`;
    (Object.keys(presetButtons) as BodyType[]).forEach((b) => {
      presetButtons[b].classList.toggle('bm-btn-active', currentStats.body === b);
      presetButtons[b].textContent = presetLabel(b, currentStats.gender);
    });
    genderButtons.forEach((btn, g) => btn.classList.toggle('bm-btn-active', currentStats.gender === g));
    const valid = eventsFor(currentStats.gender);
    eventButtons.forEach((btn, e) => {
      btn.disabled = !valid.includes(e);
      btn.classList.toggle('bm-btn-active', currentSettings.event === e);
    });
    statMeta.forEach(({ key }) => {
      const inp = sliderInputs[key];
      const valEl = sliderValues[key];
      if (inp) inp.value = String(currentStats[key]);
      if (valEl) valEl.textContent = String(currentStats[key]);
    });
  }

  (Object.keys(presetButtons) as BodyType[]).forEach((body) => {
    const btn = presetButtons[body];
    btn.type = 'button';
    btn.className = 'bm-btn';
    btn.dataset.preset = body;
    btn.addEventListener('click', () => {
      currentStats = { ...PRESETS[body], gender: currentStats.gender };
      refreshStatsUI();
    });
    presetRow.appendChild(btn);
  });

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
      currentStats = clampStatToBudget(currentStats, key, Number(input.value));
      refreshStatsUI();
    });

    row.append(top, input);
    slidersGrid.appendChild(row);
  });

  // Settings section
  const settingsTitle = document.createElement('div');
  settingsTitle.className = 'bm-section-title';
  settingsTitle.textContent = 'ตัวช่วย & กติกา (Match Settings)';

  const settingsGrid = document.createElement('div');
  settingsGrid.className = 'bm-grid-2';

  // Hit assist 0-100
  const assistRow = document.createElement('div');
  assistRow.className = 'bm-slider-row';
  const assistTop = document.createElement('div');
  assistTop.className = 'bm-slider-top';
  const assistLabel = document.createElement('span');
  assistLabel.textContent = 'ช่วยตีโดน (Hit Assist)';
  const assistVal = document.createElement('span');
  assistVal.className = 'bm-slider-val';
  assistVal.textContent = `${currentSettings.hitAssist}%`;
  assistTop.append(assistLabel, assistVal);

  const assistInput = document.createElement('input');
  assistInput.type = 'range';
  assistInput.min = '0';
  assistInput.max = '100';
  assistInput.step = '1';
  assistInput.value = String(currentSettings.hitAssist);
  assistInput.className = 'bm-slider';
  assistInput.dataset.setting = 'hitAssist';
  assistInput.addEventListener('input', () => {
    currentSettings.hitAssist = Math.max(0, Math.min(100, Number(assistInput.value)));
    assistVal.textContent = `${currentSettings.hitAssist}%`;
  });
  assistRow.append(assistTop, assistInput);

  // Format 3x15 / 3x21
  const formatRow = buildChipSetting<'3x15' | '3x21'>(
    'ระบบแต้ม (Format)',
    [
      { value: '3x15', label: '3×15 (BWF ใหม่)' },
      { value: '3x21', label: '3×21 (ดั้งเดิม)' },
    ],
    currentSettings.format,
    (v) => {
      currentSettings.format = v;
    },
  );

  // Bot level easy / medium / hard
  const botRow = buildChipSetting<'easy' | 'medium' | 'hard'>(
    'ความเก่งบอท (Bot Level)',
    [
      { value: 'easy', label: 'ง่าย (Easy)' },
      { value: 'medium', label: 'กลาง (Medium)' },
      { value: 'hard', label: 'ยาก (Hard)' },
    ],
    currentSettings.botLevel,
    (v) => {
      currentSettings.botLevel = v;
    },
  );

  // Landing marker on/off
  const landingRow = buildToggleSetting(
    'จุดตกพื้น (Landing Marker)',
    currentSettings.landingMarker,
    (v) => {
      currentSettings.landingMarker = v;
    },
  );

  // Timing ring on/off
  const ringRow = buildToggleSetting(
    'วงแหวนจังหวะชาร์จ (Timing Ring)',
    currentSettings.timingRing,
    (v) => {
      currentSettings.timingRing = v;
    },
  );

  // Demo mode: auto racket / move assist / game speed. All four are described; the chosen one is bold.
  const MODES: Array<{ value: Settings['mode']; label: string }> = [
    { value: 'easy', label: 'A-ง่าย' },
    { value: 'normal', label: 'A-ปกติ' },
    { value: 'pro', label: 'A-โปร (= C)' },
    { value: 'timing', label: 'B กดจังหวะ' },
  ];
  const modeRow = buildChipSetting<Settings['mode']>(
    'โหมดการเล่น (Mode)', MODES, currentSettings.mode,
    (v) => {
      currentSettings.mode = v;
      descLines.forEach((line, k) => { line.style.fontWeight = MODES[k].value === v ? '700' : '400'; });
    },
  );
  modeRow.style.gridColumn = '1 / -1';
  const modeDesc = document.createElement('div');
  modeDesc.className = 'bm-slider-val';
  const descLines = MODES.map((m) => {
    const line = document.createElement('div');
    line.textContent = `${m.label}: ${MODE_DESC[m.value]}`;
    line.style.fontWeight = m.value === currentSettings.mode ? '700' : '400';
    modeDesc.appendChild(line);
    return line;
  });
  modeRow.appendChild(modeDesc);

  settingsGrid.append(modeRow, assistRow, formatRow, botRow, landingRow, ringRow);

  // Start button
  const footer = document.createElement('div');
  footer.className = 'bm-btn-row';
  footer.style.marginTop = '26px';
  footer.style.justifyContent = 'flex-end';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'bm-btn bm-btn-primary';
  doneBtn.dataset.testid = 'setup-done';
  doneBtn.textContent = 'ลงสนาม (Start Game)';
  doneBtn.addEventListener('click', () => {
    overlay.remove();
    onDone({ stats: { ...currentStats }, settings: { ...currentSettings } });
  });

  footer.appendChild(doneBtn);

  refreshStatsUI();

  panel.append(
    title,
    genderHeader,
    genderRow,
    eventHeader,
    eventRow,
    presetHeader,
    presetRow,
    budgetHeader,
    slidersGrid,
    settingsTitle,
    settingsGrid,
    footer,
  );
  overlay.appendChild(panel);
  root.appendChild(overlay);
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

  // Top scoreboard
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

  // Bottom-left bars (stamina & charge)
  const bars = document.createElement('div');
  bars.className = 'bm-hud-bars';

  // Stamina bar
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

  // Charge bar
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

  // Centre message
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
  ensureStyles();
  clearOverlays(root);

  const overlay = document.createElement('div');
  overlay.className = 'bm-overlay';

  const panel = document.createElement('div');
  panel.className = 'bm-panel';
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
  againBtn.textContent = 'เล่นอีกครั้ง (Play Again)';
  againBtn.addEventListener('click', () => {
    overlay.remove();
    onAgain();
  });

  btnRow.appendChild(againBtn);
  panel.append(title, sub, gamesList, btnRow);
  overlay.appendChild(panel);
  root.appendChild(overlay);
}

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1; // per key press
const WHEEL_STEP = 0.0015; // zoom per wheel delta unit

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Fullscreen button (corner, key F) and zoom (wheel, + / -) for match and tutorial. Fullscreen drops the pointer lock;
// the input module re-requests it on the next canvas click.
export function createViewControls(root: HTMLElement, onZoom: (z: number) => void): { dispose(): void } {
  ensureStyles();
  let zoom = 1;
  const setZoom = (z: number) => { zoom = clampZoom(Math.round(z * 1000) / 1000); onZoom(zoom); };
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
    if (e.code === 'KeyF') toggleFullscreen();
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(zoom + ZOOM_STEP);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(zoom - ZOOM_STEP);
  };
  const onWheel = (e: WheelEvent) => { setZoom(zoom - e.deltaY * WHEEL_STEP); }; // wheel up (negative) zooms in
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
