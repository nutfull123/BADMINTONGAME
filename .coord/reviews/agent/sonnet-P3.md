# Cross-Review: `agent/sonnet-P3` (`46db34c` vs `main`)

## Standards
src/render/pose.ts:449 - JUDGEMENT - Duplicated Code / unused `computeCameraFraming` in production - `computePresetFraming` replaces `computeCameraFraming` in `src/render/index.ts:700`, leaving `computeCameraFraming` only called by legacy unit tests while duplicating aspect/FOV, horizontal sideline scaling, `lookY = 0.4`, `followX`, and zoom scaling.
src/render/pose.ts:602 - JUDGEMENT - Mysterious Name in `computePresetFraming` - Single-letter variables (`a`, `r1`, `r2`, `s`, `h`, `d`) in the 2x2 projection solver are terse compared to the surrounding code.
src/render/index.ts:713 - JUDGEMENT - Redundant per-frame buffer updates when `extras === false` - In `low` quality (`extras = false`), `shadow`, `dropLine`, and `trailLine` are invisible, but `render()` still updates `shadow.position`/`scale`, `dropLinePositions`, and `trailGeo` attributes every frame.
src/game/match.ts:35 - JUDGEMENT - Duplicated Code on startup preference wiring - Reading `loadSave().settings` and configuring `renderer.setCamera`, `renderer.setQuality`, `createInput(..., prefs.controls)`, and `prefs.assists.racketAid` are duplicated verbatim in `src/game/match.ts:35-44,133` and `src/game/tutorial.ts:45-54,275`.

## Spec
src/game/match.ts:44 - JUDGEMENT - `createViewControls(root, (z) => renderer.setZoom(z))` is created after `renderer.setCamera(prefs.camera)` - On current `main`, `createViewControls` calls `onZoom(1)` on initialization, which overwrites the starting zoom set by `renderer.setCamera(prefs.camera)` until `createViewControls` in `src/ui/index.ts` (outside P3's scope, updated in P2) initializes its zoom from `loadSave().settings.camera.zoom`.

## Checks
- `git diff --stat main...agent/sonnet-P3`: only `src/render/**`, `src/input/**`, `src/game/match.ts`, and `src/game/tutorial.ts` touched (`src/types.ts`, `src/ui/`, `src/app/`, `package.json` untouched; no new meshes per frame; frozen `DEFAULT_KEYS` not mutated) — PASS
- `npx vitest run`: 16 passed (212 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 232ms) — PASS

APPROVE 46db34c
