import { describe, expect, it } from 'vitest';
import { MAX_INPUT_FRAMES } from '../src/net/protocol';
import type { Intent, Stats } from '../src/types';
import { CODE_ALPHABET, parseClientMessage, parseStats } from './protocol';

const stats: Stats = { gender: 'male', body: 'balanced', speed: 5, power: 5, recovery: 5, stamina: 5 };
const intent: Intent = {
  move: { x: 0, z: 0 }, racket: { x: 0, y: 0 }, racketVel: { x: 0, y: 0 }, charging: null, chargeTime: 0,
  release: null, basicSwing: null, jumpCharge: 0, jumpRelease: false, dive: false, netShot: false,
};
const settings = { event: 'MS', format: '3x15', assists: { mode: 'pro', hitAssist: 50 }, points: 'real' };
const p = (m: unknown) => parseClientMessage(JSON.stringify(m));
const frame = (seq: number, tick = 0) => ({ seq, tick, intent });

describe('parseClientMessage accepts every valid kind', () => {
  const valid: unknown[] = [
    { t: 'hello', v: 1, token: 'abc.def.ghi', character: { name: 'Nok', stats } },
    { t: 'create', settings },
    { t: 'join', code: 'ABC234' },
    { t: 'rejoin', code: 'ABC234', resumeToken: 'f'.repeat(32) },
    { t: 'seat', seat: 3 },
    { t: 'settings', settings },
    { t: 'ready', ready: true },
    { t: 'start' },
    { t: 'input', frames: [frame(0), frame(1, 5)] },
    { t: 'leave' },
    { t: 'ping', at: 12345.5 },
  ];
  for (const m of valid) it((m as { t: string }).t, () => expect(p(m)).toEqual(m));

  it('clamps intent axes to -1..1 and drops unknown fields', () => {
    const wild = { ...intent, move: { x: 9, z: -9 }, racket: { x: 2, y: -2 }, chargeTime: 99, extra: 'x' };
    const m = p({ t: 'input', frames: [{ seq: 1, tick: 1, intent: wild, evil: true }], more: 1 });
    expect(m).toEqual({
      t: 'input',
      frames: [{ seq: 1, tick: 1, intent: { ...intent, move: { x: 1, z: -1 }, racket: { x: 1, y: -1 }, chargeTime: 10 } }],
    });
  });

  it('upper-cases a room code', () => expect(p({ t: 'join', code: 'abc234' })).toEqual({ t: 'join', code: 'ABC234' }));
});

describe('parseClientMessage rejects malformed and hostile messages', () => {
  const bad: [string, unknown][] = [
    ['unknown kind', { t: 'hack' }],
    ['no kind', {}],
    ['array', []],
    ['null', null],
    ['kind not a string', { t: 5 }],
    ['proto kind', { t: '__proto__' }],
    ['hello without token', { t: 'hello', v: 1, character: { name: 'a', stats } }],
    ['hello token too long', { t: 'hello', v: 1, token: 'x'.repeat(5000), character: { name: 'a', stats } }],
    ['hello non-integer version', { t: 'hello', v: 1.5, token: 't', character: { name: 'a', stats } }],
    ['name empty', { t: 'hello', v: 1, token: 't', character: { name: '   ', stats } }],
    ['name 25 chars', { t: 'hello', v: 1, token: 't', character: { name: 'a'.repeat(25), stats } }],
    ['name huge', { t: 'hello', v: 1, token: 't', character: { name: 'a'.repeat(1e5), stats } }],
    ['name control char', { t: 'hello', v: 1, token: 't', character: { name: 'a\u0007b', stats } }],
    ['name a number', { t: 'hello', v: 1, token: 't', character: { name: 5, stats } }],
    ['stat above 10', { t: 'hello', v: 1, token: 't', character: { name: 'a', stats: { ...stats, speed: 11 } } }],
    ['stat negative', { t: 'hello', v: 1, token: 't', character: { name: 'a', stats: { ...stats, speed: -1 } } }],
    ['stat as string', { t: 'hello', v: 1, token: 't', character: { name: 'a', stats: { ...stats, speed: '5' } } }],
    ['gender __proto__', { t: 'hello', v: 1, token: 't', character: { name: 'a', stats: { ...stats, gender: '__proto__' } } }],
    ['unknown body', { t: 'hello', v: 1, token: 't', character: { name: 'a', stats: { ...stats, body: 'giant' } } }],
    ['create without settings', { t: 'create' }],
    ['bad event', { t: 'create', settings: { ...settings, event: 'XX' } }],
    ['bad format', { t: 'create', settings: { ...settings, format: '1x15' } }],
    ['bad points', { t: 'create', settings: { ...settings, points: 'ten' } }],
    ['bad mode', { t: 'create', settings: { ...settings, assists: { mode: 'god', hitAssist: 1 } } }],
    ['hitAssist 101', { t: 'create', settings: { ...settings, assists: { mode: 'pro', hitAssist: 101 } } }],
    ['hitAssist -1', { t: 'settings', settings: { ...settings, assists: { mode: 'pro', hitAssist: -1 } } }],
    ['code too short', { t: 'join', code: 'ABC23' }],
    ['code too long', { t: 'join', code: 'ABC2345' }],
    ['code with O and 0', { t: 'join', code: 'ABO0Z2' }],
    ['code with 1 and I', { t: 'join', code: 'AB1IZ2' }],
    ['code a number', { t: 'join', code: 234567 }],
    ['rejoin without token', { t: 'rejoin', code: 'ABC234' }],
    ['rejoin token huge', { t: 'rejoin', code: 'ABC234', resumeToken: 'x'.repeat(500) }],
    ['seat 4', { t: 'seat', seat: 4 }],
    ['seat -1', { t: 'seat', seat: -1 }],
    ['seat 1.5', { t: 'seat', seat: 1.5 }],
    ['ready as string', { t: 'ready', ready: 'yes' }],
    ['ping without at', { t: 'ping' }],
    ['frames not an array', { t: 'input', frames: 'x' }],
    ['no frames', { t: 'input', frames: [] }],
    ['too many frames', { t: 'input', frames: Array.from({ length: MAX_INPUT_FRAMES + 1 }, (_, i) => frame(i)) }],
    ['negative seq', { t: 'input', frames: [frame(-1)] }],
    ['fractional seq', { t: 'input', frames: [frame(1.5)] }],
    ['negative tick', { t: 'input', frames: [frame(1, -3)] }],
    ['huge tick', { t: 'input', frames: [frame(1, 2 ** 40)] }],
    ['move not an object', { t: 'input', frames: [{ seq: 0, tick: 0, intent: { ...intent, move: 3 } }] }],
    ['unknown shot', { t: 'input', frames: [{ seq: 0, tick: 0, intent: { ...intent, release: 'nuke' } }] }],
    ['bad basicSwing', { t: 'input', frames: [{ seq: 0, tick: 0, intent: { ...intent, basicSwing: 'left' } }] }],
    ['boolean as number', { t: 'input', frames: [{ seq: 0, tick: 0, intent: { ...intent, dive: 1 } }] }],
    ['missing intent field', { t: 'input', frames: [{ seq: 0, tick: 0, intent: { move: intent.move } }] }],
  ];
  for (const [name, m] of bad) it(name, () => expect(p(m)).toBeNull());

  it('NaN and Infinity (null after JSON) in an axis', () => {
    // JSON.stringify turns NaN/Infinity into null, which is not a number
    expect(p({ t: 'input', frames: [{ seq: 0, tick: 0, intent: { ...intent, move: { x: NaN, z: 0 } } }] })).toBeNull();
    expect(parseClientMessage('{"t":"input","frames":[{"seq":0,"tick":0,"intent":{"move":{"x":1e999,"z":0}}}]}')).toBeNull();
    expect(parseClientMessage('{"t":"ping","at":1e999}')).toBeNull();
  });
  it('not JSON, empty, truncated', () => {
    for (const raw of ['', 'nope', '{"t":"ping"', '{"t":"ping","at":1}}']) expect(parseClientMessage(raw)).toBeNull();
  });
  it('oversized raw text', () => expect(parseClientMessage(`{"t":"join","code":"${'A'.repeat(40000)}"}`)).toBeNull());
  it('stats over the budget are refused (4 x 10 is the most any budget 40 allows)', () => {
    expect(parseStats({ ...stats, speed: 10, power: 10, recovery: 10, stamina: 10 }, 40)).not.toBeNull();
    expect(parseStats({ ...stats, speed: 10, power: 10, recovery: 10, stamina: 1 }, 30)).toBeNull();
  });
  it('the alphabet has no look-alikes', () => expect(CODE_ALPHABET).not.toMatch(/[01OIL]/));
});
