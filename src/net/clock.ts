// Estimates the server tick from 'pong' messages so the client knows which tick it is showing. Pure: the caller
// passes the local clock in milliseconds (performance.now()), so tests need no timers.
import { TICK_HZ } from './protocol';

const MS_TO_TICKS = TICK_HZ / 1000;
const ALPHA = 0.15;        // weight of a new sample in the smoothed offset and rtt
const OUTLIER = 1.5;       // a sample slower than this x the smoothed rtt (plus a margin) is a queued packet: skip it
const OUTLIER_MARGIN_MS = 15;
const SNAP_TICKS = 40;     // an estimate this far off (server restart, tab sleep) is replaced, not smoothed

export interface Clock {
  offset: number | null; // serverTick - localMs * MS_TO_TICKS (smoothed); null until the first sample
  rtt: number;           // smoothed round-trip time in ms
}

export const createClock = (): Clock => ({ offset: null, rtt: 0 });

// `sentAt` is the local time the ping carried back in the pong, `now` the local time the pong arrived.
export function clockSample(c: Clock, sentAt: number, serverTick: number, now: number): Clock {
  const rtt = Math.max(0, now - sentAt);
  // the server stamped serverTick about rtt/2 after the ping left, so it is rtt/2 old on arrival
  const offset = serverTick + (rtt / 2) * MS_TO_TICKS - now * MS_TO_TICKS;
  if (c.offset === null) return { offset, rtt };
  if (Math.abs(offset - c.offset) > SNAP_TICKS) return { offset, rtt };
  if (rtt > OUTLIER * c.rtt + OUTLIER_MARGIN_MS) return c;
  return { offset: c.offset + (offset - c.offset) * ALPHA, rtt: c.rtt + (rtt - c.rtt) * ALPHA };
}

// Before the first pong a snapshot's tick gives a rough start (it is one-way late; the pongs correct it).
export function clockSeed(c: Clock, serverTick: number, now: number): Clock {
  return c.offset === null ? { offset: serverTick - now * MS_TO_TICKS, rtt: c.rtt } : c;
}

// The server tick right now (fractional), or null before any sample.
export function serverTickAt(c: Clock, now: number): number | null {
  return c.offset === null ? null : c.offset + now * MS_TO_TICKS;
}
