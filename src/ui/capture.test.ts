import { describe, it, expect } from 'vitest';
import { CAPTURE_IGNORED_SELECTOR, captureStep, isCaptureIgnoredTarget } from './capture';
import type { InputAction } from '../types';

// A stand-in for a DOM Element: only `closest` is used by the helper.
const el = (match: Element | null) =>
  ({ closest: (selector: string) => (selector === CAPTURE_IGNORED_SELECTOR ? match : null) }) as unknown as Element;

describe('key-rebinding capture decisions', () => {
  it('arms capture when no row is waiting', () => {
    expect(captureStep(null, 'smash')).toBe('arm');
  });

  it('switches capture when another row is clicked while waiting', () => {
    expect(captureStep('smash', 'dive')).toBe('arm');
  });

  it('cancels capture when the waiting row is clicked again', () => {
    expect(captureStep('smash', 'smash')).toBe('cancel');
  });

  it('never captures a press on a control (เปลี่ยน button, input, link)', () => {
    expect(isCaptureIgnoredTarget(el({} as Element))).toBe(true);
    expect(isCaptureIgnoredTarget(el(null))).toBe(false);
    expect(isCaptureIgnoredTarget(null)).toBe(false);
    expect(isCaptureIgnoredTarget(undefined)).toBe(false);
    // A plain element without closest (detached / synthetic) is not a control.
    expect(isCaptureIgnoredTarget({} as Element)).toBe(false);
  });

  it('covers buttons and the rebind rows in the ignored selector', () => {
    for (const part of ['button', 'input', '[data-rebind]']) {
      expect(CAPTURE_IGNORED_SELECTOR).toContain(part);
    }
  });

  it('every InputAction can be armed and cancelled', () => {
    const actions: InputAction[] = ['smash', 'dive', 'fullscreen', 'zoomIn'];
    for (const a of actions) {
      expect(captureStep(null, a)).toBe('arm');
      expect(captureStep(a, a)).toBe('cancel');
    }
  });
});
