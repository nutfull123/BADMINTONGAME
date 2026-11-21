import type { ControlSettings, Intent, ShotType } from '../types';
import { DEFAULT_KEYS } from '../app/settings';

export const MOUSE_SENS = 0.004; // racket units (-1..1) per pixel of mouse movement

// Mouse buttons share the key sets under these pseudo-codes.
export const LMB = 'Mouse0';
export const RMB = 'Mouse2';

// Per-frame input state, filled by createInput (or by tests). buildIntent consumes it:
// it advances hold timers and clears the one-frame edge sets and mouse deltas.
export interface KeyState {
  down: Set<string>;       // codes currently held (KeyboardEvent.code, plus LMB/RMB)
  pressed: Set<string>;    // went down since last frame
  released: Set<string>;   // went up since last frame
  held: Record<string, number>; // seconds each code has been held
}
export interface MouseAccum { dx: number; dy: number; x: number; y: number } // x,y = racket position

export const newKeyState = (): KeyState => ({ down: new Set(), pressed: new Set(), released: new Set(), held: {} });
export const newMouseAccum = (): MouseAccum => ({ dx: 0, dy: 0, x: 0, y: 0 });

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

// Defaults reproduce the original fixed bindings. DEFAULT_KEYS is frozen: only read it.
const DEFAULT_CONTROLS: ControlSettings = { mouseSensitivity: 1, keys: DEFAULT_KEYS };

export function buildIntent(
  keys: KeyState, mouse: MouseAccum, dt: number, serving: boolean, controls: ControlSettings = DEFAULT_CONTROLS,
): Intent {
  const { down, pressed, released, held } = keys;
  for (const c of down) held[c] = (held[c] ?? 0) + dt;

  const b = controls.keys;
  const anyIn = (set: Set<string>, codes: readonly string[]) => codes.some((c) => set.has(c));
  const heldOf = (codes: readonly string[]) => Math.max(0, ...codes.map((c) => held[c] ?? 0));
  const axis = (neg: readonly string[], pos: readonly string[]) => (anyIn(down, pos) ? 1 : 0) - (anyIn(down, neg) ? 1 : 0);
  const sens = MOUSE_SENS * controls.mouseSensitivity;

  const px = mouse.x, py = mouse.y;
  mouse.x = clamp1(px + mouse.dx * sens);
  mouse.y = clamp1(py - mouse.dy * sens); // mouse up (negative dy) = overhead
  mouse.dx = mouse.dy = 0;

  // Priority order if several are held at once.
  const buttons: [readonly string[], ShotType][] = [
    [b.smash, 'smash'],
    [b.drop, serving ? 'serveShort' : 'drop'],
    [b.clear, serving ? 'serveLong' : 'clear'],
  ];
  const active = buttons.find(([c]) => anyIn(down, c));
  const rel = buttons.find(([c]) => anyIn(released, c));
  const chargeCodes = active?.[0] ?? rel?.[0];

  const intent: Intent = {
    move: { x: axis(b.left, b.right), z: axis(b.up, b.down) },
    racket: { x: mouse.x, y: mouse.y },
    racketVel: dt > 0 ? { x: (mouse.x - px) / dt, y: (mouse.y - py) / dt } : { x: 0, y: 0 },
    charging: active?.[1] ?? null,
    chargeTime: chargeCodes ? heldOf(chargeCodes) : 0,
    release: rel?.[1] ?? null,
    basicSwing: anyIn(pressed, b.backhand) ? 'backhand' : anyIn(pressed, b.forehand) ? 'forehand' : null,
    jumpCharge: anyIn(down, b.jump) ? heldOf(b.jump) : 0,
    jumpRelease: anyIn(released, b.jump),
    dive: anyIn(pressed, b.dive),
    netShot: anyIn(pressed, b.net),
  };

  for (const c of released) delete held[c];
  pressed.clear();
  released.clear();
  return intent;
}
