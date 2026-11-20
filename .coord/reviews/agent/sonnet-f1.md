# Cross-Review: `agent/sonnet-f1` (`d821c96` vs `main`)

## Standards
src/sim/index.ts:348 - JUDGEMENT - Literal `0.3` in `spd > 0.3` instead of reusing `T.MOVING_SPEED` (which is already `0.3` in `src/sim/tuning.ts:24`) - Every new footwork number (`FOOTWORK_RECOVERY_SPAN`, `SPLIT_*`, `CHASSE_*`, `CROSSOVER_*`, `LUNGE_*`, `RECOVER_TIME`) is in `src/sim/tuning.ts:153-169` with a one-line comment; line 348 repeats the existing `0.3` moving-speed threshold inline.
src/sim/index.ts:33 - JUDGEMENT - Data Clumps / Divergent Change on `SimPlayer` and `stepPlayer` - `SimPlayer` adds 9 flat optional footwork fields (`fw`, `fwCycle`, `fwIncoming`, `splitT`, `splitDur`, `boostT`, `lungeT`, `lungeDur`, `recoverT`) and `stepPlayer` updates the footwork state machine inline alongside movement, stamina, dive, and swing collision.
src/ui/index.ts:985 - JUDGEMENT - Duplicated Code on zoom clamping constants - `ZOOM_MIN`, `ZOOM_MAX`, and `clampZoom` in `src/ui/index.ts:985-990` duplicate the zoom clamping range used by `src/render/pose.ts`.

## Spec
src/game/match.ts:40 - JUDGEMENT - Redundant cast `(renderer as { setZoom?: (z: number) => void }).setZoom?.(z)` (also in `src/game/tutorial.ts:50`) - Brief (`f1.md:26`) instructed `f1` to call `renderer.setZoom?.(z)` defensively while `render` added `setZoom` in parallel; once `render` with `setZoom` is on `main`, the cast can be simplified to `renderer.setZoom(z)`.
src/sim/index.ts:156 - JUDGEMENT - Split-step boost check `splitDur <= T.SPLIT_WINDOW` depends purely on `stats.recovery` (`splitDur = T.SPLIT_HOP_TIME * recMul`) rather than a separate human input timing - Brief (`f1.md:16`) says "If the player is on the ground and not already moving fast, they split-step; landing within a short window after the opponent's contact gives a reaction boost... Stats: recovery shortens the hop." Because the hop triggers automatically on opponent contact, whether it lands within `SPLIT_WINDOW` (0.32 s) after contact is determined by whether the player wasn't already moving fast (skipped split) and has sufficient recovery stat (`recovery >= 4`).

## Checks
- `git diff --stat main...agent/sonnet-f1`: only `src/sim/footwork.ts`, `src/sim/footwork.test.ts`, `src/sim/index.ts`, `src/sim/tuning.ts`, `src/game/match.ts`, `src/game/tutorial.ts`, `src/ui/index.ts` touched (`src/types.ts`, `src/render/**`, `package.json` untouched; `src/sim/**` pure; `footwork.ts` signatures unchanged) — PASS
- `npx vitest run`: 13 passed (146 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 222ms) — PASS

APPROVE d821c96
