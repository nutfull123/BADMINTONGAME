import { describe, it, expect } from 'vitest';
import {
  BODY_HEIGHT,
  computePlayerPose,
  solveTwoBoneIK,
  createTrailBuffer,
  pushTrailPoint,
  computePulseScale,
  computeCameraFraming,
  projectPointToNdc,
  stepZoom,
  clampZoom,
  MAX_RIGS,
  rigVisibility,
  followedPlayer,
  proportionsOf,
  teamColor,
} from './pose';
import type { FootworkView } from '../sim/footwork';
import type { PlayerState } from '../types';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'near',
    slot: 0,
    stats: { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
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

describe('pose, footwork, camera framing & trail math (pure, no WebGL/DOM)', () => {
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

  it('computes distinct pose parameters for idle, moving, charging, swinging, airborne, diving, and down (footwork none)', () => {
    const noneFw: FootworkView = { kind: 'none', phase: 0, dir: { x: 0, z: 0 } };
    const idlePose = computePlayerPose(makePlayer({ action: 'idle' }), 0.5, noneFw);
    const movingPose = computePlayerPose(
      makePlayer({ action: 'moving', vel: { x: 2.5, y: 0, z: -1.5 } }),
      0.25,
      noneFw,
    );
    const chargingPose = computePlayerPose(makePlayer({ action: 'charging' }), 0.5, noneFw);
    const swingingPose = computePlayerPose(makePlayer({ action: 'swinging' }), 0.5, noneFw);
    const airbornePose = computePlayerPose(
      makePlayer({ action: 'airborne', pos: { x: 0, y: 0.5, z: 3.5 } }),
      0.5,
      noneFw,
    );
    const divingPose = computePlayerPose(makePlayer({ action: 'diving' }), 0.5, noneFw);
    const downPose = computePlayerPose(makePlayer({ action: 'down' }), 0.5, noneFw);

    expect(Math.abs(movingPose.leftLegPitch)).toBeGreaterThan(0.1);
    expect(Math.sign(movingPose.leftLegPitch)).toBe(-Math.sign(movingPose.rightLegPitch));
    expect(chargingPose.hipYOffset).toBeLessThan(idlePose.hipYOffset);
    expect(swingingPose.torsoTwistY).not.toBe(idlePose.torsoTwistY);
    expect(airbornePose.kneeBend).toBeGreaterThan(idlePose.kneeBend);
    expect(divingPose.torsoPitchX).toBeGreaterThan(0.7);
    expect(downPose.lyingFlat).toBe(true);
    expect(downPose.hipYOffset).toBeLessThan(-0.4);
  });

  describe('footwork kinds (split, chasse, crossover, lunge, recover, none)', () => {
    const p = makePlayer({ action: 'moving' });

    it('none: keeps standard action-based pose without lateral foot cross or lunge knee bend', () => {
      const base = computePlayerPose(p, 0.4);
      const explicitNone = computePlayerPose(p, 0.4, { kind: 'none', phase: 0.5, dir: { x: 0, z: -1 } });
      expect(explicitNone).toEqual(base);
    });

    it('split: two-foot hop mid-phase and bent knees on landing', () => {
      const idle = computePlayerPose(makePlayer({ action: 'idle' }), 0);
      const midHop = computePlayerPose(p, 0, { kind: 'split', phase: 0.3, dir: { x: 0, z: 0 } });
      const landing = computePlayerPose(p, 0, { kind: 'split', phase: 0.85, dir: { x: 0, z: 0 } });

      // Hop lifts hips above landing crouch, and landing bends both knees deeply and widens stance
      expect(midHop.hipYOffset).toBeGreaterThan(landing.hipYOffset);
      expect(landing.leftKneeBend).toBeGreaterThan(idle.leftKneeBend + 0.25);
      expect(landing.rightKneeBend).toBeGreaterThan(idle.rightKneeBend + 0.25);
      expect(landing.leftLegRoll).toBeLessThan(0);
      expect(landing.rightLegRoll).toBeGreaterThan(0);
    });

    it('chasse: side shuffle where feet come together then apart without ever crossing', () => {
      const hipHalfW = BODY_HEIGHT.balanced * 0.068;
      const legLen = BODY_HEIGHT.balanced * 0.47;
      for (const ph of [0, 0.25, 0.5, 0.75, 1]) {
        const pose = computePlayerPose(p, 0, { kind: 'chasse', phase: ph, dir: { x: 1, z: 0 } });
        const leftFootX = -hipHalfW + Math.sin(pose.leftLegRoll) * legLen;
        const rightFootX = hipHalfW + Math.sin(pose.rightLegRoll) * legLen;
        // Left foot stays strictly left of right foot (never crosses)
        expect(leftFootX).toBeLessThan(rightFootX);
      }
      const together = computePlayerPose(p, 0, { kind: 'chasse', phase: 0.5, dir: { x: 1, z: 0 } });
      const apart = computePlayerPose(p, 0, { kind: 'chasse', phase: 0.0, dir: { x: 1, z: 0 } });
      const spanTogether =
        2 * hipHalfW + (Math.sin(together.rightLegRoll) - Math.sin(together.leftLegRoll)) * legLen;
      const spanApart =
        2 * hipHalfW + (Math.sin(apart.rightLegRoll) - Math.sin(apart.leftLegRoll)) * legLen;
      expect(spanTogether).toBeLessThan(spanApart);
    });

    it('crossover: back foot crosses in front while moving backward', () => {
      const pose = computePlayerPose(p, 0, { kind: 'crossover', phase: 0.5, dir: { x: 0.4, z: 1 } });
      // Moving backward with crossover twists torso and crosses one leg laterally across the midline while pitching forward
      expect(Math.abs(pose.torsoTwistY)).toBeGreaterThan(0.25);
      expect(pose.leftLegPitch).toBeGreaterThan(0.3);
      expect(pose.rightLegPitch).toBeLessThan(0);
      // Left leg rolls inward (+X) across toward right leg
      expect(pose.leftLegRoll).toBeGreaterThan(0.18);
    });

    it('lunge: long step with racket-side (right) foot forward, front knee bent ~90 deg, back leg extended, torso leaning forward', () => {
      const pose = computePlayerPose(p, 0, { kind: 'lunge', phase: 0.7, dir: { x: 0.5, z: -1 } });
      // Racket-side (right) leg steps strongly forward (+pitch), left leg trails behind (-pitch)
      expect(pose.rightLegPitch).toBeGreaterThan(0.75);
      expect(pose.leftLegPitch).toBeLessThan(-0.55);
      // Front knee bent ~90 degrees (~1.3..1.6 rad), back knee nearly straight (<0.25 rad)
      expect(pose.rightKneeBend).toBeGreaterThan(1.2);
      expect(pose.leftKneeBend).toBeLessThan(0.25);
      // Torso leans forward and hips drop low
      expect(pose.torsoPitchX).toBeGreaterThan(0.35);
      expect(pose.hipYOffset).toBeLessThan(-0.18);
    });

    it('recover: pushes back from the front foot toward base as phase progresses from 0 to 1', () => {
      const start = computePlayerPose(p, 0, { kind: 'recover', phase: 0.1, dir: { x: -0.3, z: 1 } });
      const end = computePlayerPose(p, 0, { kind: 'recover', phase: 0.9, dir: { x: -0.3, z: 1 } });
      // Starts low with right leg still forward, rises back toward upright base stance by phase 0.9
      expect(start.hipYOffset).toBeLessThan(end.hipYOffset);
      expect(start.rightLegPitch).toBeGreaterThan(end.rightLegPitch);
      expect(start.rightKneeBend).toBeGreaterThan(end.rightKneeBend);
    });
  });

  describe('camera framing & zoom math', () => {
    it('frames BOTH baselines (z = +6.7 and -6.7) and both sidelines (x = +-3.05) inside NDC [-1, 1] with margin at 16:9 and 16:10', () => {
      const fovDeg = 50;
      for (const aspect of [16 / 9, 16 / 10]) {
        for (const camX of [0, 2.59, -2.59]) {
          const cam = computeCameraFraming(aspect, fovDeg, camX, 1.0);
          // Camera is behind the near player (z > 6.7) and elevated
          expect(cam.pos.z).toBeGreaterThan(6.7);
          expect(cam.pos.y).toBeGreaterThan(4.0);

          // Check all 4 outer doubles court corners: (x = +-3.05, y = 0, z = +-6.7)
          for (const x of [-3.05, 3.05]) {
            for (const z of [-6.7, 6.7]) {
              const ndc = projectPointToNdc({ x, y: 0, z }, cam, aspect, fovDeg);
              expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.96);
              expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.96);
            }
          }
        }
      }
    });

    it('clamps zoom to 0.6..1.6 and eases smoothly over ~0.2 s, moving camera closer when zoom > 1', () => {
      expect(clampZoom(0.2)).toBeCloseTo(0.6);
      expect(clampZoom(2.5)).toBeCloseTo(1.6);
      expect(clampZoom(1.2)).toBeCloseTo(1.2);

      let z = 1.0;
      z = stepZoom(z, 1.5, 0.05);
      expect(z).toBeGreaterThan(1.0);
      expect(z).toBeLessThan(1.5);

      // After 1 second of easing, reaches target
      for (let i = 0; i < 20; i++) z = stepZoom(z, 1.5, 0.05);
      expect(z).toBeCloseTo(1.5, 2);

      const defaultCam = computeCameraFraming(16 / 9, 50, 0, 1.0);
      const zoomedInCam = computeCameraFraming(16 / 9, 50, 0, 1.5);
      const zoomedOutCam = computeCameraFraming(16 / 9, 50, 0, 0.7);
      const distDefault = Math.hypot(
        defaultCam.pos.y - defaultCam.lookAt.y,
        defaultCam.pos.z - defaultCam.lookAt.z,
      );
      const distIn = Math.hypot(
        zoomedInCam.pos.y - zoomedInCam.lookAt.y,
        zoomedInCam.pos.z - zoomedInCam.lookAt.z,
      );
      const distOut = Math.hypot(
        zoomedOutCam.pos.y - zoomedOutCam.lookAt.y,
        zoomedOutCam.pos.z - zoomedOutCam.lookAt.z,
      );
      expect(distIn).toBeLessThan(distDefault);
      expect(distOut).toBeGreaterThan(distDefault);
    });
  });

  it('maintains a ~0.3 s shuttle trail buffer, pruning expired points and resetting on teleports', () => {
    const trail = createTrailBuffer(0.3, 24);
    pushTrailPoint(trail, { x: 0, y: 1.5, z: 3.0 }, 0.0);
    pushTrailPoint(trail, { x: 0, y: 2.0, z: 2.0 }, 0.1);
    pushTrailPoint(trail, { x: 0, y: 2.3, z: 1.0 }, 0.2);
    expect(trail.points.length).toBe(3);

    pushTrailPoint(trail, { x: 0, y: 2.4, z: 0.0 }, 0.35);
    expect(trail.points.length).toBe(3);
    expect(trail.points[0].t).toBeCloseTo(0.1);

    pushTrailPoint(trail, { x: 1.3, y: 1.0, z: 3.1 }, 0.36);
    expect(trail.points.length).toBe(1);
  });

  it('computes a smooth pulsing scale around 1.0 for the landing marker', () => {
    const s0 = computePulseScale(0);
    const sPeak = computePulseScale(Math.PI / (2 * 6));
    expect(s0).toBeCloseTo(1.0, 2);
    expect(sPeak).toBeGreaterThan(1.08);
  });
});

describe('doubles render maths', () => {
  it('shows 2 rigs for singles and 4 for doubles out of 4 pre-allocated', () => {
    expect(MAX_RIGS).toBe(4);
    expect(rigVisibility(2)).toEqual([true, true, false, false]);
    expect(rigVisibility(4)).toEqual([true, true, true, true]);
  });

  it('follows the human index, falling back to the first near player', () => {
    const ps = [
      makePlayer({ side: 'far' }),
      makePlayer({ side: 'near', slot: 0 }),
      makePlayer({ side: 'near', slot: 1 }),
    ];
    expect(followedPlayer(ps, 2)).toBe(ps[2]);
    expect(followedPlayer(ps, undefined)).toBe(ps[1]);
    expect(followedPlayer(ps, 9)).toBe(ps[1]);
    expect(followedPlayer([], 0)).toBeUndefined();
  });

  it('draws women slimmer than men with a ponytail', () => {
    const m = proportionsOf('male');
    const f = proportionsOf('female');
    expect(f.shoulder).toBeLessThan(m.shoulder);
    expect(f.limb).toBeLessThan(m.limb);
    expect(f.ponytail).toBe(true);
    expect(m.ponytail).toBe(false);
  });

  it('colours near blue, far red, second partner lighter', () => {
    const lum = (c: number) => (c >> 16) + ((c >> 8) & 255) + (c & 255);
    expect(teamColor('near', 0) & 255).toBeGreaterThan(teamColor('near', 0) >> 16);
    expect(teamColor('far', 0) >> 16).toBeGreaterThan(teamColor('far', 0) & 255);
    expect(lum(teamColor('near', 1))).toBeGreaterThan(lum(teamColor('near', 0)));
    expect(lum(teamColor('far', 1))).toBeGreaterThan(lum(teamColor('far', 0)));
  });
});

import { computePresetFraming, pixelRatioFor, CAMERA_HEIGHT_STEP, CAMERA_DISTANCE_STEP } from './pose';

describe('camera presets and quality', () => {
  const presets = ['behindHigh', 'behindLow', 'broadcast'] as const;
  const at = (preset: (typeof presets)[number], aspect: number, camX = 0, height = 0, distance = 0) =>
    computePresetFraming({ preset, height, distance }, aspect, 50, camX, 1);

  it('every preset keeps both baselines in view and the far player below the HUD band (top 10%)', () => {
    for (const preset of presets) {
      for (const aspect of [16 / 9, 16 / 10]) {
        for (const camX of [0, 2.59, -2.59]) {
          const cam = at(preset, aspect, camX);
          for (const x of [-3.05, 3.05]) {
            for (const z of [-6.7, 6.7]) {
              const n = projectPointToNdc({ x, y: 0, z }, cam, aspect, 50);
              expect(Math.abs(n.x)).toBeLessThanOrEqual(0.96);
              expect(Math.abs(n.y)).toBeLessThanOrEqual(0.96);
            }
          }
          // tallest far player (1.95 m) standing on the far baseline, on centre and at the sidelines
          for (const x of [0, -3.05, 3.05]) {
            expect(projectPointToNdc({ x, y: 1.95, z: -6.7 }, cam, aspect, 50).y).toBeLessThanOrEqual(0.8);
          }
        }
      }
    }
  });

  it('behindLow is lower and closer than behindHigh; broadcast is higher and farther back', () => {
    const dist = (c: ReturnType<typeof at>) => Math.hypot(c.pos.y - 0, c.pos.z - 6.7);
    const high = at('behindHigh', 16 / 9), low = at('behindLow', 16 / 9), tv = at('broadcast', 16 / 9);
    expect(low.pos.y).toBeLessThan(high.pos.y);
    expect(dist(low)).toBeLessThan(dist(high));
    expect(tv.pos.y).toBeGreaterThan(high.pos.y);
    expect(dist(tv)).toBeGreaterThan(dist(high));
  });

  it('height +1 is 2 m higher and distance +1 is 3 m farther; zoom still moves the camera closer', () => {
    const base = at('behindHigh', 16 / 9);
    expect(at('behindHigh', 16 / 9, 0, 1, 0).pos.y - base.pos.y).toBeCloseTo(CAMERA_HEIGHT_STEP);
    expect(at('behindHigh', 16 / 9, 0, -1, 0).pos.y - base.pos.y).toBeCloseTo(-CAMERA_HEIGHT_STEP);
    expect(at('behindHigh', 16 / 9, 0, 0, 1).pos.z - base.pos.z).toBeCloseTo(CAMERA_DISTANCE_STEP);
    const zoomed = computePresetFraming({ preset: 'behindHigh', height: 0, distance: 0 }, 16 / 9, 50, 0, 1.5);
    expect(zoomed.pos.z).toBeLessThan(base.pos.z);
  });

  it('pixel ratio: low 1, medium up to 1.5, high device ratio capped at 2', () => {
    expect(pixelRatioFor('low', 3)).toBe(1);
    expect(pixelRatioFor('medium', 3)).toBe(1.5);
    expect(pixelRatioFor('medium', 1)).toBe(1);
    expect(pixelRatioFor('high', 3)).toBe(2);
    expect(pixelRatioFor('high', 1.25)).toBe(1.25);
  });
});

import { shoulderFraming, SHOULDER_BACK, SHOULDER_RIGHT, SHOULDER_UP } from './pose';

describe('shoulderFraming', () => {
  const feet = { x: 1, y: 0, z: 3.5 };
  it('sits behind, right of and above the player when facing the net', () => {
    const f = shoulderFraming(feet, 1.78, 0, 0);
    expect(f.pos.z - feet.z).toBeCloseTo(SHOULDER_BACK); // behind = toward the near baseline
    expect(f.pos.x - feet.x).toBeCloseTo(SHOULDER_RIGHT);
    expect(f.pos.y).toBeCloseTo(1.78 + SHOULDER_UP);
    expect(f.dir.x).toBeCloseTo(0);
    expect(f.dir.y).toBeCloseTo(0);
    expect(f.dir.z).toBeCloseTo(-1);
  });
  it('looks along yaw/pitch and the camera follows the turn', () => {
    const f = shoulderFraming(feet, 1.78, Math.PI / 2, 0.5);
    expect(Math.hypot(f.dir.x, f.dir.y, f.dir.z)).toBeCloseTo(1);
    expect(f.dir.y).toBeCloseTo(Math.sin(0.5));
    expect(f.dir.x).toBeGreaterThan(0.8); // turned right: forward is +x
    expect(f.pos.x).toBeLessThan(feet.x); // so the camera is behind, at -x
    expect(f.pos.z - feet.z).toBeCloseTo(SHOULDER_RIGHT); // and the shoulder offset is toward +z
    expect(f.lookAt.x - f.pos.x).toBeCloseTo(f.dir.x);
  });
  it('zoom comes closer, distance offset goes farther, height offset goes higher', () => {
    const base = shoulderFraming(feet, 1.78, 0, 0);
    expect(shoulderFraming(feet, 1.78, 0, 0, 1.5).pos.z).toBeLessThan(base.pos.z);
    expect(shoulderFraming(feet, 1.78, 0, 0, 1, 0, 1).pos.z).toBeGreaterThan(base.pos.z);
    expect(shoulderFraming(feet, 1.78, 0, 0, 1, 1, 0).pos.y).toBeGreaterThan(base.pos.y);
  });
});
