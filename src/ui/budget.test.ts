import { describe, it, expect } from 'vitest';
import { budgetLeft, clampStatToBudget, PRESETS } from './index';
import type { Stats } from '../types';

describe('budgetLeft & stat budget rules', () => {
  it('returns 20 when all stats are 0', () => {
    const stats: Stats = { body: 'balanced', speed: 0, power: 0, recovery: 0, stamina: 0 };
    expect(budgetLeft(stats)).toBe(20);
  });

  it('returns remaining points for partial allocations', () => {
    const stats: Stats = { body: 'tall', speed: 3, power: 4, recovery: 2, stamina: 5 };
    expect(budgetLeft(stats)).toBe(6);
  });

  it('returns 0 for each preset (tall, short, balanced) which all use full 20-point budget', () => {
    expect(budgetLeft(PRESETS.tall)).toBe(0);
    expect(budgetLeft(PRESETS.short)).toBe(0);
    expect(budgetLeft(PRESETS.balanced)).toBe(0);
  });

  it('clamps a stat change so total never exceeds 20 and each stat stays within 0..10', () => {
    const current: Stats = { body: 'balanced', speed: 6, power: 6, recovery: 5, stamina: 0 };
    // 3 points left; requesting stamina = 8 should clamp stamina to 3
    const next = clampStatToBudget(current, 'stamina', 8);
    expect(next.stamina).toBe(3);
    expect(budgetLeft(next)).toBe(0);

    // Lowering a stat frees budget and clamps at 0
    const lowered = clampStatToBudget(next, 'speed', -2);
    expect(lowered.speed).toBe(0);
    expect(budgetLeft(lowered)).toBe(6);

    // Raising a stat when plenty of budget left still clamps at 10
    const maxed = clampStatToBudget({ body: 'short', speed: 0, power: 0, recovery: 0, stamina: 0 }, 'speed', 15);
    expect(maxed.speed).toBe(10);
    expect(budgetLeft(maxed)).toBe(10);
  });
});
