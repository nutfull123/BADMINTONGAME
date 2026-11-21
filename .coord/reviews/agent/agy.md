# Cross-review: agy branch (833179e) — V2a indoor hall — by Sonnet

## Standards
- Scope OK: only src/render/arena.ts and src/render/arena.test.ts; no new dependencies; 3 real lights, no shadows.
- src/render/arena.ts:575-579 — JUDGEMENT — medium half is row-major per stand, so only rows 0-1 fill and the back tiers stay empty — interleave rows too.
- src/render/arena.ts:585 — JUDGEMENT — sway freezes if elapsed goes backwards — reset lastSwayUpdate when elapsed < it.
- src/render/arena.ts:438-447 — JUDGEMENT — empty catch hides PMREM failures — console.warn.

## Spec
- src/render/arena.ts:185-208 — HARD — side ad board at x=±5.6, z=6.2 (width 3.8) spans z 4.3..8.1, inside the near camera corridor |x|<6, z>6.7 — end the last board at z<=6.7; arena.test.ts:105 checks only board centres, test the extent.
- src/render/arena.ts:401 — JUDGEMENT — wood floor 0x9b7046 is brighter than the mat 0x1f7a4f; the court must stay the brightest area — darker, less saturated floor.
- Everything else OK: contract, heights, inward single-sided shell, PMREM RoomEnvironment, instancing, sway 4.5 Hz without allocation, fictional names, quality levels, 8 draw calls, dispose.

## Checks
- vitest 233 pass, tsc clean, vite build pass (at 833179e).

CHANGES
