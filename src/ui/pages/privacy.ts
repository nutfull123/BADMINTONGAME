import { mountOverlay } from '../overlay';

// ---------- Privacy Policy Page (นโยบายความเป็นส่วนตัว · PDPA & Google OAuth) ----------

export function showPrivacyPage(root: HTMLElement, onBack: () => void): void {
  const { overlay, panel } = mountOverlay(root);

  const headerBar = document.createElement('div');
  headerBar.className = 'bm-header-bar';

  const title = document.createElement('h1');
  title.className = 'bm-title';
  title.style.fontSize = '28px';
  title.style.margin = '0';
  title.textContent = 'นโยบายความเป็นส่วนตัว (Privacy Policy)';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'bm-btn bm-btn-sm';
  backBtn.dataset.testid = 'privacy-back';
  backBtn.textContent = '← กลับ (Back)';
  backBtn.addEventListener('click', () => {
    if (typeof window !== 'undefined' && window.location.hash === '#privacy') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    overlay.remove();
    onBack();
  });

  headerBar.append(title, backBtn);

  const content = document.createElement('div');
  content.dataset.testid = 'privacy-policy-content';
  content.style.fontSize = '14px';
  content.style.lineHeight = '1.65';
  content.style.color = '#cbd5e1';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '14px';

  const addSection = (heading: string, paragraphs: string[]): void => {
    const box = document.createElement('div');
    box.style.background = 'rgba(30, 41, 59, 0.55)';
    box.style.border = '1px solid rgba(148, 163, 184, 0.16)';
    box.style.borderRadius = '10px';
    box.style.padding = '12px 16px';

    const h = document.createElement('div');
    h.style.fontWeight = '800';
    h.style.fontSize = '15px';
    h.style.color = '#38bdf8';
    h.style.marginBottom = '6px';
    h.textContent = heading;
    box.appendChild(h);

    paragraphs.forEach((pText) => {
      const p = document.createElement('p');
      p.style.margin = '4px 0';
      p.textContent = pText;
      box.appendChild(p);
    });

    content.appendChild(box);
  };

  addSection('1. ข้อมูลที่จัดเก็บ (Data We Collect)', [
    'ภาษาไทย: เมื่อท่านสมัครบัญชีหรือเข้าสู่ระบบ (ด้วยอีเมลหรือ Google Sign-In) เกมจะจัดเก็บเฉพาะ (1) ที่อยู่อีเมล (Email Address), (2) ชื่อที่แสดงในเกม (Display Name) และ (3) ข้อมูลความคืบหน้าในเกม ได้แก่ ตัวละคร ค่าพลัง การตั้งค่า และผลการแข่งขันทัวร์นาเมนต์ หากท่านเล่นแบบผู้เล่นทั่วไป (Guest) ข้อมูลทั้งหมดจะถูกเก็บไว้ในเบราว์เซอร์ของท่านเท่านั้น',
    'English: When you sign up or sign in (via email or Google Sign-In), we collect only: (1) your email address, (2) your in-game display name, and (3) your game progress data (characters, stats, settings, and tournament progress). If you play as a Guest, all data stays locally in your browser.',
  ]);

  addSection('2. วัตถุประสงค์ในการใช้ข้อมูล (Why We Collect It)', [
    'ภาษาไทย: เราใช้ข้อมูลของท่านเพื่อยืนยันตัวตน ซิงก์ข้อมูลตัวละครและความคืบหน้าข้ามอุปกรณ์ และรองรับการเล่นออนไลน์เท่านั้น เราไม่นำข้อมูลอีเมลหรือข้อมูลจาก Google OAuth ไปขายโฆษณาหรือเปิดเผยแก่บุคคลภายนอกเพื่อการตลาด',
    'English: Your data is used strictly to authenticate your account, sync your characters and progress across devices, and enable online play. Google user data (email and basic profile) is never sold or shared for advertising.',
  ]);

  addSection('3. สถานที่จัดเก็บและผู้ประมวลผลข้อมูล (Where Data Is Stored)', [
    'ภาษาไทย: ข้อมูลบัญชีและข้อมูลเซฟบนคลาวด์ถูกจัดเก็บบนระบบฐานข้อมูลและการยืนยันตัวตนของ Supabase (จำกัดสิทธิ์เข้าถึงเฉพาะเจ้าของบัญชีด้วย Row-Level Security) และเมื่อระบบห้องแข่งขันออนไลน์เปิดใช้งาน ข้อมูลการแข่งขันจะประมวลผลผ่านเซิร์ฟเวอร์เกมออนไลน์',
    'English: Account credentials and cloud saves are stored in Supabase (protected by Row-Level Security so only you can access your row) and, when online play is active, processed by the online game server.',
  ]);

  addSection('4. ระยะเวลาในการเก็บรักษาข้อมูล (Retention Period)', [
    'ภาษาไทย: เราเก็บรักษาข้อมูลของท่านตลอดระยะเวลาที่บัญชีของท่านยังคงใช้งานอยู่ และจะลบข้อมูลออกจากระบบคลาวด์ทันทีเมื่อท่านสั่งลบบัญชีของตนเอง',
    'English: We retain your data for as long as your account remains active and erase it immediately when you delete your account.',
  ]);

  addSection('5. สิทธิของเจ้าของข้อมูลและการลบบัญชี (Your PDPA Rights & Account Deletion)', [
    'ภาษาไทย: ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA) ท่านมีสิทธิในการเข้าถึง แก้ไข ถอนความยินยอม และลบข้อมูลส่วนบุคคลของท่านได้ทุกเมื่อ โดยสามารถกดปุ่ม "ลบบัญชีและข้อมูลทั้งหมด" ได้ด้วยตนเองที่หน้า ตั้งค่า > บัญชี (Settings > Account) ซึ่งจะลบบัญชีและข้อมูลเซฟบนคลาวด์ออกอย่างถาวรทันที',
    'English: Under Thailand’s PDPA, you have the right to access, update, withdraw consent, and erase your personal data at any time. You can self-delete your account and all cloud save data immediately in Settings > Account.',
  ]);

  addSection('6. ผู้ควบคุมข้อมูลส่วนบุคคลและช่องทางติดต่อ (Data Controller Contact)', [
    'ภาษาไทย: ผู้ดูแลและควบคุมข้อมูลส่วนบุคคล: [ชื่อผู้ดูแลข้อมูล] · อีเมลติดต่อ: [อีเมลติดต่อ]',
    'English: Data Controller: [ชื่อผู้ดูแลข้อมูล] · Contact Email: [อีเมลติดต่อ]',
  ]);

  panel.append(headerBar, content);
}
