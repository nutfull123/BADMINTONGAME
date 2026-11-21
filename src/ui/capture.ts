// Pure decisions for the key-rebinding capture: which action is armed, and whether a mouse press
// belongs to a UI control (so it must not be captured as a Mouse0/Mouse2 binding).
import type { InputAction } from '../types';

// Clicking the เปลี่ยน button of the row that is already waiting cancels the capture; clicking any
// other row's button switches the capture to that row (the caller stops the old one first).
export type CaptureStep = 'arm' | 'cancel';

export const captureStep = (listening: InputAction | null, clicked: InputAction): CaptureStep =>
  listening === clicked ? 'cancel' : 'arm';

// Buttons, inputs and links act on click; a press on them must never become a binding. Everything else
// (the panel background, the court area) is a valid place to click a mouse button to bind it.
export const CAPTURE_IGNORED_SELECTOR = 'button, input, select, textarea, a[href], [data-rebind]';

export function isCaptureIgnoredTarget(target: Element | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return target.closest(CAPTURE_IGNORED_SELECTOR) !== null;
}
