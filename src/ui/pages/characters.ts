import {
  characterBudget,
  createCharacter,
  deleteCharacter,
  setActiveCharacter,
  statsError,
  updateCharacter,
} from '../../app/characters';
import { heightOf } from '../../sim/tuning';
import type { BodyType, Character, Gender, SaveData, Stats } from '../../types';
import { BODY_LABELS, GENDER_LABELS, formatCharacterSummary, formatEarnedPointsSummary } from '../labels';
import { STAT_BUDGET, PRESETS, budgetLeft, clampStatToBudget, type StatKey } from '../model';
import { createStorageNotice, mountOverlay } from '../overlay';

// ---------- 5. My Characters (ตัวละครของฉัน) ----------

export function showCharacters(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onBackToMenu: () => void,
  onHome: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  const notice = createStorageNotice(overlay);
  let currentSave = save;
  let editingId: string | 'new' | null = currentSave.characters.length === 0 ? 'new' : null;
  let confirmingDeleteId: string | null = null;

  function commitSave(next: SaveData): void {
    currentSave = next;
    const ok = onSaveChange(currentSave);
    notice.set(ok);
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
      // No character yet: always offer a way back to Home, even when the save cannot be written, so
      // a blocked-storage browser is not trapped in character creation.
      const homeBtn = document.createElement('button');
      homeBtn.type = 'button';
      homeBtn.className = 'bm-btn bm-btn-sm';
      homeBtn.dataset.testid = 'characters-back-home';
      homeBtn.textContent = '← กลับหน้าแรก (Home)';
      homeBtn.addEventListener('click', () => {
        overlay.remove();
        onHome();
      });
      headerBar.append(title, homeBtn);
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
        const earnedInfo = formatEarnedPointsSummary(c.earnedPoints);
        const earnedLine = document.createElement('div');
        earnedLine.style.fontSize = '12px';
        earnedLine.style.color = '#38bdf8';
        earnedLine.style.marginTop = '2px';
        earnedLine.textContent = `${earnedInfo.text} · ${earnedInfo.progressText}`;
        info.append(nameLine, statsLine, earnedLine);

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
    const budget = Math.floor(existing ? characterBudget(existing) : STAT_BUDGET);
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

    // Earned points & progress to next point
    const earnedSummary = formatEarnedPointsSummary(existing ? existing.earnedPoints : 0);
    const progressRow = document.createElement('div');
    progressRow.className = 'bm-progress-row';
    progressRow.dataset.testid = 'earned-points-summary';
    const progressTop = document.createElement('div');
    progressTop.className = 'bm-progress-top';
    const earnedLeftEl = document.createElement('span');
    earnedLeftEl.style.color = '#38bdf8';
    earnedLeftEl.textContent = earnedSummary.text;
    const earnedRightEl = document.createElement('span');
    earnedRightEl.textContent = earnedSummary.progressText;
    progressTop.append(earnedLeftEl, earnedRightEl);
    const progressTrack = document.createElement('div');
    progressTrack.className = 'bm-bar-track';
    progressTrack.style.height = '8px';
    const progressFill = document.createElement('div');
    progressFill.className = 'bm-bar-fill';
    progressFill.style.width = `${earnedSummary.progressPct}%`;
    progressFill.style.background = '#38bdf8';
    progressTrack.appendChild(progressFill);
    progressRow.append(progressTop, progressTrack);

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
      progressRow,
      slidersGrid,
      errBox,
      footer,
    );
    panel.appendChild(formBox);
  }

  renderPage();
}
