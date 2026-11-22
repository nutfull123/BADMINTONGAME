import { describe, expect, it } from 'vitest';
import type { RoomSeat, RoomView, ServerErrorCode } from '../net/protocol';
import type { Stats } from '../types';
import {
  SERVER_ERROR_LABELS,
  buildOnlineResultMatch,
  canStartRoom,
  formatOnlineTeamNames,
  formatServerError,
  normalizeRoomCode,
  onlineMenuStatus,
  seatStatTotal,
  validateRoomCode,
} from './onlineHelpers';

const baseStats: Stats = {
  gender: 'male',
  body: 'balanced',
  speed: 6,
  power: 5,
  recovery: 5,
  stamina: 4,
};

function makeSeat(over: Partial<RoomSeat> & { seat: RoomSeat['seat'] }): RoomSeat {
  return {
    userId: null,
    name: 'บอท',
    stats: { ...baseStats },
    ready: true,
    connected: true,
    ...over,
  };
}

function makeRoom(seats: RoomSeat[], hostId = 'u1', status: RoomView['status'] = 'lobby'): RoomView {
  return {
    code: 'AB23CD',
    hostId,
    settings: {
      event: seats.length > 2 ? 'MD' : 'MS',
      format: '3x15',
      assists: { mode: 'normal', hitAssist: 60 },
      points: 'real',
    },
    seats,
    status,
  };
}

describe('onlineMenuStatus', () => {
  it('enables online only when Supabase, game server URL, and signed-in user are all present', () => {
    expect(onlineMenuStatus(true, true, true)).toEqual({ enabled: true, reason: null });
    expect(onlineMenuStatus(false, true, true)).toEqual({
      enabled: false,
      reason: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ออนไลน์',
    });
    expect(onlineMenuStatus(true, false, true)).toEqual({
      enabled: false,
      reason: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ออนไลน์',
    });
    expect(onlineMenuStatus(true, true, false)).toEqual({
      enabled: false,
      reason: 'ต้องเข้าสู่ระบบก่อน',
    });
  });
});

describe('room code normalization and validation', () => {
  it('upper-cases and strips whitespace', () => {
    expect(normalizeRoomCode(' ab2 3cd ')).toBe('AB23CD');
  });

  it('accepts valid 6-char codes without look-alikes and rejects invalid ones', () => {
    expect(validateRoomCode('AB23CD')).toBeNull();
    expect(validateRoomCode('HJKMNP')).toBeNull();
    expect(validateRoomCode('AB23C')).toContain('6');
    expect(validateRoomCode('AB23CD9')).toContain('6');
    expect(validateRoomCode('AB03CD')).toContain('0');
    expect(validateRoomCode('ABO3CD')).toContain('O');
    expect(validateRoomCode('AB13CD')).toContain('1');
    expect(validateRoomCode('ABI3CD')).toContain('I');
    expect(validateRoomCode('AB-3CD')).not.toBeNull();
  });
});

describe('SERVER_ERROR_LABELS & formatServerError', () => {
  it('provides a non-empty Thai message for every ServerErrorCode', () => {
    const codes: ServerErrorCode[] = [
      'bad-version',
      'bad-token',
      'bad-message',
      'no-room',
      'room-full',
      'not-host',
      'not-ready',
      'bad-seat',
      'bad-settings',
      'rate-limit',
    ];
    for (const code of codes) {
      expect(SERVER_ERROR_LABELS[code].length).toBeGreaterThan(4);
      expect(formatServerError(code)).toBe(SERVER_ERROR_LABELS[code]);
    }
  });
});

describe('canStartRoom & seatStatTotal', () => {
  it('sums the four stats', () => {
    expect(seatStatTotal(baseStats)).toBe(20);
  });

  it('allows only the host to start when every seated human is ready in lobby', () => {
    const readyRoom = makeRoom([
      makeSeat({ seat: 0, userId: 'u1', name: 'A', ready: true }),
      makeSeat({ seat: 1, userId: null, name: 'บอท', ready: false }),
    ]);
    expect(canStartRoom(readyRoom, 'u1')).toBe(true);
    expect(canStartRoom(readyRoom, 'u2')).toBe(false);
    expect(canStartRoom(readyRoom, null)).toBe(false);

    const notReadyRoom = makeRoom([
      makeSeat({ seat: 0, userId: 'u1', name: 'A', ready: true }),
      makeSeat({ seat: 1, userId: 'u2', name: 'B', ready: false }),
    ]);
    expect(canStartRoom(notReadyRoom, 'u1')).toBe(false);

    const playingRoom = makeRoom(readyRoom.seats, 'u1', 'playing');
    expect(canStartRoom(playingRoom, 'u1')).toBe(false);
  });
});

describe('formatOnlineTeamNames & buildOnlineResultMatch', () => {
  it('formats singles and doubles side names from the viewer perspective', () => {
    const doubles = makeRoom([
      makeSeat({ seat: 0, userId: 'u1', name: 'เมย์' }),
      makeSeat({ seat: 1, userId: 'u2', name: 'ต้น' }),
      makeSeat({ seat: 2, userId: null, name: 'บอท' }),
      makeSeat({ seat: 3, userId: 'u3', name: 'ฟ้า' }),
    ]);
    expect(formatOnlineTeamNames(doubles, 0)).toEqual({
      near: 'เมย์ / บอท',
      far: 'ต้น / ฟ้า',
    });
    // Far-seat viewer sees their own team as near
    expect(formatOnlineTeamNames(doubles, 1)).toEqual({
      near: 'ต้น / ฟ้า',
      far: 'เมย์ / บอท',
    });
  });

  it('builds a viewer-oriented MatchState for online results (flips for far seat)', () => {
    const games = [
      { near: 15, far: 12 },
      { near: 11, far: 15 },
      { near: 15, far: 13 },
    ];
    const nearView = buildOnlineResultMatch('near', games, 0, '3x15', false);
    expect(nearView.winner).toBe('near');
    expect(nearView.gamesWon).toEqual({ near: 2, far: 1 });
    expect(nearView.completedGames).toEqual(games);

    const farView = buildOnlineResultMatch('near', games, 1, '3x15', false);
    expect(farView.winner).toBe('far');
    expect(farView.gamesWon).toEqual({ near: 1, far: 2 });
    expect(farView.completedGames).toEqual([
      { near: 12, far: 15 },
      { near: 15, far: 11 },
      { near: 13, far: 15 },
    ]);
  });
});
