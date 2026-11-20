import type { Intent, ShotType } from '../types';

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

export function buildIntent(keys: KeyState, mouse: MouseAccum, dt: number, serving: boolean): Intent {
  const { down, pressed, released, held } = keys;
  for (const c of down) held[c] = (held[c] ?? 0) + dt;

  const axis = (neg: string, pos: string) => (down.has(pos) ? 1 : 0) - (down.has(neg) ? 1 : 0);

  const px = mouse.x, py = mouse.y;
  mouse.x = clamp1(px + mouse.dx * MOUSE_SENS);
  mouse.y = clamp1(py - mouse.dy * MOUSE_SENS); // mouse up (negative dy) = overhead
  mouse.dx = mouse.dy = 0;

  // Priority order if several are held at once.
  const buttons: [string, ShotType][] = [
    [LMB, 'smash'],
    [RMB, serving ? 'serveShort' : 'drop'],
    ['ShiftLeft', serving ? 'serveLong' : 'clear'],
  ];
  const active = buttons.find(([c]) => down.has(c));
  const rel = buttons.find(([c]) => released.has(c));
  const chargeCode = active?.[0] ?? rel?.[0];

  const intent: Intent = {
    move: { x: axis('KeyA', 'KeyD'), z: axis('KeyW', 'KeyS') },
    racket: { x: mouse.x, y: mouse.y },
    racketVel: dt > 0 ? { x: (mouse.x - px) / dt, y: (mouse.y - py) / dt } : { x: 0, y: 0 },
    charging: active?.[1] ?? null,
    chargeTime: chargeCode ? held[chargeCode] ?? 0 : 0,
    release: rel?.[1] ?? null,
    basicSwing: pressed.has('KeyQ') ? 'backhand' : pressed.has('KeyE') ? 'forehand' : null,
    jumpCharge: down.has('Space') ? held['Space'] ?? 0 : 0,
    jumpRelease: released.has('Space'),
    dive: pressed.has('KeyC'),
    netShot: pressed.has('AltLeft') || pressed.has('AltRight'),
  };

  for (const c of released) delete held[c];
  pressed.clear();
  released.clear();
  return intent;
}
