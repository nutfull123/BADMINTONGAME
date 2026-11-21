// Small DOM widgets shared by the settings and match-setup pages.
export function buildRangeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bm-slider-row';
  const top = document.createElement('div');
  top.className = 'bm-slider-top';
  const lbl = document.createElement('span');
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'bm-slider-val';
  val.textContent = format(initial);
  top.append(lbl, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.className = 'bm-slider';
  input.addEventListener('input', () => {
    const num = Number(input.value);
    val.textContent = format(num);
    onChange(num);
  });
  row.append(top, input);
  return row;
}

export function buildChipSetting<T extends string>(
  label: string,
  options: Array<{ value: T; label: string }>,
  initial: T,
  onChange: (value: T) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bm-setting-row';

  const lbl = document.createElement('span');
  lbl.textContent = label;

  const group = document.createElement('div');
  group.className = 'bm-chip-group';

  const buttons: HTMLButtonElement[] = [];
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bm-chip${opt.value === initial ? ' active' : ''}`;
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(opt.value);
    });
    buttons.push(btn);
    group.appendChild(btn);
  });

  row.append(lbl, group);
  return row;
}

export function buildToggleSetting(
  label: string,
  initial: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  return buildChipSetting<'on' | 'off'>(
    label,
    [
      { value: 'on', label: 'เปิด (On)' },
      { value: 'off', label: 'ปิด (Off)' },
    ],
    initial ? 'on' : 'off',
    (v) => onChange(v === 'on'),
  );
}
