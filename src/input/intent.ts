import type { ControlSettings, Intent, ShotType } from '../types';
import { DEFAULT_KEYS } from '../app/settings';

export const MOUSE_SENS = 0.004; // racket units (-1..1) per pixel of mouse movement

// 'shoulder' preset: the mouse turns the view instead of the racket.
export const LOOK_SENS = 0.0025; // radians of view turn per pixel of mouse movement
export const YAW_LIMIT = (100 * Math.PI) / 180; // +-100 deg from facing the net (yaw > 0 = turned right)
export const PITCH_MIN = (-15 * Math.PI) / 180; // look slightly down
export const PITCH_MAX = (70 * Math.PI) / 180; // look up (up = positive)
export interface Look { yaw: number; pitch: number }
export const newLook = (): Look => ({ yaw: 0, pitch: 0 });

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

// Mouse right (dx > 0) turns right, mouse down (dy > 0) looks down. Mutates `look`.
export function stepLook(look: Look, dx: number, dy: number, sens: number): void {
  look.yaw = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, look.yaw + dx * sens));
  look.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, look.pitch - dy * sens));
}

// Keys are relative to the view: forward (move.z < 0) goes where the camera looks, flattened. Result is in court axes.
export function moveRelativeToYaw(move: { x: number; z: number }, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: move.x * c - move.z * s, z: move.x * s + move.z * c };
}

// Defaults reproduce the original fixed bindings. DEFAULT_KEYS is frozen: only read it.
const DEFAULT_CONTROLS: ControlSettings = { mouseSensitivity: 1, keys: DEFAULT_KEYS };

export function buildIntent(
  keys: KeyState, mouse: MouseAccum, dt: number, serving: boolean, controls: ControlSettings = DEFAULT_CONTROLS,
  look?: Look, // given = 'shoulder' mode: the mouse turns `look`, the racket stays put (the caller aims it)
): Intent {
  const { down, pressed, released, held } = keys;
  for (const c of down) held[c] = (held[c] ?? 0) + dt;

  const b = controls.keys;
  const anyIn = (set: Set<string>, codes: readonly string[]) => codes.some((c) => set.has(c));
  const heldOf = (codes: readonly string[]) => Math.max(0, ...codes.map((c) => held[c] ?? 0));
  const axis = (neg: readonly string[], pos: readonly string[]) => (anyIn(down, pos) ? 1 : 0) - (anyIn(down, neg) ? 1 : 0);
  const sens = MOUSE_SENS * controls.mouseSensitivity;

  const px = mouse.x, py = mouse.y;
  if (look) stepLook(look, mouse.dx, mouse.dy, LOOK_SENS * controls.mouseSensitivity);
  else {
    mouse.x = clamp1(px + mouse.dx * sens);
    mouse.y = clamp1(py - mouse.dy * sens); // mouse up (negative dy) = overhead
  }
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
    move: look ? moveRelativeToYaw({ x: axis(b.left, b.right), z: axis(b.up, b.down) }, look.yaw)
      : { x: axis(b.left, b.right), z: axis(b.up, b.down) },
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
