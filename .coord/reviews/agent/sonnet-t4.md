# Cross-Review: `agent/sonnet-t4` (`eca19e0` vs `main`)

## Standards
src/render/index.ts:89 - JUDGEMENT - Long Function / Divergent Change in render() - render() handles player mesh lifecycle/recreation, camera smoothing, shuttle orientation & shadow projection, landing marker, timing ring scaling/coloring, and charge arc geometry rebuilding in one function.
src/render/index.ts:90 - JUDGEMENT - Stale mesh leak if player array shrinks - view.players.forEach mutates players[i] by index, so if view.players ever has fewer entries than on a previous frame, trailing PlayerMeshes remain in the scene.
src/input/index.ts:42 - JUDGEMENT - Duplicated Code / Feature Envy on KeyState reset - Clearing keys.down, keys.pressed, keys.released, and keys.held inline on pointer-lock loss duplicates the structure of newKeyState() from intent.ts instead of using a reset helper.
src/input/index.ts:46 - JUDGEMENT - Duplicated Code in listener registration/cleanup - The 8 addEventListener calls (lines 46-53) and 8 removeEventListener calls (lines 61-68) mirror each other verbatim; an AbortController signal would remove the duplication.

## Spec
src/render/index.ts:71 - JUDGEMENT - Player capsules, racket, and shuttle use MeshBasicMaterial instead of lit materials - Brief (t4.md:24) asks for "simple lighting"; lights illuminate the floor, court, and posts (MeshLambertMaterial), while player/shuttle meshes are unlit MeshBasicMaterial (not a violation as material type is not mandated).
src/render/index.ts:111 - JUDGEMENT - camera.lookAt(camX, 1, -2) pans lookAt.x along with camera.position.x = camX rather than fixed (0, 1, -2) - Brief (t4.md:27) says "Camera behind the near baseline (about z = 10, y = 4.5) looking at (0, 1, -2); follows the near player x with smoothing (lerp ~ 5/s); the whole far court stays visible"; shifting lookAt.x with camX keeps the camera parallel to the court Z axis and at FOV 50 keeps the entire far court (x in [-3.05, 3.05], z = -6.7) well inside the view frustum.

## Checks
- `git diff --stat main...agent/sonnet-t4`: only `src/input/**` and `src/render/**` touched (`src/types.ts` and `package.json` untouched) — PASS
- `npx vitest run src/input`: 1 passed (10 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 215ms) — PASS

APPROVE eca19e0
