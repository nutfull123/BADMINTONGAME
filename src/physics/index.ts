// Pure shuttle physics and court geometry. No three, no DOM.
import type { ServiceCourt, ShuttleEvent, ShuttleState, Side, Vec3 } from '../types';

export const COURT = {
  halfLength: 6.7,
  halfWidthSingles: 2.59,
  shortServiceLine: 1.98,
  netHeightCentre: 1.524,
  netHeightPost: 1.55,
} as const;

const G = 9.81;
const VT = 6.8; // real shuttle terminal speed
const K = G / (VT * VT);
const MAX_SUB = 1 / 240;
const NET_HALF_WIDTH = 3.05;

const netTop = (x: number) =>
  COURT.netHeightCentre + ((COURT.netHeightPost - COURT.netHeightCentre) * Math.abs(x)) / NET_HALF_WIDTH;

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export function stepShuttle(s: ShuttleState, dt: number): { state: ShuttleState; event: ShuttleEvent } {
  const n = Math.max(1, Math.ceil(dt / MAX_SUB - 1e-9));
  const h = dt / n;
  let { pos, vel } = s;
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    // semi-implicit Euler: update velocity first, then position with the new velocity
    const nv = { x: vel.x - K * sp * vel.x * h, y: vel.y - (G + K * sp * vel.y) * h, z: vel.z - K * sp * vel.z * h };
    const np = { x: pos.x + nv.x * h, y: pos.y + nv.y * h, z: pos.z + nv.z * h };

    if ((pos.z > 0 && np.z <= 0) || (pos.z < 0 && np.z >= 0)) {
      const c = lerp(pos, np, pos.z / (pos.z - np.z));
      if (Math.abs(c.x) <= NET_HALF_WIDTH && c.y > 0 && c.y < netTop(c.x)) {
        return { state: { pos: c, vel: nv }, event: { kind: 'net' } };
      }
    }
    if (np.y <= 0) {
      const at = lerp(pos, np, pos.y / (pos.y - np.y));
      at.y = 0;
      return { state: { pos: at, vel: nv }, event: { kind: 'floor', at } };
    }
    pos = np;
    vel = nv;
  }
  return { state: { pos, vel }, event: { kind: 'none' } };
}

// null if it hits the net (or has not landed within 5 s).
export function predictLanding(s: ShuttleState): Vec3 | null {
  for (let t = 0; t < 5; t += MAX_SUB) {
    const r = stepShuttle(s, MAX_SUB);
    if (r.event.kind === 'floor') return r.event.at;
    if (r.event.kind === 'net') return null;
    s = r.state;
  }
  return null;
}

// Positive z-distance from the net into `side`'s half, so near and far share one check.
const depth = (at: Vec3, side: Side) => (side === 'near' ? at.z : -at.z);

export function isInSingles(at: Vec3, side: Side): boolean {
  const d = depth(at, side);
  return d >= 0 && d <= COURT.halfLength && Math.abs(at.x) <= COURT.halfWidthSingles;
}

export function isInServiceBox(at: Vec3, receiverSide: Side, court: ServiceCourt): boolean {
  const d = depth(at, receiverSide);
  if (d < COURT.shortServiceLine || d > COURT.halfLength || Math.abs(at.x) > COURT.halfWidthSingles) return false;
  // receiver's right is +x for near, -x for far
  const rightX = receiverSide === 'near' ? at.x : -at.x;
  return court === 'right' ? rightX >= 0 : rightX <= 0;
}
