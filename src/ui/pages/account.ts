import { signInEmail, signInGoogle, signUpEmail } from '../../account/auth';
import { validateAccountForm } from '../labels';
import { mountOverlay } from '../overlay';

export interface AccountPageActions {
  onSuccess: () => void;
  onOpenPrivacy: () => void;
  onBack: () => void;
}

export function showAccountPage(root: HTMLElement, actions: AccountPageActions): void {
  const { overlay, panel } = mountOverlay(root);

  let mode: 'signin' | 'signup' = 'signin';
  let email = '';
  let password = '';
  let consentChecked = false;
  let errorMsg: string | null = null;
  let busy = false;

  function render(): void {
    panel.innerHTML = '';

    const headerBar = document.createElement('div');
    headerBar.className = 'bm-header-bar';

    const title = document.createElement('h1');
    title.className = 'bm-title';
    title.style.fontSize = '28px';
    title.style.margin = '0';
    title.textContent =
      mode === 'signin' ? 'เข้าสู่ระบบ (Sign In)' : 'สมัครบัญชีใหม่ (Sign Up)';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'bm-btn bm-btn-sm';
    backBtn.dataset.testid = 'account-back';
    backBtn.textContent = '← กลับ (Back)';
    backBtn.disabled = busy;
    backBtn.addEventListener('click', () => {
      overlay.remove();
      actions.onBack();
    });
    headerBar.append(title, backBtn);

    // Mode tabs (Sign In / Sign Up)
    const tabsBar = document.createElement('div');
    tabsBar.className = 'bm-tabs';

    const signInTab = document.createElement('button');
    signInTab.type = 'button';
    signInTab.className = `bm-btn bm-btn-sm${mode === 'signin' ? ' bm-btn-active' : ''}`;
    signInTab.dataset.testid = 'account-tab-signin';
    signInTab.textContent = 'เข้าสู่ระบบ (Sign In)';
    signInTab.disabled = busy;
    signInTab.addEventListener('click', () => {
      mode = 'signin';
      errorMsg = null;
      render();
    });

    const signUpTab = document.createElement('button');
    signUpTab.type = 'button';
    signUpTab.className = `bm-btn bm-btn-sm${mode === 'signup' ? ' bm-btn-active' : ''}`;
    signUpTab.dataset.testid = 'account-tab-signup';
    signUpTab.textContent = 'สมัครสมาชิก (Sign Up)';
    signUpTab.disabled = busy;
    signUpTab.addEventListener('click', () => {
      mode = 'signup';
      errorMsg = null;
      render();
    });

    tabsBar.append(signInTab, signUpTab);

    // Form fields
    const form = document.createElement('form');
    form.noValidate = true;
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '14px';

    const emailGroup = document.createElement('div');
    const emailLabel = document.createElement('label');
    emailLabel.htmlFor = 'bm-account-email';
    emailLabel.style.display = 'block';
    emailLabel.style.fontSize = '14px';
    emailLabel.style.fontWeight = '600';
    emailLabel.style.marginBottom = '6px';
    emailLabel.textContent = 'อีเมล (Email)';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'bm-account-email';
    emailInput.className = 'bm-input';
    emailInput.dataset.testid = 'account-email';
    emailInput.placeholder = 'you@example.com';
    emailInput.autocomplete = 'email';
    emailInput.value = email;
    emailInput.disabled = busy;
    emailInput.addEventListener('input', () => {
      email = emailInput.value;
    });
    emailGroup.append(emailLabel, emailInput);

    const passGroup = document.createElement('div');
    const passLabel = document.createElement('label');
    passLabel.htmlFor = 'bm-account-password';
    passLabel.style.display = 'block';
    passLabel.style.fontSize = '14px';
    passLabel.style.fontWeight = '600';
    passLabel.style.marginBottom = '6px';
    passLabel.textContent = 'รหัสผ่าน (Password · อย่างน้อย 8 ตัวอักษร)';
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.id = 'bm-account-password';
    passInput.className = 'bm-input';
    passInput.dataset.testid = 'account-password';
    passInput.placeholder = 'อย่างน้อย 8 ตัวอักษร';
    passInput.minLength = 8;
    passInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    passInput.value = password;
    passInput.disabled = busy;
    passInput.addEventListener('input', () => {
      password = passInput.value;
    });
    passGroup.append(passLabel, passInput);

    // Unchecked PDPA consent checkbox (required before sign-up and before Google sign-in)
    const consentRow = document.createElement('div');
    consentRow.className = 'bm-setting-row';
    consentRow.style.justifyContent = 'flex-start';
    consentRow.style.gap = '10px';

    const consentBox = document.createElement('input');
    consentBox.type = 'checkbox';
    consentBox.id = 'bm-pdpa-consent';
    consentBox.dataset.testid = 'account-consent';
    consentBox.checked = consentChecked;
    consentBox.disabled = busy;
    consentBox.style.width = '18px';
    consentBox.style.height = '18px';
    consentBox.style.accentColor = '#38bdf8';
    consentBox.style.cursor = 'pointer';
    consentBox.addEventListener('change', () => {
      consentChecked = consentBox.checked;
    });

    const consentLabel = document.createElement('label');
    consentLabel.htmlFor = 'bm-pdpa-consent';
    consentLabel.style.cursor = 'pointer';
    consentLabel.style.fontSize = '14px';
    consentLabel.textContent = 'ฉันอ่านและยอมรับนโยบายความเป็นส่วนตัว';

    const privacyLink = document.createElement('button');
    privacyLink.type = 'button';
    privacyLink.className = 'bm-btn bm-btn-sm';
    privacyLink.dataset.testid = 'account-privacy-link';
    privacyLink.style.padding = '4px 10px';
    privacyLink.style.fontSize = '13px';
    privacyLink.textContent = 'อ่านนโยบายความเป็นส่วนตัว';
    privacyLink.addEventListener('click', () => {
      overlay.remove();
      actions.onOpenPrivacy();
    });

    consentRow.append(consentBox, consentLabel, privacyLink);

    form.append(emailGroup, passGroup, consentRow);

    if (errorMsg) {
      const errBox = document.createElement('div');
      errBox.className = 'bm-error';
      errBox.dataset.testid = 'account-error';
      errBox.setAttribute('role', 'alert');
      errBox.textContent = errorMsg;
      form.appendChild(errBox);
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'bm-btn-row';
    actionsRow.style.marginTop = '8px';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'bm-btn bm-btn-primary';
    submitBtn.dataset.testid = 'account-submit';
    submitBtn.disabled = busy;
    submitBtn.textContent = busy
      ? 'กำลังดำเนินการ...'
      : mode === 'signin'
        ? 'เข้าสู่ระบบด้วยอีเมล (Sign In)'
        : 'สมัครสมาชิกด้วยอีเมล (Sign Up)';

    const googleBtn = document.createElement('button');
    googleBtn.type = 'button';
    googleBtn.className = 'bm-btn';
    googleBtn.dataset.testid = 'account-google';
    googleBtn.disabled = busy;
    googleBtn.textContent = 'ดำเนินการต่อด้วย Google (Sign in with Google)';
    googleBtn.addEventListener('click', async () => {
      if (busy) return;
      if (!consentChecked) {
        errorMsg = 'กรุณาอ่านและยอมรับนโยบายความเป็นส่วนตัวก่อนเข้าสู่ระบบด้วย Google';
        render();
        return;
      }
      busy = true;
      errorMsg = null;
      render();
      const res = await signInGoogle();
      busy = false;
      if (!res.ok) {
        errorMsg = res.message;
        render();
      }
    });

    actionsRow.append(submitBtn, googleBtn);
    form.appendChild(actionsRow);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const validationErr = validateAccountForm(mode, email, password, consentChecked);
      if (validationErr) {
        errorMsg = validationErr;
        render();
        return;
      }
      busy = true;
      errorMsg = null;
      render();
      const res =
        mode === 'signin'
          ? await signInEmail(email.trim(), password)
          : await signUpEmail(email.trim(), password);
      busy = false;
      if (!res.ok) {
        errorMsg = res.message;
        render();
        return;
      }
      overlay.remove();
      actions.onSuccess();
    });

    panel.append(headerBar, tabsBar, form);
  }

  render();
}
