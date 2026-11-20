# Cross-Review: `agent/sonnet-D4` (`f085ed6` vs `main`)

## Standards
src/render/pose.ts:6 - JUDGEMENT - Speculative Generality / unused `BODY_HEIGHT` export - `src/render/index.ts` now uses `heightOf(p.stats)` from `src/sim/tuning.ts`, leaving `BODY_HEIGHT` in `pose.ts` unused in production code (only referenced by `pose.test.ts`).
src/ui/events.ts:11 - JUDGEMENT - Mysterious Name (`FOR`) - Constant `FOR` in `events.ts` is named after a preposition rather than a descriptive noun like `EVENTS_BY_GENDER`.
src/ui/index.ts:489 - JUDGEMENT - Duplicated Code on setup button-row creation - `genderRow` (`src/ui/index.ts:489-505`), `eventRow` (`src/ui/index.ts:512-525`), and `presetRow` (`src/ui/index.ts:577-587`) repeat button construction, dataset wiring, click listeners, and `.bm-btn-active` toggling across three loops.
src/render/index.ts:643 - JUDGEMENT - Stale comment - Comment says `// Pre-allocate two human player rigs once and reuse every frame` above `Array.from({ length: MAX_RIGS }, ...)` which pre-allocates 4 rigs.

## Spec
src/render/index.ts:758 - JUDGEMENT - Racket aid (`view.aim`) reads pre-computed coordinates from `view.aim` rather than deriving them from `followedPlayer` inside `render` - Brief (`D4.md:35-36`) says "The camera follow, timing ring, charge arc and racket aid use view.players[view.human] (fallback: the first near player)"; `view.aim` is computed by the caller (`game/match.ts`) for the human player, while `render` uses `near = followedPlayer(view.players, view.human)` for the human marker, camera follow, timing ring, and charge arc.

## Checks
- `git diff --stat main...agent/sonnet-D4`: only `src/render/**` and `src/ui/**` touched (`src/types.ts` and `package.json` untouched; `src/render/pose.ts` and `src/ui/events.ts` pure) — PASS
- `npx vitest run`: 14 passed (158 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 235ms) — PASS

APPROVE f085ed6
