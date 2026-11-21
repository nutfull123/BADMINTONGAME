# Cross-review round 2: agy branch (fd03240) — V3 textures and HDRI — by Sonnet

## Standards
- Scope OK: only src/render/arena.ts and src/render/arena.test.ts; no new dependencies. No HARD issues.
- src/render/arena.ts:~790 — JUDGEMENT — each loaded map sets material.needsUpdate, so up to 5 recompiles at startup (once per map, not per frame).
- src/render/arena.ts:~655 — JUDGEMENT — store/slot structure slightly verbose; leave it.

## Spec
- Round 1 HARD fixed: maps assigned only in load callbacks; configureTiledTexture no longer marks needsUpdate (tested); setQuality only marks a material when its map changes; a failed file warns once and keeps the plain material.
- All V3 items met: wood maps tiled every 2 m and tinted darker than the mat; linoleum normal/roughness on the green mat; gym_01 HDRI via HDRLoader + PMREM with RoomEnvironment fallback; low loads nothing; anisotropy per quality; async; dispose frees everything incl. late loads.

## Checks
- vitest 260 pass, tsc clean, vite build pass (at fd03240).

APPROVE fd03240
