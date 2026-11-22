// One authoritative match: the same startRally / stepRally / botIntent offline play uses, at a fixed 120 Hz step
// driven by an accumulator, with humans' input frames, lag compensation and 30 Hz snapshots on top.
// No ws, no timers: the caller calls update(nowMs), so tests run it with a fake clock.
import { STEP, aimServe, botContext, startRally, stepRally, type Rally, type ShuttleView } from '../src/game/rally';
import { REWIND_MAX_TICKS, SNAPSHOT_HZ, TICK_HZ, type InputFrame, type RoomSettings, type SeatIndex, type ServerMessage, type Snapshot } from '../src/net/protocol';
import { FORMAT_3X15, FORMAT_3X21, awardRally, createMatch } from '../src/rules';
import { createPlayer, type SimPlayer } from '../src/sim';
import { applyAssist } from '../src/sim/assist';
import { botIntent, createBot, type Bot } from '../src/sim/bot';
import type { Intent, MatchState, PlayerState, ShuttleState, Side, Slot, Stats } from '../src/types';

const START_DELAY = 3; // s before the first serve, so every client has loaded
const POINT_PAUSE = 1.5; // s between points (as offline)
const BREAK_PAUSE = 3; // s for an interval or the end of a game (as offline)
const MAX_FRAME_BACKLOG = 128; // queued input frames per player; the oldest go first
const MAX_CATCH_UP = 0.25; // s of real time simulated in one update at most (a stalled process does not spiral)
const SNAPSHOT_EVERY = Math.round(TICK_HZ / SNAPSHOT_HZ);

export const seatSide = (seat: number): Side => (seat % 2 === 0 ? 'near' : 'far');
export const seatSlot = (seat: number): Slot => (seat >> 1) as Slot;

const idleIntent = (): Intent => ({
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
});
// Edges (one-tick events) are used once; later ticks of the same frame only hold the state.
const dropEdges = (i: Intent): Intent => ({ ...i, release: null, basicSwing: null, jumpRelease: false, dive: false, netShot: false });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Human {
  send: (m: ServerMessage) => void;
  queue: InputFrame[];
  current: Intent;     // the newest applied frame's intent
  lastSeq: number;     // newest seq received (older or repeated ones are dropped)
  ackSeq: number;      // newest seq applied, -1 before the first
  frameTick: number;   // the tick the newest applied frame says the player was looking at
}

// The shuttle at the start of each of the last few ticks, so a swing can be judged against what the player saw.
export class ShuttleHistory {
  private entries: { tick: number; shuttle: ShuttleState }[] = [];
  push(tick: number, shuttle: ShuttleState) {
    this.entries.push({ tick, shuttle });
    if (this.entries.length > REWIND_MAX_TICKS + 1) this.entries.shift();
  }
  clear() { this.entries = []; }
  // The shuttle `lag` ticks before `now`; the lag is clamped to the window and to what is recorded. Null when it is 0.
  view(now: number, lag: number): ShuttleView | null {
    const want = now - clamp(Math.floor(lag), 0, REWIND_MAX_TICKS);
    const e = this.entries.find((x) => x.tick >= want && x.tick < now);
    return e ? { shuttle: e.shuttle, ticks: now - e.tick } : null;
  }
}

export interface MatchLoopOptions {
  settings: RoomSettings;
  stats: Stats[];      // as played, by seat: 2 for singles, 4 for doubles
  rng?: () => number;  // bots' randomness
  onEnd?: (winner: Side, games: { near: number; far: number }[]) => void;
}

export class MatchLoop {
  readonly doubles: boolean;
  match: MatchState;
  rally: Rally;
  tick = 0;                 // ticks simulated so far
  phase: 'between' | 'play' | 'finished' = 'between';
  readonly history = new ShuttleHistory();
  private timer = START_DELAY;
  private breakPause = false;
  private bots: (Bot | null)[];
  private humans: (Human | null)[];
  private memory: ({ lastSeq: number; ackSeq: number } | undefined)[] = [];
  private acc = 0;
  private last: number | null = null;
  private readonly assist: number;

  constructor(private readonly o: MatchLoopOptions) {
    const seats = o.stats.length;
    this.doubles = seats === 4;
    this.assist = o.settings.assists.hitAssist / 100;
    this.humans = Array.from({ length: seats }, () => null);
    this.bots = Array.from({ length: seats }, () => null);
    this.match = createMatch(o.settings.format === '3x21' ? FORMAT_3X21 : FORMAT_3X15, 'near', this.doubles);
    const team = (side: Side): PlayerState[] => {
      const players: PlayerState[] = [];
      for (let seat = 0; seat < seats; seat++) {
        if (seatSide(seat) === side) players[seatSlot(seat)] = createPlayer(o.stats[seat], side, { x: 0, y: 0, z: side === 'near' ? 3.5 : -3.5 }, seatSlot(seat));
      }
      return players;
    };
    this.rally = startRally(this.match, { near: team('near'), far: team('far') });
    this.freshBots();
  }

  // A human takes the seat (at the start or when they rejoin); until then a bot plays it. A rejoining client keeps
  // counting its seq, so the seat remembers the last seq seen and applied.
  attach(seat: SeatIndex, send: (m: ServerMessage) => void) {
    const kept = this.memory[seat];
    this.humans[seat] = { send, queue: [], current: idleIntent(), lastSeq: kept?.lastSeq ?? -1, ackSeq: kept?.ackSeq ?? -1, frameTick: 0 };
  }
  detach(seat: SeatIndex) {
    const h = this.humans[seat];
    if (h) this.memory[seat] = { lastSeq: h.lastSeq, ackSeq: h.ackSeq };
    this.humans[seat] = null;
  }

  // Frames only count while the ball is in play (serve or rally); between points they are dropped, not acknowledged.
  input(seat: SeatIndex, frames: InputFrame[]) {
    const h = this.humans[seat];
    if (!h) return;
    for (const f of frames) {
      if (f.seq <= h.lastSeq) continue;
      h.lastSeq = f.seq;
      if (this.phase === 'play') h.queue.push(f);
    }
    if (h.queue.length > MAX_FRAME_BACKLOG) h.queue.splice(0, h.queue.length - MAX_FRAME_BACKLOG);
  }

  // Advance by the real time since the last call (fixed steps; the remainder waits in the accumulator).
  update(nowMs: number) {
    if (this.last === null) { this.last = nowMs; return; }
    this.acc += Math.min(MAX_CATCH_UP, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    const n = Math.floor(this.acc / STEP + 1e-9);
    this.acc -= n * STEP;
    for (let k = 0; k < n && this.phase !== 'finished'; k++) this.step();
  }

  step() {
    if (this.phase === 'finished') return;
    if (this.phase === 'between') {
      this.timer -= STEP;
      if (this.timer <= 0) {
        if (this.match.winner) return this.finish();
        this.rally = startRally(this.match, this.rally.players);
        this.freshBots();
        this.history.clear();
        for (const h of this.humans) if (h) { h.queue = []; h.current = idleIntent(); }
        this.phase = 'play';
      }
    } else {
      this.play();
    }
    this.tick++;
    if (this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
  }

  private play() {
    const r = this.rally;
    const intents: Record<Side, Intent[]> = { near: [], far: [] };
    const views = new Map<string, ShuttleView>();
    for (let seat = 0; seat < this.humans.length; seat++) {
      const side = seatSide(seat), slot = seatSlot(seat);
      const p = r.players[side][slot];
      const h = this.humans[seat];
      if (h) {
        const raw = this.nextIntent(h);
        const serving = r.stage === 'serve' && r.server === side && r.serverSlot === slot;
        const view = serving ? null : this.lagView(h, p, raw);
        if (view) views.set(`${side}${slot}`, view);
        intents[side][slot] = serving ? aimServe(raw, p) : applyAssist(raw, p, view?.shuttle ?? r.shuttle, this.o.settings.assists.mode);
      } else {
        const bot = (this.bots[seat] ??= createBot('medium', this.o.rng));
        intents[side][slot] = botIntent(bot, p, botContext(r, side, slot), r.shuttle, STEP);
      }
    }
    this.history.push(this.tick, r.shuttle);
    stepRally(r, intents, STEP, this.assist, (side, slot) => views.get(`${side}${slot}`) ?? null);
    if (r.result) this.endRally(r.result.winner);
  }

  private nextIntent(h: Human): Intent {
    const f = h.queue.shift();
    if (!f) return dropEdges(h.current);
    h.current = f.intent;
    h.ackSeq = f.seq;
    h.frameTick = f.tick;
    return f.intent;
  }

  // Only a swing is judged against the past: its racket contact must match what the player saw at the frame's tick.
  private lagView(h: Human, p: PlayerState, raw: Intent): ShuttleView | null {
    const swinging = (p as SimPlayer).swing != null || raw.release !== null || raw.basicSwing !== null || raw.netShot;
    return swinging ? this.history.view(this.tick, this.tick - h.frameTick) : null;
  }

  private endRally(winner: Side) {
    const games = this.match.completedGames.length;
    this.match = awardRally(this.match, winner);
    const gameOver = this.match.completedGames.length > games;
    this.breakPause = this.match.winner !== null || gameOver || this.match.intervalNow;
    this.timer = this.breakPause ? BREAK_PAUSE : POINT_PAUSE;
    this.phase = 'between';
  }

  private finish() {
    this.phase = 'finished';
    this.sendSnapshots();
    const games = (this.match.completedGames.length > 0 ? this.match.completedGames : [this.match.score])
      .map((g) => ({ near: g.near, far: g.far }));
    const winner = this.match.winner!;
    for (const h of this.humans) h?.send({ t: 'end', winner, games });
    this.o.onEnd?.(winner, games);
  }

  private freshBots() {
    this.bots = this.bots.map(() => null); // created on demand per seat (a seat whose human left gets a fresh bot)
  }

  private snapPhase(): Snapshot['phase'] {
    if (this.phase === 'finished') return 'finished';
    if (this.phase === 'between') return this.breakPause ? 'interval' : 'between';
    return this.rally.stage === 'serve' ? 'serve' : 'rally';
  }

  private sendSnapshots() {
    const base = { tick: this.tick, phase: this.snapPhase(), match: this.match, rally: this.rally };
    for (const h of this.humans) h?.send({ t: 'snap', snap: { ...base, ackSeq: h.ackSeq } });
  }
}
