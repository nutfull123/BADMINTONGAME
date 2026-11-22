import { activeCharacter, awardPoints, setCareer } from '../../app/characters';
import {
  TIERS,
  abandonTournament,
  canEnter,
  createTournament,
  eventsFor,
  finishTournament,
  humanMatch,
  newCareer,
  roundCount,
  type HumanMatch,
} from '../../career';
import type {
  CareerProgress,
  Entrant,
  MatchEvent,
  SaveData,
  Stats,
  TierId,
  Tournament,
} from '../../types';
import { EVENTS, fitEvent } from '../events';
import {
  ROUND_LABELS,
  TIER_LABELS,
  formatCharacterSummary,
  formatEarnedPointsSummary,
  formatPlayerSideScore,
  formatRoundReachedLabel,
  roundNameFor,
} from '../labels';
import { createStorageNotice, mountOverlay } from '../overlay';

export interface CareerMatchLaunch {
  tournament: Tournament;
  next: HumanMatch;
}

const statTotal = (s: Stats): number => s.speed + s.power + s.recovery + s.stamina;

const formatEntrantNames = (e: Entrant): string =>
  e.players.map((p) => `${p.name} (${statTotal(p.stats)})`).join(' / ');

const BOT_LEVEL_THAI: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'ง่าย (Easy)',
  medium: 'กลาง (Medium)',
  hard: 'ยาก (Hard)',
};

export function showCareerPage(
  root: HTMLElement,
  save: SaveData,
  onSaveChange: (next: SaveData) => boolean,
  onPlayTournamentMatch: (launch: CareerMatchLaunch) => void,
  onBack: () => void,
): void {
  const initialActive = activeCharacter(save);
  if (!initialActive) {
    onBack();
    return;
  }

  const { overlay, panel } = mountOverlay(root);
  const notice = createStorageNotice(overlay);
  let currentSave = save;
  let selectedTier: TierId = 'club';
  let selectedEvent: MatchEvent = fitEvent(currentSave.settings.match.event, initialActive.stats.gender);
  let confirmingAbandon = false;
  let bannerNotice: string | null = null;

  function commitSave(next: SaveData): void {
    currentSave = next;
    notice.set(onSaveChange(currentSave));
  }

  function renderPage(): void {
    panel.innerHTML = '';
    const active = activeCharacter(currentSave);
    if (!active) {
      overlay.remove();
      onBack();
      return;
    }

    const career: CareerProgress = active.career ?? newCareer();
    const validEvents = eventsFor(active.stats.gender);
    if (!validEvents.includes(selectedEvent)) {
      selectedEvent = validEvents[0]!;
    }
    if (!canEnter(career, selectedTier)) {
      selectedTier = 'club';
    }

    // Header
    const headerBar = document.createElement('div');
    headerBar.className = 'bm-header-bar';
    const title = document.createElement('h1');
    title.className = 'bm-title';
    title.style.fontSize = '30px';
    title.style.margin = '0';
    title.textContent = 'ทัวร์นาเมนต์ (ออฟไลน์) · Career Tournaments';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'bm-btn bm-btn-sm';
    backBtn.dataset.testid = 'career-back';
    backBtn.textContent = '← กลับเมนูหลัก';
    backBtn.addEventListener('click', () => {
      overlay.remove();
      onBack();
    });
    headerBar.append(title, backBtn);
    panel.appendChild(headerBar);

    // Character + earned points summary
    const earned = formatEarnedPointsSummary(active.earnedPoints);
    const charBar = document.createElement('div');
    charBar.className = 'bm-active-char-bar';
    charBar.style.marginBottom = '16px';
    const charLeft = document.createElement('div');
    charLeft.className = 'bm-active-char-info';
    const charName = document.createElement('div');
    charName.className = 'bm-active-char-name';
    charName.style.fontSize = '17px';
    charName.textContent = formatCharacterSummary(active);
    const charPts = document.createElement('div');
    charPts.style.fontSize = '13px';
    charPts.style.color = '#38bdf8';
    charPts.textContent = `${earned.text} · ${earned.progressText}`;
    charLeft.append(charName, charPts);
    charBar.appendChild(charLeft);
    panel.appendChild(charBar);

    if (bannerNotice) {
      const msg = document.createElement('div');
      msg.className = 'bm-notice';
      msg.dataset.testid = 'career-banner';
      msg.style.marginBottom = '14px';
      msg.textContent = bannerNotice;
      panel.appendChild(msg);
    }

    // Tier cards (4 tiers, locked or open with best round reached)
    const tierHeader = document.createElement('div');
    tierHeader.className = 'bm-section-title';
    tierHeader.style.marginTop = '8px';
    tierHeader.textContent = 'เลือกรายการแข่งขัน (4 ระดับ · เข้ารอบรองชนะเลิศ SF เพื่อปลดล็อกระดับถัดไป)';
    panel.appendChild(tierHeader);

    const tierGrid = document.createElement('div');
    tierGrid.className = 'bm-tier-grid';

    const hasActiveTournament = career.current !== null;

    TIERS.forEach((tier) => {
      const open = canEnter(career, tier.id);
      const isSelected = !hasActiveTournament && selectedTier === tier.id;
      const isCurrentTier = career.current?.tier === tier.id;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `bm-tier-card${isSelected || isCurrentTier ? ' active' : ''}${!open ? ' locked' : ''}`;
      card.dataset.testid = `tier-card-${tier.id}`;
      card.disabled = !open || hasActiveTournament;

      const topLine = document.createElement('div');
      topLine.style.display = 'flex';
      topLine.style.justifyContent = 'space-between';
      topLine.style.alignItems = 'center';
      topLine.style.width = '100%';
      topLine.style.fontWeight = '800';
      topLine.style.fontSize = '16px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = TIER_LABELS[tier.id];
      const statusBadge = document.createElement('span');
      statusBadge.className = 'bm-soon-pill';
      if (isCurrentTier) {
        statusBadge.style.background = 'rgba(56, 189, 248, 0.25)';
        statusBadge.style.color = '#38bdf8';
        statusBadge.textContent = 'กำลังแข่งขัน';
      } else if (open) {
        statusBadge.style.background = 'rgba(34, 197, 94, 0.2)';
        statusBadge.style.color = '#4ade80';
        statusBadge.textContent = 'เปิดแล้ว (Open)';
      } else {
        statusBadge.textContent = '🔒 ล็อก (Locked)';
      }
      topLine.append(nameSpan, statusBadge);

      const metaLine = document.createElement('div');
      metaLine.style.fontSize = '13px';
      metaLine.style.color = '#94a3b8';
      metaLine.textContent = `สาย ${tier.size} ทีม · บอท ${BOT_LEVEL_THAI[tier.botLevel]} (~${tier.botPoints} แต้ม)`;

      const bestLine = document.createElement('div');
      bestLine.style.fontSize = '13px';
      bestLine.style.color = '#cbd5e1';
      bestLine.textContent = `ผลงานดีที่สุด: ${formatRoundReachedLabel(career.best[tier.id], tier.size)}`;

      card.append(topLine, metaLine, bestLine);
      card.addEventListener('click', () => {
        if (!open || hasActiveTournament) return;
        selectedTier = tier.id;
        renderPage();
      });
      tierGrid.appendChild(card);
    });
    panel.appendChild(tierGrid);

    if (!career.current) {
      // Event picker (limited to eventsFor(character.stats.gender)) + Start tournament button
      const eventHeader = document.createElement('div');
      eventHeader.className = 'bm-section-title';
      eventHeader.textContent = 'ประเภทการแข่งขัน (Event)';
      const eventRow = document.createElement('div');
      eventRow.className = 'bm-btn-row';

      EVENTS.filter((e) => validEvents.includes(e.value)).forEach(({ value, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `bm-btn bm-btn-sm${selectedEvent === value ? ' bm-btn-active' : ''}`;
        btn.dataset.testid = `career-event-${value}`;
        btn.textContent = label;
        btn.addEventListener('click', () => {
          selectedEvent = value;
          renderPage();
        });
        eventRow.appendChild(btn);
      });

      const startRow = document.createElement('div');
      startRow.className = 'bm-btn-row';
      startRow.style.marginTop = '22px';
      startRow.style.justifyContent = 'flex-end';

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'bm-btn bm-btn-primary';
      startBtn.dataset.testid = 'career-start-tournament';
      startBtn.textContent = `เริ่มทัวร์นาเมนต์ ${TIER_LABELS[selectedTier]} (Start Tournament)`;
      startBtn.addEventListener('click', () => {
        bannerNotice = null;
        const seed = Date.now() | 0;
        const tournament = createTournament(selectedTier, selectedEvent, active, seed);
        const nextCareer: CareerProgress = { ...career, current: tournament };
        commitSave(setCareer(currentSave, active.id, nextCareer));
        renderPage();
      });
      startRow.appendChild(startBtn);

      panel.append(eventHeader, eventRow, startRow);
      return;
    }

    // Active or finished tournament bracket view
    const tour = career.current;
    renderActiveTournament(tour, career, active.id);
  }

  function renderActiveTournament(tour: Tournament, career: CareerProgress, characterId: string): void {
    const active = activeCharacter(currentSave)!;
    const fullFormat = currentSave.settings.match.format;
    const next = humanMatch(tour, fullFormat);
    const totalRounds = roundCount(tour);
    const humanIdx = tour.entrants.findIndex((e) => e.human);
    const eventLabel = EVENTS.find((e) => e.value === tour.event)?.label ?? tour.event;

    const tourHeader = document.createElement('div');
    tourHeader.className = 'bm-header-bar';
    tourHeader.style.marginTop = '20px';
    tourHeader.style.marginBottom = '8px';

    const tourTitle = document.createElement('div');
    tourTitle.className = 'bm-section-title';
    tourTitle.style.margin = '0';
    tourTitle.style.color = '#f8fafc';
    tourTitle.style.fontSize = '16px';
    tourTitle.textContent = `สายการแข่งขัน: ${TIER_LABELS[tour.tier]} · ${eventLabel}`;

    const abandonControls = document.createElement('div');
    abandonControls.className = 'bm-btn-row';

    if (tour.status === 'playing') {
      if (confirmingAbandon) {
        const prompt = document.createElement('span');
        prompt.style.fontSize = '14px';
        prompt.style.color = '#fca5a5';
        prompt.style.alignSelf = 'center';
        prompt.textContent = 'ยืนยันสละสิทธิ์ทัวร์นาเมนต์นี้? (ไม่ได้รับโบนัส)';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'bm-btn bm-btn-sm bm-btn-danger';
        confirmBtn.dataset.testid = 'career-confirm-abandon';
        confirmBtn.textContent = 'ยืนยันสละสิทธิ์';
        confirmBtn.addEventListener('click', () => {
          confirmingAbandon = false;
          const abandoned = abandonTournament(tour);
          const finished = finishTournament(career, abandoned);
          let nextSave = setCareer(currentSave, characterId, finished.career);
          if (finished.bonus > 0) {
            nextSave = awardPoints(nextSave, characterId, finished.bonus);
          }
          bannerNotice = finished.unlocked
            ? `สละสิทธิ์ทัวร์นาเมนต์แล้ว · ปลดล็อก ${TIER_LABELS[finished.unlocked]}!`
            : 'สละสิทธิ์ทัวร์นาเมนต์แล้ว (Abandoned tournament)';
          commitSave(nextSave);
          renderPage();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'bm-btn bm-btn-sm';
        cancelBtn.dataset.testid = 'career-cancel-abandon';
        cancelBtn.textContent = 'ยกเลิก';
        cancelBtn.addEventListener('click', () => {
          confirmingAbandon = false;
          renderPage();
        });

        abandonControls.append(prompt, confirmBtn, cancelBtn);
      } else {
        const abandonBtn = document.createElement('button');
        abandonBtn.type = 'button';
        abandonBtn.className = 'bm-btn bm-btn-sm bm-btn-danger';
        abandonBtn.dataset.testid = 'career-abandon';
        abandonBtn.textContent = 'สละสิทธิ์ (Abandon)';
        abandonBtn.addEventListener('click', () => {
          confirmingAbandon = true;
          renderPage();
        });
        abandonControls.appendChild(abandonBtn);
      }
    } else {
      // Defensive recovery if a completed tournament was ever left in career.current
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'bm-btn bm-btn-sm bm-btn-primary';
      closeBtn.dataset.testid = 'career-finish-tournament';
      closeBtn.textContent = 'รับรางวัลและปิดสายแข่งขัน';
      closeBtn.addEventListener('click', () => {
        const finished = finishTournament(career, tour);
        let nextSave = setCareer(currentSave, characterId, finished.career);
        if (finished.bonus > 0) {
          nextSave = awardPoints(nextSave, characterId, finished.bonus);
        }
        commitSave(nextSave);
        renderPage();
      });
      abandonControls.appendChild(closeBtn);
    }

    tourHeader.append(tourTitle, abandonControls);
    panel.appendChild(tourHeader);

    // Next match card
    if (next) {
      const card = document.createElement('div');
      card.className = 'bm-next-match-card';
      card.dataset.testid = 'career-next-match';

      const info = document.createElement('div');
      info.style.display = 'flex';
      info.style.flexDirection = 'column';
      info.style.gap = '4px';

      const roundTitle = document.createElement('div');
      roundTitle.style.fontSize = '18px';
      roundTitle.style.fontWeight = '800';
      roundTitle.style.color = '#4ade80';
      roundTitle.textContent = `แมตช์ถัดไป: ${ROUND_LABELS[next.roundName]}`;

      const oppLine = document.createElement('div');
      oppLine.style.fontSize = '15px';
      oppLine.style.fontWeight = '700';
      oppLine.style.color = '#f8fafc';
      oppLine.textContent = `คู่แข่ง (Opponent): ${formatEntrantNames(next.opponent)}`;

      const metaParts: string[] = [];
      if (next.partner) {
        metaParts.push(`คู่หู (Partner): ${next.partner.name} (${statTotal(next.partner.stats)} แต้ม)`);
      } else {
        metaParts.push(`ผู้เล่น: ${active.name} (${statTotal(active.stats)} แต้ม)`);
      }
      const formatText =
        next.format === '1x15'
          ? '1 เกม 15 แต้ม (1×15 One Game)'
          : next.format === '3x21'
            ? '2 ใน 3 เกม 21 แต้ม (Best of 3 · 3×21)'
            : '2 ใน 3 เกม 15 แต้ม (Best of 3 · 3×15)';
      metaParts.push(`กติกา: ${formatText}`);
      metaParts.push(`บอท: ${BOT_LEVEL_THAI[next.botLevel]}`);

      const metaLine = document.createElement('div');
      metaLine.style.fontSize = '13px';
      metaLine.style.color = '#cbd5e1';
      metaLine.textContent = metaParts.join(' · ');

      info.append(roundTitle, oppLine, metaLine);

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'bm-btn bm-btn-primary';
      playBtn.dataset.testid = 'career-play-match';
      playBtn.textContent = 'ลงสนาม (Play Match)';
      playBtn.addEventListener('click', () => {
        overlay.remove();
        onPlayTournamentMatch({ tournament: tour, next });
      });

      card.append(info, playBtn);
      panel.appendChild(card);
    }

    // Bracket columns
    const bracketScroll = document.createElement('div');
    bracketScroll.className = 'bm-bracket-scroll';
    bracketScroll.dataset.testid = 'career-bracket';

    for (let r = 0; r < totalRounds; r++) {
      const col = document.createElement('div');
      col.className = 'bm-bracket-col';
      const rn = roundNameFor(r, totalRounds);

      const colTitle = document.createElement('div');
      colTitle.className = 'bm-bracket-col-title';
      colTitle.textContent = ROUND_LABELS[rn];
      col.appendChild(colTitle);

      const roundMatches = tour.rounds[r];
      if (!roundMatches) {
        const placeholderCount = tour.entrants.length >> (r + 1);
        for (let i = 0; i < placeholderCount; i++) {
          const box = document.createElement('div');
          box.className = 'bm-bracket-match';
          box.style.opacity = '0.45';
          box.textContent = 'รอผลการแข่งขัน (TBD)';
          col.appendChild(box);
        }
      } else {
        roundMatches.forEach((m) => {
          const entA = tour.entrants[m.a]!;
          const entB = tour.entrants[m.b]!;
          const involvesHuman = m.a === humanIdx || m.b === humanIdx;

          const box = document.createElement('div');
          box.className = `bm-bracket-match${involvesHuman ? ' human' : ''}`;

          const rowA = document.createElement('div');
          rowA.className = `bm-bracket-team${entA.human ? ' human' : ''}${m.winner === m.a ? ' winner' : ''}`;
          rowA.textContent = formatEntrantNames(entA);

          const rowB = document.createElement('div');
          rowB.className = `bm-bracket-team${entB.human ? ' human' : ''}${m.winner === m.b ? ' winner' : ''}`;
          rowB.textContent = formatEntrantNames(entB);

          box.append(rowA, rowB);

          if (m.score) {
            const scoreRow = document.createElement('div');
            scoreRow.className = 'bm-bracket-score';
            // Show the player's score from the player's side when the match involves the human
            const shownScore = involvesHuman
              ? formatPlayerSideScore(m.score, m.a === humanIdx)
              : m.score;
            scoreRow.textContent = `ผล: ${shownScore}`;
            box.appendChild(scoreRow);
          }

          col.appendChild(box);
        });
      }

      bracketScroll.appendChild(col);
    }

    panel.appendChild(bracketScroll);
  }

  renderPage();
}
