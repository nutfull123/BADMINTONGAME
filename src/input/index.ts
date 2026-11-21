import type { ControlSettings, Intent } from '../types';
import { DEFAULT_GAME_SETTINGS } from '../app/settings';
import { buildIntent, newKeyState, newMouseAccum, LMB, RMB } from './intent';

export { buildIntent } from './intent';

const BLOCKED = new Set(['AltLeft', 'AltRight', 'Space', 'Tab']);

export function createInput(canvas: HTMLCanvasElement, controls: ControlSettings = DEFAULT_GAME_SETTINGS.controls) {
  const keys = newKeyState();
  const mouse = newMouseAccum();
  const lockCbs: ((locked: boolean) => void)[] = [];
  let serving = false;

  const isLocked = () => document.pointerLockElement === canvas;
  const press = (c: string) => { if (!keys.down.has(c)) { keys.down.add(c); keys.pressed.add(c); } };
  const release = (c: string) => { if (keys.down.delete(c)) keys.released.add(c); };

  const onKeyDown = (e: KeyboardEvent) => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (!e.repeat) press(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    release(e.code);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (!isLocked()) return; // the click that grabs the lock must not count as a shot
    if (e.button === 0) press(LMB); else if (e.button === 2) press(RMB);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) release(LMB); else if (e.button === 2) release(RMB);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!isLocked()) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  };
  const onClick = () => { if (!isLocked()) void canvas.requestPointerLock(); };
  const onContextMenu = (e: Event) => e.preventDefault();
  const onLockChange = () => {
    const locked = isLocked();
    if (!locked) { keys.down.clear(); keys.pressed.clear(); keys.released.clear(); keys.held = {}; } // no stuck keys
    lockCbs.forEach((cb) => cb(locked));
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', onClick);

  return {
    intent: (dt: number): Intent => buildIntent(keys, mouse, dt, serving, controls),
    setServing: (v: boolean) => { serving = v; },
    isLocked,
    onLockChange: (cb: (locked: boolean) => void) => { lockCbs.push(cb); },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('click', onClick);
      lockCbs.length = 0;
    },
  };
}
