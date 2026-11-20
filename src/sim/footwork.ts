// Footwork contract shared by sim (f1, fills the logic) and render (f2, animates it).
import type { PlayerState } from '../types';
import type { SimPlayer } from './index';

export type Footwork = 'none' | 'split' | 'chasse' | 'crossover' | 'lunge' | 'recover';

// kind = current footwork pattern; phase = 0..1 progress through it (for animation);
// dir = unit move direction on the court (x, z) the pattern is heading.
export interface FootworkView { kind: Footwork; phase: number; dir: { x: number; z: number } }

// Reads the view stepPlayer keeps on the player; a player that never stepped (or a plain PlayerState) is 'none'.
export function footworkOf(p: PlayerState): FootworkView {
  const fw = (p as SimPlayer).fw;
  return fw ? { kind: fw.kind, phase: fw.phase, dir: { ...fw.dir } } : { kind: 'none', phase: 0, dir: { x: 0, z: p.side === 'near' ? -1 : 1 } };
}
