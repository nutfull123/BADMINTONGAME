# Cross-Review: `agent/sonnet-v2` (`9749f53` vs `main`)

## Standards
src/sim/assist.ts:13 - JUDGEMENT - Duplicated Code on racket plane dimensions - `racketInputFor` duplicates the height, lateral reach, and overhead top calculations (`T.HEIGHT[p.stats.body]`, `lateral`, `top`) from `racketHeadFor` in `src/sim/index.ts:70-72`.
src/sim/assist.ts:8 - JUDGEMENT - Duplicated Code on clamp and sgnOf helpers - `clamp` and `sgnOf` are duplicated across `src/sim/assist.ts:8-9`, `src/sim/index.ts:11-13`, and `src/sim/bot.ts:61-63`.
src/sim/tuning.ts:143 - JUDGEMENT - Primitive Obsession / Duplicated Code on mode union type - The literal union `'easy' | 'normal' | 'pro' | 'timing'` is written inline in `src/sim/tuning.ts:143` and `src/ui/index.ts:13` instead of sharing `AssistMode` from `src/sim/assist.ts:6`.
src/game/match.ts:120 - JUDGEMENT - Duplicated Code on game-speed accumulator loop - The scaled accumulator and real-time flick division (`acc += dt * speed` and `input.intent((n * STEP) / speed)`) are duplicated in `src/game/match.ts:120-126` and `src/game/tutorial.ts:351-357`.

## Spec
src/sim/assist.ts:66 - JUDGEMENT - Uncached `predictLanding(shuttle)` called each tick while shuttle is incoming in `easy` and `timing` modes - Brief (`v2.md:24`) notes for `autoRacket`: "use stepShuttle look-ahead, not every-frame predictLanding solves; cache per incoming shot if needed"; `autoRacket` itself uses `stepShuttle` look-ahead (`intercept`), while `applyAssist` calls `predictLanding(shuttle)` for movement in `easy`/`timing`.
src/ui/index.ts:643 - JUDGEMENT - `modeDesc` reuses `.bm-slider-val` class (24px bold numeric font style) for multi-line mode descriptions - Brief (`v2.md:29`) asks to "add `mode: 'easy' | 'normal' | 'pro' | 'timing'` to Settings (default 'easy') and a clear mode picker on the setup screen with Thai labels... each with a one-line description. Do not restyle anything else." Reusing `.bm-slider-val` avoids touching the stylesheet, though 24px is large for 4 description lines.

## Checks
- `git diff --stat main...agent/sonnet-v2`: only `src/sim/assist.ts`, `src/sim/assist.test.ts`, `src/sim/tuning.ts`, `src/sim/index.ts` (export-only on `racketHeadFor`), `src/game/match.ts`, `src/game/tutorial.ts`, and `src/ui/index.ts` touched (`src/types.ts` and `package.json` untouched; `src/sim/**` pure) — PASS
- `npx vitest run`: 11 passed (121 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 265ms) — PASS

APPROVE 9749f53
