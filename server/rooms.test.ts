import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSettings, RoomView, ServerMessage } from '../src/net/protocol';
import type { Stats } from '../src/types';
import { validateStats } from '../src/sim';
import { CODE_ALPHABET } from './protocol';
import { REJOIN_MS, Rooms, seatCount, twentyPoints, type Session } from './rooms';

const male: Stats = { gender: 'male', body: 'balanced', speed: 10, power: 10, recovery: 10, stamina: 10 };
const female: Stats = { ...male, gender: 'female', body: 'short', speed: 9, power: 3, recovery: 2, stamina: 6 };
const settings = (o: Partial<RoomSettings> = {}): RoomSettings => ({
  event: 'MS', format: '3x15', assists: { mode: 'pro', hitAssist: 50 }, points: 'real', ...o,
});

interface Fake extends Session { msgs: ServerMessage[]; last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined }
const fake = (userId: string, stats: Stats = male): Fake => {
  const msgs: ServerMessage[] = [];
  return {
    userId, name: userId, stats, msgs, send: (m) => { msgs.push(m); },
    last: (t) => [...msgs].reverse().find((m) => m.t === t) as never,
  };
};
const room = (f: Fake): RoomView => f.last('room')!.room;
const errors = (f: Fake) => f.msgs.filter((m) => m.t === 'error').map((m) => (m as { code: string }).code);

describe('rooms', () => {
  let rooms: Rooms;
  beforeEach(() => { vi.useFakeTimers(); rooms = new Rooms({ rng: () => 0.5 }); });
  afterEach(() => { rooms.closeAll(); vi.useRealTimers(); });

  const open = (host: Fake, s = settings()) => { rooms.handle(host, { t: 'create', settings: s }); return room(host).code; };

  it('creates rooms with unique 6-character codes without look-alikes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const code = open(fake(`h${i}`));
      expect(code).toHaveLength(6);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(300);
  });

  it('seats the host, lets a guest join and choose a seat, refuses a taken seat', () => {
    const a = fake('a'), b = fake('b');
    const code = open(a);
    expect(room(a).seats[0].userId).toBe('a');
    rooms.handle(b, { t: 'join', code });
    expect(room(b).seats.map((s) => s.userId)).toEqual(['a', 'b']);
    expect(b.last('room')!.you).toBe(1);
    rooms.handle(b, { t: 'seat', seat: 0 });
    expect(errors(b)).toEqual(['bad-seat']);
    rooms.handle(b, { t: 'seat', seat: 2 }); // singles has only 2 seats
    expect(errors(b)).toEqual(['bad-seat', 'bad-seat']);
  });

  it('join: unknown code, full room, started match', () => {
    const a = fake('a'), b = fake('b'), c = fake('c');
    const code = open(a);
    rooms.handle(c, { t: 'join', code: 'ZZZZZZ' });
    expect(errors(c)).toEqual(['no-room']);
    rooms.handle(b, { t: 'join', code });
    rooms.handle(c, { t: 'join', code });
    expect(errors(c)).toEqual(['no-room', 'room-full']);
  });

  it('only the host changes settings, and only in the lobby', () => {
    const a = fake('a'), b = fake('b');
    const code = open(a);
    rooms.handle(b, { t: 'join', code });
    rooms.handle(b, { t: 'settings', settings: settings({ format: '3x21' }) });
    expect(errors(b)).toEqual(['not-host']);
    rooms.handle(a, { t: 'settings', settings: settings({ format: '3x21', points: 'twenty' }) });
    expect(room(b).settings).toMatchObject({ format: '3x21', points: 'twenty' });
    rooms.handle(a, { t: 'ready', ready: true });
    rooms.handle(b, { t: 'ready', ready: true });
    rooms.handle(a, { t: 'start' });
    rooms.handle(a, { t: 'settings', settings: settings() });
    expect(errors(a)).toEqual(['bad-settings']);
  });

  it('start is host-only and needs every human seated and ready', () => {
    const a = fake('a'), b = fake('b');
    const code = open(a);
    rooms.handle(b, { t: 'join', code });
    rooms.handle(b, { t: 'start' });
    expect(errors(b)).toEqual(['not-host']);
    rooms.handle(a, { t: 'start' });
    expect(errors(a)).toEqual(['not-ready']);
    rooms.handle(a, { t: 'ready', ready: true });
    rooms.handle(a, { t: 'start' });
    expect(errors(a)).toEqual(['not-ready', 'not-ready']); // b is still not ready
    rooms.handle(b, { t: 'ready', ready: true });
    rooms.handle(a, { t: 'start' });
    expect(room(a).status).toBe('playing');
    expect(a.last('start')).toEqual({ t: 'start', tick: 0 });
    expect(b.last('start')).toBeDefined();
  });

  it('changing seat takes the ready mark back', () => {
    const a = fake('a');
    open(a, settings({ event: 'MD' }));
    rooms.handle(a, { t: 'ready', ready: true });
    rooms.handle(a, { t: 'seat', seat: 3 });
    expect(room(a).seats[3]).toMatchObject({ userId: 'a', ready: false });
  });

  describe('gender rules', () => {
    it('men\'s singles refuses a woman, women\'s doubles refuses a man', () => {
      const w = fake('w', female);
      open(w, settings({ event: 'MS' }));
      expect(w.last('room')!.you).toBeNull(); // no legal seat
      rooms.handle(w, { t: 'seat', seat: 0 });
      expect(errors(w)).toEqual(['bad-seat']);
      rooms.handle(w, { t: 'ready', ready: true });
      expect(errors(w)).toEqual(['bad-seat', 'bad-seat']);
      const m = fake('m');
      open(m, settings({ event: 'WD' }));
      expect(m.last('room')!.you).toBeNull();
    });
    it('mixed doubles needs one of each per side', () => {
      const m1 = fake('m1'), m2 = fake('m2'), w = fake('w', female);
      const code = open(m1, settings({ event: 'XD' }));
      rooms.handle(m2, { t: 'join', code });
      expect(m2.last('room')!.you).toBe(1); // far side, no partner yet
      rooms.handle(m2, { t: 'seat', seat: 2 }); // m1's partner seat: another man
      expect(errors(m2)).toEqual(['bad-seat']);
      rooms.handle(w, { t: 'join', code });
      expect(w.last('room')!.you).toBe(2);
    });
    it('a settings change unseats players who no longer fit', () => {
      const a = fake('a'), w = fake('w', female);
      const code = open(a, settings({ event: 'MD' }));
      rooms.handle(w, { t: 'join', code }); // women are not seated in MD
      expect(w.last('room')!.you).toBeNull();
      rooms.handle(a, { t: 'settings', settings: settings({ event: 'WD' }) });
      expect(room(a).seats[0].userId).toBeNull();
      expect(a.last('room')!.you).toBeNull();
    });
    it('start re-checks the rules and bots take the right gender', () => {
      const a = fake('a');
      open(a, settings({ event: 'XD' }));
      rooms.handle(a, { t: 'ready', ready: true });
      rooms.handle(a, { t: 'start' });
      const seats = room(a).seats;
      expect(seats.map((s) => s.stats.gender)).toEqual(['male', 'male', 'female', 'female']); // mate of a is female
      expect(seats.map((s) => s.userId)).toEqual(['a', null, null, null]);
    });
  });

  it('bots fill the empty seats at start (singles and doubles)', () => {
    const a = fake('a');
    open(a, settings({ event: 'MD' }));
    rooms.handle(a, { t: 'ready', ready: true });
    rooms.handle(a, { t: 'start' });
    const v = room(a);
    expect(v.seats).toHaveLength(4);
    expect(v.seats.filter((s) => s.userId === null).map((s) => s.name)).toEqual(['Bot', 'Bot', 'Bot']);
    for (const s of v.seats) expect(validateStats(s.stats)).toBeNull();
  });

  describe('twenty points', () => {
    it('reduces every stat set to a valid 20-point set and keeps its shape', () => {
      for (const s of [male, female, { ...male, speed: 10, power: 10, recovery: 0, stamina: 3 }, { ...male, speed: 7, power: 7, recovery: 7, stamina: 7 }]) {
        const t = twentyPoints(s);
        expect(validateStats(t, 20)).toBeNull();
        expect(t.gender).toBe(s.gender);
        expect(t.body).toBe(s.body);
        expect(t.speed + t.power + t.recovery + t.stamina).toBe(20);
      }
      expect(twentyPoints(female)).toMatchObject({ speed: 9, power: 3, recovery: 2, stamina: 6 }); // already 20: unchanged
      const t = twentyPoints({ ...male, speed: 10, power: 10, recovery: 0, stamina: 10 });
      expect(t).toMatchObject({ speed: 7, power: 7, recovery: 0, stamina: 6 }); // 30 -> 20, the zero stays zero
    });
    it('is applied to humans in a room that plays at 20', () => {
      const a = fake('a');
      open(a, settings({ points: 'twenty' }));
      expect(room(a).seats[0].stats).toMatchObject({ speed: 5, power: 5, recovery: 5, stamina: 5 });
      rooms.handle(a, { t: 'ready', ready: true });
      rooms.handle(a, { t: 'start' });
      const s = room(a).seats[0].stats;
      expect(s.speed + s.power + s.recovery + s.stamina).toBe(20);
    });
  });

  describe('leaving', () => {
    it('hands the host to the next human; an empty room closes', () => {
      const a = fake('a'), b = fake('b');
      const code = open(a);
      rooms.handle(b, { t: 'join', code });
      rooms.handle(a, { t: 'leave' });
      expect(room(b).hostId).toBe('b');
      expect(room(b).seats[0].userId).toBeNull();
      expect(rooms.size).toBe(1);
      rooms.handle(b, { t: 'leave' });
      expect(rooms.size).toBe(0);
      expect(rooms.find(code)).toBeUndefined();
    });
    it('a lobby disconnect is a leave', () => {
      const a = fake('a');
      open(a);
      rooms.disconnect(a);
      expect(rooms.size).toBe(0);
    });
    it('creating or joining another room leaves the first', () => {
      const a = fake('a'), b = fake('b');
      const first = open(a), second = open(b);
      rooms.handle(a, { t: 'join', code: second });
      expect(rooms.find(first)).toBeUndefined();
      expect(room(a).code).toBe(second);
    });
  });

  describe('disconnect during a match', () => {
    const playing = () => {
      const a = fake('a'), b = fake('b');
      const code = open(a);
      rooms.handle(b, { t: 'join', code });
      rooms.handle(a, { t: 'ready', ready: true });
      rooms.handle(b, { t: 'ready', ready: true });
      rooms.handle(a, { t: 'start' });
      return { a, b, code, token: b.last('room')!.resumeToken };
    };

    it('a bot plays the seat and the player can rejoin within 30 s', () => {
      const { a, b, code, token } = playing();
      rooms.disconnect(b);
      expect(room(a).seats[1]).toMatchObject({ userId: 'b', connected: false });
      vi.advanceTimersByTime(REJOIN_MS - 1000);
      const b2 = fake('b');
      rooms.handle(b2, { t: 'rejoin', code, resumeToken: token });
      expect(errors(b2)).toEqual([]);
      expect(room(b2)).toMatchObject({ status: 'playing' });
      expect(b2.last('room')!.you).toBe(1);
      expect(room(a).seats[1]).toMatchObject({ userId: 'b', connected: true });
      vi.advanceTimersByTime(REJOIN_MS * 2); // the timer was cancelled
      expect(room(a).seats[1].userId).toBe('b');
    });

    it('after 30 s the seat stays a bot and a late rejoin is refused', () => {
      const { a, b, code, token } = playing();
      rooms.disconnect(b);
      vi.advanceTimersByTime(REJOIN_MS + 1);
      expect(room(a).seats[1]).toMatchObject({ userId: null, name: 'Bot' });
      const b2 = fake('b');
      rooms.handle(b2, { t: 'rejoin', code, resumeToken: token });
      expect(errors(b2)).toEqual(['no-room']);
    });

    it('a wrong resume token is refused', () => {
      const { b, code } = playing();
      rooms.disconnect(b);
      const b2 = fake('b');
      rooms.handle(b2, { t: 'rejoin', code, resumeToken: 'nope' });
      expect(errors(b2)).toEqual(['no-room']);
      const evil = fake('evil');
      rooms.handle(evil, { t: 'rejoin', code, resumeToken: 'nope' });
      expect(errors(evil)).toEqual(['no-room']);
    });

    it('the host who never comes back hands over after 30 s; when nobody is left the room closes', () => {
      const { a, b } = playing();
      rooms.disconnect(a);
      expect(room(b).hostId).toBe('a');
      vi.advanceTimersByTime(REJOIN_MS + 1);
      expect(room(b).hostId).toBe('b');
      rooms.disconnect(b);
      vi.advanceTimersByTime(REJOIN_MS + 1);
      expect(rooms.size).toBe(0);
    });

    it('ignores messages from a replaced connection', () => {
      const { b, code, token } = playing();
      rooms.disconnect(b);
      const b2 = fake('b');
      rooms.handle(b2, { t: 'rejoin', code, resumeToken: token });
      rooms.handle(b, { t: 'leave' });
      expect(errors(b)).toEqual(['no-room']);
      expect(room(b2).seats[1].userId).toBe('b');
    });
  });

  it('seatCount: 2 for singles, 4 for doubles', () => {
    expect(['MS', 'WS', 'MD', 'WD', 'XD'].map((e) => seatCount(e as never))).toEqual([2, 2, 4, 4, 4]);
  });
});
