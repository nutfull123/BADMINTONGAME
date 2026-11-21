// The single injected <style> element for every UI screen. Idempotent: added once per document.
const STYLE_ID = 'badminton-ui-styles';

export function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .bm-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, rgba(16, 28, 56, 0.88), rgba(6, 10, 22, 0.96));
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif;
      z-index: 30;
      user-select: none;
    }
    .bm-panel {
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 16px;
      padding: 32px 36px;
      width: min(780px, 92vw);
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
    }
    .bm-title {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      color: #f8fafc;
    }
    .bm-subtitle {
      font-size: 16px;
      color: #94a3b8;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }
    .bm-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }
    .bm-active-char-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: rgba(30, 41, 59, 0.72);
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 24px;
    }
    .bm-active-char-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bm-active-char-tag {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #38bdf8;
    }
    .bm-active-char-name {
      font-size: 20px;
      font-weight: 800;
      color: #f8fafc;
    }
    .bm-btn-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bm-menu-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .bm-btn {
      cursor: pointer;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: #1e293b;
      color: #f8fafc;
      font-size: 16px;
      font-weight: 700;
      padding: 13px 22px;
      border-radius: 10px;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .bm-btn:hover:not(:disabled) {
      background: #334155;
      border-color: #64748b;
    }
    .bm-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .bm-btn-primary {
      background: #22c55e;
      color: #052e16;
      border-color: #4ade80;
    }
    .bm-btn-primary:hover:not(:disabled) {
      background: #4ade80;
      border-color: #86efac;
    }
    .bm-btn-danger {
      background: rgba(239, 68, 68, 0.18);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.45);
    }
    .bm-btn-danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.32);
      border-color: #f87171;
    }
    .bm-btn-active {
      background: #38bdf8;
      color: #082f49;
      border-color: #7dd3fc;
    }
    .bm-btn-sm {
      font-size: 14px;
      padding: 8px 14px;
      border-radius: 8px;
    }
    .bm-btn:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }
    .bm-soon-pill {
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
    }
    .bm-section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin: 22px 0 12px 0;
    }
    .bm-budget-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 20px 0 10px 0;
    }
    .bm-budget-badge {
      font-variant-numeric: tabular-nums;
      font-size: 20px;
      font-weight: 800;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      padding: 4px 14px;
      border-radius: 999px;
    }
    .bm-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 20px;
    }
    .bm-slider-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: rgba(30, 41, 59, 0.55);
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.14);
    }
    .bm-slider-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 600;
    }
    .bm-slider-val {
      font-variant-numeric: tabular-nums;
      font-size: 22px;
      font-weight: 800;
      color: #f8fafc;
    }
    .bm-slider {
      width: 100%;
      accent-color: #38bdf8;
      cursor: pointer;
    }
    .bm-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(30, 41, 59, 0.55);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      font-size: 15px;
      flex-wrap: wrap;
    }
    .bm-chip-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .bm-chip {
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: #0f172a;
      color: #cbd5e1;
      font-size: 14px;
      font-weight: 600;
    }
    .bm-chip.active {
      background: #38bdf8;
      color: #082f49;
      border-color: #7dd3fc;
    }
    .bm-input {
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #f8fafc;
      font-size: 16px;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 8px;
      width: 100%;
      box-sizing: border-box;
    }
    .bm-input:focus {
      outline: 2px solid #38bdf8;
      border-color: transparent;
    }
    .bm-notice {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: rgba(245, 158, 11, 0.16);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fde68a;
    }
    /* Sits outside the panel so a page or tab re-render cannot wipe it. */
    .bm-storage-notice {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      margin: 0;
      max-width: 92vw;
      z-index: 1;
    }
    .bm-error {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
    }
    .bm-char-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
    }
    .bm-char-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      background: rgba(30, 41, 59, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
      flex-wrap: wrap;
    }
    .bm-char-card.active {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
    }
    .bm-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      padding-bottom: 12px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .bm-key-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    /* HUD */
    .bm-fs-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 30;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      background: rgba(15,23,42,0.6);
      color: #f8fafc;
      font-size: 20px;
      cursor: pointer;
    }
    .bm-fs-btn:hover { background: rgba(15,23,42,0.85); }
    .bm-hud {
      position: fixed;
      inset: 0;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif;
      color: #f8fafc;
      z-index: 20;
      user-select: none;
    }
    .bm-scoreboard {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 14px;
      padding: 10px 24px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .bm-side-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bm-side-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bm-side-label {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bm-serve-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      background: #22c55e;
      color: #052e16;
    }
    .bm-games-pill {
      font-size: 13px;
      font-weight: 700;
      color: #cbd5e1;
    }
    .bm-big-score {
      font-size: 46px;
      font-weight: 900;
      line-height: 1;
      color: #f8fafc;
      min-width: 56px;
      text-align: center;
    }
    .bm-score-divider {
      font-size: 28px;
      font-weight: 700;
      color: #64748b;
    }
    .bm-hud-bars {
      position: absolute;
      bottom: 24px;
      left: 28px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 260px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 12px;
      padding: 12px 16px;
    }
    .bm-bar-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bm-bar-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 700;
      color: #cbd5e1;
      font-variant-numeric: tabular-nums;
    }
    .bm-bar-track {
      width: 100%;
      height: 12px;
      background: rgba(30, 41, 59, 0.95);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .bm-bar-fill {
      height: 100%;
      width: 100%;
      transform-origin: left center;
      transition: width 60ms linear;
    }
    .bm-center-msg {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 14px;
      padding: 18px 32px;
      font-size: 26px;
      font-weight: 800;
      color: #f8fafc;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      max-width: 80vw;
    }
    .bm-keys-hint {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}
