import { describe, it, expect } from 'vitest';
import {
  ACTION_ORDER,
  ACTION_LABELS,
  CAMERA_PRESET_LABELS,
  GRAPHICS_QUALITY_LABELS,
  formatKeyCode,
  formatBindingList,
  formatConflictMessage,
  formatCharacterSummary,
  formatControlHints,
  formatMovementHint,
  matchesBinding,
} from './labels';
import { DEFAULT_KEYS, rebindKey } from '../app/settings';
import type { Character } from '../types';

describe('UI shell pure helpers (labels, key formatting, conflict warning, character summary)', () => {
  it('defines Thai labels for all 15 InputActions in ACTION_ORDER', () => {
    expect(ACTION_ORDER).toHaveLength(15);
    for (const action of Object.keys(DEFAULT_KEYS) as Array<keyof typeof DEFAULT_KEYS>) {
      expect(ACTION_ORDER).toContain(action);
      expect(ACTION_LABELS[action].length).toBeGreaterThan(2);
    }
  });

  it('defines Thai labels for camera presets and graphics qualities', () => {
    expect(CAMERA_PRESET_LABELS.behindLow).toContain('หลังผู้เล่น มุมต่ำ');
    expect(CAMERA_PRESET_LABELS.behindHigh).toContain('หลังผู้เล่น มุมสูง');
    expect(CAMERA_PRESET_LABELS.broadcast).toContain('มุมถ่ายทอดสด');
    expect(GRAPHICS_QUALITY_LABELS.low).toContain('ต่ำ');
    expect(GRAPHICS_QUALITY_LABELS.medium).toContain('กลาง');
    expect(GRAPHICS_QUALITY_LABELS.high).toContain('สูง');
  });

  it('formats KeyboardEvent.code and mouse button pseudo-codes into readable strings', () => {
    expect(formatKeyCode('KeyW')).toBe('W');
    expect(formatKeyCode('Mouse0')).toContain('คลิกซ้าย');
    expect(formatKeyCode('Mouse2')).toContain('คลิกขวา');
    expect(formatKeyCode('ShiftLeft')).toBe('LShift');
    expect(formatKeyCode('Space')).toBe('Space');
    expect(formatBindingList(['Equal', 'NumpadAdd'])).toBe('= / Num+');
  });

  it('formats a conflict warning message when rebindKey reports a duplicate binding', () => {
    expect(formatConflictMessage(null, 'KeyQ')).toBeNull();
    const msg = formatConflictMessage('backhand', 'KeyQ');
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACTION_LABELS.backhand);
    expect(msg).toContain('Q');
  });

  it('formats active character summary with name, gender, body and height from heightOf', () => {
    const c: Character = {
      id: 'c1',
      name: 'เมย์',
      stats: { gender: 'female', body: 'tall', speed: 5, power: 5, recovery: 5, stamina: 5 },
      earnedPoints: 0,
      createdAt: 1,
    };
    const summary = formatCharacterSummary(c);
    expect(summary).toContain('เมย์');
    expect(summary).toContain('หญิง');
    expect(summary).toContain('1.82m');
  });

  it('matchesBinding checks if a key code belongs to fullscreen, zoomIn or zoomOut bindings', () => {
    expect(matchesBinding(DEFAULT_KEYS, 'fullscreen', 'KeyF')).toBe(true);
    expect(matchesBinding(DEFAULT_KEYS, 'fullscreen', 'KeyG')).toBe(false);
    expect(matchesBinding(DEFAULT_KEYS, 'zoomIn', 'Equal')).toBe(true);
    expect(matchesBinding(DEFAULT_KEYS, 'zoomIn', 'NumpadAdd')).toBe(true);
    expect(matchesBinding(DEFAULT_KEYS, 'zoomOut', 'Minus')).toBe(true);
  });

  it('formats the movement hint compactly from the saved bindings', () => {
    expect(formatMovementHint(DEFAULT_KEYS)).toBe('WASD');
    const arrows = { ...DEFAULT_KEYS, up: ['ArrowUp'], left: ['ArrowLeft'], down: ['ArrowDown'], right: ['ArrowRight'] };
    expect(formatMovementHint(arrows)).toBe('↑←↓→');
  });

  it('formats the Home control hint from the saved bindings, not from hard-coded keys', () => {
    const hint = formatControlHints(DEFAULT_KEYS);
    expect(hint).toContain('WASD เคลื่อนที่');
    expect(hint).toContain('Q/E ตีพื้นฐาน');
    expect(hint).toContain('คลิกซ้าย (LMB) ค้าง = ตบ');
    expect(hint).toContain('Space ค้าง = กระโดด');
    expect(hint).toContain('F เต็มจอ');

    const rebound = rebindKey(DEFAULT_KEYS, 'up', 'ArrowUp').keys;
    const reboundHint = formatControlHints(rebound);
    expect(reboundHint).toContain('↑ASD เคลื่อนที่');
    expect(reboundHint).not.toContain('WASD');

    const allRebound = rebindKey(rebindKey(DEFAULT_KEYS, 'jump', 'KeyJ').keys, 'dive', 'KeyV').keys;
    expect(formatControlHints(allRebound)).toContain('J ค้าง = กระโดด');
    expect(formatControlHints(allRebound)).toContain('V = พุ่งรับ');
  });
});
