import { loadSave } from '../../app/save';
import type { KeyBindings } from '../../types';
import { formatControlHints } from '../labels';
import { mountOverlay } from '../overlay';

// ---------- 1. Home screen ----------

export function showHome(
  root: HTMLElement,
  onPlayGuest: () => void,
  keys: KeyBindings = loadSave().settings.controls.keys,
): void {
  const { overlay, panel } = mountOverlay(root);

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.textContent = 'BADMINTON 3D · แบดมินตัน 3 มิติ';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.textContent =
    'ควบคุมหน้าไม้ด้วยเมาส์ · ฟุตเวิร์กสมจริง (Split Step / Chasse / Lunge) · เดี่ยวและคู่ครบทั้ง 5 ประเภท (MS · WS · MD · WD · XD)';

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'bm-btn bm-btn-primary';
  playBtn.dataset.testid = 'home-play-guest';
  playBtn.textContent = 'เล่นเลย (ไม่ต้องล็อกอิน)';
  playBtn.addEventListener('click', () => {
    overlay.remove();
    onPlayGuest();
  });

  const loginBtn = document.createElement('button');
  loginBtn.type = 'button';
  loginBtn.className = 'bm-btn';
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span>เข้าสู่ระบบ / สมัคร</span><span class="bm-soon-pill">เร็วๆ นี้</span>';

  btnRow.append(playBtn, loginBtn);

  const hint = document.createElement('div');
  hint.className = 'bm-keys-hint';
  hint.dataset.testid = 'home-control-hints';
  hint.textContent = formatControlHints(keys);

  panel.append(title, sub, btnRow, hint);
}
