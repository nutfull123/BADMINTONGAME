// Rooms by 6-character code: lobby rules (seats, host-only settings, ready, start) and the life of a playing room
// (a bot holds the seat of a player who dropped, for 30 s). No sockets here: a Session is just a send function.
import { randomBytes, randomInt } from 'node:crypto';
import type {
  ClientMessage, RoomSeat, RoomSettings, RoomView, SeatIndex, ServerErrorCode, ServerMessage,
} from '../src/net/protocol';
import { PRESETS } from '../src/ui/model';
import type { BodyType, Gender, MatchEvent, Stats } from '../src/types';
import { MatchLoop, seatSlot } from './match';
import { CODE_ALPHABET, CODE_LENGTH } from './protocol';

export const REJOIN_MS = 30_000;
const MAX_STAT_POINTS = 20;

export interface Session { userId: string; name: string; stats: Stats; send(m: ServerMessage): void }

interface Member {
  userId: string; name: string; stats: Stats; resumeToken: string;
  session: Session | null; seat: SeatIndex | null; ready: boolean; timer: ReturnType<typeof setTimeout> | null;
}

export interface Room {
  code: string; hostId: string; settings: RoomSettings; status: RoomView['status'];
  members: Map<string, Member>;      // in join order
  played: Stats[];                   // stats per seat as played, set when the match starts
  loop: MatchLoop | null;
}

export const seatCount = (event: MatchEvent): number => (event === 'MS' || event === 'WS' ? 2 : 4);

// 'twenty': scale a stat set down to at most 20 points, keeping its shape (largest remainders get the leftover points).
export function twentyPoints(s: Stats): Stats {
  const keys = ['speed', 'power', 'recovery', 'stamina'] as const;
  const total = keys.reduce((n, k) => n + s[k], 0);
  if (total <= MAX_STAT_POINTS) return { ...s };
  const raw = keys.map((k) => (s[k] * MAX_STAT_POINTS) / total);
  const out = raw.map(Math.floor);
  let left = MAX_STAT_POINTS - out.reduce((a, b) => a + b, 0);
  [...raw.keys()].sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])) || a - b)
    .forEach((i) => { if (left-- > 0) out[i]++; });
  return { ...s, speed: out[0], power: out[1], recovery: out[2], stamina: out[3] };
}

const needGender = (event: MatchEvent): Gender | null =>
  event === 'MS' || event === 'MD' ? 'male' : event === 'WS' || event === 'WD' ? 'female' : null;

export class Rooms {
  private rooms = new Map<string, Room>();
  private byUser = new Map<string, Room>();

  constructor(private readonly o: { rng?: () => number; rejoinMs?: number } = {}) {}

  get size() { return this.rooms.size; }
  find(code: string) { return this.rooms.get(code); }
  roomOf(userId: string) { return this.byUser.get(userId); }

  handle(s: Session, msg: ClientMessage): void {
    switch (msg.t) {
      case 'create': return this.create(s, msg.settings);
      case 'join': return this.join(s, msg.code);
      case 'rejoin': return this.rejoin(s, msg.code, msg.resumeToken);
      default: break;
    }
    const room = this.byUser.get(s.userId);
    const me = room?.members.get(s.userId);
    if (!room || !me || me.session !== s) return this.error(s, 'no-room', 'You are not in a room');
    switch (msg.t) {
      case 'seat': return this.sit(room, me, msg.seat);
      case 'settings': return this.changeSettings(room, me, msg.settings);
      case 'ready': return this.setReady(room, me, msg.ready);
      case 'start': return this.start(room, me);
      case 'leave': return this.leave(room, me);
      case 'input':
        if (room.status === 'playing' && me.seat !== null) room.loop?.input(me.seat, msg.frames);
        return;
      default: return this.error(s, 'bad-message', 'Unexpected message');
    }
  }

  // The socket closed. In a match the seat is played by a bot for REJOIN_MS; anywhere else the player just leaves.
  disconnect(s: Session): void {
    const room = this.byUser.get(s.userId);
    const me = room?.members.get(s.userId);
    if (!room || !me || me.session !== s) return;
    if (room.status !== 'playing') return this.leave(room, me);
    me.session = null;
    if (me.seat !== null) room.loop?.detach(me.seat);
    me.timer = setTimeout(() => this.leave(room, me), this.o.rejoinMs ?? REJOIN_MS);
    me.timer.unref?.();
    this.broadcast(room);
  }

  update(nowMs: number): void {
    for (const room of this.rooms.values()) if (room.status === 'playing') room.loop?.update(nowMs);
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) this.close(room);
  }

  // ---------- lobby ----------

  private create(s: Session, settings: RoomSettings) {
    this.dropFromOtherRoom(s);
    const code = this.newCode();
    const room: Room = { code, hostId: s.userId, settings, status: 'lobby', members: new Map(), played: [], loop: null };
    this.rooms.set(code, room);
    this.enter(room, s);
    this.broadcast(room);
  }

  private join(s: Session, code: string) {
    const room = this.rooms.get(code);
    if (!room) return this.error(s, 'no-room', 'No room with that code');
    if (room.members.has(s.userId) && this.byUser.get(s.userId) === room) {
      return this.error(s, 'bad-message', 'You are already in this room'); // rejoin with the resume token instead
    }
    if (room.status !== 'lobby') return this.error(s, 'room-full', 'The match has already started');
    if (room.members.size >= seatCount(room.settings.event)) return this.error(s, 'room-full', 'The room is full');
    this.dropFromOtherRoom(s);
    this.enter(room, s);
    this.broadcast(room);
  }

  private rejoin(s: Session, code: string, resumeToken: string) {
    const room = this.rooms.get(code);
    const me = room?.members.get(s.userId);
    if (!room || !me || me.resumeToken !== resumeToken) return this.error(s, 'no-room', 'This room is no longer open to you');
    this.dropFromOtherRoom(s, room);
    if (me.timer) clearTimeout(me.timer);
    me.timer = null;
    me.session = s;
    this.byUser.set(s.userId, room);
    if (room.status === 'playing' && me.seat !== null) room.loop?.attach(me.seat, s.send);
    this.broadcast(room);
  }

  private sit(room: Room, me: Member, seat: SeatIndex) {
    if (room.status !== 'lobby') return this.error(me.session!, 'bad-seat', 'The match has already started');
    const why = this.seatProblem(room, me, seat);
    if (why) return this.error(me.session!, 'bad-seat', why);
    me.seat = seat;
    me.ready = false;
    this.broadcast(room);
  }

  private changeSettings(room: Room, me: Member, settings: RoomSettings) {
    if (room.hostId !== me.userId) return this.error(me.session!, 'not-host', 'Only the host can change the settings');
    if (room.status !== 'lobby') return this.error(me.session!, 'bad-settings', 'The match has already started');
    if (room.members.size > seatCount(settings.event)) return this.error(me.session!, 'bad-settings', 'Too many players for that event');
    room.settings = settings;
    for (const m of room.members.values()) { // a seat that no longer exists (doubles to singles) is given up
      if (m.seat !== null && m.seat >= seatCount(settings.event)) m.seat = null;
    }
    this.resetReady(room);
    this.broadcast(room);
  }

  private setReady(room: Room, me: Member, ready: boolean) {
    if (room.status !== 'lobby') return this.error(me.session!, 'bad-message', 'The match has already started');
    if (ready && me.seat === null) return this.error(me.session!, 'bad-seat', 'Pick a seat first');
    me.ready = ready;
    this.broadcast(room);
  }

  private start(room: Room, me: Member) {
    const s = me.session!;
    if (room.hostId !== me.userId) return this.error(s, 'not-host', 'Only the host can start the match');
    if (room.status !== 'lobby') return this.error(s, 'bad-message', 'The match has already started');
    for (const m of room.members.values()) {
      if (m.seat === null || !m.ready) return this.error(s, 'not-ready', `${m.name} is not seated and ready`);
    }
    this.begin(room);
  }

  private begin(room: Room) {
    const { settings } = room;
    const n = seatCount(settings.event);
    const human = (seat: number) => [...room.members.values()].find((m) => m.seat === seat);
    room.played = Array.from({ length: n }, (_, seat) => {
      const m = human(seat);
      if (m) return settings.points === 'twenty' ? twentyPoints(m.stats) : { ...m.stats };
      const mate = human(seat ^ 2)?.stats.gender ?? null;
      return this.botStats(settings.event, seat, mate);
    });
    const loop = new MatchLoop({
      settings, stats: room.played, rng: this.o.rng,
      onEnd: () => { room.status = 'finished'; room.loop = null; this.broadcast(room); },
    });
    for (const m of room.members.values()) if (m.session) loop.attach(m.seat!, m.session.send);
    room.loop = loop;
    room.status = 'playing';
    this.broadcast(room);
    for (const m of room.members.values()) m.session?.send({ t: 'start', tick: 0 });
  }

  // ---------- leaving ----------

  private leave(room: Room, me: Member) {
    if (me.timer) clearTimeout(me.timer);
    room.members.delete(me.userId);
    if (this.byUser.get(me.userId) === room) this.byUser.delete(me.userId);
    if (room.status === 'playing' && me.seat !== null) room.loop?.detach(me.seat); // a bot keeps the seat
    if (room.members.size === 0) return this.close(room);
    if (room.hostId === me.userId) {
      const next = [...room.members.values()].find((m) => m.session) ?? room.members.values().next().value!;
      room.hostId = next.userId;
    }
    this.broadcast(room);
  }

  private close(room: Room) {
    for (const m of room.members.values()) {
      if (m.timer) clearTimeout(m.timer);
      if (this.byUser.get(m.userId) === room) this.byUser.delete(m.userId);
    }
    room.members.clear();
    room.loop = null;
    this.rooms.delete(room.code);
  }

  // ---------- helpers ----------

  private enter(room: Room, s: Session) {
    const m: Member = {
      userId: s.userId, name: s.name, stats: s.stats, resumeToken: randomBytes(16).toString('hex'),
      session: s, seat: null, ready: false, timer: null,
    };
    room.members.set(s.userId, m);
    this.byUser.set(s.userId, room);
    for (let seat = 0; seat < seatCount(room.settings.event) && m.seat === null; seat++) {
      if (!this.seatProblem(room, m, seat as SeatIndex)) m.seat = seat as SeatIndex;
    }
  }

  // Leaves a different room the player is still in (a match in progress included: a bot takes the seat).
  private dropFromOtherRoom(s: Session, keep?: Room) {
    const old = this.byUser.get(s.userId);
    const m = old?.members.get(s.userId);
    if (old && m && old !== keep) this.leave(old, m);
  }

  private resetReady(room: Room) {
    for (const m of room.members.values()) m.ready = false;
  }

  // Why `me` cannot sit in `seat` (null = fine). Private rooms mix genders freely: any character, any seat.
  private seatProblem(room: Room, me: Member, seat: number): string | null {
    if (seat >= seatCount(room.settings.event)) return 'That seat does not exist in this event';
    for (const m of room.members.values()) {
      if (m !== me && m.seat === seat) return 'That seat is taken';
    }
    return null;
  }

  private botStats(event: MatchEvent, seat: number, mateGender: Gender | null): Stats {
    const bodies = Object.keys(PRESETS) as BodyType[];
    const rng = this.o.rng ?? Math.random;
    const gender: Gender = needGender(event) ??
      (mateGender ? (mateGender === 'male' ? 'female' : 'male') : seatSlot(seat) === 0 ? 'male' : 'female');
    return { ...PRESETS[bodies[Math.floor(rng() * bodies.length)]], gender };
  }

  private view(room: Room): RoomView {
    const n = seatCount(room.settings.event);
    const seats: RoomSeat[] = Array.from({ length: n }, (_, i) => {
      const seat = i as SeatIndex;
      const m = [...room.members.values()].find((x) => x.seat === seat);
      const stats = room.status === 'lobby'
        ? m ? (room.settings.points === 'twenty' ? twentyPoints(m.stats) : m.stats) : { ...PRESETS.balanced, gender: needGender(room.settings.event) ?? 'male' }
        : room.played[i];
      return m
        ? { seat, userId: m.userId, name: m.name, stats, ready: m.ready, connected: m.session !== null }
        : { seat, userId: null, name: 'Bot', stats, ready: true, connected: true };
    });
    return { code: room.code, hostId: room.hostId, settings: room.settings, seats, status: room.status };
  }

  private broadcast(room: Room) {
    const view = this.view(room);
    for (const m of room.members.values()) m.session?.send({ t: 'room', room: view, you: m.seat, resumeToken: m.resumeToken });
  }

  private error(s: Session, code: ServerErrorCode, message: string) {
    s.send({ t: 'error', code, message });
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
