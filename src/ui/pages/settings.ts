import { isConfigured, type AccountResult } from '../../account/auth';
import {
  CAMERA_PRESETS,
  DEFAULT_KEYS,
  GRAPHICS_QUALITIES,
  LIMITS,
  rebindKey,
} from '../../app/settings';
import type {
  AccountUser,
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

type SettingsTab = 'camera' | 'controls' | 'assists' | 'graphics' | 'account';

export type SignOutResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

export interface SettingsAccountOptions {
  user: AccountUser | null;
  getUser?: () => AccountUser | null;
  configured?: boolean;
  onOpenAccount?: () => void;
  onSignOut?: () => Promise<SignOutResult>;
  onDeleteAccount?: () => Promise<AccountResult>;
}

export function showSettingsPage(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onBack: () => void,
  account?: SettingsAccountOptions,
): void {
  const { overlay, panel } = mountOverlay(root);
  const notice = createStorageNotice(overlay);
  let currentSave = save;
  let activeTab: SettingsTab = 'camera';
  let listeningAction: InputAction | null = null;
  let conflictNotice: string | null = null;
  let cleanupCapture: (() => void) | null = null;
  let accountUser: AccountUser | null = account?.getUser ? account.getUser() : (account?.user ?? null);
  let confirmingDelete = false;
  let accountBusy = false;
  let accountError: string | null = null;
  let accountInfo: string | null = null;
  const accountConfigured = account?.configured ?? isConfigured();

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
      { id: 'account', label: 'บัญชี (Account)' },
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
        confirmingDelete = false;
        accountError = null;
        accountInfo = null;
        if (t.id === 'account' && account?.getUser) {
          accountUser = account.getUser();
        }
        renderTabs();
      });
      tabsBar.appendChild(btn);
    });

    const body = document.createElement('div');
    if (activeTab === 'camera') renderCameraTab(body);
    else if (activeTab === 'controls') renderControlsTab(body);
    else if (activeTab === 'assists') renderAssistsTab(body);
    else if (activeTab === 'graphics') renderGraphicsTab(body);
    else renderAccountTab(body);

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

  function renderAccountTab(container: HTMLElement): void {
    if (account?.getUser) {
      accountUser = account.getUser();
    }
    const card = document.createElement('div');
    card.className = 'bm-char-card';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'flex-start';
    card.style.gap = '14px';

    if (accountInfo) {
      const info = document.createElement('div');
      info.className = 'bm-notice';
      info.dataset.testid = 'settings-account-info';
      info.style.width = '100%';
      info.style.boxSizing = 'border-box';
      info.style.marginTop = '0';
      info.textContent = accountInfo;
      card.appendChild(info);
    }

    if (accountError) {
      const err = document.createElement('div');
      err.className = 'bm-error';
      err.dataset.testid = 'settings-account-error';
      err.setAttribute('role', 'alert');
      err.style.width = '100%';
      err.style.boxSizing = 'border-box';
      err.style.marginTop = '0';
      err.textContent = accountError;
      card.appendChild(err);
    }

    if (!accountUser) {
      const statusTag = document.createElement('div');
      statusTag.className = 'bm-active-char-tag';
      statusTag.textContent = 'สถานะบัญชี (Account Status)';

      const guestText = document.createElement('div');
      guestText.dataset.testid = 'settings-account-guest';
      guestText.style.fontSize = '18px';
      guestText.style.fontWeight = '800';
      guestText.textContent = 'ผู้เล่นทั่วไป (Guest)';

      const desc = document.createElement('div');
      desc.style.fontSize = '14px';
      desc.style.color = '#94a3b8';
      desc.textContent =
        'ข้อมูลตัวละคร การตั้งค่า และความคืบหน้าทัวร์นาเมนต์ถูกเก็บไว้ในเบราว์เซอร์นี้ เข้าสู่ระบบเพื่อซิงก์ข้อมูลบนคลาวด์';

      const signInBtn = document.createElement('button');
      signInBtn.type = 'button';
      signInBtn.className = 'bm-btn bm-btn-primary';
      signInBtn.dataset.testid = 'settings-signin';
      if (accountConfigured && account?.onOpenAccount) {
        signInBtn.textContent = 'เข้าสู่ระบบ / สมัครสมาชิก (Sign In)';
        signInBtn.addEventListener('click', () => {
          stopListening();
          overlay.remove();
          account.onOpenAccount?.();
        });
      } else {
        signInBtn.disabled = true;
        signInBtn.innerHTML =
          '<span>เข้าสู่ระบบ / สมัครสมาชิก</span><span class="bm-soon-pill">ยังไม่ได้ตั้งค่าบัญชีออนไลน์</span>';
      }

      card.append(statusTag, guestText, desc, signInBtn);
      container.appendChild(card);
      return;
    }

    const emailTag = document.createElement('div');
    emailTag.className = 'bm-active-char-tag';
    emailTag.textContent = 'เข้าสู่ระบบด้วยบัญชี (Signed In As)';

    const emailValue = document.createElement('div');
    emailValue.dataset.testid = 'settings-account-email';
    emailValue.style.fontSize = '18px';
    emailValue.style.fontWeight = '800';
    emailValue.textContent = accountUser.email ?? 'บัญชีออนไลน์ (Signed In)';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'bm-btn-row';

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'bm-btn';
    signOutBtn.dataset.testid = 'settings-signout';
    signOutBtn.disabled = accountBusy;
    signOutBtn.textContent = accountBusy ? 'กำลังดำเนินการ...' : 'ออกจากระบบ (Sign Out)';
    signOutBtn.addEventListener('click', async () => {
      if (accountBusy || !account?.onSignOut) return;
      accountBusy = true;
      accountError = null;
      accountInfo = null;
      confirmingDelete = false;
      renderTabs();
      const res = await account.onSignOut();
      accountBusy = false;
      if (!res.ok) {
        accountError = res.message;
      } else {
        accountUser = null;
        accountInfo =
          res.warning ??
          'ออกจากระบบแล้ว ข้อมูลเซฟในเบราว์เซอร์นี้ยังคงอยู่ (Signed out; local save kept)';
      }
      renderTabs();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'bm-btn bm-btn-danger';
    deleteBtn.dataset.testid = 'settings-delete-account';
    deleteBtn.disabled = accountBusy;
    deleteBtn.textContent = 'ลบบัญชีและข้อมูลทั้งหมด (Delete Account)';
    deleteBtn.addEventListener('click', () => {
      if (accountBusy) return;
      confirmingDelete = true;
      accountError = null;
      renderTabs();
    });

    actionsRow.append(signOutBtn, deleteBtn);
    card.append(emailTag, emailValue, actionsRow);

    if (confirmingDelete) {
      const confirmBox = document.createElement('div');
      confirmBox.dataset.testid = 'settings-delete-confirm-box';
      confirmBox.setAttribute('role', 'alertdialog');
      confirmBox.style.width = '100%';
      confirmBox.style.boxSizing = 'border-box';
      confirmBox.style.padding = '14px 16px';
      confirmBox.style.borderRadius = '10px';
      confirmBox.style.background = 'rgba(239, 68, 68, 0.14)';
      confirmBox.style.border = '1px solid rgba(239, 68, 68, 0.45)';
      confirmBox.style.display = 'flex';
      confirmBox.style.flexDirection = 'column';
      confirmBox.style.gap = '10px';

      const warnText = document.createElement('div');
      warnText.style.fontSize = '14px';
      warnText.style.color = '#fecaca';
      warnText.style.lineHeight = '1.5';
      warnText.textContent =
        'ยืนยันการลบบัญชี? การกระทำนี้ไม่สามารถย้อนกลับได้ บัญชีและข้อมูลเซฟบนคลาวด์ทั้งหมดจะถูกลบอย่างถาวร (This cannot be undone. Your account and cloud save will be permanently deleted.)';

      const confirmBtns = document.createElement('div');
      confirmBtns.className = 'bm-btn-row';

      const confirmYes = document.createElement('button');
      confirmYes.type = 'button';
      confirmYes.className = 'bm-btn bm-btn-danger bm-btn-sm';
      confirmYes.dataset.testid = 'settings-delete-confirm';
      confirmYes.disabled = accountBusy;
      confirmYes.textContent = accountBusy
        ? 'กำลังลบบัญชี...'
        : 'ยืนยันลบบัญชีถาวร (Delete Permanently)';
      confirmYes.addEventListener('click', async () => {
        if (accountBusy || !account?.onDeleteAccount) return;
        accountBusy = true;
        accountError = null;
        renderTabs();
        const res = await account.onDeleteAccount();
        accountBusy = false;
        if (!res.ok) {
          accountError = res.message;
        } else {
          accountUser = null;
          confirmingDelete = false;
          accountInfo = 'ลบบัญชีและข้อมูลบนคลาวด์เรียบร้อยแล้ว (Account permanently deleted)';
        }
        renderTabs();
      });

      const confirmNo = document.createElement('button');
      confirmNo.type = 'button';
      confirmNo.className = 'bm-btn bm-btn-sm';
      confirmNo.dataset.testid = 'settings-delete-cancel';
      confirmNo.disabled = accountBusy;
      confirmNo.textContent = 'ยกเลิก (Cancel)';
      confirmNo.addEventListener('click', () => {
        confirmingDelete = false;
        renderTabs();
      });

      confirmBtns.append(confirmYes, confirmNo);
      confirmBox.append(warnText, confirmBtns);
      card.appendChild(confirmBox);
    }

    container.appendChild(card);
  }

  renderTabs();
}
