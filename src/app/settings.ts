// Game settings defaults and the flat view a match reads. Pure: no DOM.
import type { GameSettings, KeyBindings, MatchSettings } from '../types';

export const DEFAULT_KEYS: KeyBindings = {
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
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  camera: { preset: 'behindHigh', height: 0, distance: 0, zoom: 1, follow: true },
  controls: { mouseSensitivity: 1, keys: DEFAULT_KEYS },
  assists: { mode: 'easy', hitAssist: 70, landingMarker: true, timingRing: true, racketAid: true },
  graphics: { quality: 'high' },
  match: { event: 'MS', format: '3x15', botLevel: 'medium' },
};

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
