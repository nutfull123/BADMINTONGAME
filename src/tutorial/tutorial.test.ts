import { describe, expect, it } from 'vitest';
import { isInSingles, predictLanding } from '../physics';
import { createPlayer, setRandom } from '../sim';
import type { HitResult, ShotType, Stats } from '../types';
import { DRILL_IDS, SUCCESSES_TO_PASS, createTutorial, type Attempt, type DrillId } from './index';

const stats: Stats = { body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const at = (x: number, z: number) => ({ x, y: 0, z });
const hit = (shot: ShotType): HitResult => ({
  shot,
  perfect: false,
  launch: { pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 2, z: -8 } },
});

// The shot/state a drill is teaching: clear lands deep, drop lands short, smash is airborne, etc.
function matchingAttempt(id: DrillId, successes: number): Attempt {
  switch (id) {
    case 'move':
      return { reached: true };
    case 'basic':
      return {
        hit: hit('basic'),
        landing: at(0, -5),
        basicSide: successes === 0 ? 'forehand' : successes === 1 ? 'backhand' : 'forehand',
      };
    case 'clear':
      return { hit: hit('clear'), landing: at(0, -5.5) };
    case 'drop':
      return { hit: hit('drop'), landing: at(0, -2) };
    case 'smash':
      return { hit: hit('smash'), landing: at(0, -4), airborne: true };
    case 'net':
      return { hit: hit('net'), landing: at(0, -2) };
    case 'dive':
      return { dived: true, gotUp: true };
    case 'serve':
      return {
        hit: hit(successes === 1 ? 'serveLong' : 'serveShort'),
        landing: at(-1, -4),
        court: 'right',
      };
  }
}

function wrongAttempt(id: DrillId): Attempt {
  switch (id) {
    case 'move':
      return { reached: false };
    case 'basic':
      return { hit: hit('clear'), landing: at(0, -5), basicSide: 'forehand' };
    case 'clear':
      return { hit: hit('drop'), landing: at(0, -2) };
    case 'drop':
      return { hit: hit('clear'), landing: at(0, -5.5) };
    case 'smash':
      return { hit: hit('smash'), landing: at(0, -4), airborne: false };
    case 'net':
      return { hit: hit('drop'), landing: at(0, -2) };
    case 'dive':
      return { dived: true, gotUp: false };
    case 'serve':
      // a short serve into the wrong service box
      return { hit: hit('serveShort'), landing: at(1, -4), court: 'right' };
  }
}

describe('tutorial state machine', () => {
  it('teaches the eight drills in the designed order', () => {
    expect(createTutorial().drills.map((d) => d.id)).toEqual([
      'move', 'basic', 'clear', 'drop', 'smash', 'net', 'dive', 'serve',
    ]);
    expect(DRILL_IDS).toEqual(['move', 'basic', 'clear', 'drop', 'smash', 'net', 'dive', 'serve']);
    expect(SUCCESSES_TO_PASS).toBe(3);
  });

  it('passes a drill after three successes and moves on', () => {
    const t = createTutorial();
    const firstTwo = [
      t.recordAttempt(matchingAttempt('move', 0)),
      t.recordAttempt(matchingAttempt('move', 1)),
    ];
    expect(firstTwo.every((p) => p.passed)).toBe(true);
    expect(t.index).toBe(0);
    expect(t.successes).toBe(2);

    const third = t.recordAttempt(matchingAttempt('move', 2));
    expect(third.passed).toBe(true);
    expect(t.index).toBe(1);
    expect(t.successes).toBe(0);
    expect(t.current.id).toBe('basic');
  });

  it('does not pass a drill on a wrong attempt', () => {
    const t = createTutorial();
    const p = t.recordAttempt(wrongAttempt('move'));
    expect(p.passed).toBe(false);
    expect(t.index).toBe(0);
    expect(t.successes).toBe(0);
  });

  it('skip advances without successes and finishes after the last drill', () => {
    const t = createTutorial();
    t.recordAttempt(matchingAttempt('move', 0)); // a success must not survive a skip
    const p = t.skip();
    expect(p.done).toBe(false);
    expect(t.index).toBe(1);
    expect(t.successes).toBe(0);

    for (let i = 0; i < 7; i++) t.skip();
    expect(t.done).toBe(true);
    expect(t.current.id).toBe('serve');
  });

  it('replay resets the chosen drill', () => {
    const t = createTutorial();
    for (let i = 0; i < 3; i++) t.recordAttempt(matchingAttempt('move', i));
    expect(t.index).toBe(1);
    t.recordAttempt(matchingAttempt('basic', 0));
    expect(t.successes).toBe(1);

    const p = t.replay(0);
    expect(p.index).toBe(0);
    expect(t.current.id).toBe('move');
    expect(t.successes).toBe(0);
    expect(t.attempts).toBe(0);
    expect(t.done).toBe(false);

    t.replay(7);
    expect(t.current.id).toBe('serve');
  });

  it('each drill accepts a matching attempt and rejects a wrong one', () => {
    for (const id of DRILL_IDS) {
      const ok = createTutorial();
      while (ok.current.id !== id) ok.skip();
      const passed = ok.recordAttempt(matchingAttempt(id, 0));
      expect(passed.passed, `${id} should accept its matching attempt`).toBe(true);

      const bad = createTutorial();
      while (bad.current.id !== id) bad.skip();
      const failed = bad.recordAttempt(wrongAttempt(id));
      expect(failed.passed, `${id} should reject a wrong attempt`).toBe(false);
      expect(bad.successes).toBe(0);
    }
  });

  it('marks a move target and advances it after each success', () => {
    const t = createTutorial();
    const first = t.target;
    expect(first).not.toBeNull();
    t.recordAttempt({ reached: true });
    const second = t.target;
    expect(second).not.toBeNull();
    expect(second).not.toEqual(first);
    t.skip();
    expect(t.target).toBeNull();
  });
});

describe('tutorial feeder', () => {
  it('feeds a shuttle toward the near court for every drill that needs one', () => {
    setRandom(() => 0.5);
    const player = createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });
    const t = createTutorial();

    for (const d of t.drills) {
      const s = d.feed({ player });
      if (d.id === 'move' || d.id === 'serve') {
        expect(s, `${d.id} is fed by the player, not the drill`).toBeNull();
        continue;
      }
      expect(s, `${d.id} should feed a shuttle`).not.toBeNull();
      const landing = predictLanding(s!);
      expect(landing, `${d.id} feed should clear the net`).not.toBeNull();
      expect(landing!.z, `${d.id} feed should land on the near side`).toBeGreaterThan(0);
      expect(isInSingles(landing!, 'near'), `${d.id} feed should be reachable in the near court`).toBe(true);
    }
  });

  it('feeds the kind of shuttle each drill teaches', () => {
    setRandom(() => 0.5);
    const player = createPlayer(stats, 'near', { x: 0, y: 0, z: 3.5 });
    const t = createTutorial();
    const landingZ = (id: DrillId) => {
      const d = t.drills.find((x) => x.id === id)!;
      return predictLanding(d.feed({ player })!)!.z;
    };

    // The clear, drop and smash drills all start with a deep lift to the back court.
    expect(landingZ('clear')).toBeGreaterThan(4.5);
    expect(landingZ('drop')).toBeGreaterThan(4.5);
    expect(landingZ('smash')).toBeGreaterThan(4.5);
    // The net drill feeds a shuttle that falls near the net.
    expect(landingZ('net')).toBeLessThan(2.5);
    // The dive drill feeds a shuttle out to the side, so the player has to dive.
    expect(landingZ('dive')).toBeLessThan(3.5);
  });
});
