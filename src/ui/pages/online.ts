import { getAccessToken } from '../../account/auth';
import { activeCharacter } from '../../app/characters';
import { LIMITS } from '../../app/settings';
import { startOnlineMatch } from '../../game/onlineMatch';
import { connect, gameServerUrl, type Connection } from '../../net/connection';
import type {
  RoomSeat,
  RoomSettings,
  RoomView,
  SeatIndex,
  ServerErrorCode,
  ServerMessage,
} from '../../net/protocol';
import type { MatchEvent, MatchSettings, SaveData } from '../../types';
import {
  SERVER_ERROR_LABELS,
  buildOnlineResultMatch,
  canStartRoom,
  formatOnlineTeamNames,
  formatServerError,
  normalizeRoomCode,
  seatStatTotal,
  validateRoomCode,
} from '../onlineHelpers';
import { mountOverlay } from '../overlay';
import { showResult } from '../result';
import { buildChipSetting, buildRangeSlider } from '../widgets';

export interface OnlinePageActions {
  onBack: () => void;
  onMatchStateChange?: (playing: boolean) => void;
}

const EVENT_OPTIONS: Array<{ value: MatchEvent; label: string }> = [
  { value: 'MS', label: 'MS ชายเดี่ยว' },
  { value: 'WS', label: 'WS หญิงเดี่ยว' },
  { value: 'MD', label: 'MD ชายคู่' },
  { value: 'WD', label: 'WD หญิงคู่' },
  { value: 'XD', label: 'XD คู่ผสม' },
];

const FORMAT_OPTIONS: Array<{ value: RoomSettings['format']; label: string }> = [
  { value: '3x15', label: '3×15 แต้ม' },
  { value: '3x21', label: '3×21 แต้ม' },
];

const ASSIST_MODE_OPTIONS: Array<{ value: MatchSettings['mode']; label: string }> = [
  { value: 'easy', label: 'A-ง่าย' },
  { value: 'normal', label: 'A-ปกติ' },
  { value: 'pro', label: 'A-โปร' },
  { value: 'timing', label: 'B กดจังหวะ' },
];

const POINTS_OPTIONS: Array<{ value: RoomSettings['points']; label: string }> = [
  { value: 'real', label: 'ค่าพลังจริง' },
  { value: 'twenty', label: 'ทุกคน 20 แต้ม' },
];

const EVENT_TEXT: Record<MatchEvent, string> = {
  MS: 'MS ชายเดี่ยว',
  WS: 'WS หญิงเดี่ยว',
  MD: 'MD ชายคู่',
  WD: 'WD หญิงคู่',
  XD: 'XD คู่ผสม',
};

const MODE_TEXT: Record<MatchSettings['mode'], string> = {
  easy: 'A-ง่าย',
  normal: 'A-ปกติ',
  pro: 'A-โปร',
  timing: 'B กดจังหวะ',
};

function isServerErrorCode(s: string): s is ServerErrorCode {
  return s in SERVER_ERROR_LABELS;
}

export function showOnlinePage(
  root: HTMLElement,
  save: SaveData,
  actions: OnlinePageActions,
): void {
  const active = activeCharacter(save);
  if (!active) {
    actions.onBack();
    return;
  }

  let phase: 'connecting' | 'lobby' | 'room' | 'playing' | 'result' | 'disconnected' = 'connecting';
  let conn: Connection | null = null;
  let offMsg: (() => void) | null = null;
  let offClose: (() => void) | null = null;
  let stopMatch: (() => void) | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let room: RoomView | null = null;
  let you: SeatIndex | null = null;
  let errorMsg: string | null = null;
  let copied = false;
  let joinCode = '';
  let disposed = false;

  let draftSettings: RoomSettings = {
    event: save.settings.match.event,
    format: save.settings.match.format,
    assists: {
      mode: save.settings.assists.mode,
      hitAssist: save.settings.assists.hitAssist,
    },
    points: 'real',
  };

  let overlay: HTMLElement | null = null;
  let panel: HTMLElement | null = null;

  function ensurePanel(): HTMLElement {
    if (!overlay || !panel || !overlay.isConnected) {
      const mounted = mountOverlay(root);
      overlay = mounted.overlay;
      panel = mounted.panel;
    }
    const currentPanel = panel;
    currentPanel.innerHTML = '';
    return currentPanel;
  }

  function clearOverlay(): void {
    overlay?.remove();
    overlay = null;
    panel = null;
  }

  function detachConn(sendLeave: boolean): void {
    if (offMsg) {
      offMsg();
      offMsg = null;
    }
    if (offClose) {
      offClose();
      offClose = null;
    }
    if (conn) {
      if (sendLeave && room) {
        conn.send({ t: 'leave' });
      }
      conn.close();
      conn = null;
    }
  }

  function leaveToMenu(): void {
    if (disposed) return;
    disposed = true;
    if (copyTimer !== null) {
      clearTimeout(copyTimer);
      copyTimer = null;
    }
    if (stopMatch) {
      stopMatch();
      stopMatch = null;
    }
    detachConn(true);
    clearOverlay();
    actions.onMatchStateChange?.(false);
    actions.onBack();
  }

  function handleMessage(msg: ServerMessage): void {
    if (disposed) return;
    if (msg.t === 'room') {
      room = msg.room;
      you = msg.you;
      errorMsg = null;
      if (phase === 'lobby' || phase === 'room') {
        phase = 'room';
        render();
      }
      return;
    }
    if (msg.t === 'error') {
      errorMsg = formatServerError(msg.code, msg.message);
      if (phase === 'lobby' || phase === 'room') {
        render();
      }
      return;
    }
    if (msg.t === 'start') {
      if (phase === 'playing' || !conn || !room || you === null) return;
      phase = 'playing';
      errorMsg = null;
      clearOverlay();
      actions.onMatchStateChange?.(true);
      const matchRoom = room;
      const matchSeat = you;
      const activeConn = conn;
      stopMatch = startOnlineMatch(
        root,
        activeConn,
        matchRoom,
        matchSeat,
        save.settings,
        (winner, games) => {
          stopMatch = null;
          if (disposed) return;
          actions.onMatchStateChange?.(false);
          phase = 'result';
          const sideNames = formatOnlineTeamNames(matchRoom, matchSeat);
          const resultMatch = buildOnlineResultMatch(
            winner,
            games,
            matchSeat,
            matchRoom.settings.format,
            matchRoom.seats.length > 2,
          );
          const lost = winner === null;
          showResult(
            root,
            resultMatch,
            () => {
              if (disposed) return;
              if (lost || !conn) {
                leaveToMenu();
              } else {
                phase = room ? 'room' : 'lobby';
                render();
              }
            },
            {
              sideNames,
              subtitleNote: lost
                ? 'การเชื่อมต่อขาดหายเกิน 30 วินาที (Connection lost)'
                : 'แมตช์ออนไลน์ไม่ได้รับแต้มพลัง (Online matches earn no stat points)',
              buttonLabel: lost ? 'กลับสู่เมนูหลัก (Main Menu)' : 'กลับเข้าห้อง (Back to Room)',
            },
          );
        },
      );
    }
  }

  function handleDrop(): void {
    if (disposed || phase === 'playing') return;
    room = null;
    you = null;
    phase = 'disconnected';
    errorMsg = 'การเชื่อมต่อกับเซิร์ฟเวอร์ขาดหาย กรุณาลองเชื่อมต่อใหม่อีกครั้ง';
    render();
  }

  async function connectNow(): Promise<void> {
    detachConn(false);
    phase = 'connecting';
    errorMsg = null;
    render();

    const url = gameServerUrl();
    if (!url) {
      phase = 'disconnected';
      errorMsg = 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ออนไลน์';
      render();
      return;
    }

    const token = await getAccessToken();
    if (disposed) return;
    if (!token) {
      phase = 'disconnected';
      errorMsg = formatServerError('bad-token');
      render();
      return;
    }

    try {
      const c = await connect(url, token, { name: active!.name, stats: { ...active!.stats } });
      if (disposed) {
        c.close();
        return;
      }
      conn = c;
      offMsg = c.onMessage(handleMessage);
      offClose = c.onClose(handleDrop);
      phase = 'lobby';
      errorMsg = null;
      render();
    } catch (err) {
      if (disposed) return;
      const code = err instanceof Error ? err.message : '';
      errorMsg = isServerErrorCode(code)
        ? formatServerError(code)
        : 'เชื่อมต่อเซิร์ฟเวอร์ออนไลน์ไม่ได้ กรุณาลองใหม่อีกครั้ง';
      phase = 'disconnected';
      render();
    }
  }

  function buildSettingsControls(
    current: RoomSettings,
    onChange: (next: RoomSettings) => void,
    commitSliderOnRelease = false,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const eventRow = buildChipSetting<MatchEvent>(
      'ประเภท (Event · ห้องกับเพื่อนผสมเพศได้)',
      EVENT_OPTIONS,
      current.event,
      (v) => onChange({ ...current, event: v }),
    );

    const formatRow = buildChipSetting<RoomSettings['format']>(
      'รูปแบบเกม (Format)',
      FORMAT_OPTIONS,
      current.format,
      (v) => onChange({ ...current, format: v }),
    );

    const assistRow = buildChipSetting<MatchSettings['mode']>(
      'ตัวช่วยทุกคนในห้อง (Assists · ไม่มีสโลว์โมชัน)',
      ASSIST_MODE_OPTIONS,
      current.assists.mode,
      (v) => onChange({ ...current, assists: { ...current.assists, mode: v } }),
    );

    let pendingHitAssist = current.assists.hitAssist;
    const hitSlider = buildRangeSlider(
      'ช่วยตีโดน (Hit Assist)',
      LIMITS.hitAssist[0],
      LIMITS.hitAssist[1],
      1,
      current.assists.hitAssist,
      (v) => `${Math.round(v)}%`,
      (v) => {
        pendingHitAssist = Math.round(v);
        if (!commitSliderOnRelease) {
          onChange({ ...current, assists: { ...current.assists, hitAssist: pendingHitAssist } });
        }
      },
    );
    if (commitSliderOnRelease) {
      hitSlider.querySelector('input')?.addEventListener('change', () => {
        onChange({ ...current, assists: { ...current.assists, hitAssist: pendingHitAssist } });
      });
    }

    const pointsRow = buildChipSetting<RoomSettings['points']>(
      'ค่าพลังตัวละคร (Stat Points)',
      POINTS_OPTIONS,
      current.points,
      (v) => onChange({ ...current, points: v }),
    );

    wrap.append(eventRow, formatRow, assistRow, hitSlider, pointsRow);
    return wrap;
  }

  function renderHeader(p: HTMLElement, headingText: string, backText: string): void {
    const headerBar = document.createElement('div');
    headerBar.className = 'bm-header-bar';

    const title = document.createElement('h1');
    title.className = 'bm-title';
    title.style.fontSize = '28px';
    title.style.margin = '0';
    title.textContent = headingText;

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'bm-btn bm-btn-sm';
    backBtn.dataset.testid = 'online-back';
    backBtn.textContent = backText;
    backBtn.addEventListener('click', leaveToMenu);

    headerBar.append(title, backBtn);
    p.appendChild(headerBar);

    if (errorMsg) {
      const errBox = document.createElement('div');
      errBox.className = 'bm-error';
      errBox.dataset.testid = 'online-error';
      errBox.setAttribute('role', 'alert');
      errBox.style.marginTop = '0';
      errBox.style.marginBottom = '16px';
      errBox.textContent = errorMsg;
      p.appendChild(errBox);
    }
  }

  function renderLobby(p: HTMLElement): void {
    renderHeader(p, 'ออนไลน์ · ห้องกับเพื่อน (Online Rooms)', '← กลับเมนูหลัก');

    // Join by 6-character code
    const joinSection = document.createElement('div');
    joinSection.className = 'bm-char-card';
    joinSection.style.flexDirection = 'column';
    joinSection.style.alignItems = 'stretch';
    joinSection.style.gap = '10px';
    joinSection.style.marginBottom = '18px';

    const joinTitle = document.createElement('div');
    joinTitle.className = 'bm-active-char-tag';
    joinTitle.textContent = 'เข้าห้องด้วยรหัส (Join by Room Code)';

    const joinForm = document.createElement('form');
    joinForm.noValidate = true;
    joinForm.className = 'bm-btn-row';
    joinForm.style.alignItems = 'center';

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.className = 'bm-input';
    codeInput.dataset.testid = 'online-join-code';
    codeInput.placeholder = 'รหัสห้อง 6 ตัว เช่น AB23CD';
    codeInput.maxLength = 6;
    codeInput.autocomplete = 'off';
    codeInput.style.flex = '1';
    codeInput.style.minWidth = '200px';
    codeInput.style.textTransform = 'uppercase';
    codeInput.style.letterSpacing = '0.16em';
    codeInput.style.fontVariantNumeric = 'tabular-nums';
    codeInput.value = joinCode;
    codeInput.addEventListener('input', () => {
      joinCode = normalizeRoomCode(codeInput.value);
      codeInput.value = joinCode;
    });

    const joinBtn = document.createElement('button');
    joinBtn.type = 'submit';
    joinBtn.className = 'bm-btn bm-btn-primary';
    joinBtn.dataset.testid = 'online-join-submit';
    joinBtn.textContent = 'เข้าห้องด้วยรหัส';

    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const normalized = normalizeRoomCode(joinCode);
      joinCode = normalized;
      const err = validateRoomCode(normalized);
      if (err) {
        errorMsg = err;
        render();
        return;
      }
      errorMsg = null;
      conn?.send({ t: 'join', code: normalized });
    });

    joinForm.append(codeInput, joinBtn);
    joinSection.append(joinTitle, joinForm);
    p.appendChild(joinSection);

    // Create room with host settings
    const createSection = document.createElement('div');
    createSection.className = 'bm-char-card';
    createSection.style.flexDirection = 'column';
    createSection.style.alignItems = 'stretch';
    createSection.style.gap = '12px';

    const createTitle = document.createElement('div');
    createTitle.className = 'bm-active-char-tag';
    createTitle.textContent = 'สร้างห้องใหม่ (Create Room)';

    const settingsEl = buildSettingsControls(draftSettings, (next) => {
      draftSettings = next;
    });

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'bm-btn bm-btn-primary';
    createBtn.dataset.testid = 'online-create-room';
    createBtn.style.marginTop = '6px';
    createBtn.textContent = 'สร้างห้อง (Create Room)';
    createBtn.addEventListener('click', () => {
      errorMsg = null;
      conn?.send({ t: 'create', settings: draftSettings });
    });

    createSection.append(createTitle, settingsEl, createBtn);
    p.appendChild(createSection);
  }

  function renderSeatCard(s: RoomSeat, r: RoomView): HTMLElement {
    const isMe = you === s.seat;
    const isBot = s.userId === null;
    const isHostSeat = s.userId !== null && s.userId === r.hostId;
    const sideName = s.seat % 2 === 0 ? 'ฝั่ง A (Near)' : 'ฝั่ง B (Far)';

    const card = document.createElement('div');
    card.className = `bm-char-card${isMe ? ' active' : ''}`;
    card.dataset.testid = `online-seat-${s.seat}`;

    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    info.style.gap = '4px';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '8px';
    topRow.style.flexWrap = 'wrap';

    const sideTag = document.createElement('span');
    sideTag.className = 'bm-soon-pill';
    sideTag.textContent = sideName;

    const nameEl = document.createElement('span');
    nameEl.style.fontWeight = '800';
    nameEl.style.fontSize = '16px';
    nameEl.textContent = isBot ? 'บอท (Bot)' : s.name;

    topRow.append(sideTag, nameEl);

    if (isMe) {
      const mePill = document.createElement('span');
      mePill.className = 'bm-soon-pill';
      mePill.style.background = 'rgba(56, 189, 248, 0.22)';
      mePill.style.color = '#38bdf8';
      mePill.textContent = 'คุณ';
      topRow.appendChild(mePill);
    }
    if (isHostSeat) {
      const hostPill = document.createElement('span');
      hostPill.className = 'bm-soon-pill';
      hostPill.style.background = 'rgba(250, 204, 21, 0.2)';
      hostPill.style.color = '#facc15';
      hostPill.textContent = 'หัวหน้าห้อง';
      topRow.appendChild(hostPill);
    }

    const meta = document.createElement('div');
    meta.style.fontSize = '13px';
    meta.style.color = '#94a3b8';
    const statSum = seatStatTotal(s.stats);
    if (isBot) {
      meta.textContent = `พลังรวม ${statSum} แต้ม · ว่าง (คลิกเพื่อย้ายมานั่งที่นี่)`;
    } else {
      const readyText = s.ready ? 'พร้อมแล้ว' : 'ยังไม่พร้อม';
      const connText = s.connected ? 'เชื่อมต่อแล้ว' : 'หลุดการเชื่อมต่อ';
      meta.textContent = `พลังรวม ${statSum} แต้ม · ${readyText} · ${connText}`;
    }

    info.append(topRow, meta);
    card.appendChild(info);

    const right = document.createElement('div');
    right.className = 'bm-btn-row';
    if (isBot) {
      const pickBtn = document.createElement('button');
      pickBtn.type = 'button';
      pickBtn.className = 'bm-btn bm-btn-sm';
      pickBtn.dataset.testid = `online-pick-seat-${s.seat}`;
      pickBtn.textContent = 'เลือกที่นั่งนี้';
      pickBtn.addEventListener('click', () => {
        conn?.send({ t: 'seat', seat: s.seat });
      });
      right.appendChild(pickBtn);
    } else {
      const readyPill = document.createElement('span');
      readyPill.className = 'bm-soon-pill';
      readyPill.style.background = s.ready
        ? 'rgba(34, 197, 94, 0.22)'
        : 'rgba(148, 163, 184, 0.18)';
      readyPill.style.color = s.ready ? '#4ade80' : '#cbd5e1';
      readyPill.textContent = s.ready ? '✓ พร้อม' : 'รอพร้อม';
      right.appendChild(readyPill);
    }
    card.appendChild(right);

    return card;
  }

  function renderRoom(p: HTMLElement): void {
    const r = room;
    if (!r) return;
    renderHeader(p, 'ห้องแข่งขันออนไลน์ (Room Lobby)', 'ออกจากห้อง (Leave)');

    // Large room code bar + Copy button
    const codeBar = document.createElement('div');
    codeBar.className = 'bm-active-char-bar';
    codeBar.style.marginBottom = '18px';

    const codeInfo = document.createElement('div');
    codeInfo.className = 'bm-active-char-info';
    const codeTag = document.createElement('div');
    codeTag.className = 'bm-active-char-tag';
    codeTag.textContent = 'รหัสห้อง (Room Code · ส่งให้เพื่อนเพื่อเข้าร่วม)';
    const codeBig = document.createElement('div');
    codeBig.dataset.testid = 'online-room-code';
    codeBig.style.fontSize = '34px';
    codeBig.style.fontWeight = '900';
    codeBig.style.letterSpacing = '0.2em';
    codeBig.style.fontVariantNumeric = 'tabular-nums';
    codeBig.style.color = '#f8fafc';
    codeBig.style.userSelect = 'text';
    codeBig.textContent = r.code;
    codeInfo.append(codeTag, codeBig);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'bm-btn bm-btn-sm';
    copyBtn.dataset.testid = 'online-copy-code';
    copyBtn.textContent = copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกรหัส (Copy)';
    copyBtn.addEventListener('click', () => {
      try {
        void navigator.clipboard?.writeText(r.code);
      } catch {
        // Clipboard API unavailable; code is selectable text.
      }
      copied = true;
      if (copyTimer !== null) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
        if (!disposed && phase === 'room') render();
      }, 2000);
      render();
    });

    codeBar.append(codeInfo, copyBtn);
    p.appendChild(codeBar);

    // Seats list (2 for singles, 4 for doubles)
    const seatsTitle = document.createElement('div');
    seatsTitle.className = 'bm-section-title';
    seatsTitle.style.marginTop = '8px';
    seatsTitle.textContent = `ที่นั่งในห้อง (${r.seats.length === 2 ? 'เดี่ยว 2 ที่นั่ง' : 'คู่ 4 ที่นั่ง'})`;
    p.appendChild(seatsTitle);

    const seatsList = document.createElement('div');
    seatsList.className = 'bm-char-list';
    r.seats.forEach((s) => seatsList.appendChild(renderSeatCard(s, r)));
    p.appendChild(seatsList);

    // Settings (editable for host, read-only for others)
    const isHost = conn?.userId !== null && conn?.userId === r.hostId;
    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'bm-section-title';
    settingsTitle.textContent = isHost
      ? 'ตั้งค่าห้อง (หัวหน้าห้องแก้ไขได้)'
      : 'ตั้งค่าห้อง (อ่านอย่างเดียว · กำหนดโดยหัวหน้าห้อง)';
    p.appendChild(settingsTitle);

    if (isHost) {
      const hostSettings = buildSettingsControls(
        r.settings,
        (next) => {
          conn?.send({ t: 'settings', settings: next });
        },
        true,
      );
      p.appendChild(hostSettings);
    } else {
      const roBox = document.createElement('div');
      roBox.className = 'bm-setting-row';
      roBox.dataset.testid = 'online-settings-readonly';
      roBox.style.color = '#e2e8f0';
      const pointsLabel = r.settings.points === 'real' ? 'ค่าพลังจริง' : 'ทุกคน 20 แต้ม';
      roBox.textContent = `${EVENT_TEXT[r.settings.event]} · ${r.settings.format} · ตัวช่วย: ${MODE_TEXT[r.settings.assists.mode]} (ช่วยตี ${r.settings.assists.hitAssist}%) · ${pointsLabel}`;
      p.appendChild(roBox);
    }

    // Bottom action row: Ready toggle, Host Start, Leave
    const mySeat = you !== null ? r.seats.find((s) => s.seat === you) ?? null : null;
    const actionRow = document.createElement('div');
    actionRow.className = 'bm-btn-row';
    actionRow.style.marginTop = '20px';

    if (mySeat) {
      const readyBtn = document.createElement('button');
      readyBtn.type = 'button';
      readyBtn.className = `bm-btn${mySeat.ready ? ' bm-btn-active' : ''}`;
      readyBtn.dataset.testid = 'online-ready-toggle';
      readyBtn.textContent = mySeat.ready ? 'ยกเลิกพร้อม (Not Ready)' : 'พร้อมแล้ว (Ready)';
      readyBtn.addEventListener('click', () => {
        conn?.send({ t: 'ready', ready: !mySeat.ready });
      });
      actionRow.appendChild(readyBtn);
    }

    if (isHost) {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'bm-btn bm-btn-primary';
      startBtn.dataset.testid = 'online-start-match';
      startBtn.disabled = !canStartRoom(r, conn?.userId ?? null);
      startBtn.textContent = 'เริ่มการแข่งขัน (Start Match)';
      startBtn.addEventListener('click', () => {
        errorMsg = null;
        conn?.send({ t: 'start' });
      });
      actionRow.appendChild(startBtn);
    }

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'bm-btn bm-btn-danger';
    leaveBtn.dataset.testid = 'online-leave';
    leaveBtn.textContent = 'ออกจากห้อง (Leave)';
    leaveBtn.addEventListener('click', leaveToMenu);
    actionRow.appendChild(leaveBtn);

    p.appendChild(actionRow);
  }

  function render(): void {
    if (disposed || phase === 'playing' || phase === 'result') return;
    const p = ensurePanel();

    if (phase === 'connecting') {
      renderHeader(p, 'ออนไลน์ · ห้องกับเพื่อน (Online Rooms)', '← กลับเมนูหลัก');
      const status = document.createElement('div');
      status.className = 'bm-setting-row';
      status.dataset.testid = 'online-connecting';
      status.textContent = 'กำลังเชื่อมต่อเซิร์ฟเวอร์ออนไลน์... (Connecting...)';
      p.appendChild(status);
      return;
    }

    if (phase === 'disconnected') {
      renderHeader(p, 'ออนไลน์ · ห้องกับเพื่อน (Online Rooms)', '← กลับเมนูหลัก');
      const retryRow = document.createElement('div');
      retryRow.className = 'bm-btn-row';
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'bm-btn bm-btn-primary';
      retryBtn.dataset.testid = 'online-retry-connect';
      retryBtn.textContent = 'ลองเชื่อมต่ออีกครั้ง (Retry)';
      retryBtn.addEventListener('click', () => {
        void connectNow();
      });
      retryRow.appendChild(retryBtn);
      p.appendChild(retryRow);
      return;
    }

    if (phase === 'room' && room) {
      renderRoom(p);
      return;
    }

    renderLobby(p);
  }

  void connectNow();
}
