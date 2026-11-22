import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ServerMessage } from '../src/net/protocol';
import type { Stats } from '../src/types';
import { createGameServer, originAllowed, type GameServer } from './index';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const hello = (token = 'good') => JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token, character: { name: 'Nok', stats } });
const settings = { event: 'MS', format: '3x15', assists: { mode: 'pro', hitAssist: 50 }, points: 'real' };
const verify = async (token: string) => (token.startsWith('good') ? { userId: token } : null);

describe('originAllowed', () => {
  it('unset or empty list: localhost only', () => {
    for (const list of [undefined, '', ' , ']) {
      expect(originAllowed('http://localhost:5173', list)).toBe(true);
      expect(originAllowed('http://127.0.0.1:4173', list)).toBe(true);
      expect(originAllowed('https://evil.example', list)).toBe(false);
      expect(originAllowed('https://localhost.evil.example', list)).toBe(false);
    }
  });
  it('a list allows exactly those origins', () => {
    const list = 'https://game.pages.dev, https://example.com/';
    expect(originAllowed('https://game.pages.dev', list)).toBe(true);
    expect(originAllowed('https://example.com', list)).toBe(true);
    expect(originAllowed('http://localhost:5173', list)).toBe(false);
    expect(originAllowed('https://evil.pages.dev', list)).toBe(false);
  });
  it('a missing or odd Origin is refused', () => {
    expect(originAllowed(undefined, undefined)).toBe(false);
    expect(originAllowed('null', undefined)).toBe(false);
    expect(originAllowed(undefined, 'https://game.pages.dev')).toBe(false);
  });
});

describe('game server', () => {
  let game: GameServer | null = null;
  afterEach(async () => { await game?.close(); game = null; });

  const start = async (o: Parameters<typeof createGameServer>[0] = {}) => {
    game = createGameServer({ verify, ...o });
    return await game.listen(0, '127.0.0.1');
  };
  // A websocket whose messages and close are recorded.
  const connect = (port: number, origin: string | null = 'http://localhost:5173') => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { headers: { Origin: origin } } : {});
    const msgs: ServerMessage[] = [];
    const closed = new Promise<number>((res) => ws.on('close', (code) => res(code)));
    const waiters: (() => void)[] = [];
    ws.on('message', (d) => { msgs.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
    const next = async (t: ServerMessage['t']) => {
      for (;;) {
        const i = msgs.findIndex((m) => m.t === t);
        if (i >= 0) return msgs.splice(i, 1)[0];
        await new Promise<void>((r) => waiters.push(r));
      }
    };
    const opened = new Promise<void>((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    return { ws, msgs, closed, next, opened };
  };

  it('answers /healthz and 404 elsewhere', async () => {
    const port = await start();
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
  });

  it('refuses a websocket from a foreign origin or without one', async () => {
    const port = await start();
    await expect(connect(port, 'https://evil.example').opened).rejects.toThrow(/403/);
    await expect(connect(port, null).opened).rejects.toThrow(/403/);
  });

  it('hello, create a room, ping/pong', async () => {
    const port = await start();
    const c = connect(port);
    await c.opened;
    c.ws.send(hello());
    expect(await c.next('welcome')).toEqual({ t: 'welcome', userId: 'good' });
    c.ws.send(JSON.stringify({ t: 'create', settings }));
    const room = (await c.next('room')) as Extract<ServerMessage, { t: 'room' }>;
    expect(room.room.code).toHaveLength(6);
    expect(room.you).toBe(0);
    c.ws.send(JSON.stringify({ t: 'ping', at: 42 }));
    expect(await c.next('pong')).toMatchObject({ t: 'pong', at: 42, serverTick: 0 });
    c.ws.close();
    await c.closed;
    await new Promise((r) => setTimeout(r, 50));
    expect(game!.rooms.size).toBe(0); // the lobby closed with its only player
  });

  it('the first message must be a valid hello with the right version and a good token', async () => {
    const port = await start();
    const cases: [string, string][] = [
      [JSON.stringify({ t: 'create', settings }), 'bad-message'],
      ['not json', 'bad-message'],
      [JSON.stringify({ t: 'hello', v: 99, token: 'good', character: { name: 'a', stats } }), 'bad-version'],
      [hello('bad'), 'bad-token'],
    ];
    for (const [raw, code] of cases) {
      const c = connect(port);
      await c.opened;
      c.ws.send(raw);
      expect(await c.next('error')).toMatchObject({ code });
      await c.closed;
    }
  });

  it('closes a connection that never says hello', async () => {
    const port = await start({ helloTimeoutMs: 100 });
    const c = connect(port);
    await c.opened;
    expect(await c.closed).toBe(1008);
  });

  it('rate limit: an error, then close', async () => {
    const port = await start({ ratePerSecond: 20 });
    const c = connect(port);
    await c.opened;
    c.ws.send(hello());
    await c.next('welcome');
    for (let i = 0; i < 60; i++) c.ws.send(JSON.stringify({ t: 'ping', at: i }));
    expect(await c.next('error')).toMatchObject({ code: 'rate-limit' });
    expect(await c.closed).toBe(1008);
  });

  it('a dropped player rejoins with the resume token on a new socket', async () => {
    const port = await start();
    const a = connect(port), b = connect(port);
    await Promise.all([a.opened, b.opened]);
    a.ws.send(hello('good-a'));
    b.ws.send(hello('good-b'));
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    a.ws.send(JSON.stringify({ t: 'create', settings }));
    const code = ((await a.next('room')) as Extract<ServerMessage, { t: 'room' }>).room.code;
    b.ws.send(JSON.stringify({ t: 'join', code }));
    const token = ((await b.next('room')) as Extract<ServerMessage, { t: 'room' }>).resumeToken;
    a.ws.send(JSON.stringify({ t: 'ready', ready: true }));
    b.ws.send(JSON.stringify({ t: 'ready', ready: true }));
    a.ws.send(JSON.stringify({ t: 'start' }));
    await b.next('start');
    b.ws.terminate();
    await b.closed;
    const b2 = connect(port);
    await b2.opened;
    b2.ws.send(hello('good-b'));
    await b2.next('welcome');
    b2.ws.send(JSON.stringify({ t: 'rejoin', code, resumeToken: token }));
    const back = (await b2.next('room')) as Extract<ServerMessage, { t: 'room' }>;
    expect(back.room.status).toBe('playing');
    expect(back.you).toBe(1);
    a.ws.close();
    b2.ws.close();
  });

  it('close() tells clients to reconnect (1012) and closes the rooms', async () => {
    const port = await start();
    const c = connect(port);
    await c.opened;
    c.ws.send(hello());
    await c.next('welcome');
    c.ws.send(JSON.stringify({ t: 'create', settings }));
    await c.next('room');
    const g = game!;
    await g.close();
    expect(await c.closed).toBe(1012);
    expect(g.rooms.size).toBe(0);
    game = null;
  });
});
