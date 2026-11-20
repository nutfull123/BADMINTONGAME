# Cross-Review: `agent/sonnet-D3` (`cb12b91` vs `main`)

## Standards
src/sim/bot.ts:191 - JUDGEMENT - Duplicated Code on `topSpeedOf` formula - `topSpeedOf` duplicates the base top speed calculation (`T.BASE_TOP_SPEED * (1 + ((p.stats.speed - T.STAT_MAX / 2) / (T.STAT_MAX / 2)) * T.SPEED_STAT_SPAN) * T.BODY_SPEED[p.stats.body]`) from `src/sim/index.ts:211-213`.
src/sim/bot.ts:203 - JUDGEMENT - Duplicated Code on `flightTime` simulation - `flightTime(s)` integrates `stepShuttle` until floor/net right after `predictLanding(shuttle)` (`src/sim/bot.ts:339`) already stepped the trajectory.
src/sim/bot.ts:71 - JUDGEMENT - Data Clumps on `Bot` doubles fields - Doubles state (`owns`, `attacking`, `firstShot`, `receiverLatch`, `hold`) is flattened directly onto `Bot` alongside singles fields.

## Spec
src/sim/bot.ts:171 - JUDGEMENT - `computeServeFlickX` uses `COURT.halfLength` (6.70 m) for `serveLong` target depth even when `mate !== null` (doubles) - In doubles (`doublesShortServeChance: 0.85`), 85% of serves are `serveShort`, and the remaining 15% `serveLong` inherit `src/sim/shots.ts`'s `COURT.halfLength` target depth calculation; `computeServeFlickX` only computes lateral flick angle, which still aims into the diagonal service box width.
src/sim/bot.ts:348 - JUDGEMENT - `mayReturn = ctx.receiving || bot.receiverLatch` supports both conventions for `ctx.receiving` during `serveFlight` - `game/rally.ts` keeps `ctx.receiving` true through `serveFlight`, while `bot.receiverLatch` also latches `ctx.receiving` during the held-shuttle serve stage, so both `game/rally.ts` and `bot.test.ts` work seamlessly.

## Checks
- `git diff --stat main...agent/sonnet-D3`: only `src/sim/bot.ts` and `src/sim/bot.test.ts` touched (`src/types.ts` and `package.json` untouched; `src/sim/**` pure; all bot numbers in `BOT_TUNING`) — PASS
- `npx vitest run`: 15 passed (189 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 310ms) — PASS

APPROVE cb12b91
