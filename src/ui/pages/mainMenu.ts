import { activeCharacter } from '../../app/characters';
import type { SaveData } from '../../types';
import { formatCharacterSummary } from '../labels';
import { mountOverlay } from '../overlay';

// ---------- 2. Main menu ----------

export interface MainMenuActions {
  onPlayMatch: () => void;
  onTutorial: () => void;
  onTournament?: () => void;
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
  panel.append(title, charBar, grid);
}
