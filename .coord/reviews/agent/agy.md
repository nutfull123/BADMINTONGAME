# Review of agent/agy (f2 footwork render, camera, zoom) — reviewer: Sonnet (xf2)

## Standards
- src/render/pose.ts:~58-75,~515 - JUDGEMENT - unrelated edits (removed comments, clamp helper)
- src/render/index.ts:511 - JUDGEMENT - PerspectiveCamera(50) hardcoded; use CAM_FOV_DEG
- src/render/pose.ts:~437-500 - JUDGEMENT - magic framing bounds
- HARD: none

## Spec
- split / chasse / crossover / lunge / recover poses: PASS (chasse symmetric, ignores dir — JUDGEMENT)
- camera: all four baseline corners inside view at 16:9 and 16:10, camX in [-2.59, 2.59] (reviewer projected with real THREE)
- setZoom: clamps 0.6..1.6, eased ~0.2 s

## Checks
npx vitest run -> pass (134)
npx tsc --noEmit -> pass
npx vite build -> pass

APPROVE b3733bb
