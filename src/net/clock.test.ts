import { describe, expect, it } from 'vitest';
import { clockSample, clockSeed, createClock, serverTickAt } from './clock';
import { TICK_HZ } from './protocol';

// deterministic pseudo-random
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

// The server's tick is true time * 120 + 5000. Each pong: out-leg and back-leg delays are noisy.
function run(n: number, base: number, jitter: number, spikeEvery = 0) {
  const rand = rng(7);
  let c = createClock();
  const trueTick = (ms: number) => 5000 + ms * (TICK_HZ / 1000);
  let t = 1000;
  for (let i = 0; i < n; i++) {
    const out = base / 2 + rand() * jitter;
    const back = base / 2 + rand() * jitter + (spikeEvery && i % spikeEvery === 0 && i > 0 ? 200 : 0);
    const serverTick = trueTick(t + out);
    c = clockSample(c, t, serverTick, t + out + back);
    t += 2000;
  }
  return { c, err: (serverTickAt(c, t)! - trueTick(t)) };
}

describe('clock', () => {
  it('has no estimate before a sample', () => {
    expect(serverTickAt(createClock(), 100)).toBeNull();
  });

  it('is exact with a symmetric, steady link', () => {
    const { err, c } = run(1, 60, 0);
    expect(Math.abs(err)).toBeLessThan(0.01);
    expect(c.rtt).toBeCloseTo(60);
  });

  it('converges to within one tick from noisy pongs', () => {
    const { err, c } = run(40, 60, 30);
    expect(Math.abs(err)).toBeLessThan(1);
    expect(c.rtt).toBeGreaterThan(55);
    expect(c.rtt).toBeLessThan(100);
  });

  it('ignores a delayed pong (queued packet)', () => {
    const { err } = run(40, 60, 10, 5);
    expect(Math.abs(err)).toBeLessThan(1.5);
  });

  it('a snapshot seeds the clock only when it has no sample yet', () => {
    const seeded = clockSeed(createClock(), 1000, 500);
    expect(serverTickAt(seeded, 500)).toBeCloseTo(1000);
    const real = clockSample(createClock(), 0, 2000, 40);
    expect(clockSeed(real, 5, 40)).toBe(real);
  });

  it('replaces a wildly wrong estimate instead of smoothing', () => {
    let c = clockSample(createClock(), 0, 1000, 40);
    c = clockSample(c, 2000, 90000, 2040);
    expect(serverTickAt(c, 2040)).toBeCloseTo(90000 + 2.4, 0);
  });
});
