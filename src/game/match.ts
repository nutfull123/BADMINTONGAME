// Playable match: fixed-timestep loop, rally flow, scoring, pause. Wires input, bot, render and ui.
import { createInput } from '../input';
import { createRenderer } from '../render';
import { FORMAT_3X15, FORMAT_3X21, awardRally, createMatch } from '../rules';
import { chargeLevel, createPlayer, validateStats } from '../sim';
import { aimView, applyAssist } from '../sim/assist';
import { botIntent, createBot } from '../sim/bot';
import { ASSIST_GAME_SPEED } from '../sim/tuning';
import { createHud, createViewControls, PRESETS, showResult, type Settings } from '../ui';
import type { BodyType, Intent, MatchState, PlayerState, Stats, WorldView } from '../types';
import { predictLanding } from '../physics';
import { STEP, aimServe, startRally, stepRally, type Rally, type RallyReason } from './rally';

export interface MatchSetup { stats: Stats; settings: Settings }

const POINT_PAUSE = 1.5; // s between points
const BREAK_PAUSE = 3; // s for an interval or the end of a game
const NOTICE_TIME = 4; // s a start-up notice stays on screen
const WHO: Record<'near' | 'far', string> = { near: 'You', far: 'Bot' };
const WHY: Record<RallyReason, string> = {
  in: 'landed in', out: 'out', net: 'net', fault: 'double hit', 'serve-fault': 'bad serve',
};

const dropEdges = (i: Intent): Intent => ({ ...i, release: null, basicSwing: null, jumpRelease: false, dive: false, netShot: false });

export function startMatch(root: HTMLElement, setup: MatchSetup, onAgain: () => void, notice: string | null = null): void {
  const { settings } = setup;
  const assist = settings.hitAssist / 100;
  const speed = ASSIST_GAME_SPEED[settings.mode];
  const humanStats = validateStats(setup.stats) === null ? setup.stats : PRESETS.balanced;
  const bodies = Object.keys(PRESETS) as BodyType[];
  const botStats = PRESETS[bodies[Math.floor(Math.random() * bodies.length)]];

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0';
  root.appendChild(container);
  const renderer = createRenderer(container);
  const input = createInput(container.querySelector('canvas')!);
  const hud = createHud(root);
  const viewControls = createViewControls(root, (z) => (renderer as { setZoom?: (z: number) => void }).setZoom?.(z)); // render adds setZoom in a parallel task

  let match: MatchState = createMatch(settings.format === '3x21' ? FORMAT_3X21 : FORMAT_3X15, 'near');
  let rally: Rally = startRally(
    match, createPlayer(humanStats, 'near', { x: 0, y: 0, z: 3.5 }), createPlayer(botStats, 'far', { x: 0, y: 0, z: -3.5 }),
  );
  let bot = createBot(settings.botLevel); // fresh per rally: it remembers the last shuttle direction
  let phase: 'play' | 'between' = 'play';
  let timer = 0;
  let message: string | null = null;
  let noticeLeft = notice ? NOTICE_TIME : 0;
  let paused = !input.isLocked();
  let human: Intent | null = null;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let done = false;

  input.onLockChange((locked) => { paused = !locked; });

  function endRally(winner: 'near' | 'far', reason: RallyReason) {
    const games = match.completedGames.length;
    match = awardRally(match, winner);
    const gameOver = match.completedGames.length > games;
    message = `${WHO[winner]} ${winner === 'near' ? 'win' : 'wins'} the point (${WHY[reason]})`;
    if (match.winner) message = match.winner === 'near' ? 'You win the match!' : 'Bot wins the match';
    else if (gameOver) message = `Game to ${WHO[winner]}`;
    else if (match.intervalNow) message = 'Interval';
    phase = 'between';
    timer = match.winner || gameOver || match.intervalNow ? BREAK_PAUSE : POINT_PAUSE;
  }

  function finish() {
    done = true;
    cancelAnimationFrame(raf);
    input.dispose();
    hud.dispose();
    viewControls.dispose();
    renderer.dispose();
    container.remove();
    if (document.pointerLockElement) document.exitPointerLock();
    showResult(root, match, onAgain);
  }

  function tick(i: Intent) {
    if (phase === 'between') {
      timer -= STEP;
      if (timer > 0) return;
      if (match.winner) return finish();
      rally = startRally(match, rally.near, rally.far);
      bot = createBot(settings.botLevel);
      phase = 'play';
      return;
    }
    const serving = rally.stage === 'serve' && rally.server === 'far';
    stepRally(rally, {
      near: rally.stage === 'serve' && rally.server === 'near'
        ? aimServe(i, rally.near) : applyAssist(i, rally.near, rally.shuttle, settings.mode),
      far: botIntent(bot, rally.far, rally.near, rally.shuttle, STEP, serving),
    }, STEP, assist);
    if (rally.result) endRally(rally.result.winner, rally.result.reason);
  }

  function view(): WorldView {
    const me: PlayerState = rally.near;
    const charging = human?.charging ?? null;
    const gap = Math.hypot(
      rally.shuttle.pos.x - me.racketHead.x, rally.shuttle.pos.y - me.racketHead.y, rally.shuttle.pos.z - me.racketHead.z,
    );
    return {
      players: [rally.near, rally.far],
      shuttle: rally.shuttle,
      landing: settings.landingMarker && rally.stage !== 'serve' ? predictLanding(rally.shuttle) : null,
      timingRing: settings.timingRing && charging ? Math.max(0, Math.min(1, 1 - gap / 1.5)) : null,
      charge: charging && human ? chargeLevel(me, human.chargeTime) : null,
      aim: aimView(me, rally.shuttle, assist),
    };
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused) acc = 0; else acc += dt * speed;
    const n = Math.floor(acc / STEP + 1e-9);
    acc -= n * STEP;
    if (n > 0) {
      input.setServing(phase === 'between' ? match.server === 'near' : rally.stage === 'serve' && rally.server === 'near');
      // one input read per frame: edges go to the first tick only, the flick velocity spans all of them
      human = input.intent((n * STEP) / speed); // flick speed is per real second
      for (let k = 0; k < n && !done; k++) tick(k === 0 ? human : dropEdges(human));
    }
    if (done) return;
    noticeLeft = Math.max(0, noticeLeft - dt);
    hud.update({
      match: { ...match, intervalNow: phase === 'between' && match.intervalNow },
      stamina: rally.near.staminaNow,
      charge: human?.charging ? chargeLevel(rally.near, human.chargeTime) : null,
      message: paused ? 'Click to play' : phase === 'between' ? message : noticeLeft > 0 ? notice : null,
    });
    renderer.render(view(), dt);
  }

  raf = requestAnimationFrame(frame);
}
