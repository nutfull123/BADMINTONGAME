// Game settings: defaults, limits, sanitising untrusted saved values, key rebinding, and the flat view a match
// reads. Pure: no DOM.
import type { CameraPreset, GameSettings, GraphicsQuality, InputAction, KeyBindings, MatchEvent, MatchSettings } from '../types';

// Defaults are frozen so a page that mutates them by mistake fails loudly instead of changing every save.
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export const DEFAULT_KEYS: KeyBindings = deepFreeze({
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  backhand: ['KeyQ'],
  forehand: ['KeyE'],
  smash: ['Mouse0'],
  drop: ['Mouse2'],
  clear: ['ShiftLeft'],
  jump: ['Space'],
  dive: ['KeyC'],
  net: ['AltLeft', 'AltRight'],
  fullscreen: ['KeyF'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
});

export const DEFAULT_GAME_SETTINGS: GameSettings = deepFreeze({
  camera: { preset: 'shoulder', height: 0, distance: 0, zoom: 1, follow: true },
  controls: { mouseSensitivity: 1, keys: DEFAULT_KEYS },
  assists: { mode: 'easy', hitAssist: 70, landingMarker: true, timingRing: true, racketAid: true },
  graphics: { quality: 'high' },
  match: { event: 'MS', format: '3x15', botLevel: 'medium' },
});

// Slider ranges for the settings page; loadSave clamps saved values into them.
export const LIMITS = {
  cameraOffset: [-1, 1], // camera height and distance offsets
  zoom: [0.6, 1.6],
  mouseSensitivity: [0.25, 3],
  hitAssist: [0, 100],
} as const satisfies Record<string, readonly [number, number]>;

export const CAMERA_PRESETS: readonly CameraPreset[] = ['shoulder', 'behindLow', 'behindHigh', 'broadcast'];
export const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high'];
const MODES: readonly MatchSettings['mode'][] = ['easy', 'normal', 'pro', 'timing'];
const EVENTS: readonly MatchEvent[] = ['MS', 'WS', 'MD', 'WD', 'XD'];
const FORMATS: readonly GameSettings['match']['format'][] = ['3x15', '3x21'];
const BOT_LEVELS: readonly MatchSettings['botLevel'][] = ['easy', 'medium', 'hard'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, [lo, hi]: readonly [number, number], d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);
const section = (raw: unknown, key: string) => (isObject(raw) && isObject(raw[key]) ? raw[key] : {});

function sanitizeKeys(raw: unknown): KeyBindings {
  const src = isObject(raw) ? raw : {};
  const out = {} as KeyBindings;
  for (const action of Object.keys(DEFAULT_KEYS) as InputAction[]) {
    const v = src[action];
    const ok = Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === 'string' && c.length > 0);
    out[action] = ok ? [...(v as string[])] : [...DEFAULT_KEYS[action]];
  }
  return out;
}

// Saved settings are untrusted: every field is type-checked, enums checked, numbers clamped; anything else falls
// back to the default. The result shares no arrays or objects with the defaults.
export function sanitizeSettings(raw: unknown): GameSettings {
  const d = DEFAULT_GAME_SETTINGS;
  const cam = section(raw, 'camera'), ctl = section(raw, 'controls'), as = section(raw, 'assists');
  const gfx = section(raw, 'graphics'), m = section(raw, 'match');
  return {
    camera: {
      preset: oneOf(cam.preset, CAMERA_PRESETS, d.camera.preset),
      height: num(cam.height, LIMITS.cameraOffset, d.camera.height),
      distance: num(cam.distance, LIMITS.cameraOffset, d.camera.distance),
      zoom: num(cam.zoom, LIMITS.zoom, d.camera.zoom),
      follow: bool(cam.follow, d.camera.follow),
    },
    controls: {
      mouseSensitivity: num(ctl.mouseSensitivity, LIMITS.mouseSensitivity, d.controls.mouseSensitivity),
      keys: sanitizeKeys(ctl.keys),
    },
    assists: {
      mode: oneOf(as.mode, MODES, d.assists.mode),
      hitAssist: num(as.hitAssist, LIMITS.hitAssist, d.assists.hitAssist),
      landingMarker: bool(as.landingMarker, d.assists.landingMarker),
      timingRing: bool(as.timingRing, d.assists.timingRing),
      racketAid: bool(as.racketAid, d.assists.racketAid),
    },
    graphics: { quality: oneOf(gfx.quality, GRAPHICS_QUALITIES, d.graphics.quality) },
    match: {
      event: oneOf(m.event, EVENTS, d.match.event),
      format: oneOf(m.format, FORMATS, d.match.format),
      botLevel: oneOf(m.botLevel, BOT_LEVELS, d.match.botLevel),
    },
  };
}

// Bind `action` to exactly `code`. `conflict` names another action already using that code (left as is, so the
// page can warn and let the player decide). Never mutates `keys`.
export function rebindKey(
  keys: KeyBindings, action: InputAction, code: string,
): { keys: KeyBindings; conflict: InputAction | null } {
  const next = sanitizeKeys(keys);
  next[action] = [code];
  const conflict = (Object.keys(next) as InputAction[]).find((a) => a !== action && next[a].includes(code)) ?? null;
  return { keys: next, conflict };
}

// The flat settings a match reads. The caller must already have fitted match.event to the character's gender
// (ui/events fitEvent); camera, controls, graphics and racketAid are read from GameSettings by the game itself.
export function toMatchSettings(s: GameSettings): MatchSettings {
  return {
    hitAssist: s.assists.hitAssist,
    landingMarker: s.assists.landingMarker,
    timingRing: s.assists.timingRing,
    format: s.match.format,
    botLevel: s.match.botLevel,
    mode: s.assists.mode,
    event: s.match.event,
  };
}
