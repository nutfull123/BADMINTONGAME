# Cross-review: agent/sonnet-N1 (d6a821f) — N1 authoritative game server — by agy

## Standards
- Scope OK: only `server/**` (10 files), `tsconfig.server.json`, `vite.server.config.ts`, `Dockerfile`, `.dockerignore`, `fly.toml`, `docs/deploy.md`, `package.json` (`build:server` and `start:server` scripts only), and the minimal optional `seen` hook in `src/game/rally.ts` were touched (18 files, +1803/-7 lines). `src/net/protocol.ts`, `src/types.ts`, `src/ui/`, `src/render/`, `src/input/`, `src/account/`, and dependencies are untouched. No secrets, keys, or real URLs anywhere.
- `tsconfig.server.json:16` — JUDGEMENT — includes the whole `"src/net"` directory instead of `"src/net/protocol.ts"`; once N2 (`src/net/connection.ts`, which uses browser `WebSocket` and `import.meta.env`) is merged with N1, `tsc -p tsconfig.server.json` (which omits `"DOM"`) will fail unless narrowed to `"src/net/protocol.ts"`.
- `server/rooms.ts:188` — JUDGEMENT — `onEnd` sets `room.status = 'finished'` with no transition back to `'lobby'`; after a match ends, `start`/`ready`/`seat`/`settings` all reject with `'The match has already started'`, so returning to the room for a rematch requires a new room unless `onEnd` resets ready states and returns `status` to `'lobby'` (or allows restarting from `'finished'`).
- `server/rooms.ts:7` — JUDGEMENT — imports `PRESETS` from `../src/ui/model` (pure, no DOM, compiles under `tsconfig.server.json`), echoing the existing `PROGRESS.md` follow-up to move `PRESETS` to a shared pure module.
- `server/index.ts:112-113` — JUDGEMENT — fixed 1 s window rate limiter (`now - windowStart >= 1000`) allows a brief 2× burst across a window boundary; acceptable for 120 msg/s gameplay traffic, though a sliding/token-bucket limiter would be smoother.

## Spec
- All requirements from `.orchestra/briefs/N1.md` and both mid-task corrections are satisfied:
  - **Trust boundary (`server/protocol.ts`)**: `parseClientMessage` enforces `MAX_RAW` (32 KB), finite numbers, integer bounds, clamped intent axes (`-1..1`), `1..MAX_INPUT_FRAMES` frames, 6-char code alphabet without `0/O/1/I/L`, name length ≤ 24 without control chars, `validateStats(stats, 40)`, and valid `RoomSettings`. Hostile inputs return `null` and cannot crash the server.
  - **Auth (`server/auth.ts`)**: `verifyToken` uses `supabase-js` `auth.getUser(token)` with `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `process.env`, catches network errors cleanly, and is injectable via `makeVerifier`.
  - **Rooms (`server/rooms.ts`)**: 6-char unique codes, create/join/seat/host-only settings/ready/start, private rooms mix genders freely (no gender check on `seat`/`start`, while `botStats` still fits the event including XD), `'twenty'` scales stats to ≤ 20 preserving shape, host hand-over on leave, 30 s `rejoin` window with bot holding the seat and 128-bit `resumeToken` verified against `userId`, empty rooms close. Users cannot read or control other seats or spoof identity.
  - **Match loop & client contract (`server/match.ts`)**: real fixed-step `STEP = 1/120` accumulator (`MAX_CATCH_UP = 0.25` s), raw world-axis intents with server-side `applyAssist` and `aimServe`, 1 frame/tick, `ackSeq` = last applied `seq`, `lastSeq`/`ackSeq` preserved across `detach`/`attach` rejoin, inputs ignored/unacked outside `'serve'`/`'rally'`, 30 Hz snapshots carrying full sim `Rally`/`MatchState`, `'end'` on win, no slow motion, bounded `MAX_FRAME_BACKLOG = 128` and `ShuttleHistory` (`REWIND_MAX_TICKS + 1`).
  - **Lag compensation (`src/game/rally.ts`, `server/match.ts`)**: optional `seen` hook in `stepRally` leaves offline play byte-for-byte identical when omitted (`view = null`, `stepShuttle` runs once); online rewinds only during swings, strictly clamped to `0..REWIND_MAX_TICKS` (future ticks return `null`, history cleared each rally), and fast-forwards the launched shuttle to the current tick.
  - **Server process (`server/index.ts`)**: `GET /healthz`, `ws` with `maxPayload = 64 KB`, `Origin` check against `ALLOWED_ORIGINS` (localhost-only when unset), `hello` handshake with `PROTOCOL_VERSION` and 5 s timeout, serialized async message chain, 120 msg/s rate limit (`error` + close `1008`), ping/pong, and clean `SIGTERM` shutdown (`1012` + room cleanup).
  - **Build & deploy (`tsconfig.server.json`, `vite.server.config.ts`, `package.json`, `Dockerfile`, `.dockerignore`, `fly.toml`, `docs/deploy.md`)**: `node:22-alpine` non-root `USER node`, `fly.toml` matches `sin` / port `8080` / `auto_stop_machines = "stop"` / `min_machines_running = 0` / `/healthz`, and `docs/deploy.md` in Thai matches `Dockerfile` and `fly.toml` step-for-step.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a0580cf9aa663ccd4`): **PASS** — 34 test files passed, 468 tests passed.
- `npx tsc --noEmit`: **PASS** — exit 0.
- `npx tsc --noEmit -p tsconfig.server.json`: **PASS** — exit 0.
- `npx vite build`: **PASS** — exit 0 (`dist/assets/index-fCe99zU4.js` 846.53 kB).
- `npm run build:server`: **PASS** — exit 0 (`dist-server/index.js` 71.64 kB).

APPROVE d6a821f
