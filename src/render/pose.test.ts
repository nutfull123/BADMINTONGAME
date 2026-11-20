import { describe, it, expect } from 'vitest';
import {
  BODY_HEIGHT,
  computePlayerPose,
  solveTwoBoneIK,
  createTrailBuffer,
  pushTrailPoint,
  computePulseScale,
} from './pose';
import type { PlayerState } from '../types';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'near',
    stats: { body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
    pos: { x: 0, y: 0, z: 3.5 },
    vel: { x: 0, y: 0, z: 0 },
    facing: 0,
    racketHead: { x: 0.4, y: 1.5, z: 3.0 },
    action: 'idle',
    staminaNow: 1,
    fatigue: 0,
    getUpPressesLeft: 0,
    ...overrides,
  };
}

describe('pose & trail math (pure, no WebGL/DOM)', () => {
  it('maps body types to exact specification heights (tall 1.95, balanced 1.78, short 1.63)', () => {
    expect(BODY_HEIGHT.tall).toBe(1.95);
    expect(BODY_HEIGHT.balanced).toBe(1.78);
    expect(BODY_HEIGHT.short).toBe(1.63);
  });

  it('solveTwoBoneIK places elbow and wrist toward the grip target and clamps when target is beyond max reach', () => {
    const shoulder = { x: 0.2, y: 1.4, z: 3.5 };
    const grip = { x: 0.35, y: 1.55, z: 3.15 };
    const upperLen = 0.32;
    const forearmLen = 0.30;

    const ik = solveTwoBoneIK(shoulder, grip, upperLen, forearmLen);
    const d1 = Math.hypot(
      ik.elbow.x - shoulder.x,
      ik.elbow.y - shoulder.y,
      ik.elbow.z - shoulder.z,
    );
    const d2 = Math.hypot(
      ik.wrist.x - ik.elbow.x,
      ik.wrist.y - ik.elbow.y,
      ik.wrist.z - ik.elbow.z,
    );
    expect(d1).toBeCloseTo(upperLen, 2);
    expect(d2).toBeCloseTo(forearmLen, 2);
    expect(ik.wrist.x).toBeCloseTo(grip.x, 2);
    expect(ik.wrist.y).toBeCloseTo(grip.y, 2);
    expect(ik.wrist.z).toBeCloseTo(grip.z, 2);

    // Out-of-reach target extends arm straight toward target
    const farTarget = { x: 2.0, y: 3.0, z: 1.0 };
    const ikFar = solveTwoBoneIK(shoulder, farTarget, upperLen, forearmLen);
    const totalReach = Math.hypot(
      ikFar.wrist.x - shoulder.x,
      ikFar.wrist.y - shoulder.y,
      ikFar.wrist.z - shoulder.z,
    );
    expect(totalReach).toBeCloseTo(upperLen + forearmLen, 2);
  });

  it('computes distinct pose parameters for idle, moving, charging, swinging, airborne, diving, and down', () => {
    const idlePose = computePlayerPose(makePlayer({ action: 'idle' }), 0.5);
    const movingPose = computePlayerPose(
      makePlayer({ action: 'moving', vel: { x: 2.5, y: 0, z: -1.5 } }),
      0.25,
    );
    const chargingPose = computePlayerPose(makePlayer({ action: 'charging' }), 0.5);
    const swingingPose = computePlayerPose(makePlayer({ action: 'swinging' }), 0.5);
    const airbornePose = computePlayerPose(
      makePlayer({ action: 'airborne', pos: { x: 0, y: 0.5, z: 3.5 } }),
      0.5,
    );
    const divingPose = computePlayerPose(makePlayer({ action: 'diving' }), 0.5);
    const downPose = computePlayerPose(makePlayer({ action: 'down' }), 0.5);

    // Moving strides legs opposite each other
    expect(Math.abs(movingPose.leftLegPitch)).toBeGreaterThan(0.1);
    expect(Math.sign(movingPose.leftLegPitch)).toBe(-Math.sign(movingPose.rightLegPitch));

    // Charging crouches hip lower than idle
    expect(chargingPose.hipYOffset).toBeLessThan(idlePose.hipYOffset);

    // Swinging adds forward torso twist / swing arc compared to idle
    expect(swingingPose.torsoTwistY).not.toBe(idlePose.torsoTwistY);

    // Airborne tucks legs
    expect(airbornePose.kneeBend).toBeGreaterThan(idlePose.kneeBend);

    // Diving pitches torso forward strongly
    expect(divingPose.torsoPitchX).toBeGreaterThan(0.7);

    // Down lies horizontal on the court
    expect(downPose.lyingFlat).toBe(true);
    expect(downPose.hipYOffset).toBeLessThan(-0.4);
  });

  it('maintains a ~0.3 s shuttle trail buffer, pruning expired points and resetting on teleports', () => {
    const trail = createTrailBuffer(0.3, 24);
    pushTrailPoint(trail, { x: 0, y: 1.5, z: 3.0 }, 0.0);
    pushTrailPoint(trail, { x: 0, y: 2.0, z: 2.0 }, 0.1);
    pushTrailPoint(trail, { x: 0, y: 2.3, z: 1.0 }, 0.2);
    expect(trail.points.length).toBe(3);

    // At t = 0.35, point at t = 0.0 is older than 0.3 s and gets pruned
    pushTrailPoint(trail, { x: 0, y: 2.4, z: 0.0 }, 0.35);
    expect(trail.points.length).toBe(3);
    expect(trail.points[0].t).toBeCloseTo(0.1);

    // Huge jump (e.g., new rally serve placement) clears old trail so no streak crosses the court
    pushTrailPoint(trail, { x: 1.3, y: 1.0, z: 3.1 }, 0.36);
    expect(trail.points.length).toBe(1);
  });

  it('computes a smooth pulsing scale around 1.0 for the landing marker', () => {
    const s0 = computePulseScale(0);
    const sPeak = computePulseScale(Math.PI / (2 * 6)); // sin(6 * t) = 1
    expect(s0).toBeCloseTo(1.0, 2);
    expect(sPeak).toBeGreaterThan(1.08);
  });
});
