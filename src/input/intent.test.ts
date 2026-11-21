import { describe, it, expect } from 'vitest';
import { DEFAULT_KEYS } from '../app/settings';
import type { ControlSettings } from '../types';
import { buildIntent, newKeyState, newMouseAccum, MOUSE_SENS, LMB, RMB } from './intent';

const press = (k: ReturnType<typeof newKeyState>, code: string) => { k.down.add(code); k.pressed.add(code); };
const release = (k: ReturnType<typeof newKeyState>, code: string) => { k.down.delete(code); k.released.add(code); };

describe('buildIntent', () => {
  it('maps WASD to move axes (W = -z toward net, A = -x)', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyW'); press(k, 'KeyA');
    expect(buildIntent(k, m, 0.01, false).move).toEqual({ x: -1, z: -1 });
    release(k, 'KeyW'); release(k, 'KeyA'); press(k, 'KeyS'); press(k, 'KeyD');
    expect(buildIntent(k, m, 0.01, false).move).toEqual({ x: 1, z: 1 });
  });

  it('opposite keys cancel', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyW'); press(k, 'KeyS');
    expect(buildIntent(k, m, 0.01, false).move.z).toBe(0);
  });

  it('accumulates mouse into racket, derives racketVel, consumes deltas', () => {
    const k = newKeyState(); const m = newMouseAccum();
    m.dx = 100; m.dy = -50; // mouse up = overhead
    const i = buildIntent(k, m, 0.5, false);
    expect(i.racket.x).toBeCloseTo(100 * MOUSE_SENS);
    expect(i.racket.y).toBeCloseTo(50 * MOUSE_SENS);
    expect(i.racketVel.x).toBeCloseTo((100 * MOUSE_SENS) / 0.5);
    expect(m.dx).toBe(0);
    const j = buildIntent(k, m, 0.5, false); // no movement -> no velocity
    expect(j.racketVel).toEqual({ x: 0, y: 0 });
    expect(j.racket.x).toBeCloseTo(i.racket.x);
  });

  it('clamps racket to -1..1', () => {
    const k = newKeyState(); const m = newMouseAccum();
    m.dx = 1e6; m.dy = 1e6;
    expect(buildIntent(k, m, 0.01, false).racket).toEqual({ x: 1, y: -1 });
    m.dx = -1e6; m.dy = -1e6;
    expect(buildIntent(k, m, 0.01, false).racket).toEqual({ x: -1, y: 1 });
  });

  it('LMB/RMB/Shift charge smash/drop/clear', () => {
    for (const [code, shot] of [[LMB, 'smash'], [RMB, 'drop'], ['ShiftLeft', 'clear']] as const) {
      const k = newKeyState(); const m = newMouseAccum();
      press(k, code);
      const i = buildIntent(k, m, 0.1, false);
      expect(i.charging).toBe(shot);
      expect(i.release).toBeNull();
    }
  });

  it('serve remaps RMB and Shift', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, RMB);
    expect(buildIntent(k, m, 0.1, true).charging).toBe('serveShort');
    release(k, RMB); press(k, 'ShiftLeft');
    const i = buildIntent(k, m, 0.1, true);
    expect(i.release).toBe('serveShort');
    expect(i.charging).toBe('serveLong');
  });

  it('chargeTime counts while held; release fires once with the held time', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, LMB);
    buildIntent(k, m, 0.1, false);
    const held = buildIntent(k, m, 0.1, false);
    expect(held.chargeTime).toBeCloseTo(0.2);
    release(k, LMB);
    const rel = buildIntent(k, m, 0.1, false);
    expect(rel.release).toBe('smash');
    expect(rel.charging).toBeNull();
    expect(rel.chargeTime).toBeCloseTo(0.2);
    const after = buildIntent(k, m, 0.1, false);
    expect(after.release).toBeNull();
    expect(after.chargeTime).toBe(0);
  });

  it('Q/E basic swing is edge only', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyQ');
    expect(buildIntent(k, m, 0.01, false).basicSwing).toBe('backhand');
    expect(buildIntent(k, m, 0.01, false).basicSwing).toBeNull(); // still held, no edge
    release(k, 'KeyQ'); press(k, 'KeyE');
    expect(buildIntent(k, m, 0.01, false).basicSwing).toBe('forehand');
  });

  it('Space charges jump and releases', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'Space');
    buildIntent(k, m, 0.1, false);
    const i = buildIntent(k, m, 0.1, false);
    expect(i.jumpCharge).toBeCloseTo(0.2);
    expect(i.jumpRelease).toBe(false);
    release(k, 'Space');
    const r = buildIntent(k, m, 0.1, false);
    expect(r.jumpRelease).toBe(true);
    expect(r.jumpCharge).toBe(0);
  });

  it('C and Alt are edge triggers', () => {
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyC'); press(k, 'AltLeft');
    const i = buildIntent(k, m, 0.01, false);
    expect(i.dive).toBe(true);
    expect(i.netShot).toBe(true);
    const j = buildIntent(k, m, 0.01, false);
    expect(j.dive).toBe(false);
    expect(j.netShot).toBe(false);
  });
});

describe('buildIntent with rebound controls', () => {
  const controls = (keys: Partial<ControlSettings['keys']>, mouseSensitivity = 1): ControlSettings =>
    ({ mouseSensitivity, keys: { ...DEFAULT_KEYS, ...keys } });

  it('jump on KeyJ, smash on KeyK; old keys no longer work', () => {
    const c = controls({ jump: ['KeyJ'], smash: ['KeyK'] });
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyJ'); press(k, 'KeyK'); press(k, 'Space'); press(k, LMB);
    buildIntent(k, m, 0.1, false, c);
    const i = buildIntent(k, m, 0.1, false, c);
    expect(i.jumpCharge).toBeCloseTo(0.2);
    expect(i.charging).toBe('smash');
    expect(i.chargeTime).toBeCloseTo(0.2);
    release(k, 'KeyJ'); release(k, 'KeyK');
    const r = buildIntent(k, m, 0.1, false, c);
    expect(r.jumpRelease).toBe(true);
    expect(r.release).toBe('smash');
    const k2 = newKeyState(); press(k2, 'Space'); press(k2, LMB);
    const o = buildIntent(k2, newMouseAccum(), 0.1, false, c);
    expect(o.jumpCharge).toBe(0);
    expect(o.charging).toBeNull();
  });

  it('movement, swings, dive and net use the rebound keys; any code in a list triggers', () => {
    const c = controls({ up: ['ArrowUp'], left: ['ArrowLeft', 'KeyA'], backhand: ['KeyU'], dive: ['KeyV'], net: ['KeyN'] });
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'ArrowUp'); press(k, 'KeyA'); press(k, 'KeyU'); press(k, 'KeyV'); press(k, 'KeyN');
    const i = buildIntent(k, m, 0.01, false, c);
    expect(i.move).toEqual({ x: -1, z: -1 });
    expect(i.basicSwing).toBe('backhand');
    expect(i.dive).toBe(true);
    expect(i.netShot).toBe(true);
  });

  it('serve remap follows the drop and clear bindings', () => {
    const c = controls({ drop: ['KeyX'], clear: ['KeyZ'] });
    const k = newKeyState(); const m = newMouseAccum();
    press(k, 'KeyX');
    expect(buildIntent(k, m, 0.1, true, c).charging).toBe('serveShort');
    release(k, 'KeyX'); press(k, 'KeyZ');
    expect(buildIntent(k, m, 0.1, true, c).charging).toBe('serveLong');
  });

  it('mouse sensitivity scales racket movement', () => {
    const k = newKeyState();
    const m = newMouseAccum(); m.dx = 50; m.dy = -50;
    const i = buildIntent(k, m, 0.1, false, controls({}, 2));
    expect(i.racket.x).toBeCloseTo(50 * MOUSE_SENS * 2);
    expect(i.racket.y).toBeCloseTo(50 * MOUSE_SENS * 2);
  });

  it('does not mutate the frozen defaults', () => {
    const k = newKeyState(); press(k, 'KeyW');
    expect(() => buildIntent(k, newMouseAccum(), 0.1, false)).not.toThrow();
  });
});
