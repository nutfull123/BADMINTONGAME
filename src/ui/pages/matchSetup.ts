import { activeCharacter } from '../../app/characters';
import { toMatchSettings } from '../../app/settings';
import type { GameSettings, MatchEvent, MatchSettings, SaveData, Stats } from '../../types';
import { EVENTS, eventsFor, fitEvent } from '../events';
import { formatCharacterSummary } from '../labels';
import { createStorageNotice, mountOverlay } from '../overlay';
import { buildChipSetting } from '../widgets';

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
  const notice = createStorageNotice(overlay);
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
    notice.set(onSaveChange(currentSave));
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
    notice.set(onSaveChange(currentSave));
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
