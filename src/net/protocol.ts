// Phase 6 online rooms: the JSON messages between the browser and the game server over one WebSocket.
// Shared contract (owned by the lead) - pure types and constants only, no DOM and no Node imports,
// so both src/ (client) and server/ import it. The server treats every ClientMessage as untrusted.
import type { Rally } from '../game/rally';
import type { Intent, MatchEvent, MatchSettings, MatchState, Stats } from '../types';

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 120;     // server simulation rate, the same STEP as offline play (1/120 s)
export const SNAPSHOT_HZ = 30;  // snapshots sent to each client per second
export const MAX_INPUT_FRAMES = 16; // input frames per 'input' message
export const REWIND_MAX_TICKS = 14; // lag compensation looks back at most ~115 ms

// Seat = side + slot: 0 near/0, 1 far/0, 2 near/1, 3 far/1. Singles uses seats 0 and 1.
export type SeatIndex = 0 | 1 | 2 | 3;

export interface RoomSettings {
  event: MatchEvent;
  format: '3x15' | '3x21';
  assists: { mode: MatchSettings['mode']; hitAssist: number }; // the host's choice, the same for everyone
  points: 'real' | 'twenty';   // characters' own stats, or everyone at 20 points (host decides)
}

export interface RoomSeat {
  seat: SeatIndex;
  userId: string | null;       // null = a bot holds the seat
  name: string;
  stats: Stats;                // as played: already reduced to 20 points when settings.points is 'twenty'
  ready: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string;                // 6 characters, no look-alikes (0/O, 1/I)
  hostId: string;
  settings: RoomSettings;
  seats: RoomSeat[];           // 2 for singles events, 4 for doubles
  status: 'lobby' | 'playing' | 'finished';
}

// One frame of the player's input. `tick` is the server tick the client was showing when it made the input,
// so the server can judge a racket-shuttle contact against what the player saw (lag compensation).
export interface InputFrame { seq: number; tick: number; intent: Intent }

export interface Snapshot {
  tick: number;
  ackSeq: number;              // last input seq of THIS client the server has applied (for prediction replay)
  phase: 'serve' | 'rally' | 'between' | 'interval' | 'finished';
  match: MatchState;
  rally: Rally;
}

export type ClientMessage =
  | { t: 'hello'; v: number; token: string; character: { name: string; stats: Stats } } // token = Supabase access token
  | { t: 'create'; settings: RoomSettings }
  | { t: 'join'; code: string }
  | { t: 'rejoin'; code: string; resumeToken: string }
  | { t: 'seat'; seat: SeatIndex }
  | { t: 'settings'; settings: RoomSettings }            // host only, lobby only
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }                                        // host only, every human seated and ready
  | { t: 'input'; frames: InputFrame[] }
  | { t: 'leave' }
  | { t: 'ping'; at: number };

export type ServerErrorCode =
  | 'bad-version' | 'bad-token' | 'bad-message' | 'no-room' | 'room-full' | 'not-host'
  | 'not-ready' | 'bad-seat' | 'bad-settings' | 'rate-limit';

export type ServerMessage =
  | { t: 'welcome'; userId: string }
  | { t: 'room'; room: RoomView; you: SeatIndex | null; resumeToken: string }
  | { t: 'start'; tick: number }
  | { t: 'snap'; snap: Snapshot }
  | { t: 'end'; winner: 'near' | 'far'; games: { near: number; far: number }[] }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'pong'; at: number; serverTick: number };
