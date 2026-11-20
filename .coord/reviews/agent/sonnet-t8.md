# Cross-Review: `agent/sonnet-t8` (`25748c1` vs `main`)

## Standards
src/game/match.ts:108 - JUDGEMENT - Duplicated Code on chargeLevel calculation - `chargeLevel(rally.near, human.chargeTime)` (with the `human?.charging` check) is computed in both `view()` (`src/game/match.ts:108`) and `frame()` (`src/game/match.ts:130`).
src/game/match.ts:89 - JUDGEMENT - Feature Envy on Rally state in tick() - `tick()` inspects `rally.stage`, `rally.server`, `rally.near`, `rally.far`, and `rally.shuttle` to apply `aimServe` and `serving` flags before calling `stepRally`.
src/game/tutorial.ts:4 - JUDGEMENT - Middle Man / Speculative Generality in startTutorial - `startTutorial` forwards directly to `startMatch` with `'Tutorial coming soon'`, adding temporary `notice` / `NOTICE_TIME` / `noticeLeft` plumbing in `match.ts` as a hook for `t9`.

## Spec
src/game/match.ts:29 - JUDGEMENT - Bot stats use the preset for a randomly chosen body type (`PRESETS[randomBody]`) rather than an arbitrary random 20-point stat split - Design spec (`2026-11-20-badminton-demo-design.md:49-50`) says "Uses the same stat system, random body type"; picking a random `BodyType` from `PRESETS` uses the 20-point stat system and a random body type.
src/game/match.ts:85 - JUDGEMENT - `createBot(settings.botLevel)` is called again at the start of each rally - `botIntent` already resets its per-rally state on a dead shuttle or serve, so re-instantiating `Bot` per rally is redundant (though harmless).

## Checks
- `git diff --stat main...agent/sonnet-t8`: only `src/game/**` and `src/main.ts` touched (`src/types.ts` and `package.json` untouched; `src/game/rally.ts` has no DOM or `three` imports) — PASS
- `npx vitest run`: 9 passed (107 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 253ms) — PASS

APPROVE 25748c1
