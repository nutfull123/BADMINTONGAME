// Pure pose, footwork animation, two-bone IK, camera framing/zoom, landing-marker pulse and shuttle trail buffer math (no DOM, no WebGL/Three).
import type { FootworkView } from '../sim/footwork';
import { footworkOf } from '../sim/footwork';
import type { BodyType, CameraPreset, Gender, PlayerState, Side, Slot, Vec3 } from '../types';

export const BODY_HEIGHT: Record<BodyType, number> = {
  tall: 1.95,
  balanced: 1.78,
  short: 1.63,
};

export const MAX_RIGS = 4;
/** Which of the pre-allocated rigs are shown for `playerCount` players. */
export const rigVisibility = (playerCount: number): boolean[] =>
  Array.from({ length: MAX_RIGS }, (_, i) => i < playerCount);

/** The player the camera, rings and aid follow: view.human, else the first near player. */
export function followedPlayer(players: PlayerState[], human?: number): PlayerState | undefined {
  return (human !== undefined ? players[human] : undefined) ?? players.find((p) => p.side === 'near') ?? players[0];
}

/** Body proportions as fractions of height; women are drawn slimmer, with a ponytail. */
export function proportionsOf(g: Gender) {
  return g === 'female'
    ? { shoulder: 0.125, torso: 0.9, limb: 0.85, ponytail: true }
    : { shoulder: 0.145, torso: 1, limb: 1, ponytail: false };
}

const TEAM_COLOR: Record<Side, [number, number]> = {
  near: [0x2563eb, 0x60a5fa],
  far: [0xdc2626, 0xf87171],
};
export const teamColor = (side: Side, slot: Slot): number => TEAM_COLOR[side][slot];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
  const cosAlpha =
    (upperLen * upperLen + clampedDist * clampedDist - forearmLen * forearmLen) /
    (2 * upperLen * clampedDist);
  const clampedCos = clamp(cosAlpha, -1, 1);
  const along = upperLen * clampedCos;
  const perp = upperLen * Math.sqrt(Math.max(0, 1 - clampedCos * clampedCos));

  const dot = poleHint.x * ux + poleHint.y * uy + poleHint.z * uz;
  let px = poleHint.x - dot * ux;
  let py = poleHint.y - dot * uy;
  let pz = poleHint.z - dot * uz;
  let plen = Math.hypot(px, py, pz);
  if (plen < 1e-5) {
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
  leftLegRoll: number;      // +X lateral angle in player local coords (right > 0, left < 0)
  rightLegRoll: number;
  kneeBend: number;         // symmetric reference bend
  leftKneeBend: number;
  rightKneeBend: number;
  offArmPitch: number;
  offArmSpread: number;
  swingPhaseOffset: number;
  lyingFlat: boolean;
}

function makeBasePose(
  o: Omit<PlayerPose, 'leftLegRoll' | 'rightLegRoll' | 'leftKneeBend' | 'rightKneeBend'> & {
    leftLegRoll?: number;
    rightLegRoll?: number;
    leftKneeBend?: number;
    rightKneeBend?: number;
  },
): PlayerPose {
  return {
    ...o,
    leftLegRoll: o.leftLegRoll ?? -0.04,
    rightLegRoll: o.rightLegRoll ?? 0.04,
    leftKneeBend: o.leftKneeBend ?? o.kneeBend,
    rightKneeBend: o.rightKneeBend ?? o.kneeBend,
  };
}

function applyFootworkToPose(base: PlayerPose, p: PlayerState, fw: FootworkView): PlayerPose {
  if (fw.kind === 'none' || base.lyingFlat || p.action === 'diving' || p.action === 'airborne') {
    return base;
  }
  const ph = clamp(fw.phase, 0, 1);
  const sgn = p.side === 'near' ? 1 : -1;
  const localDirX = fw.dir.x * sgn;

  switch (fw.kind) {
    case 'split': {
      // Small two-foot hop in the first half of phase, knees bent on landing in the second half
      const hop = ph < 0.55 ? Math.sin((ph / 0.55) * Math.PI) * 0.11 : 0;
      const landT = ph >= 0.45 ? Math.sin(((ph - 0.45) / 0.55) * Math.PI * 0.5) : 0;
      const crouch = -0.15 * landT;
      const bend = 0.18 + 0.46 * landT;
      return {
        ...base,
        hipYOffset: hop + crouch,
        torsoPitchX: 0.12 + 0.1 * landT,
        leftLegPitch: 0.16 * landT,
        rightLegPitch: 0.16 * landT,
        leftLegRoll: -0.16 - 0.12 * landT,
        rightLegRoll: 0.16 + 0.12 * landT,
        kneeBend: bend,
        leftKneeBend: bend,
        rightKneeBend: bend,
        offArmSpread: 0.35 + 0.15 * landT,
      };
    }
    case 'chasse': {
      // Side shuffle: feet come together around phase 0.5, apart at 0 and 1, never crossing
      const apartness = Math.abs(Math.cos(ph * Math.PI)); // 1 at 0 and 1, 0 at 0.5
      const bounce = Math.sin(ph * Math.PI) * 0.05;
      const spread = 0.03 + 0.24 * apartness;
      const bend = 0.24 + 0.14 * (1 - apartness);
      return {
        ...base,
        hipYOffset: -0.06 + bounce,
        torsoPitchX: 0.14,
        torsoTwistY: localDirX * 0.12,
        leftLegPitch: 0.12 * Math.sin(ph * Math.PI * 2),
        rightLegPitch: -0.12 * Math.sin(ph * Math.PI * 2),
        leftLegRoll: -spread,
        rightLegRoll: spread,
        kneeBend: bend,
        leftKneeBend: bend,
        rightKneeBend: bend,
        offArmSpread: 0.35,
      };
    }
    case 'crossover': {
      // Moving backward: non-racket (left) foot crosses in front across the midline while hips pivot
      const crossWave = Math.sin(ph * Math.PI);
      const bendL = 0.32 + 0.18 * crossWave;
      const bendR = 0.2 + 0.1 * (1 - crossWave);
      return {
        ...base,
        hipYOffset: -0.07 + 0.03 * crossWave,
        torsoPitchX: 0.1,
        torsoTwistY: -0.45 - 0.15 * crossWave,
        leftLegPitch: 0.48 * (0.4 + 0.6 * crossWave),
        rightLegPitch: -0.38 * (0.4 + 0.6 * crossWave),
        leftLegRoll: 0.26 * (0.5 + 0.5 * crossWave), // crosses over to +X
        rightLegRoll: -0.06,
        kneeBend: (bendL + bendR) * 0.5,
        leftKneeBend: bendL,
        rightKneeBend: bendR,
        offArmPitch: -0.45,
        offArmSpread: 0.42,
      };
    }
    case 'lunge': {
      // Long step with racket-side (right) foot forward, front knee bent ~90 degrees (~1.42 rad),
      // back (left) leg extended behind, torso leaning forward
      const reach = Math.sin(Math.min(1, ph * 1.15) * (Math.PI * 0.5));
      const frontBend = 0.45 + 1.0 * reach; // ~1.45 rad (~83-90 deg) at peak lunge
      const backBend = 0.12; // extended back leg
      return {
        ...base,
        hipYOffset: -0.08 - 0.18 * reach,
        torsoPitchX: 0.22 + 0.26 * reach,
        torsoTwistY: 0.18 * reach + base.torsoTwistY * 0.5,
        rightLegPitch: 0.35 + 0.62 * reach,
        leftLegPitch: -0.28 - 0.52 * reach,
        rightLegRoll: 0.08 + Math.max(0, localDirX) * 0.14 * reach,
        leftLegRoll: -0.1 - Math.max(0, -localDirX) * 0.12 * reach,
        kneeBend: (frontBend + backBend) * 0.5,
        rightKneeBend: frontBend,
        leftKneeBend: backBend,
        offArmPitch: 0.45 * reach,
        offArmSpread: 0.48,
      };
    }
    case 'recover': {
      // Push back from the front foot toward upright base stance as phase goes 0 -> 1
      const rem = 1 - ph;
      const frontBend = lerp(0.16, 1.15, rem);
      const backBend = lerp(0.16, 0.22, rem);
      return {
        ...base,
        hipYOffset: lerp(-0.02, -0.22, rem),
        torsoPitchX: lerp(0.1, 0.36, rem),
        torsoTwistY: lerp(0, 0.15, rem),
        rightLegPitch: lerp(0.08, 0.78, rem),
        leftLegPitch: lerp(-0.08, -0.52, rem),
        rightLegRoll: lerp(0.05, 0.12, rem),
        leftLegRoll: lerp(-0.05, -0.1, rem),
        kneeBend: (frontBend + backBend) * 0.5,
        rightKneeBend: frontBend,
        leftKneeBend: backBend,
        offArmPitch: lerp(-0.2, 0.3, rem),
        offArmSpread: lerp(0.25, 0.42, rem),
      };
    }
  }
}

export function computePlayerPose(
  p: PlayerState,
  timeSeconds: number,
  footworkOverride?: FootworkView,
): PlayerPose {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const strideFreq = 11;
  const strideAmp = Math.min(0.65, 0.15 + speed * 0.12);
  const phase = timeSeconds * strideFreq;

  let base: PlayerPose;
  switch (p.action) {
    case 'moving': {
      const s = Math.sin(phase) * strideAmp;
      base = makeBasePose({
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
      });
      break;
    }
    case 'charging':
      base = makeBasePose({
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
      });
      break;
    case 'swinging':
      base = makeBasePose({
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
      });
      break;
    case 'airborne':
      base = makeBasePose({
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
      });
      break;
    case 'diving':
      base = makeBasePose({
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
      });
      break;
    case 'down':
      base = makeBasePose({
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
      });
      break;
    case 'idle':
    default: {
      const breath = Math.sin(timeSeconds * 3) * 0.015;
      base = makeBasePose({
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
      });
      break;
    }
  }

  const fw = footworkOverride ?? footworkOf(p);
  return applyFootworkToPose(base, p, fw);
}

// ---------- Camera framing & zoom ----------

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;
export const ZOOM_TAU = 0.08; // exponential time constant so ~92% of zoom settles in ~0.2 s

export function clampZoom(z: number): number {
  return clamp(Number.isFinite(z) ? z : 1, ZOOM_MIN, ZOOM_MAX);
}

export function stepZoom(current: number, target: number, dt: number): number {
  const clampedTarget = clampZoom(target);
  if (dt <= 0) return current;
  return current + (clampedTarget - current) * (1 - Math.exp(-dt / ZOOM_TAU));
}

export interface CameraFraming {
  pos: Vec3;
  lookAt: Vec3;
}

// Projects a world point into Normalized Device Coordinates [-1, 1] for a camera looking along (0, lookY-posY, lookZ-posZ)
export function projectPointToNdc(
  world: Vec3,
  cam: CameraFraming,
  aspect: number,
  fovDeg = 50,
): { x: number; y: number } {
  const dx = world.x - cam.pos.x;
  const dy = world.y - cam.pos.y;
  const dz = world.z - cam.pos.z;

  const fy = cam.lookAt.y - cam.pos.y;
  const fz = cam.lookAt.z - cam.pos.z;
  const flen = Math.hypot(fy, fz) || 1;
  // Forward unit vector F = (0, fy/flen, fz/flen); Right unit vector R = (1, 0, 0) since lookAt.x === pos.x
  // Camera Up vector U = R x F = (0, -Fz, Fy)
  const F_y = fy / flen;
  const F_z = fz / flen;
  const U_y = -F_z;
  const U_z = F_y;

  const depth = dy * F_y + dz * F_z;
  const upCoord = dy * U_y + dz * U_z;
  const rightCoord = dx;

  const tanHalfV = Math.tan(((fovDeg * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * Math.max(0.5, aspect);

  const safeDepth = Math.max(0.1, depth);
  return {
    x: rightCoord / (safeDepth * tanHalfH),
    y: upCoord / (safeDepth * tanHalfV),
  };
}

// Computes camera position and look-at so BOTH baselines (z = +6.7 and -6.7) and both sidelines (x = +-3.05)
// plus player lateral follow (+-2.59 m) fit inside the frustum with margin at zoom = 1.
export function computeCameraFraming(
  aspect: number,
  fovDeg = 50,
  camX = 0,
  zoom = 1,
): CameraFraming {
  const safeAspect = Math.max(0.5, aspect || 16 / 9);
  const halfV = ((fovDeg * Math.PI) / 180) * 0.5;
  const tanV = Math.tan(halfV);
  const tanH = tanV * safeAspect;

  // We want the near baseline (z = +6.7) plus a comfortable margin (zNearMargin = 7.9)
  // and the far baseline + overhead space (z = -7.8) both comfortably inside the vertical FOV,
  // and max horizontal court offset (3.05 + 2.59 + 0.5 = 6.14 m) inside the horizontal FOV.
  const zNearBound = 7.9;
  const zFarBound = -8.0;
  const xHalfSpan = 6.2;

  // Fixed camera elevation angle alpha below horizontal (~35 degrees gives clear depth and height reading)
  const alpha = (35 * Math.PI) / 180;
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);

  // Use 88% of vertical half-angle so baselines have a clean margin from the screen edges
  const effHalfV = Math.atan(tanV * 0.88);
  // Ray to near bound makes angle (alpha + effHalfV) below horizontal;
  // Ray to far bound makes angle (alpha - effHalfV) below horizontal.
  const tanNear = Math.tan(alpha + effHalfV);
  const tanFar = Math.tan(Math.max(0.08, alpha - effHalfV));

  // At height H, zCam - zNearBound = H / tanNear, and zCam - zFarBound = H / tanFar
  // => zNearBound - zFarBound = H * (1 / tanFar - 1 / tanNear)
  const spanZ = zNearBound - zFarBound;
  const hForVertical = spanZ / (1 / tanFar - 1 / tanNear);
  const zForVertical = zNearBound + hForVertical / tanNear;

  // Also ensure horizontal span fits at the near baseline depth:
  // depthNear = (zCam - 6.7) * cosA + H * sinA >= xHalfSpan / (tanH * 0.90)
  const minDepthNear = xHalfSpan / (tanH * 0.9);
  const currentDepthNear = (zForVertical - 6.7) * cosA + hForVertical * sinA;
  const horizScale = currentDepthNear < minDepthNear ? minDepthNear / currentDepthNear : 1;

  const baseH = hForVertical * horizScale;
  const baseZ = 6.7 + (zForVertical - 6.7) * horizScale;

  // Look-at intersection on court plane y = 0.4 along angle alpha
  const lookY = 0.4;
  const lookZ = baseZ - (baseH - lookY) / Math.tan(alpha);

  // Apply zoom (zoom > 1 moves camera closer along the view ray toward lookAt)
  const zClamped = clampZoom(zoom);
  const distScale = 1 / zClamped;

  // Keep camera follow X slightly damped when zoomed out so sidelines stay framed
  const followX = camX * 0.72;

  return {
    pos: {
      x: followX,
      y: lookY + (baseH - lookY) * distScale,
      z: lookZ + (baseZ - lookZ) * distScale,
    },
    lookAt: {
      x: followX,
      y: lookY,
      z: lookZ,
    },
  };
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

// ---------- Camera presets (settings) ----------

export interface CameraPresetSpec {
  pitchDeg: number; // camera elevation angle below horizontal
  top: number;      // NDC y the far player's head (1.95 m on the far baseline) lands on; <= 0.8 keeps the HUD band clear
  bottom: number;   // NDC y (as a positive number) the near baseline lands on
  halfSpan: number; // m either side of the camera that must fit horizontally at the near baseline
}

// top is 0.78 everywhere: the scoreboard HUD covers the top ~10% of the view (NDC y > 0.8).
export const CAMERA_PRESET_SPECS: Record<'behindHigh' | 'behindLow' | 'broadcast', CameraPresetSpec> = {
  behindHigh: { pitchDeg: 35, top: 0.78, bottom: 0.88, halfSpan: 6.2 },
  behindLow: { pitchDeg: 22, top: 0.78, bottom: 0.95, halfSpan: 4.7 },
  broadcast: { pitchDeg: 45, top: 0.78, bottom: 0.55, halfSpan: 6.2 },
};

export const CAMERA_HEIGHT_STEP = 2; // m of camera height per 1.0 of the height offset
export const CAMERA_DISTANCE_STEP = 3; // m of camera distance per 1.0 of the distance offset
const FAR_HEAD_Y = 1.95;

export interface CameraSetup {
  preset: CameraPreset;
  height: number;   // -1..1
  distance: number; // -1..1
}

// Camera for a preset: solves the camera position so the far head and the near baseline land on the preset's NDC
// rows, widens it if the sidelines would not fit, then applies the height/distance offsets (the look-at point stays
// fixed) and the zoom (moves along the view ray toward the look-at point).
export function computePresetFraming(
  setup: CameraSetup,
  aspect: number,
  fovDeg = 50,
  camX = 0,
  zoom = 1,
): CameraFraming {
  // 'shoulder' is framed by shoulderFraming; behindHigh here only keeps the type total
  const spec = setup.preset === 'shoulder' ? CAMERA_PRESET_SPECS.behindHigh : CAMERA_PRESET_SPECS[setup.preset];
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) * 0.5);
  const tanH = tanV * Math.max(0.5, aspect || 16 / 9);
  const a = (spec.pitchDeg * Math.PI) / 180;
  const Fy = -Math.sin(a), Fz = -Math.cos(a), Uy = Math.cos(a), Uz = -Math.sin(a);

  // (P - C) . (U - n tanV F) = 0 for both anchor points: a 2x2 linear system in the camera (y, z).
  const row = (n: number, py: number, pz: number) => {
    const wy = Uy - n * tanV * Fy, wz = Uz - n * tanV * Fz;
    return { wy, wz, rhs: py * wy + pz * wz };
  };
  const r1 = row(spec.top, FAR_HEAD_Y, -6.7), r2 = row(-spec.bottom, 0, 6.7);
  const det = r1.wy * r2.wz - r1.wz * r2.wy;
  let cy = (r1.rhs * r2.wz - r1.wz * r2.rhs) / det;
  let cz = (r1.wy * r2.rhs - r1.rhs * r2.wy) / det;

  // Look-at: where the view ray meets y = 0.4, as computeCameraFraming does.
  const lookY = 0.4;
  const rayToLook = (cy - lookY) / Math.sin(a);
  let lookZ = cz - rayToLook * Math.cos(a);

  // Sidelines (+-3.05) plus follow room must fit horizontally at the near baseline.
  const depthNear = (cz - 6.7) * Math.cos(a) + cy * Math.sin(a);
  const minDepth = spec.halfSpan / (tanH * 0.9);
  if (depthNear < minDepth) { // moving away along the ray only shrinks the image, so the vertical anchors stay valid
    const s = minDepth / depthNear;
    cy = lookY + (cy - lookY) * s;
    cz = lookZ + (cz - lookZ) * s;
  }

  const followX = camX * 0.72;
  const h = clamp(Number.isFinite(setup.height) ? setup.height : 0, -1, 1);
  const d = clamp(Number.isFinite(setup.distance) ? setup.distance : 0, -1, 1);
  cy += h * CAMERA_HEIGHT_STEP;
  cz += d * CAMERA_DISTANCE_STEP;

  const distScale = 1 / clampZoom(zoom);
  return {
    pos: { x: followX, y: lookY + (cy - lookY) * distScale, z: lookZ + (cz - lookZ) * distScale },
    lookAt: { x: followX, y: lookY, z: lookZ },
  };
}

export const SHOULDER_BACK = 2.6;  // m behind the player
export const SHOULDER_RIGHT = 0.45; // m to the player's right
export const SHOULDER_UP = 0.35;    // m above the head
export const SHOULDER_HEIGHT_STEP = 1;     // m of camera height per 1.0 of the height offset
export const SHOULDER_DISTANCE_STEP = 1.5; // m of camera distance per 1.0 of the distance offset
export const SHOULDER_ZOOM_OUT = 6;   // zooming out adds this many m per unit of (1/zoom - 1): zoom 0.6 = about 6.6 m back
export const SHOULDER_RISE = 0.35;    // camera rises this many m per extra m of pull-back, to keep looking over the player

export interface ShoulderFraming extends CameraFraming { dir: Vec3 } // dir = unit forward

// Over-the-right-shoulder camera for the FPS-style 'shoulder' preset. `feet` is the (smoothed) player position,
// yaw 0 = facing the net (yaw > 0 turns right), pitch > 0 looks up. Turns with yaw/pitch directly; zoom > 1 comes closer.
export function shoulderFraming(
  feet: Vec3, bodyHeight: number, yaw: number, pitch: number, zoom = 1, height = 0, distance = 0,
  out: ShoulderFraming = { pos: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 } },
): ShoulderFraming {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), cp = Math.cos(pitch);
  const h = clamp(Number.isFinite(height) ? height : 0, -1, 1);
  const d = clamp(Number.isFinite(distance) ? distance : 0, -1, 1);
  const z = clampZoom(zoom), base = SHOULDER_BACK + d * SHOULDER_DISTANCE_STEP;
  const back = Math.max(0.6, z >= 1 ? base / z : base + (1 / z - 1) * SHOULDER_ZOOM_OUT);
  out.dir.x = sy * cp; out.dir.y = Math.sin(pitch); out.dir.z = -cy * cp;
  out.pos.x = feet.x + cy * SHOULDER_RIGHT - sy * back; // right = (cos, 0, sin), flat forward = (sin, 0, -cos)
  out.pos.y = feet.y + bodyHeight + SHOULDER_UP + h * SHOULDER_HEIGHT_STEP + Math.max(0, back - SHOULDER_BACK) * SHOULDER_RISE;
  out.pos.z = feet.z + sy * SHOULDER_RIGHT + cy * back;
  out.lookAt.x = out.pos.x + out.dir.x; out.lookAt.y = out.pos.y + out.dir.y; out.lookAt.z = out.pos.z + out.dir.z;
  return out;
}

// low = 1, medium = up to 1.5, high = device pixel ratio capped at 2.
export function pixelRatioFor(q: 'low' | 'medium' | 'high', devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return q === 'low' ? 1 : Math.min(dpr, q === 'medium' ? 1.5 : 2);
}
