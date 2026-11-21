import {
  CAMERA_PRESETS,
  DEFAULT_KEYS,
  GRAPHICS_QUALITIES,
  LIMITS,
  rebindKey,
} from '../../app/settings';
import type {
  CameraPreset,
  GameSettings,
  GraphicsQuality,
  InputAction,
  MatchSettings,
  SaveData,
} from '../../types';
import { captureStep, isCaptureIgnoredTarget } from '../capture';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  CAMERA_PRESET_LABELS,
  GRAPHICS_QUALITY_LABELS,
  formatBindingList,
  formatConflictMessage,
} from '../labels';
import { createStorageNotice, mountOverlay } from '../overlay';
import { buildChipSetting, buildRangeSlider, buildToggleSetting } from '../widgets';

const MODE_DESC: Record<MatchSettings['mode'], string> = {
  easy: 'ไม้ตีอัตโนมัติ + WASD ช่วยดึงไปจุดตก + เกมช้าลง 0.75x',
  normal: 'ไม้ตีอัตโนมัติ + เดินเองด้วย WASD',
  pro: 'คุมไม้ด้วยเมาส์เอง + เดินด้วย WASD (แบบเดิม)',
  timing: 'เดินและไม้อัตโนมัติทั้งหมด แค่กดจังหวะตี (WASD ไม่ทำงาน)',
};

// ---------- 6. Settings with tabs (ตั้งค่า) ----------

type SettingsTab = 'camera' | 'controls' | 'assists' | 'graphics';

export function showSettingsPage(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onBack: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  const notice = createStorageNotice(overlay);
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
    notice.set(onSaveChange(currentSave));
  }

  // Does not stop a pending capture: the capture state is rendered into the rows below, and every
  // caller that changes tabs or leaves the page calls stopListening() itself.
  function renderTabs(): void {
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
        stopListening();
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
      stopListening();
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
      changeBtn.textContent = listeningAction === action ? 'ยกเลิก (Cancel)' : 'เปลี่ยน';
      changeBtn.setAttribute('aria-pressed', listeningAction === action ? 'true' : 'false');
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
    const step = captureStep(listeningAction, action);
    stopListening();
    if (step === 'cancel') {
      renderTabs();
      return;
    }
    // Set the state before rendering so exactly one row shows "กดปุ่มหรือคลิกเมาส์... (Esc ยกเลิก)".
    listeningAction = action;
    renderTabs();

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
      // A press on a control (เปลี่ยน button, tab, input) is a UI click, not a binding: its own click
      // handler cancels or switches the capture, so the press must not be read as Mouse0/Mouse2.
      if (isCaptureIgnoredTarget(e.target as Element | null)) return;
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
