// Page chrome shared by every shell page: the full-screen overlay, its panel, and the save-failure
// notice. The notice is a sibling of the panel so a page or tab re-render cannot wipe it.
import { ensureStyles } from './styles';

function clearOverlays(root: HTMLElement): void {
  const existing = root.querySelectorAll('.bm-overlay');
  existing.forEach((el) => el.remove());
}

export function mountOverlay(root: HTMLElement): { overlay: HTMLElement; panel: HTMLElement } {
  ensureStyles();
  clearOverlays(root);
  const overlay = document.createElement('div');
  overlay.className = 'bm-overlay';
  const panel = document.createElement('div');
  panel.className = 'bm-panel';
  overlay.appendChild(panel);
  root.appendChild(overlay);
  return { overlay, panel };
}

export interface StorageNotice {
  // Records the result of the last writeSave call and shows / hides the notice from that flag.
  set(savedOk: boolean): void;
}

// The notice is a sibling of the panel, not part of it: pages re-render their panel (`innerHTML = ''`)
// on every action, so a notice inside it would disappear exactly when the player needs it. The flag
// below is the last write result; the element is rendered from it.
export function createStorageNotice(overlay: HTMLElement): StorageNotice {
  let lastWriteOk = true;
  let warn: HTMLElement | null = null;

  const render = (): void => {
    if (lastWriteOk) {
      warn?.remove();
      warn = null;
      return;
    }
    if (warn) return;
    warn = document.createElement('div');
    warn.className = 'bm-notice bm-storage-notice';
    warn.dataset.testid = 'storage-warning';
    warn.setAttribute('role', 'status');
    warn.textContent = 'ไม่สามารถบันทึกการตั้งค่าลงเบราว์เซอร์นี้ได้ (Storage unavailable)';
    overlay.appendChild(warn);
  };

  return {
    set(savedOk: boolean): void {
      lastWriteOk = savedOk;
      render();
    },
  };
}
