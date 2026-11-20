// Tutorial mode: runs the eight drills in src/tutorial/ with the same renderer, input, sim and
// HUD message line as a match. The drill state machine is pure; this file only drives it.
import { createInput } from '../input';
import { createRenderer } from '../render';
import { predictLanding, stepShuttle } from '../physics';
import { FORMAT_3X15, createMatch } from '../rules';
import { chargeLevel, createPlayer, recoverBetweenPoints, stepPlayer, validateStats } from '../sim';
import { SERVE_MAX_CONTACT } from '../sim/tuning';
import { createHud, PRESETS, type Settings } from '../ui';
import type { Intent, MatchState, PlayerState, ServiceCourt, ShuttleState, Stats, Vec3, WorldView } from '../types';
import { aimServe, serveSpots, STEP } from './rally';
import { createTutorial, type Attempt, type Progress } from '../tutorial';

export interface TutorialSetup { stats: Stats; settings: Settings }

const START: Vec3 = { x: 0, y: 0, z: 3.5 };
const FEEDER: Vec3 = { x: 0, y: 0, z: -3.5 };
const REACH = 0.7; // m from a move target that counts as reached
const MOVE_TIME = 15; // s to reach one move target before the attempt fails
const ATTEMPT_TIME = 10; // s the dive drill waits for a dive + get-up
const RESET_TIME = 1.2; // s of feedback before the next attempt
const COMPLETE_TIME = 2.4; // s the "all eight done" message stays up
const ESCAPE_WINDOW = 900; // ms between the two Escape presses
const ESCAPE_DEBOUNCE = 250; // ms; one physical Escape can fire both keydown and unlock
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

// Edges only belong to the first fixed step of a frame, like match.ts.
const dropEdges = (i: Intent): Intent => ({
  ...i, release: null, basicSwing: null, jumpRelease: false, dive: false, netShot: false,
});

const heldShuttle = (p: PlayerState): ShuttleState => ({
  pos: { x: p.racketHead.x, y: Math.min(p.racketHead.y, SERVE_MAX_CONTACT), z: p.racketHead.z },
  vel: ZERO,
});

export function startTutorial(root: HTMLElement, setup: TutorialSetup, onAgain: () => void): void {
  const { settings } = setup;
  const assist = settings.hitAssist / 100;
  const humanStats = validateStats(setup.stats) === null ? setup.stats : PRESETS.balanced;

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0';
  root.appendChild(container);
  const renderer = createRenderer(container);
  const input = createInput(container.querySelector('canvas')!);
  const hud = createHud(root);
  const hudMatch: MatchState = createMatch(FORMAT_3X15, 'near');

  const tut = createTutorial();
  let near = createPlayer(humanStats, 'near', START);
  let far = createPlayer(PRESETS.balanced, 'far', FEEDER);
  let shuttle: ShuttleState = { pos: { ...FEEDER }, vel: ZERO };
  let target: Vec3 | null = null;
  let stage: 'move' | 'flight' | 'serve' | 'reset' | 'complete' = 'flight';
  let attemptRecorded = false;
  let timer = 0;
  let elapsed = 0;
  let feedback: string | null = null;
  let feedbackLeft = 0;
  let dived = false;
  let gotUp = false;
  let prevAction = near.action;
  let pendingBasic: 'forehand' | 'backhand' | null = null;
  let pendingBasicLeft = 0;
  let serveCourt: ServiceCourt = 'right';
  let paused = !input.isLocked();
  let human: Intent | null = null;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let done = false;
  let escapeCount = 0;
  let escapeAt = -Infinity;

  function startDrill(): void {
    const drill = tut.current;
    near = recoverBetweenPoints(near, START);
    far = recoverBetweenPoints(far, FEEDER);
    near = { ...near, staminaNow: 1, fatigue: 0 };
    far = { ...far, staminaNow: 1, fatigue: 0 };
    dived = false;
    gotUp = false;
    prevAction = near.action;
    pendingBasic = null;
    pendingBasicLeft = 0;
    attemptRecorded = false;
    elapsed = 0;
    feedback = null;
    feedbackLeft = 0;
    target = tut.target;

    if (drill.id === 'move') {
      stage = 'move';
      timer = MOVE_TIME;
      shuttle = { pos: { x: far.racketHead.x, y: far.racketHead.y, z: far.racketHead.z }, vel: ZERO };
    } else if (drill.id === 'serve') {
      const spots = serveSpots('near', 'right');
      near = recoverBetweenPoints(near, spots.server);
      far = recoverBetweenPoints(far, spots.receiver);
      serveCourt = 'right';
      stage = 'serve';
      timer = 0;
      shuttle = heldShuttle(near);
    } else {
      shuttle = drill.feed({ player: near }) ?? { pos: { x: 0, y: 0, z: -3 }, vel: ZERO };
      stage = 'flight';
      timer = 0;
    }
  }

  function finishAttempt(p: Progress): void {
    feedback = p.message;
    feedbackLeft = 1.4;
    if (p.done) {
      stage = 'complete';
      timer = COMPLETE_TIME;
      return;
    }
    stage = 'reset';
    timer = RESET_TIME;
  }

  // The move drill keeps the player where they are; only the marked spot changes.
  function finishMoveAttempt(p: Progress): void {
    feedback = p.message;
    feedbackLeft = 1;
    if (p.done) {
      stage = 'complete';
      timer = COMPLETE_TIME;
      return;
    }
    if (tut.current.id !== 'move') {
      stage = 'reset';
      timer = RESET_TIME;
      return;
    }
    target = tut.target;
    timer = MOVE_TIME;
  }

  function trackDive(): void {
    if (near.action === 'diving' || near.action === 'down') dived = true;
    if (dived && prevAction === 'down' && near.action !== 'down') gotUp = true;
    prevAction = near.action;
  }

  function tick(i: Intent): void {
    if (stage === 'complete') {
      timer -= STEP;
      if (timer <= 0) finish();
      return;
    }

    if (stage === 'reset') {
      timer -= STEP;
      // Let the shot fly while the feedback is shown; it is only visual at this point.
      if (tut.current.id !== 'move') shuttle = stepShuttle(shuttle, STEP).state;
      if (timer <= 0) {
        if (tut.done) {
          stage = 'complete';
          timer = COMPLETE_TIME;
        } else {
          startDrill();
        }
      }
      return;
    }

    if (i.basicSwing) {
      pendingBasic = i.basicSwing;
      pendingBasicLeft = 0.3;
    }
    pendingBasicLeft = Math.max(0, pendingBasicLeft - STEP);
    if (pendingBasicLeft === 0) pendingBasic = null;

    if (stage === 'move') {
      const out = stepPlayer(near, i, shuttle, STEP, assist);
      near = out.player;
      timer -= STEP;
      if (target && Math.hypot(near.pos.x - target.x, near.pos.z - target.z) <= REACH) {
        finishMoveAttempt(tut.recordAttempt({ reached: true }));
        return;
      }
      if (timer <= 0) {
        const p = tut.recordAttempt({ reached: false });
        feedback = p.message;
        feedbackLeft = 1;
        timer = MOVE_TIME;
      }
      return;
    }

    if (stage === 'serve') {
      const out = stepPlayer(near, aimServe(i, near), shuttle, STEP, assist);
      near = out.player;
      if (out.hit) {
        const landing = predictLanding(out.hit.launch);
        shuttle = out.hit.launch;
        const attempt: Attempt = { hit: out.hit, landing, court: serveCourt };
        attemptRecorded = true;
        finishAttempt(tut.recordAttempt(attempt));
        return;
      }
      shuttle = heldShuttle(near);
      return;
    }

    // flight: the feeder's shuttle is on its way, the player may hit it at any time.
    const out = stepPlayer(near, i, shuttle, STEP, assist);
    near = out.player;
    trackDive();
    if (out.hit && !attemptRecorded) {
      const landing = predictLanding(out.hit.launch);
      shuttle = out.hit.launch;
      if (tut.current.id !== 'dive') {
        attemptRecorded = true;
        finishAttempt(tut.recordAttempt({
          hit: out.hit,
          landing,
          airborne: near.pos.y > 0.05,
          basicSide: pendingBasic,
          court: serveCourt,
        }));
        return;
      }
    }

    const step = stepShuttle(shuttle, STEP);
    shuttle = step.state;
    if (tut.current.id === 'dive') {
      elapsed += STEP;
      if (dived && gotUp && !attemptRecorded) {
        attemptRecorded = true;
        finishAttempt(tut.recordAttempt({ dived, gotUp }));
        return;
      }
      if (elapsed > ATTEMPT_TIME && !attemptRecorded) {
        attemptRecorded = true;
        finishAttempt(tut.recordAttempt({ dived, gotUp }));
      }
      return;
    }

    // A missed feed (net or floor) ends the attempt; a hit was recorded above.
    if (step.event.kind !== 'none' && !attemptRecorded) {
      attemptRecorded = true;
      finishAttempt(tut.recordAttempt({ hit: null, landing: null }));
    }
  }

  function view(): WorldView {
    const charging = human?.charging ?? null;
    const gap = Math.hypot(
      shuttle.pos.x - near.racketHead.x,
      shuttle.pos.y - near.racketHead.y,
      shuttle.pos.z - near.racketHead.z,
    );
    const showTarget = !tut.done && tut.current.id === 'move';
    return {
      players: [near, far],
      shuttle,
      landing: showTarget ? target : settings.landingMarker && stage === 'flight' ? predictLanding(shuttle) : null,
      timingRing: settings.timingRing && charging ? Math.max(0, Math.min(1, 1 - gap / 1.5)) : null,
      charge: charging && human ? chargeLevel(near, human.chargeTime) : null,
    };
  }

  function instructionLine(): string {
    if (tut.done) return 'จบการฝึกแล้ว! ผ่านครบทั้ง 8 ท่า';
    const drill = tut.current;
    const hint = drill.hint?.(tut.successes);
    const extra = hint ? ` · ${hint}` : '';
    return `ท่าที่ ${tut.index + 1}/8 · ${drill.instruction}${extra} · ${tut.successes}/${drill.successesNeeded}`;
  }

  function skipDrill(): void {
    if (done) return;
    const p = tut.skip();
    feedback = p.message;
    feedbackLeft = 1.2;
    if (p.done) {
      stage = 'complete';
      timer = COMPLETE_TIME;
    } else {
      startDrill();
    }
  }

  function replayDrill(): void {
    if (done) return;
    const p = tut.replay(tut.index);
    feedback = p.message;
    feedbackLeft = 1.2;
    startDrill();
  }

  function finish(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    input.dispose();
    hud.dispose();
    renderer.dispose();
    container.remove();
    if (document.pointerLockElement) document.exitPointerLock();
    onAgain();
  }

  // Escape twice goes back. One physical Escape can also unlock the pointer, so debounce it.
  function onEscape(): void {
    const now = performance.now();
    if (now - escapeAt > ESCAPE_WINDOW) escapeCount = 0;
    if (now - escapeAt > ESCAPE_DEBOUNCE) escapeCount++;
    escapeAt = now;
    if (escapeCount >= 2) finish();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code === 'KeyN') {
      e.preventDefault();
      skipDrill();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      replayDrill();
    } else if (e.code === 'Escape') {
      onEscape();
    }
  }

  input.onLockChange((locked) => {
    paused = !locked;
    if (!locked) onEscape();
    else escapeCount = 0;
  });
  window.addEventListener('keydown', onKey);

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused) {
      acc = 0;
      human = null;
    } else {
      acc += dt;
    }
    const n = Math.floor(acc / STEP + 1e-9);
    acc -= n * STEP;
    if (n > 0) {
      input.setServing(tut.current.id === 'serve' && stage === 'serve');
      human = input.intent(n * STEP);
      for (let k = 0; k < n && !done; k++) tick(k === 0 ? human : dropEdges(human));
    }
    if (done) return;
    feedbackLeft = Math.max(0, feedbackLeft - dt);
    hud.update({
      match: hudMatch,
      stamina: near.staminaNow,
      charge: human?.charging ? chargeLevel(near, human.chargeTime) : null,
      message: paused
        ? 'คลิกเพื่อเล่นต่อ (Click to play)'
        : feedbackLeft > 0 && feedback
          ? feedback
          : instructionLine(),
    });
    renderer.render(view(), dt);
  }

  startDrill();
  raf = requestAnimationFrame(frame);
}
