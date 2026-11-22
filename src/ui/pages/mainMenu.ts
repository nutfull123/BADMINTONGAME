import { activeCharacter } from '../../app/characters';
import type { AccountUser, SaveData } from '../../types';
import { formatAccountBadge, formatCharacterSummary } from '../labels';
import { mountOverlay } from '../overlay';

// ---------- 2. Main menu ----------

export interface MainMenuActions {
  onPlayMatch: () => void;
  onTutorial: () => void;
  onTournament?: () => void;
  onCharacters: () => void;
  onSettings: () => void;
  user?: AccountUser | null;
  syncError?: string | null;
  onRetrySync?: () => void;
}

export function showMainMenu(root: HTMLElement, save: SaveData, actions: MainMenuActions): void {
  const active = activeCharacter(save);
  if (!active) {
    actions.onCharacters();
    return;
  }

  const { overlay, panel } = mountOverlay(root);

  const headerBar = document.createElement('div');
  headerBar.className = 'bm-header-bar';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '32px';
  title.style.margin = '0';
  title.textContent = 'เมนูหลัก (Main Menu)';

  const accountBadge = document.createElement('div');
  accountBadge.className = 'bm-soon-pill';
  accountBadge.dataset.testid = 'menu-account-status';
  accountBadge.style.fontSize = '13px';
  accountBadge.style.padding = '5px 12px';
  if (actions.user) {
    accountBadge.style.background = 'rgba(56, 189, 248, 0.2)';
    accountBadge.style.color = '#38bdf8';
  }
  accountBadge.textContent = formatAccountBadge(actions.user ?? null);

  headerBar.append(title, accountBadge);
  panel.appendChild(headerBar);

  if (actions.syncError) {
    const syncWarn = document.createElement('div');
    syncWarn.className = 'bm-notice';
    syncWarn.dataset.testid = 'menu-sync-error';
    syncWarn.setAttribute('role', 'alert');
    syncWarn.style.marginBottom = '16px';
    syncWarn.style.display = 'flex';
    syncWarn.style.alignItems = 'center';
    syncWarn.style.justifyContent = 'space-between';
    syncWarn.style.gap = '12px';
    syncWarn.style.flexWrap = 'wrap';

    const warnMsg = document.createElement('span');
    warnMsg.textContent = actions.syncError;
    syncWarn.appendChild(warnMsg);

    if (actions.onRetrySync) {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'bm-btn bm-btn-sm';
      retryBtn.dataset.testid = 'menu-retry-sync';
      retryBtn.textContent = 'ลองซิงก์อีกครั้ง (Retry sync)';
      retryBtn.addEventListener('click', () => {
        retryBtn.disabled = true;
        actions.onRetrySync?.();
      });
      syncWarn.appendChild(retryBtn);
    }

    panel.appendChild(syncWarn);
  }

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
  tourBtn.dataset.testid = 'menu-tournament';
  tourBtn.textContent = 'ทัวร์นาเมนต์ (ออฟไลน์)';
  tourBtn.addEventListener('click', () => {
    overlay.remove();
    actions.onTournament?.();
  });

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
  panel.append(charBar, grid);
}
