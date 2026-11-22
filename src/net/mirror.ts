// A far-side player sees the court turned 180 degrees about the vertical axis (x and z negated, near and far
// swapped), so every seat plays from the near end with the same camera and controls. Pure: no DOM.
// Everything is an involution: mirroring twice gives back the original, so the same functions map the server's
// world to the view and the player's input back to world axes.
import type { SeatIndex } from './protocol';
import type { Intent, MatchState, PlayerState, ShuttleState, Side, Slot, Vec3 } from '../types';
import type { SimPlayer } from '../sim';

const flip = (s: Side): Side => (s === 'near' ? 'far' : 'near');

export const seatSide = (seat: SeatIndex): Side => (seat % 2 === 0 ? 'near' : 'far');
export const seatSlot = (seat: SeatIndex): Slot => (seat >> 1) as Slot;
export const isMirrored = (seat: SeatIndex): boolean => seatSide(seat) === 'far';

export const mirrorVec = (v: Vec3): Vec3 => ({ x: -v.x, y: v.y, z: -v.z });

export function mirrorShuttle(s: ShuttleState): ShuttleState {
  return { pos: mirrorVec(s.pos), vel: mirrorVec(s.vel) };
}

// facing f points along (sin f, 0, netDir cos f): turning the world 180 degrees negates f.
// The racket input and flick are relative to the player (forehand is always +x), so they do not change.
export function mirrorPlayer(p: PlayerState): PlayerState {
  const out: SimPlayer = {
    ...p, side: flip(p.side), pos: mirrorVec(p.pos), vel: mirrorVec(p.vel), racketHead: mirrorVec(p.racketHead),
    facing: -p.facing,
  };
  if (out.fw) out.fw = { ...out.fw, dir: { x: -out.fw.dir.x, z: -out.fw.dir.z } }; // render reads this for the feet
  return out;
}

// Only the movement is in court axes; the rest of an intent is relative to the player.
export function mirrorIntent(i: Intent): Intent {
  return { ...i, move: { x: -i.move.x, z: -i.move.z } };
}

const swap = <T extends { near: unknown; far: unknown }>(g: T): T => ({ ...g, near: g.far, far: g.near });

// For the scoreboard: the viewer is always "near".
export function mirrorMatch(m: MatchState): MatchState {
  return {
    ...m,
    score: swap(m.score),
    completedGames: m.completedGames.map(swap),
    gamesWon: swap(m.gamesWon),
    server: flip(m.server),
    winner: m.winner ? flip(m.winner) : null,
    rightCourt: swap(m.rightCourt),
  };
}
