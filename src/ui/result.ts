import type { MatchState, Side } from '../types';
import { mountOverlay } from './overlay';

export function showResult(
  root: HTMLElement,
  match: MatchState,
  onAgain: () => void,
): void {
  const { overlay, panel } = mountOverlay(root);
  panel.style.textAlign = 'center';

  const winnerSide: Side | null = match.winner;
  const youWon = winnerSide === 'near';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.color = youWon ? '#4ade80' : '#f87171';
  title.textContent =
    winnerSide === null
      ? 'จบการแข่งขัน (Match Ended)'
      : youWon
        ? 'คุณชนะ! (YOU WIN)'
        : 'บอทชนะ (BOT WINS)';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.style.fontSize = '24px';
  sub.style.fontWeight = '800';
  sub.style.color = '#f8fafc';
  sub.textContent = `ผลรวมเกม (Games): คุณ ${match.gamesWon.near} - ${match.gamesWon.far} บอท`;

  const gamesList = document.createElement('div');
  gamesList.style.margin = '18px 0 28px 0';
  gamesList.style.fontSize = '18px';
  gamesList.style.color = '#cbd5e1';
  gamesList.style.fontVariantNumeric = 'tabular-nums';

  const gamesToDisplay =
    match.completedGames.length > 0 ? match.completedGames : [match.score];
  gamesList.textContent = gamesToDisplay
    .map((g, idx) => `เกมที่ ${idx + 1}: ${g.near}–${g.far}`)
    .join('   ·   ');

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';
  btnRow.style.justifyContent = 'center';

  const againBtn = document.createElement('button');
  againBtn.type = 'button';
  againBtn.className = 'bm-btn bm-btn-primary';
  againBtn.textContent = 'กลับสู่เมนูหลัก (Main Menu)';
  againBtn.addEventListener('click', () => {
    overlay.remove();
    onAgain();
  });

  btnRow.appendChild(againBtn);
  panel.append(title, sub, gamesList, btnRow);
}
