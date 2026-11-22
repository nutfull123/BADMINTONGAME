// One WebSocket to the game server: hello handshake, typed send/receive, ping every 2 s (round-trip time and the
// server tick estimate), defensive parsing of everything the server sends.
import type { Stats } from '../types';
import { clockSample, clockSeed, createClock, serverTickAt } from './clock';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol';

// The server address, or null when online play is not configured (VITE_GAME_SERVER_URL missing).
export const gameServerUrl = (): string | null => import.meta.env.VITE_GAME_SERVER_URL?.trim() || null;

// The part of WebSocket we use, so tests can pass a fake.
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface Connection {
  send(msg: ClientMessage): boolean; // false when the socket is not open (the message is dropped)
  onMessage(cb: (msg: ServerMessage) => void): () => void; // returns the unsubscribe function
  onClose(cb: () => void): () => void;                    // fires when the socket drops, not after close()
  close(): void;
  reopen(): Promise<boolean>; // after a drop: a new socket with the same hello; true once the server welcomed it
  readonly userId: string | null;
  readonly resumeToken: string | null; // from the latest 'room' message, for 'rejoin'
  readonly rtt: number;                // smoothed round-trip time, ms
  serverTick(): number | null;         // estimated server tick right now
  seedTick(tick: number): void;        // rough start from a snapshot before the first pong
}

export interface ConnectOptions {
  makeSocket?: (url: string) => SocketLike;
  now?: () => number; // ms
  pingMs?: number;
  welcomeTimeoutMs?: number;
}

const OPEN = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

// null for anything that is not a well-formed server message (the server is trusted less than its own types say).
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'welcome': return typeof m.userId === 'string' ? (m as unknown as ServerMessage) : null;
    case 'room':
      return isObj(m.room) && typeof m.resumeToken === 'string' && (m.you === null || num(m.you)) && Array.isArray(m.room.seats)
        ? (m as unknown as ServerMessage) : null;
    case 'start': return num(m.tick) ? (m as unknown as ServerMessage) : null;
    case 'snap': {
      const s = m.snap;
      return isObj(s) && num(s.tick) && num(s.ackSeq) && typeof s.phase === 'string' && isObj(s.match) &&
        isObj(s.rally) && isObj(s.rally.players) && Array.isArray(s.rally.players.near) &&
        Array.isArray(s.rally.players.far) && isObj(s.rally.shuttle)
        ? (m as unknown as ServerMessage) : null;
    }
    case 'end':
      return (m.winner === 'near' || m.winner === 'far') && Array.isArray(m.games) ? (m as unknown as ServerMessage) : null;
    case 'error': return typeof m.code === 'string' && typeof m.message === 'string' ? (m as unknown as ServerMessage) : null;
    case 'pong': return num(m.at) && num(m.serverTick) ? (m as unknown as ServerMessage) : null;
    default: return null;
  }
}

// Resolves once the server has answered the hello with 'welcome'; rejects with the server's error code,
// 'closed' or 'timeout' otherwise.
export function connect(
  url: string, token: string, character: { name: string; stats: Stats }, opts: ConnectOptions = {},
): Promise<Connection> {
  const makeSocket = opts.makeSocket ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const now = opts.now ?? (() => performance.now());
  const pingMs = opts.pingMs ?? 2000;
  const welcomeTimeoutMs = opts.welcomeTimeoutMs ?? 10000;

  const msgCbs = new Set<(m: ServerMessage) => void>();
  const closeCbs = new Set<() => void>();
  let socket: SocketLike | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let clock = createClock();
  let userId: string | null = null;
  let resumeToken: string | null = null;
  let warned = false;
  let closedByUs = false;

  const stopPing = () => { if (pingTimer !== null) clearInterval(pingTimer); pingTimer = null; };
  const send = (msg: ClientMessage): boolean => {
    if (!socket || socket.readyState !== OPEN) return false;
    try { socket.send(JSON.stringify(msg)); return true; } catch { return false; }
  };
  const ping = () => { send({ t: 'ping', at: now() }); };

  function open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const s = makeSocket(url);
      socket = s;
      let settled = false;
      let welcomed = false;
      const settle = (err: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve();
      };
      const timer = setTimeout(() => { settle(new Error('timeout')); s.close(); }, welcomeTimeoutMs);
      s.onopen = () => {
        s.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token, character } satisfies ClientMessage));
      };
      s.onmessage = (ev) => {
        const msg = parseServerMessage(ev.data);
        if (!msg) {
          if (!warned) { warned = true; console.warn('[net] dropped a malformed message from the server'); }
          return;
        }
        if (msg.t === 'welcome') {
          userId = msg.userId;
          welcomed = true;
          stopPing();
          ping();
          pingTimer = setInterval(ping, pingMs);
          settle(null);
        } else if (msg.t === 'error' && !welcomed) {
          settle(new Error(msg.code));
        } else if (msg.t === 'room') {
          resumeToken = msg.resumeToken;
        } else if (msg.t === 'pong') {
          clock = clockSample(clock, msg.at, msg.serverTick, now());
        }
        msgCbs.forEach((cb) => cb(msg));
      };
      s.onerror = () => {}; // a close always follows
      s.onclose = () => {
        if (socket !== s) return; // an old socket we replaced
        stopPing();
        settle(new Error('closed'));
        if (welcomed && !closedByUs) closeCbs.forEach((cb) => cb());
      };
    });
  }

  const conn: Connection = {
    send,
    onMessage: (cb) => { msgCbs.add(cb); return () => { msgCbs.delete(cb); }; },
    onClose: (cb) => { closeCbs.add(cb); return () => { closeCbs.delete(cb); }; },
    close() {
      closedByUs = true;
      stopPing();
      const s = socket;
      socket = null;
      if (s) { s.onclose = null; s.close(); }
    },
    async reopen() {
      if (closedByUs) return false;
      stopPing();
      const old = socket;
      if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch { /* already gone */ } }
      try { await open(); return true; } catch { return false; }
    },
    get userId() { return userId; },
    get resumeToken() { return resumeToken; },
    get rtt() { return clock.rtt; },
    serverTick: () => serverTickAt(clock, now()),
    seedTick: (tick) => { clock = clockSeed(clock, tick, now()); },
  };
  return open().then(() => conn, (e: unknown) => { conn.close(); throw e; });
}
