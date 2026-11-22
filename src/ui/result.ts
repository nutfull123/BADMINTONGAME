import type { MatchState, Side, TierId } from '../types';
import type { RoundName } from '../career';
import { ROUND_LABELS, TIER_LABELS, formatEarnedPointsSummary } from './labels';
import { mountOverlay } from './overlay';

export interface ResultTournamentExtras {
  outcome: 'advanced' | 'out' | 'champion';
  roundName: RoundName;
  placementBonus?: number;
  unlockedTier?: TierId | null;
}

export interface ResultExtras {
  pointsEarned?: number;
  totalEarned?: number;
  buttonLabel?: string;
  tournament?: ResultTournamentExtras;
  sideNames?: { near?: string; far?: string };
  subtitleNote?: string;
}

export function showResult(
  root: HTMLElement,
  match: MatchState,
  onAgain: () => void,
  extras?: ResultExtras,
): void {
  const { overlay, panel } = mountOverlay(root);
  panel.style.textAlign = 'center';

  const winnerSide: Side | null = match.winner;
  const youWon = winnerSide === 'near';
  const nearName = extras?.sideNames?.near ?? 'คุณ';
  const farName = extras?.sideNames?.far ?? 'บอท';
  const formatWinnerName = (name: string): string => (name.includes(' / ') ? `ทีม ${name}` : name);

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.color = winnerSide === null ? '#f8fafc' : youWon ? '#4ade80' : '#f87171';
  title.textContent =
    winnerSide === null
      ? 'จบการแข่งขัน (Match Ended)'
      : youWon
        ? extras?.sideNames?.near
          ? `${formatWinnerName(nearName)} ชนะ! (YOU WIN)`
          : 'คุณชนะ! (YOU WIN)'
        : extras?.sideNames?.far
          ? `${formatWinnerName(farName)} ชนะ`
          : 'บอทชนะ (BOT WINS)';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.style.fontSize = '24px';
  sub.style.fontWeight = '800';
  sub.style.color = '#f8fafc';
  sub.textContent = `ผลรวมเกม (Games): ${nearName} ${match.gamesWon.near} - ${match.gamesWon.far} ${farName}`;

  const gamesList = document.createElement('div');
  gamesList.style.margin = '18px 0 22px 0';
  gamesList.style.fontSize = '18px';
  gamesList.style.color = '#cbd5e1';
  gamesList.style.fontVariantNumeric = 'tabular-nums';

  const gamesToDisplay =
    match.completedGames.length > 0 ? match.completedGames : [match.score];
  gamesList.textContent = gamesToDisplay
    .map((g, idx) => `เกมที่ ${idx + 1}: ${g.near}–${g.far}`)
    .join('   ·   ');

  panel.append(title, sub, gamesList);

  if (extras?.subtitleNote) {
    const noteEl = document.createElement('div');
    noteEl.dataset.testid = 'result-subtitle-note';
    noteEl.style.margin = '0 auto 20px auto';
    noteEl.style.fontSize = '14px';
    noteEl.style.color = '#94a3b8';
    noteEl.textContent = extras.subtitleNote;
    panel.appendChild(noteEl);
  }

  if (extras && (extras.pointsEarned !== undefined || extras.totalEarned !== undefined || extras.tournament)) {
    const extrasBox = document.createElement('div');
    extrasBox.dataset.testid = 'result-extras';
    extrasBox.style.background = 'rgba(30, 41, 59, 0.72)';
    extrasBox.style.border = '1px solid rgba(56, 189, 248, 0.32)';
    extrasBox.style.borderRadius = '12px';
    extrasBox.style.padding = '16px 20px';
    extrasBox.style.margin = '0 auto 24px auto';
    extrasBox.style.maxWidth = '540px';
    extrasBox.style.display = 'flex';
    extrasBox.style.flexDirection = 'column';
    extrasBox.style.gap = '10px';

    if (extras.tournament) {
      const t = extras.tournament;
      const tourOutcome = document.createElement('div');
      tourOutcome.dataset.testid = 'result-tournament-outcome';
      tourOutcome.style.fontSize = '18px';
      tourOutcome.style.fontWeight = '800';
      const roundText = ROUND_LABELS[t.roundName];
      if (t.outcome === 'champion') {
        tourOutcome.style.color = '#facc15';
        tourOutcome.textContent = '🏆 แชมป์ทัวร์นาเมนต์! (Tournament Champion!)';
      } else if (t.outcome === 'advanced') {
        tourOutcome.style.color = '#4ade80';
        tourOutcome.textContent = `ผ่านเข้าสู่ ${roundText} (Advanced to ${t.roundName})`;
      } else {
        tourOutcome.style.color = '#f87171';
        tourOutcome.textContent = `ตกรอบที่ ${roundText} (Out in ${t.roundName})`;
      }
      extrasBox.appendChild(tourOutcome);

      if (t.placementBonus !== undefined && t.placementBonus > 0) {
        const bonusEl = document.createElement('div');
        bonusEl.dataset.testid = 'result-placement-bonus';
        bonusEl.style.fontSize = '15px';
        bonusEl.style.fontWeight = '700';
        bonusEl.style.color = '#facc15';
        bonusEl.textContent = `โบนัสอันดับทัวร์นาเมนต์ (Placement Bonus): +${t.placementBonus} แต้ม`;
        extrasBox.appendChild(bonusEl);
      }

      if (t.unlockedTier) {
        const unlockEl = document.createElement('div');
        unlockEl.dataset.testid = 'result-unlocked-tier';
        unlockEl.style.fontSize = '15px';
        unlockEl.style.fontWeight = '800';
        unlockEl.style.color = '#38bdf8';
        unlockEl.textContent = `🔓 ปลดล็อกรายการใหม่: ${TIER_LABELS[t.unlockedTier]}!`;
        extrasBox.appendChild(unlockEl);
      }
    }

    if (extras.pointsEarned !== undefined) {
      const earnedLine = document.createElement('div');
      earnedLine.dataset.testid = 'result-points-earned';
      earnedLine.style.fontSize = '16px';
      earnedLine.style.fontWeight = '700';
      earnedLine.style.color = '#4ade80';
      earnedLine.textContent = `แต้มที่ได้รับจากแมตช์นี้ (Match Points): +${extras.pointsEarned} แต้ม`;
      extrasBox.appendChild(earnedLine);
    }

    if (extras.totalEarned !== undefined) {
      const summary = formatEarnedPointsSummary(extras.totalEarned);
      const totalLine = document.createElement('div');
      totalLine.dataset.testid = 'result-total-earned';
      totalLine.style.fontSize = '14px';
      totalLine.style.color = '#e2e8f0';
      totalLine.textContent = `${summary.text} · ${summary.progressText}`;

      const track = document.createElement('div');
      track.className = 'bm-bar-track';
      track.style.height = '8px';
      const fill = document.createElement('div');
      fill.className = 'bm-bar-fill';
      fill.style.width = `${summary.progressPct}%`;
      fill.style.background = '#38bdf8';
      track.appendChild(fill);

      extrasBox.append(totalLine, track);
    }

    panel.appendChild(extrasBox);
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';
  btnRow.style.justifyContent = 'center';

  const againBtn = document.createElement('button');
  againBtn.type = 'button';
  againBtn.className = 'bm-btn bm-btn-primary';
  againBtn.dataset.testid = 'result-continue';
  againBtn.textContent = extras?.buttonLabel ?? 'กลับสู่เมนูหลัก (Main Menu)';
  againBtn.addEventListener('click', () => {
    overlay.remove();
    onAgain();
  });

  btnRow.appendChild(againBtn);
  panel.appendChild(btnRow);
}
