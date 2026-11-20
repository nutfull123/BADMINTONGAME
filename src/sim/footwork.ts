// Footwork contract shared by sim (f1, fills the logic) and render (f2, animates it).
import type { PlayerState } from '../types';

export type Footwork = 'none' | 'split' | 'chasse' | 'crossover' | 'lunge' | 'recover';

// kind = current footwork pattern; phase = 0..1 progress through it (for animation);
// dir = unit move direction on the court (x, z) the pattern is heading.
export interface FootworkView { kind: Footwork; phase: number; dir: { x: number; z: number } }

// shortcut: stub returns 'none' until task f1 implements it from the player's hidden footwork state.
export function footworkOf(_p: PlayerState): FootworkView {
  return { kind: 'none', phase: 0, dir: { x: 0, z: 0 } };
}
