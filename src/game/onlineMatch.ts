// Online twin of startMatch: the server runs the match, this draws it. The player's own movement is predicted,
// everything else is interpolated a little in the past, a far-side seat sees the court mirrored so it always
// plays from the near end. No slow motion online.
import { createInput } from '../input';
import { predictLanding } from '../physics';
import { createRenderer } from '../render';
import { FORMAT_3X15, FORMAT_3X21, createMatch, serverSlot } from '../rules';
import { chargeLevel } from '../sim';
import { aimView, racketFromAim } from '../sim/assist';
import { createHud, createViewControls } from '../ui';
import type { Connection } from '../net/connection';
import { interpDelayTicks, createSnapBuffer, pushSnapshot, sample, type Sampled } from '../net/interpolation';
import { isMirrored, mirrorIntent, mirrorMatch, mirrorPlayer, mirrorShuttle, seatSide, seatSlot } from '../net/mirror';
import { createPredictor, decayError, drawnPlayer, predict, reconcile, STEP, type PredCtx } from '../net/prediction';
import {
  MAX_INPUT_FRAMES, type InputFrame, type RoomView, type SeatIndex, type ServerMessage, type Snapshot,
} from '../net/protocol';
import type { GameSettings, Intent, MatchState, PlayerState, Side, WorldView } from '../types';

const RECONNECT_WINDOW_MS = 30_000; // how long a dropped player's seat is held (server side too)
const RETRY_MS = 1500;
const SEND_EVERY_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 24;     // after a long stall do not run a burst of ticks

const dropEdges = (i: Intent): Intent => ({ ...i, release: null, basicSwing: null, jumpRelease: false, dive: false, netShot: false });

// ---------- pure helpers (tested) ----------

// Input frames in messages of at most `max` frames, oldest first.
export function batchFrames(frames: InputFrame[], max: number = MAX_INPUT_FRAMES): InputFrame[][] {
  const out: InputFrame[][] = [];
  for (let i = 0; i < frames.length; i += max) out.push(frames.slice(i, i + max));
  return out;
}

export interface ViewArgs {
  seat: SeatIndex;
  world: Pick<Sampled, 'players' | 'shuttle'>; // others and the shuttle as drawn, in server (world) axes
  mine: PlayerState;                           // the seat's own player (predicted), world axes
  human: Intent | null;                        // this frame's input, for the charge meter
  stage: Snapshot['rally']['stage'];
  hitAssist: number;                           // 0..1
  landingMarker: boolean;
  timingRing: boolean;
  racketAid: boolean;
}

// The WorldView for this seat. A far seat gets everything turned 180 degrees and the sides swapped, so the
// renderer sees the viewer as the near player; `players` is listed near side first and `human` points at the viewer.
export function buildOnlineView(a: ViewArgs): WorldView {
  const mirrored = isMirrored(a.seat);
  const side = seatSide(a.seat);
  const slot = seatSlot(a.seat);
  const all: { p: PlayerState; me: boolean }[] = (['near', 'far'] as const).flatMap((s) =>
    a.world.players[s].map((p, i) => ({ p: s === side && i === slot ? a.mine : p, me: s === side && i === slot })));
  const seen = all.map(({ p, me }) => ({ p: mirrored ? mirrorPlayer(p) : p, me }));
  seen.sort((x, y) => (x.p.side === y.p.side ? 0 : x.p.side === 'near' ? -1 : 1)); // stable: slots stay in order
  const human = seen.findIndex((s) => s.me);
  const me = seen[human].p;
  const shuttle = mirrored ? mirrorShuttle(a.world.shuttle) : a.world.shuttle;
  const charging = a.human?.charging ?? null;
  const gap = Math.hypot(shuttle.pos.x - me.racketHead.x, shuttle.pos.y - me.racketHead.y, shuttle.pos.z - me.racketHead.z);
  return {
    players: seen.map((s) => s.p),
    human,
    shuttle,
    landing: a.landingMarker && a.stage !== 'serve' ? predictLanding(shuttle) : null,
    timingRing: a.timingRing && charging ? Math.max(0, Math.min(1, 1 - gap / 1.5)) : null,
    charge: charging && a.human ? chargeLevel(me, a.human.chargeTime) : null,
    aim: a.racketAid ? aimView(me, shuttle, a.hitAssist) : undefined,
  };
}

// The scoreboard as this seat sees it (the viewer is "near").
export function hudMatch(match: MatchState, phase: Snapshot['phase'], seat: SeatIndex): MatchState {
  const m = isMirrored(seat) ? mirrorMatch(match) : match;
  return { ...m, intervalNow: (phase === 'between' || phase === 'interval') && m.intervalNow };
}

// ---------- the match ----------

// Runs until the server sends 'end' (onEnd gets the winner and the game scores), or the connection is lost for
// longer than 30 s (onEnd gets null). Returns a function that stops everything early; it does not close `conn`.
export function startOnlineMatch(
  root: HTMLElement, conn: Connection, room: RoomView, you: SeatIndex, prefs: GameSettings,
  onEnd: (winner: Side | null, games: { near: number; far: number }[]) => void,
): () => void {
  const mySide = seatSide(you);
  const mySlot = seatSlot(you);
  const mirrored = isMirrored(you);
  const mode = room.settings.assists.mode;
  const hitAssist = room.settings.assists.hitAssist / 100;

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0';
  root.appendChild(container);
  const renderer = createRenderer(container);
  renderer.setCamera(prefs.camera);
  renderer.setQuality(prefs.graphics.quality);
  const input = createInput(container.querySelector('canvas')!, prefs.controls, prefs.camera.preset);
  const look = input.look;
  let prevAim = { x: 0, y: 0 };
  const hud = createHud(root);
  const viewControls = createViewControls(root, (z) => renderer.setZoom(z));

  const buf = createSnapBuffer();
  const pr = createPredictor();
  let last: Snapshot | null = null;
  let human: Intent | null = null;
  let pending: InputFrame[] = [];
  let lastSend = 0;
  let acc = 0;
  let lastFrame = performance.now();
  let raf = 0;
  let done = false;
  let roomRef = room;
  let dropAt: number | null = null; // when the connection dropped
  let rejoining = false;            // reopened and 'rejoin' sent, waiting for the server to answer
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const live = () => last !== null && (last.phase === 'serve' || last.phase === 'rally');
  const reconnecting = () => dropAt !== null || rejoining;
  const renderTick = (): number | null => {
    const t = conn.serverTick();
    return t === null ? null : t - interpDelayTicks(conn.rtt);
  };
  const ctxFor = (shuttle: PredCtx['shuttle']): PredCtx => ({ shuttle, rally: last!.rally, mode, hitAssist });

  function dispose() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (retryTimer !== null) clearTimeout(retryTimer);
    offMsg();
    offClose();
    input.dispose();
    hud.dispose();
    viewControls.dispose();
    renderer.dispose();
    container.remove();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  const finish = (winner: Side | null, games: { near: number; far: number }[]) => {
    if (done) return;
    dispose();
    onEnd(winner, games);
  };

  function onSnap(snap: Snapshot) {
    conn.seedTick(snap.tick);
    pushSnapshot(buf, snap);
    last = snap;
    rejoining = false;
    const mine = snap.rally.players[mySide][mySlot];
    if (!mine) return;
    const t = renderTick();
    const smp = t === null ? null : sample(buf, t);
    reconcile(pr, mine, snap.ackSeq, ctxFor(smp?.shuttle ?? snap.rally.shuttle), snap.phase === 'serve' || snap.phase === 'rally');
  }

  const offMsg = conn.onMessage((m: ServerMessage) => {
    if (done) return;
    if (m.t === 'snap') onSnap(m.snap);
    else if (m.t === 'room') { roomRef = m.room; rejoining = false; }
    else if (m.t === 'end') finish(m.winner, m.games);
    else if (m.t === 'error' && rejoining) finish(null, []); // the server no longer knows this seat
  });

  function tryRejoin() {
    retryTimer = null;
    if (done || dropAt === null) return;
    if (performance.now() - dropAt > RECONNECT_WINDOW_MS) return finish(null, []);
    void conn.reopen().then((ok) => {
      if (done) return;
      const token = conn.resumeToken;
      if (ok && token && conn.send({ t: 'rejoin', code: roomRef.code, resumeToken: token })) {
        dropAt = null;
        rejoining = true;
        pr.player = null; // the next snapshot restarts the prediction
        pr.pending = [];
        pending = [];
        return;
      }
      retryTimer = setTimeout(tryRejoin, RETRY_MS);
    });
  }
  const offClose = conn.onClose(() => {
    if (done) return;
    dropAt = performance.now();
    rejoining = false;
    pending = [];
    tryRejoin();
  });

  const humanServes = () =>
    last !== null && (last.phase === 'between' || last.phase === 'interval' || last.phase === 'finished'
      ? last.match.server === mySide && serverSlot(last.match) === mySlot
      : last.rally.stage === 'serve' && last.rally.server === mySide && last.rally.serverSlot === mySlot);

  function flush(now: number) {
    if (pending.length === 0 || (now - lastSend < SEND_EVERY_MS && pending.length < MAX_INPUT_FRAMES)) return;
    lastSend = now;
    for (const frames of batchFrames(pending)) conn.send({ t: 'input', frames });
    pending = [];
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = renderTick();
    const smp = t === null ? null : sample(buf, t);
    const paused = !input.isLocked();

    acc += dt;
    let n = Math.floor(acc / STEP + 1e-9);
    acc -= n * STEP;
    if (n > MAX_TICKS_PER_FRAME) { n = MAX_TICKS_PER_FRAME; acc = 0; }
    if (n > 0 && last) {
      input.setServing(humanServes());
      const realDt = n * STEP;
      human = input.intent(realDt);
      if (look && pr.player) { // crosshair aims the racket; its change per second is the flick
        const ray = renderer.aimRay();
        const aim = racketFromAim(mirrored ? mirrorPlayer(pr.player) : pr.player, ray.origin, ray.dir);
        human.racket = aim;
        human.racketVel = { x: (aim.x - prevAim.x) / realDt, y: (aim.y - prevAim.y) / realDt };
        prevAim = aim;
      }
      if (live() && !reconnecting() && smp && t !== null) {
        const ctx = ctxFor(smp.shuttle);
        for (let k = 0; k < n; k++) {
          const raw = k === 0 ? human : dropEdges(human);
          const intent = mirrored ? mirrorIntent(raw) : raw; // the server only knows court axes
          const seq = predict(pr, intent, ctx);
          if (seq !== null) pending.push({ seq, tick: Math.floor(t), intent });
        }
      }
    }
    flush(now);
    decayError(pr, dt);

    if (!smp || !last) {
      hud.update({ match: hudMatchEmpty(), stamina: 1, charge: null, message: reconnecting() ? 'Reconnecting...' : 'Connecting...' });
      return;
    }
    const mine = (live() ? drawnPlayer(pr) : null) ?? smp.players[mySide][mySlot];
    if (!mine) return;
    const w = buildOnlineView({
      seat: you, world: smp, mine, human, stage: smp.snap.rally.stage, hitAssist,
      landingMarker: prefs.assists.landingMarker, timingRing: prefs.assists.timingRing, racketAid: prefs.assists.racketAid,
    });
    const me = w.players[w.human ?? 0];
    hud.update({
      crosshair: look && !paused && live() ? (w.aim?.onTarget ? 'target' : 'idle') : null,
      match: hudMatch(smp.snap.match, smp.snap.phase, you),
      stamina: me.staminaNow,
      charge: w.charge,
      message: reconnecting() ? 'Reconnecting...' : paused ? 'Click to play' : null,
    });
    if (look) renderer.setLook(look.yaw, look.pitch);
    renderer.render(w, dt);
  }

  // an empty scoreboard while waiting for the first snapshot
  const hudMatchEmpty = (): MatchState =>
    createMatch(roomRef.settings.format === '3x21' ? FORMAT_3X21 : FORMAT_3X15, 'near', roomRef.seats.length > 2);

  raf = requestAnimationFrame(frame);
  return dispose;
}
