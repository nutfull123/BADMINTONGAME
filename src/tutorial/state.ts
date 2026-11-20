// Small state machine for the tutorial: current drill, progress, skip and replay.
// Pure: no DOM, no three.
import type { Vec3 } from '../types';
import { DRILLS, type Attempt, type Drill, type DrillId } from './drills';

export interface Progress {
  index: number;
  drillId: DrillId;
  successes: number;
  needed: number;
  attempts: number;
  passed: boolean;   // this attempt matched the drill's success test
  done: boolean;     // all eight drills are finished
  message: string;   // Thai feedback for the HUD
}

export interface Tutorial {
  readonly drills: readonly Drill[];
  index: number;
  successes: number;
  attempts: number;
  done: boolean;
  readonly current: Drill;
  readonly target: Vec3 | null;
  recordAttempt(attempt: Attempt): Progress;
  skip(): Progress;
  replay(index: number): Progress;
}

class TutorialState implements Tutorial {
  readonly drills = DRILLS;
  index = 0;
  successes = 0;
  attempts = 0;
  done = false;

  get current(): Drill {
    return this.drills[Math.min(this.index, this.drills.length - 1)];
  }

  // The move drill marks a spot; every other drill has no walking target.
  get target(): Vec3 | null {
    if (this.done) return null;
    return this.current.target?.(this.successes) ?? null;
  }

  recordAttempt(attempt: Attempt): Progress {
    if (this.done) return this.progress(false, 'จบการฝึกแล้ว');
    const drill = this.current;
    this.attempts++;
    if (!drill.passes(attempt, this.successes)) return this.progress(false, 'ยังไม่ผ่าน ลองอีกครั้ง');

    this.successes++;
    if (this.successes < drill.successesNeeded) {
      return this.progress(true, `ดีมาก! ${this.successes}/${drill.successesNeeded}`);
    }
    if (this.index >= this.drills.length - 1) {
      this.done = true;
      return this.progress(true, 'เยี่ยม! ผ่านครบทั้ง 8 ท่า');
    }
    this.index++;
    this.successes = 0;
    this.attempts = 0;
    return this.progress(true, `ผ่านท่า ${drill.title}! ไปท่าต่อไป`);
  }

  skip(): Progress {
    if (this.done) return this.progress(false, 'จบการฝึกแล้ว');
    const drill = this.current;
    if (this.index >= this.drills.length - 1) {
      this.done = true;
      return this.progress(false, `ข้ามท่า ${drill.title} — จบการฝึก`);
    }
    this.index++;
    this.successes = 0;
    this.attempts = 0;
    return this.progress(false, `ข้ามท่า ${drill.title}`);
  }

  replay(index: number): Progress {
    const i = Math.max(0, Math.min(this.drills.length - 1, Math.floor(index)));
    this.index = i;
    this.successes = 0;
    this.attempts = 0;
    this.done = false;
    return this.progress(false, `เริ่มท่า ${this.current.title} ใหม่`);
  }

  private progress(passed: boolean, message: string): Progress {
    const drill = this.current;
    return {
      index: this.index,
      drillId: drill.id,
      successes: this.successes,
      needed: drill.successesNeeded,
      attempts: this.attempts,
      passed,
      done: this.done,
      message,
    };
  }
}

export function createTutorial(): Tutorial {
  return new TutorialState();
}
