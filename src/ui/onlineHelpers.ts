// Pure helpers for the online lobby, room page, HUD side names, and match results (no DOM, no WebSocket).
import { FORMAT_3X15, FORMAT_3X21, createMatch } from '../rules';
import type { RoomSeat, RoomView, SeatIndex, ServerErrorCode } from '../net/protocol';
import type { GameScore, MatchState, Side, Stats } from '../types';

export interface OnlineMenuStatus {
  enabled: boolean;
  reason: string | null;
}

export function onlineMenuStatus(
  supabaseConfigured: boolean,
  serverConfigured: boolean,
  signedIn: boolean,
): OnlineMenuStatus {
  if (!supabaseConfigured || !serverConfigured) {
    return { enabled: false, reason: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ออนไลน์' };
  }
  if (!signedIn) {
    return { enabled: false, reason: 'ต้องเข้าสู่ระบบก่อน' };
  }
  return { enabled: true, reason: null };
}

export function normalizeRoomCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

const VALID_ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const LOOK_ALIKE = /[0O1I]/;

export function validateRoomCode(raw: string): string | null {
  const code = normalizeRoomCode(raw);
  if (code.length !== 6) {
    return 'รหัสห้องต้องมี 6 ตัวอักษร (Room code must be 6 characters)';
  }
  if (LOOK_ALIKE.test(code)) {
    return 'รหัสห้องไม่ใช้ตัวอักษรที่คล้ายกัน (0, O, 1, I)';
  }
  if (!VALID_ROOM_CODE.test(code)) {
    return 'รหัสห้องใช้ได้เฉพาะตัวอักษรภาษาอังกฤษพิมพ์ใหญ่และตัวเลข (A–Z, 2–9)';
  }
  return null;
}

export const SERVER_ERROR_LABELS: Record<ServerErrorCode, string> = {
  'bad-version': 'เวอร์ชันเกมไม่ตรงกับเซิร์ฟเวอร์ กรุณารีเฟรชหน้าเว็บ',
  'bad-token': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  'bad-message': 'คำสั่งไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
  'no-room': 'ไม่พบห้องรหัสนี้ กรุณาตรวจสอบรหัสอีกครั้ง',
  'room-full': 'ห้องเต็มแล้ว ไม่สามารถเข้าร่วมได้',
  'not-host': 'เฉพาะหัวหน้าห้องเท่านั้นที่ทำรายการนี้ได้',
  'not-ready': 'ผู้เล่นทุกคนในห้องต้องกดพร้อมก่อนเริ่มเกม',
  'bad-seat': 'ที่นั่งนี้ไม่ว่างหรือเลือกไม่ได้',
  'bad-settings': 'การตั้งค่าห้องไม่ถูกต้อง',
  'rate-limit': 'ส่งคำสั่งเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่',
};

export function formatServerError(code: ServerErrorCode, fallback?: string): string {
  return SERVER_ERROR_LABELS[code] ?? fallback ?? 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์';
}

export function seatStatTotal(stats: Stats): number {
  return stats.speed + stats.power + stats.recovery + stats.stamina;
}

export function canStartRoom(room: RoomView, userId: string | null): boolean {
  if (!userId || room.hostId !== userId || room.status !== 'lobby') return false;
  const humans = room.seats.filter((s) => s.userId !== null);
  return humans.length > 0 && humans.every((s) => s.ready);
}

const seatSide = (seat: SeatIndex): Side => (seat % 2 === 0 ? 'near' : 'far');

function sideLabel(seats: RoomSeat[], side: Side): string {
  const names = seats
    .filter((s) => seatSide(s.seat) === side)
    .map((s) => (s.userId ? s.name : 'บอท'));
  return names.length > 0 ? names.join(' / ') : side === 'near' ? 'ฝั่ง A' : 'ฝั่ง B';
}

export function formatOnlineTeamNames(
  room: RoomView,
  you: SeatIndex | null,
): { near: string; far: string } {
  const worldNear = sideLabel(room.seats, 'near');
  const worldFar = sideLabel(room.seats, 'far');
  const mirrored = you !== null && seatSide(you) === 'far';
  return mirrored ? { near: worldFar, far: worldNear } : { near: worldNear, far: worldFar };
}

export function buildOnlineResultMatch(
  winner: Side | null,
  games: readonly GameScore[],
  you: SeatIndex | null,
  format: '3x15' | '3x21',
  doubles: boolean,
): MatchState {
  const mirrored = you !== null && seatSide(you) === 'far';
  const orientedGames: GameScore[] = games.map((g) =>
    mirrored ? { near: g.far, far: g.near } : { near: g.near, far: g.far },
  );
  let nearWins = 0;
  let farWins = 0;
  for (const g of orientedGames) {
    if (g.near > g.far) nearWins++;
    else if (g.far > g.near) farWins++;
  }
  const orientedWinner: Side | null =
    winner === null ? null : mirrored ? (winner === 'near' ? 'far' : 'near') : winner;
  const base = createMatch(format === '3x21' ? FORMAT_3X21 : FORMAT_3X15, 'near', doubles);
  const lastGame = orientedGames[orientedGames.length - 1] ?? { near: 0, far: 0 };
  return {
    ...base,
    score: lastGame,
    completedGames: orientedGames,
    gamesWon: { near: nearWins, far: farWins },
    winner: orientedWinner,
  };
}
