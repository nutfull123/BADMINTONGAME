import type { SaveData, SyncChoice } from '../../types';
import { formatSaveSyncSummary } from '../labels';
import { mountOverlay } from '../overlay';

// ---------- First-sign-in Sync Conflict Dialog (in-page, never window.confirm) ----------

export function showSyncChoiceDialog(
  root: HTMLElement,
  localSave: SaveData,
  cloudSave: SaveData,
  onChoose: (choice: SyncChoice) => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '26px';
  title.textContent = 'พบข้อมูลตัวละครทั้งในบัญชีและในเบราว์เซอร์นี้ (Sync Conflict)';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.textContent =
    'กรุณาเลือกข้อมูลที่ต้องการเก็บไว้ใช้งาน (สามารถเลือกใช้ข้อมูลฝั่งใดฝั่งหนึ่ง หรือรวมตัวละครทั้งหมดเข้าด้วยกันได้)';

  const cardsBox = document.createElement('div');
  cardsBox.style.display = 'flex';
  cardsBox.style.flexDirection = 'column';
  cardsBox.style.gap = '12px';
  cardsBox.style.marginBottom = '22px';

  const makeSummaryCard = (label: string, testId: string, summaryText: string): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'bm-char-card';
    card.dataset.testid = testId;
    card.style.flexDirection = 'column';
    card.style.alignItems = 'flex-start';

    const tag = document.createElement('div');
    tag.className = 'bm-active-char-tag';
    tag.textContent = label;

    const body = document.createElement('div');
    body.style.fontSize = '14px';
    body.style.color = '#f8fafc';
    body.style.lineHeight = '1.5';
    body.textContent = summaryText;

    card.append(tag, body);
    return card;
  };

  cardsBox.append(
    makeSummaryCard(
      `ข้อมูลในบัญชีออนไลน์ (Account Cloud Save · ${cloudSave.characters.length} ตัวละคร)`,
      'sync-summary-cloud',
      formatSaveSyncSummary(cloudSave),
    ),
    makeSummaryCard(
      `ข้อมูลในเบราว์เซอร์นี้ (This Browser Save · ${localSave.characters.length} ตัวละคร)`,
      'sync-summary-local',
      formatSaveSyncSummary(localSave),
    ),
  );

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';

  const pick = (choice: SyncChoice) => {
    overlay.remove();
    onChoose(choice);
  };

  const mergeBtn = document.createElement('button');
  mergeBtn.type = 'button';
  mergeBtn.className = 'bm-btn bm-btn-primary';
  mergeBtn.dataset.testid = 'sync-choose-merge';
  mergeBtn.textContent = 'รวมตัวละครทั้งหมด (Merge Both)';
  mergeBtn.addEventListener('click', () => pick('merge'));

  const cloudBtn = document.createElement('button');
  cloudBtn.type = 'button';
  cloudBtn.className = 'bm-btn';
  cloudBtn.dataset.testid = 'sync-choose-cloud';
  cloudBtn.textContent = 'ใช้ข้อมูลในบัญชี (Keep Account’s)';
  cloudBtn.addEventListener('click', () => pick('cloud'));

  const localBtn = document.createElement('button');
  localBtn.type = 'button';
  localBtn.className = 'bm-btn';
  localBtn.dataset.testid = 'sync-choose-local';
  localBtn.textContent = 'ใช้ข้อมูลในเบราว์เซอร์นี้ (Keep Browser’s)';
  localBtn.addEventListener('click', () => pick('local'));

  btnRow.append(mergeBtn, cloudBtn, localBtn);
  panel.append(title, sub, cardsBox, btnRow);
}
