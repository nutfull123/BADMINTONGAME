import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, parseServerMessage, type SocketLike } from './connection';
import { PROTOCOL_VERSION, type ClientMessage } from './protocol';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string) { this.sent.push(JSON.parse(data) as ClientMessage); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(data: unknown) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
}

const character = { name: 'Nok', stats: { gender: 'female', body: 'short', speed: 5, power: 5, recovery: 5, stamina: 5 } } as const;
let sockets: FakeSocket[];
let clockMs: number;
const opts = () => ({ makeSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; }, now: () => clockMs });

async function welcomed() {
  const p = connect('wss://x', 'tok', { ...character }, opts());
  const s = sockets[0];
  s.open();
  s.recv({ t: 'welcome', userId: 'u1' });
  return { conn: await p, s };
}

beforeEach(() => { sockets = []; clockMs = 1000; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('connection', () => {
  it('sends hello with the protocol version and token, and resolves on welcome', async () => {
    const { conn, s } = await welcomed();
    expect(s.sent[0]).toEqual({ t: 'hello', v: PROTOCOL_VERSION, token: 'tok', character });
    expect(conn.userId).toBe('u1');
  });

  it('rejects with the server error code before welcome, and on close', async () => {
    const p = connect('wss://x', 't', { ...character }, opts());
    sockets[0].open();
    sockets[0].recv({ t: 'error', code: 'bad-token', message: 'no' });
    await expect(p).rejects.toThrow('bad-token');
    const q = connect('wss://x', 't', { ...character }, opts());
    sockets[1].close();
    await expect(q).rejects.toThrow('closed');
  });

  it('drops malformed server messages with one warning and keeps delivering good ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { conn, s } = await welcomed();
    const got: string[] = [];
    conn.onMessage((m) => got.push(m.t));
    s.recv('{not json');
    s.recv('"just a string"');
    s.recv({ t: 'snap', snap: { tick: 'x' } });
    s.recv({ t: 'nonsense' });
    s.recv(new ArrayBuffer(4));
    s.recv({ t: 'pong', at: 1, serverTick: 5 });
    expect(got).toEqual(['pong']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('pings every 2 s and learns the round-trip time and server tick from pongs', async () => {
    const { conn, s } = await welcomed();
    const pings = () => s.sent.filter((m) => m.t === 'ping');
    expect(pings()).toHaveLength(1); // at once
    expect(conn.serverTick()).toBeNull();
    clockMs = 1000;
    s.recv({ t: 'pong', at: 940, serverTick: 3000 }); // rtt 60 ms
    expect(conn.rtt).toBeCloseTo(60);
    // server was at 3000 when the ping arrived (30 ms after it left): now = 3000 + 0.03 s * 120
    expect(conn.serverTick()).toBeCloseTo(3000 + 3.6, 5);
    vi.advanceTimersByTime(6000);
    expect(pings()).toHaveLength(4);
  });

  it('remembers the resume token and reports a drop, but not a deliberate close', async () => {
    const { conn, s } = await welcomed();
    s.recv({ t: 'room', room: { seats: [] }, you: 0, resumeToken: 'rt1' });
    expect(conn.resumeToken).toBe('rt1');
    const dropped = vi.fn();
    conn.onClose(dropped);
    s.onclose?.();
    expect(dropped).toHaveBeenCalledTimes(1);
    conn.close();
    expect(conn.send({ t: 'leave' })).toBe(false);
  });

  it('reopens with a new socket and the same hello', async () => {
    const { conn, s } = await welcomed();
    s.onclose?.();
    const again = conn.reopen();
    const s2 = sockets[1];
    s2.open();
    s2.recv({ t: 'welcome', userId: 'u1' });
    await expect(again).resolves.toBe(true);
    expect(s2.sent[0]).toMatchObject({ t: 'hello', token: 'tok' });
    expect(conn.send({ t: 'leave' })).toBe(true);
    conn.close();
    await expect(conn.reopen()).resolves.toBe(false);
  });

  it('does not send while the socket is not open', async () => {
    const { conn, s } = await welcomed();
    s.readyState = 3;
    expect(conn.send({ t: 'ready', ready: true })).toBe(false);
  });
});

describe('parseServerMessage', () => {
  it('accepts a well-formed pong and rejects non-strings', () => {
    expect(parseServerMessage('{"t":"pong","at":1,"serverTick":2}')).toEqual({ t: 'pong', at: 1, serverTick: 2 });
    expect(parseServerMessage(5)).toBeNull();
    expect(parseServerMessage('null')).toBeNull();
    expect(parseServerMessage('{"t":"end","winner":"left","games":[]}')).toBeNull();
  });
});
