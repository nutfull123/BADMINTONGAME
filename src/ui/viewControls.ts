import { loadSave } from '../app/save';
import { matchesBinding } from './labels';
import { ensureStyles } from './styles';

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1; // per key press
const WHEEL_STEP = 0.0015; // zoom per wheel delta unit

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Fullscreen button (corner, bound fullscreen key) and zoom (wheel, bound zoomIn / zoomOut keys) for match and tutorial.
export function createViewControls(root: HTMLElement, onZoom: (z: number) => void): { dispose(): void } {
  ensureStyles();
  const saved = loadSave();
  const keys = saved.settings.controls.keys;
  let zoom = clampZoom(saved.settings.camera.zoom);
  const setZoom = (z: number) => {
    zoom = clampZoom(Math.round(z * 1000) / 1000);
    onZoom(zoom);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
    else void root.requestFullscreen?.()?.catch(() => {});
  };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bm-fs-btn';
  btn.title = 'เต็มจอ';
  btn.setAttribute('aria-label', 'เต็มจอ');
  btn.textContent = '⛶';
  btn.addEventListener('click', toggleFullscreen);
  root.appendChild(btn);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (matchesBinding(keys, 'fullscreen', e.code)) toggleFullscreen();
    else if (matchesBinding(keys, 'zoomIn', e.code)) setZoom(zoom + ZOOM_STEP);
    else if (matchesBinding(keys, 'zoomOut', e.code)) setZoom(zoom - ZOOM_STEP);
  };
  const onWheel = (e: WheelEvent) => {
    setZoom(zoom - e.deltaY * WHEEL_STEP);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  onZoom(zoom);

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      btn.remove();
    },
  };
}
