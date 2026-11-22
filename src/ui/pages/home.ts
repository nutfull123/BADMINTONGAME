import { isConfigured } from '../../account/auth';
import { loadSave } from '../../app/save';
import type { KeyBindings } from '../../types';
import { formatControlHints } from '../labels';
import { mountOverlay } from '../overlay';

// ---------- 1. Home screen ----------

export interface HomeActions {
  onOpenAccount?: () => void;
  onOpenPrivacy?: () => void;
  configured?: boolean;
}

export function showHome(
  root: HTMLElement,
  onPlayGuest: () => void,
  keys: KeyBindings = loadSave().settings.controls.keys,
  actions?: HomeActions,
): void {
  const { overlay, panel } = mountOverlay(root);
  const configured = actions?.configured ?? isConfigured();

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.textContent = 'BADMINTON 3D · แบดมินตัน 3 มิติ';

  const sub = document.createElement('p');
  sub.className = 'bm-subtitle';
  sub.textContent =
    'ควบคุมหน้าไม้ด้วยเมาส์ · ฟุตเวิร์กสมจริง (Split Step / Chasse / Lunge) · เดี่ยวและคู่ครบทั้ง 5 ประเภท (MS · WS · MD · WD · XD)';

  const btnRow = document.createElement('div');
  btnRow.className = 'bm-btn-row';
  btnRow.style.alignItems = 'center';

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
  loginBtn.dataset.testid = 'home-login';
  if (configured) {
    loginBtn.disabled = false;
    loginBtn.textContent = 'เข้าสู่ระบบ / สมัคร';
    loginBtn.addEventListener('click', () => {
      overlay.remove();
      if (actions?.onOpenAccount) actions.onOpenAccount();
      else onPlayGuest();
    });
  } else {
    loginBtn.disabled = true;
    loginBtn.innerHTML =
      '<span>เข้าสู่ระบบ / สมัคร</span><span class="bm-soon-pill">ยังไม่ได้ตั้งค่าบัญชีออนไลน์</span>';
  }

  const privacyBtn = document.createElement('button');
  privacyBtn.type = 'button';
  privacyBtn.className = 'bm-btn bm-btn-sm';
  privacyBtn.dataset.testid = 'home-privacy';
  privacyBtn.textContent = 'นโยบายความเป็นส่วนตัว (Privacy Policy)';
  privacyBtn.addEventListener('click', () => {
    overlay.remove();
    if (actions?.onOpenPrivacy) {
      actions.onOpenPrivacy();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#privacy';
    }
  });

  btnRow.append(playBtn, loginBtn, privacyBtn);

  const hint = document.createElement('div');
  hint.className = 'bm-keys-hint';
  hint.dataset.testid = 'home-control-hints';
  hint.textContent = formatControlHints(keys);

  panel.append(title, sub, btnRow, hint);
}
