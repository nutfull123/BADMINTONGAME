// The game server process: GET /healthz and a websocket per player. All game logic lives in rooms.ts and match.ts.
// Env: PORT (8080), ALLOWED_ORIGINS (comma list; empty = localhost only), SUPABASE_URL, SUPABASE_ANON_KEY.
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ServerErrorCode, type ServerMessage } from '../src/net/protocol';
import { verifyToken, type TokenVerifier } from './auth';
import { parseClientMessage } from './protocol';
import { Rooms, type Session } from './rooms';

const RATE_PER_SECOND = 120;
const HELLO_TIMEOUT_MS = 5000;
const PING_MS = 20_000;
const LOOP_MS = 4; // how often the match loops are asked to catch up (they run fixed 120 Hz steps)
const MAX_PAYLOAD = 64 * 1024;

// Browsers always send Origin on a websocket. Not in the list (or missing) = refused; unset list = localhost only.
export function originAllowed(origin: string | undefined, allowed: string | undefined): boolean {
  if (!origin) return false;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\/+$/, '');
  const list = (allowed ?? '').split(',').map(norm).filter(Boolean);
  if (list.length > 0) return list.includes(norm(origin));
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

const text = (d: RawData): string => (Array.isArray(d) ? Buffer.concat(d) : Buffer.from(d as Buffer)).toString('utf8');

export interface GameServerOptions {
  allowedOrigins?: string;
  verify?: TokenVerifier;
  rooms?: Rooms;
  ratePerSecond?: number;
  helloTimeoutMs?: number;
  pingMs?: number;
}

export interface GameServer {
  server: Server;
  rooms: Rooms;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(o: GameServerOptions = {}): GameServer {
  const rooms = o.rooms ?? new Rooms();
  const verify = o.verify ?? verifyToken;
  const limit = o.ratePerSecond ?? RATE_PER_SECOND;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    } else {
      res.writeHead(404).end();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (!originAllowed(req.headers.origin, o.allowedOrigins ?? process.env.ALLOWED_ORIGINS)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    let session: Session | null = null;
    let alive = true;
    let windowStart = Date.now(), count = 0;
    const send = (m: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    const fail = (code: ServerErrorCode, message: string, close = true) => {
      send({ t: 'error', code, message });
      if (close) ws.close(1008, code);
    };
    const helloTimer = setTimeout(() => { if (!session) ws.close(1008, 'hello timeout'); }, o.helloTimeoutMs ?? HELLO_TIMEOUT_MS);
    const pinger = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, o.pingMs ?? PING_MS);
    ws.on('pong', () => { alive = true; });

    // Messages are handled one after the other, so the (slow) token check cannot be overtaken by the next message.
    let chain: Promise<void> = Promise.resolve();
    const handle = async (raw: string) => {
      const msg = parseClientMessage(raw);
      if (!msg) return fail('bad-message', 'Invalid message', !session);
      if (!session) {
        if (msg.t !== 'hello') return fail('bad-message', 'Say hello first');
        if (msg.v !== PROTOCOL_VERSION) return fail('bad-version', `Protocol version ${PROTOCOL_VERSION} is required`);
        const who = await verify(msg.token);
        if (!who) return fail('bad-token', 'Sign in again');
        if (ws.readyState !== ws.OPEN) return;
        clearTimeout(helloTimer);
        session = { userId: who.userId, name: msg.character.name, stats: msg.character.stats, send };
        send({ t: 'welcome', userId: who.userId });
        return;
      }
      if (msg.t === 'hello') return fail('bad-message', 'Already signed in', false);
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at, serverTick: rooms.roomOf(session.userId)?.loop?.tick ?? 0 });
      rooms.handle(session, msg);
    };

    ws.on('message', (data, isBinary) => {
      if (ws.readyState !== ws.OPEN) return; // already being closed (e.g. after the rate-limit error)
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      if (++count > limit) return fail('rate-limit', 'Too many messages');
      if (isBinary) return fail('bad-message', 'Text frames only');
      const raw = text(data);
      chain = chain.then(() => handle(raw)).catch((e) => { console.error('message failed', e); fail('bad-message', 'Server error'); });
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      clearInterval(pinger);
      chain = chain.then(() => { if (session) rooms.disconnect(session); });
    });
    ws.on('error', () => ws.terminate());
  });

  const loop = setInterval(() => rooms.update(performance.now()), LOOP_MS);

  return {
    server, rooms,
    listen: (port, host = '0.0.0.0') => new Promise((resolve) => {
      server.listen(port, host, () => resolve((server.address() as { port: number }).port));
    }),
    close: () => new Promise((resolve) => {
      clearInterval(loop);
      rooms.closeAll();
      for (const ws of wss.clients) ws.close(1012, 'server restarting'); // 1012 = service restart: the client reconnects
      wss.close();
      server.close(() => resolve());
      server.closeIdleConnections();
      setTimeout(() => { for (const ws of wss.clients) ws.terminate(); server.closeAllConnections(); }, 2000).unref();
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const game = createGameServer();
  game.listen(Number(process.env.PORT) || 8080).then((port) => console.log(`game server listening on ${port}`));
  process.once('SIGTERM', () => { game.close().then(() => process.exit(0)); });
}
