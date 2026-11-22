# Cross-review: agent/sonnet-N2 (eb3b3c9) — N2 online client core — by agy

## Standards
- Scope OK: only `src/net/{clock,connection,interpolation,mirror,prediction}{,.test}.ts`, `src/game/onlineMatch{,.test}.ts`, and `src/account/auth.ts` (`getAccessToken` only) were touched (13 files, +1286 lines). `src/net/protocol.ts`, `src/types.ts`, `server/`, `src/ui/pages/`, `src/game/index.ts`, `src/render/`, and `package.json` are untouched; no new dependencies.
- Purity OK: `src/net/clock.ts`, `src/net/prediction.ts`, `src/net/interpolation.ts`, and `src/net/mirror.ts` contain zero DOM, `WebSocket`, or timer references.
- `src/net/clock.ts:24-25` — JUDGEMENT — `Math.abs(offset - c.offset) > SNAP_TICKS` is checked before the RTT outlier filter (`rtt > OUTLIER * c.rtt + OUTLIER_MARGIN_MS`), so a single huge queued-packet spike (>666 ms RTT) would snap the clock instead of being skipped as an outlier.
- `src/net/connection.ts:152-165` — JUDGEMENT — if `conn.close()` is called while `reopen()` is awaiting `welcome`, nulling `s.onclose` leaves the `welcomeTimeoutMs` (10 s) timer running until timeout before `reopen()` settles; clearing the pending open timer in `close()` would avoid the dangling timer.
- `src/net/connection.ts:54-56` — JUDGEMENT — `parseServerMessage` for `'room'` checks `isObj(m.room)` and `Array.isArray(m.room.seats)`, but does not validate `typeof m.room.code === 'string'`, `isObj(m.room.settings)`, or `m.you` being a valid seat index `0..3` before casting.
- `src/game/onlineMatch.ts:187-193` — JUDGEMENT — `onClose` resets `dropAt = performance.now()` on every drop, so a socket that repeatedly connects and drops before a `'snap'`/`'room'` arrives can extend past the 30 s reconnect window instead of measuring from the first drop.

## Spec
- All items from `.orchestra/briefs/N2.md`, `Phase 6 detail`, and `.coord/research/online-rooms.md` (section 2) are implemented and covered by unit tests:
  - `src/net/connection.ts`: `gameServerUrl()` reads `VITE_GAME_SERVER_URL` (`null` when missing); `connect(url, token, character)` sends `'hello'` with `PROTOCOL_VERSION`, exposes typed `send`/`onMessage`/`onClose`/`close`/`reopen`, pings every 2 s, and drops malformed server JSON with a single warning.
  - `src/net/clock.ts`: smoothed server-tick and RTT estimation from `'pong'` with snapshot seeding before the first pong; converges under noisy pongs.
  - `src/net/prediction.ts`: local `stepPlayer` at `TICK_HZ`, `seq`-buffered inputs, snapshot reconciliation dropping `seq <= ackSeq` and replaying the rest, blending small errors (`BLEND_TAU = 0.1`) and snapping large ones (`SNAP_DISTANCE = 1.0`).
  - `src/net/interpolation.ts`: snapshot ring buffer returning interpolated remote players and shuttle at `interpDelayTicks` (at least 2 snapshot intervals back), stepping shuttle briefly via `stepShuttle` and holding when snapshots stop.
  - `src/net/mirror.ts`: 180-degree court mirroring (positions, velocities, facing, footwork direction, sides, match score) and intent un-mirroring with exact round-trip tests.
  - `src/game/onlineMatch.ts`: `startOnlineMatch` mirrors `match.ts` (renderer, input, HUD, viewControls, camera presets, room assists, shoulder look, no slow motion), sends `'input'` at ~60 Hz in batches of at most `MAX_INPUT_FRAMES` tagged with the shown render tick, builds `WorldView` from prediction + interpolation + mirror, renders mirrored scoreboard, handles `'end'`, displays `"Reconnecting..."` and attempts `'rejoin'` with `resumeToken` for 30 s, and disposes all resources on exit.
  - `src/account/auth.ts`: adds `getAccessToken(): Promise<string | null>`.
- No missing requirements and no scope creep.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a0dd00c62e3e2cec8`): **PASS** — 35 test files passed, 398 tests passed.
- `npx tsc --noEmit`: **PASS** — exit 0.
- `npx vite build`: **PASS** — exit 0 (`dist/assets/index-DFS7FpJj.js` 846.41 kB).

APPROVE eb3b3c9
