// Pure pose, two-bone IK, landing-marker pulse and shuttle trail buffer math (no DOM, no WebGL/Three).
import type { BodyType, PlayerState, Vec3 } from '../types';

export const BODY_HEIGHT: Record<BodyType, number> = {
  tall: 1.95,
  balanced: 1.78,
  short: 1.63,
};

export interface TwoBoneIKResult {
  elbow: Vec3;
  wrist: Vec3;
}

export function solveTwoBoneIK(
  shoulder: Vec3,
  target: Vec3,
  upperLen: number,
  forearmLen: number,
  poleHint: Vec3 = { x: 0.15, y: -0.9, z: 0.25 },
): TwoBoneIKResult {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const dz = target.z - shoulder.z;
  const dist = Math.hypot(dx, dy, dz);
  const maxReach = upperLen + forearmLen;
  const minReach = Math.abs(upperLen - forearmLen) + 1e-4;

  if (dist < 1e-6) {
    return {
      elbow: { x: shoulder.x, y: shoulder.y - upperLen, z: shoulder.z },
      wrist: { x: shoulder.x, y: shoulder.y - upperLen + forearmLen, z: shoulder.z },
    };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  const uz = dz / dist;

  if (dist >= maxReach - 1e-5) {
    return {
      elbow: {
        x: shoulder.x + ux * upperLen,
        y: shoulder.y + uy * upperLen,
        z: shoulder.z + uz * upperLen,
      },
      wrist: {
        x: shoulder.x + ux * maxReach,
        y: shoulder.y + uy * maxReach,
        z: shoulder.z + uz * maxReach,
      },
    };
  }

  const clampedDist = Math.max(minReach, dist);
  // Law of cosines for distance along shoulder->target axis to the elbow projection
  const cosAlpha =
    (upperLen * upperLen + clampedDist * clampedDist - forearmLen * forearmLen) /
    (2 * upperLen * clampedDist);
  const clampedCos = Math.max(-1, Math.min(1, cosAlpha));
  const along = upperLen * clampedCos;
  const perp = upperLen * Math.sqrt(Math.max(0, 1 - clampedCos * clampedCos));

  // Orthogonalize poleHint against u = (ux, uy, uz)
  const dot = poleHint.x * ux + poleHint.y * uy + poleHint.z * uz;
  let px = poleHint.x - dot * ux;
  let py = poleHint.y - dot * uy;
  let pz = poleHint.z - dot * uz;
  let plen = Math.hypot(px, py, pz);
  if (plen < 1e-5) {
    // Fallback orthogonal axis
    px = -uz;
    py = 0;
    pz = ux;
    plen = Math.hypot(px, py, pz) || 1;
  }
  px /= plen;
  py /= plen;
  pz /= plen;

  const elbow: Vec3 = {
    x: shoulder.x + ux * along + px * perp,
    y: shoulder.y + uy * along + py * perp,
    z: shoulder.z + uz * along + pz * perp,
  };
  const wrist: Vec3 = {
    x: shoulder.x + ux * clampedDist,
    y: shoulder.y + uy * clampedDist,
    z: shoulder.z + uz * clampedDist,
  };
  return { elbow, wrist };
}

export interface PlayerPose {
  hipYOffset: number;
  torsoPitchX: number;
  torsoTwistY: number;
  leftLegPitch: number;
  rightLegPitch: number;
  kneeBend: number;
  offArmPitch: number;
  offArmSpread: number;
  swingPhaseOffset: number;
  lyingFlat: boolean;
}

export function computePlayerPose(p: PlayerState, timeSeconds: number): PlayerPose {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const strideFreq = 11;
  const strideAmp = Math.min(0.65, 0.15 + speed * 0.12);
  const phase = timeSeconds * strideFreq;

  switch (p.action) {
    case 'moving': {
      const s = Math.sin(phase) * strideAmp;
      return {
        hipYOffset: Math.abs(Math.cos(phase)) * 0.03 - 0.02,
        torsoPitchX: 0.12,
        torsoTwistY: Math.sin(phase) * 0.1,
        leftLegPitch: s,
        rightLegPitch: -s,
        kneeBend: 0.18,
        offArmPitch: -s * 0.7,
        offArmSpread: 0.25,
        swingPhaseOffset: 0,
        lyingFlat: false,
      };
    }
    case 'charging':
      return {
        hipYOffset: -0.14,
        torsoPitchX: 0.2,
        torsoTwistY: -0.32,
        leftLegPitch: 0.35,
        rightLegPitch: -0.35,
        kneeBend: 0.48,
        offArmPitch: -0.55,
        offArmSpread: 0.4,
        swingPhaseOffset: -0.25,
        lyingFlat: false,
      };
    case 'swinging':
      return {
        hipYOffset: -0.04,
        torsoPitchX: 0.18,
        torsoTwistY: 0.42,
        leftLegPitch: 0.22,
        rightLegPitch: -0.22,
        kneeBend: 0.22,
        offArmPitch: 0.35,
        offArmSpread: 0.35,
        swingPhaseOffset: 0.35,
        lyingFlat: false,
      };
    case 'airborne':
      return {
        hipYOffset: 0.04,
        torsoPitchX: -0.08,
        torsoTwistY: -0.2,
        leftLegPitch: -0.45,
        rightLegPitch: -0.35,
        kneeBend: 0.65,
        offArmPitch: -0.7,
        offArmSpread: 0.45,
        swingPhaseOffset: 0.1,
        lyingFlat: false,
      };
    case 'diving':
      return {
        hipYOffset: -0.28,
        torsoPitchX: 1.05,
        torsoTwistY: 0.15,
        leftLegPitch: -0.55,
        rightLegPitch: -0.45,
        kneeBend: 0.25,
        offArmPitch: -0.8,
        offArmSpread: 0.5,
        swingPhaseOffset: 0.2,
        lyingFlat: false,
      };
    case 'down':
      return {
        hipYOffset: -0.68,
        torsoPitchX: 1.48,
        torsoTwistY: 0,
        leftLegPitch: -0.1,
        rightLegPitch: 0.1,
        kneeBend: 0.15,
        offArmPitch: -1.1,
        offArmSpread: 0.6,
        swingPhaseOffset: 0,
        lyingFlat: true,
      };
    case 'idle':
    default: {
      const breath = Math.sin(timeSeconds * 3) * 0.015;
      return {
        hipYOffset: breath,
        torsoPitchX: 0.06,
        torsoTwistY: 0,
        leftLegPitch: 0.08,
        rightLegPitch: -0.08,
        kneeBend: 0.12,
        offArmPitch: -0.2,
        offArmSpread: 0.22,
        swingPhaseOffset: 0,
        lyingFlat: false,
      };
    }
  }
}

export interface TrailPoint {
  pos: Vec3;
  t: number;
}

export interface TrailBuffer {
  maxAge: number;
  maxPoints: number;
  points: TrailPoint[];
}

export function createTrailBuffer(maxAge = 0.3, maxPoints = 24): TrailBuffer {
  return { maxAge, maxPoints, points: [] };
}

export function pushTrailPoint(buf: TrailBuffer, pos: Vec3, nowSeconds: number): void {
  const last = buf.points[buf.points.length - 1];
  if (last) {
    const jump = Math.hypot(pos.x - last.pos.x, pos.y - last.pos.y, pos.z - last.pos.z);
    if (jump > 2.2) {
      buf.points.length = 0;
    } else if (jump < 0.008 && nowSeconds - last.t < 0.015) {
      // Prune old points even when stationary
      pruneTrail(buf, nowSeconds);
      return;
    }
  }
  buf.points.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, t: nowSeconds });
  pruneTrail(buf, nowSeconds);
  while (buf.points.length > buf.maxPoints) {
    buf.points.shift();
  }
}

function pruneTrail(buf: TrailBuffer, nowSeconds: number): void {
  const cutoff = nowSeconds - buf.maxAge;
  while (buf.points.length > 0 && buf.points[0].t < cutoff) {
    buf.points.shift();
  }
}

export function computePulseScale(timeSeconds: number): number {
  return 1 + 0.14 * Math.sin(timeSeconds * 6);
}
