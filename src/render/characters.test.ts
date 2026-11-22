import { describe, it, expect } from 'vitest';
import {
  clipFor,
  clipKey,
  heightScale,
  hipDropFor,
  isShirtMesh,
  isUpperBodyTrack,
  modelFileFor,
  swingWeight,
} from './characters';
import type { PlayerState, Side } from '../types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'near',
    slot: 0,
    stats: { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 },
    pos: { x: 0, y: 0, z: 3.5 },
    vel: { x: 0, y: 0, z: 0 },
    facing: 0,
    racketHead: { x: 0.4, y: 1.5, z: 3 },
    action: 'idle',
    staminaNow: 1,
    fatigue: 0,
    getUpPressesLeft: 0,
    ...over,
  };
}

// Near faces -z (net at z = 0) with its right at +x; far faces +z with its right at -x.
const moving = (side: Side, x: number, z: number) =>
  makePlayer({ side, pos: { x: 0, y: 0, z: side === 'near' ? 3.5 : -3.5 }, vel: { x, y: 0, z }, action: 'moving' });

describe('clipFor', () => {
  it('idle for a still player', () => {
    const c = clipFor(makePlayer());
    expect(c.base).toBe('Idle');
    expect(c.swing).toBe(false);
  });

  it('near side: forward is -z, right is +x', () => {
    expect(clipFor(moving('near', 0, -4)).base).toBe('Run');
    expect(clipFor(moving('near', 0, 4)).base).toBe('Run_Back');
    expect(clipFor(moving('near', 4, 0)).base).toBe('Run_Right');
    expect(clipFor(moving('near', -4, 0)).base).toBe('Run_Left');
  });

  it('far side: forward is +z, right is -x', () => {
    expect(clipFor(moving('far', 0, 4)).base).toBe('Run');
    expect(clipFor(moving('far', 0, -4)).base).toBe('Run_Back');
    expect(clipFor(moving('far', -4, 0)).base).toBe('Run_Right');
    expect(clipFor(moving('far', 4, 0)).base).toBe('Run_Left');
  });

  it('turning the player turns the run direction with it', () => {
    // facing pi/2 on the near side points the body along +x
    const p = moving('near', 4, 0);
    p.facing = Math.PI / 2;
    expect(clipFor(p).base).toBe('Run');
  });

  it('playback speed follows the ground speed, within limits', () => {
    const slow = clipFor(moving('near', 0, -1)).timeScale;
    const fast = clipFor(moving('near', 0, -4)).timeScale;
    const crazy = clipFor(moving('near', 0, -40)).timeScale;
    expect(slow).toBeLessThan(fast);
    expect(fast).toBeCloseTo(1, 1);
    expect(crazy).toBeLessThanOrEqual(1.6);
    expect(clipFor(makePlayer()).timeScale).toBe(1);
  });

  it('Roll while diving or down', () => {
    expect(clipFor(makePlayer({ action: 'diving', vel: { x: 0, y: 0, z: -4 } })).base).toBe('Roll');
    expect(clipFor(makePlayer({ action: 'down' })).base).toBe('Roll');
  });

  it('swing overlay when a shot is released, base clip keeps following the legs', () => {
    expect(clipFor(makePlayer({ action: 'swinging' }))).toMatchObject({ base: 'Idle', swing: true });
    const run = moving('near', 0, -4);
    run.action = 'swinging';
    expect(clipFor(run)).toMatchObject({ base: 'Run', swing: true });
  });

  it('reuses the output object when given one', () => {
    const out = clipFor(makePlayer());
    expect(clipFor(moving('near', 0, -4), out)).toBe(out);
    expect(out.base).toBe('Run');
  });
});

describe('model choice and scale', () => {
  it('gender picks the right file', () => {
    expect(modelFileFor('male')).toMatch(/\/male_casual\.glb$/);
    expect(modelFileFor('female')).toMatch(/\/female_casual\.glb$/);
  });

  it('scales the model so its height equals the target height', () => {
    expect(heightScale(1.63, 2)).toBeCloseTo(0.815, 5);
    expect(heightScale(1.95, 2)).toBeCloseTo(0.975, 5);
    expect(heightScale(1.78, 1.78)).toBe(1);
    expect(heightScale(1.8, 0)).toBe(1); // degenerate model: leave it alone
  });
});

describe('helpers', () => {
  it('strips the armature prefix from clip names', () => {
    expect(clipKey('CharacterArmature|Run_Back')).toBe('Run_Back');
    expect(clipKey('Idle')).toBe('Idle');
  });

  it('swing weight ramps in, holds, ramps out', () => {
    expect(swingWeight(0, 1.3)).toBe(0);
    expect(swingWeight(0.65, 1.3)).toBe(1);
    expect(swingWeight(1.3, 1.3)).toBe(0);
    expect(swingWeight(0.03, 1.3)).toBeGreaterThan(0);
    expect(swingWeight(0.03, 1.3)).toBeLessThan(1);
  });

  it('upper-body filter keeps the arms and spine, drops the legs and hips', () => {
    expect(isUpperBodyTrack('UpperArmR.quaternion')).toBe(true);
    expect(isUpperBodyTrack('Torso.quaternion')).toBe(true);
    expect(isUpperBodyTrack('Index2L.quaternion')).toBe(true);
    expect(isUpperBodyTrack('UpperLegL.quaternion')).toBe(false);
    expect(isUpperBodyTrack('Hips.quaternion')).toBe(false);
    expect(isUpperBodyTrack('FootR.position')).toBe(false);
  });

  it('finds the shirt mesh in both models', () => {
    expect(isShirtMesh('Casual2_Body_1')).toBe(true);
    expect(isShirtMesh('Casual_Body_1')).toBe(true);
    expect(isShirtMesh('Casual_Body_2')).toBe(false);
    expect(isShirtMesh('Casual_Legs')).toBe(false);
  });

  it('drops the hips for a lunge or crouch only, never while rolling', () => {
    expect(hipDropFor('charging', -0.14)).toBeLessThan(0);
    expect(hipDropFor('charging', -0.14)).toBeGreaterThanOrEqual(-0.08);
    expect(hipDropFor('moving', 0.03)).toBe(0);
    expect(hipDropFor('diving', -0.28)).toBe(0);
    expect(hipDropFor('down', -0.3)).toBe(0);
    expect(hipDropFor('idle', -0.5)).toBe(-0.08); // capped
  });
});
