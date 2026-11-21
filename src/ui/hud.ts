import type { MatchState } from '../types';
import { ensureStyles } from './styles';

export function createHud(root: HTMLElement): {
  update(view: {
    match: MatchState;
    stamina: number;
    charge: number | null;
    message: string | null;
  }): void;
  dispose(): void;
} {
  ensureStyles();

  const hud = document.createElement('div');
  hud.className = 'bm-hud';

  const board = document.createElement('div');
  board.className = 'bm-scoreboard';

  const nearBox = document.createElement('div');
  nearBox.className = 'bm-side-box';
  const nearMeta = document.createElement('div');
  nearMeta.className = 'bm-side-meta';
  const nearLabel = document.createElement('div');
  nearLabel.className = 'bm-side-label';
  const nearTitle = document.createElement('span');
  nearTitle.textContent = 'คุณ (YOU)';
  const nearServe = document.createElement('span');
  nearServe.className = 'bm-serve-badge';
  nearLabel.append(nearTitle, nearServe);
  const nearGames = document.createElement('div');
  nearGames.className = 'bm-games-pill';
  nearMeta.append(nearLabel, nearGames);
  const nearScore = document.createElement('div');
  nearScore.className = 'bm-big-score';
  nearScore.dataset.testid = 'score-near';
  nearBox.append(nearMeta, nearScore);

  const divider = document.createElement('div');
  divider.className = 'bm-score-divider';
  divider.textContent = ':';

  const farBox = document.createElement('div');
  farBox.className = 'bm-side-box';
  const farScore = document.createElement('div');
  farScore.className = 'bm-big-score';
  farScore.dataset.testid = 'score-far';
  const farMeta = document.createElement('div');
  farMeta.className = 'bm-side-meta';
  const farLabel = document.createElement('div');
  farLabel.className = 'bm-side-label';
  const farTitle = document.createElement('span');
  farTitle.textContent = 'บอท (BOT)';
  const farServe = document.createElement('span');
  farServe.className = 'bm-serve-badge';
  farLabel.append(farTitle, farServe);
  const farGames = document.createElement('div');
  farGames.className = 'bm-games-pill';
  farMeta.append(farLabel, farGames);
  farBox.append(farScore, farMeta);

  board.append(nearBox, divider, farBox);

  const bars = document.createElement('div');
  bars.className = 'bm-hud-bars';

  const stamGroup = document.createElement('div');
  stamGroup.className = 'bm-bar-group';
  const stamLabelRow = document.createElement('div');
  stamLabelRow.className = 'bm-bar-label';
  const stamName = document.createElement('span');
  stamName.textContent = 'แรง (STAMINA)';
  const stamPct = document.createElement('span');
  stamLabelRow.append(stamName, stamPct);
  const stamTrack = document.createElement('div');
  stamTrack.className = 'bm-bar-track';
  const stamFill = document.createElement('div');
  stamFill.className = 'bm-bar-fill';
  stamFill.dataset.testid = 'stamina-fill';
  stamTrack.appendChild(stamFill);
  stamGroup.append(stamLabelRow, stamTrack);

  const chargeGroup = document.createElement('div');
  chargeGroup.className = 'bm-bar-group';
  const chargeLabelRow = document.createElement('div');
  chargeLabelRow.className = 'bm-bar-label';
  const chargeName = document.createElement('span');
  chargeName.textContent = 'ชาร์จ (CHARGE)';
  const chargePct = document.createElement('span');
  chargeLabelRow.append(chargeName, chargePct);
  const chargeTrack = document.createElement('div');
  chargeTrack.className = 'bm-bar-track';
  const chargeFill = document.createElement('div');
  chargeFill.className = 'bm-bar-fill';
  chargeFill.dataset.testid = 'charge-fill';
  chargeTrack.appendChild(chargeFill);
  chargeGroup.append(chargeLabelRow, chargeTrack);

  bars.append(stamGroup, chargeGroup);

  const centerMsg = document.createElement('div');
  centerMsg.className = 'bm-center-msg';
  centerMsg.dataset.testid = 'hud-message';
  centerMsg.style.display = 'none';

  hud.append(board, bars, centerMsg);
  root.appendChild(hud);

  return {
    update({ match, stamina, charge, message }) {
      nearScore.textContent = String(match.score.near);
      farScore.textContent = String(match.score.far);
      nearGames.textContent = `เกม (Games): ${match.gamesWon.near}`;
      farGames.textContent = `เกม (Games): ${match.gamesWon.far}`;

      const courtLabel = match.serviceCourt === 'right' ? 'R' : 'L';
      if (match.server === 'near') {
        nearServe.style.display = 'inline-block';
        nearServe.textContent = `เสิร์ฟ (${courtLabel})`;
        farServe.style.display = 'none';
      } else {
        farServe.style.display = 'inline-block';
        farServe.textContent = `เสิร์ฟ (${courtLabel})`;
        nearServe.style.display = 'none';
      }

      const clampedStam = Math.max(0, Math.min(1, stamina));
      const stamPercent = Math.round(clampedStam * 100);
      stamPct.textContent = `${stamPercent}%`;
      stamFill.style.width = `${stamPercent}%`;
      stamFill.style.background =
        clampedStam > 0.35 ? '#22c55e' : clampedStam > 0.15 ? '#f59e0b' : '#ef4444';

      if (charge === null) {
        chargePct.textContent = '—';
        chargeFill.style.width = '0%';
        chargeFill.style.background = '#38bdf8';
      } else {
        const clampedCharge = Math.max(0, Math.min(1, charge));
        const chargePercent = Math.round(clampedCharge * 100);
        chargePct.textContent = `${chargePercent}%`;
        chargeFill.style.width = `${chargePercent}%`;
        chargeFill.style.background = clampedCharge >= 0.85 ? '#facc15' : '#38bdf8';
      }

      const activeMessage =
        message ?? (match.intervalNow ? 'พักครึ่งเกม (Interval Break)' : null);
      if (activeMessage) {
        centerMsg.style.display = 'block';
        centerMsg.textContent = activeMessage;
      } else {
        centerMsg.style.display = 'none';
        centerMsg.textContent = '';
      }
    },
    dispose() {
      hud.remove();
    },
  };
}
