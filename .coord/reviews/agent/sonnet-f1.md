# Cross-Review: `agent/sonnet-F1` (`1500773`)

## Standards
- Scope check (`git diff main...agent/sonnet-F1`): Only `src/input/**` (`index.ts`, `intent.ts`, `intent.test.ts`), `src/sim/assist.ts`, `src/sim/assist.test.ts`, `src/render/index.ts`, `src/render/pose.ts`, `src/render/pose.test.ts`, `src/game/match.ts`, `src/game/tutorial.ts`, and `src/ui/hud.ts` were touched. `src/types.ts`, `src/render/arena.ts`, `src/render/equipment.ts`, `src/app/`, `src/ui/pages/`, and `package.json` were untouched. No new dependencies were added, and `src/render/index.ts` reuses pre-allocated `shFeet`, `shFrame`, and `aimOut` objects without per-frame allocations.
- `src/game/match.ts:151-157` & `src/game/tutorial.ts:368-374` - JUDGEMENT - Duplicated Code between `match.ts` and `tutorial.ts` for applying `racketFromAim` and computing `racketVel` from `prevAim` - pre-existing loop duplication between match and tutorial modes; acceptable here since both files are small and follow the exact same frame structure.
- `src/render/pose.ts:653-656` - JUDGEMENT - Long Parameter List in `shoulderFraming(feet, bodyHeight, yaw, pitch, zoom, height, distance, out)` (8 parameters, 4 with defaults) - clear and allocation-free via the optional `out` parameter.

## Spec
- **1. Input mouse look & yaw-relative movement (`src/input/intent.ts:7-13,34-43,62-81`, `src/input/index.ts:10-13,61-62`)**: PASS.
  - When `preset === 'shoulder'`, `createInput` creates a `look` state and passes it to `buildIntent`.
  - When `look` is present and the pointer is locked, mouse deltas call `stepLook(look, mouse.dx, mouse.dy, LOOK_SENS * controls.mouseSensitivity)` instead of moving `mouse.x`/`mouse.y`.
  - Yaw is clamped to `±YAW_LIMIT` (`±100°` from facing the net) and pitch to `PITCH_MIN..PITCH_MAX` (`-15°..+70°`, up = positive).
  - Movement keys are rotated by `moveRelativeToYaw({ x: axis(b.left, b.right), z: axis(b.up, b.down) }, look.yaw)`, resolving forward/sideways relative to view yaw into court axes in `Intent.move`.
- **2. Shoulder camera, `setLook`, `aimRay`, and `shoulderFraming` (`src/render/pose.ts:643-667`, `src/render/index.ts:576-597,636-657,774`)**: PASS.
  - `shoulderFraming` places the camera behind the player's right shoulder (`SHOULDER_BACK = 2.6 m`, `SHOULDER_RIGHT = 0.45 m`, `SHOULDER_UP = 0.35 m` above head height), applies height (`SHOULDER_HEIGHT_STEP = 1`) and distance (`SHOULDER_DISTANCE_STEP = 1.5`) offsets and `1 / clampZoom(zoom)`, and computes `dir` and `lookAt` directly from `yaw`/`pitch`.
  - In `src/render/index.ts`, `shFeet` smoothly follows `near.pos` (`1 - Math.exp(-CAM_FOLLOW * dt)`, snapping on first frame via `shFollowed`), while `lookYaw`/`lookPitch` turn immediately without lag.
  - `createRenderer` exposes `setLook(yaw, pitch)` and `aimRay(): { origin: Vec3; dir: Vec3 }`.
- **3. Pure `racketFromAim` (`src/sim/assist.ts:23-37`)**: PASS.
  - Projects `reachCentre(p)` (`p.pos.y + height * 0.82`) onto the ray `(origin, dir)` with `t = Math.max(0, ...)`, clamps the offset from `reachCentre(p)` to `aimReach(p)`, and returns `racketInputFor(p, clampedPoint)`.
- **4. Match & tutorial integration (`src/game/match.ts:42-44,151-157,164,170`, `src/game/tutorial.ts:52-54,368-374,381,391`)**: PASS.
  - Both `startMatch` and `startTutorial` pass `prefs.camera.preset` to `createInput`, override `human.racket` with `racketFromAim(..., ray.origin, ray.dir)` and `human.racketVel` with `(aim - prevAim) / realDt` when `look` is active, and call `renderer.setLook(look.yaw, look.pitch)` each frame.
- **5. HUD crosshair (`src/ui/hud.ts:10,108-120`)**: PASS.
  - Renders a centered `18×18 px` circular crosshair (`data-testid="crosshair"`), visible only when `crosshair` is `'idle'` or `'target'` (i.e. in `'shoulder'` mode while unpaused and playing), turning green (`#22c55e`) when `w.aim?.onTarget` is true (`'target'`) and white (`#fff`) otherwise.
- **6. Unchanged behavior for other presets (`src/input/intent.ts:62-66,80-81`, `src/input/intent.test.ts:217-223`)**: PASS.
  - When `look` is omitted (`behindLow`, `behindHigh`, `broadcast`), `buildIntent` behaves identically to before.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ad5901cdb222d52f6`): PASS — 18 test files passed (237 tests).
- `npx tsc --noEmit` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ad5901cdb222d52f6`): PASS — exit 0.
- `npx vite build` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ad5901cdb222d52f6`): PASS — built in 272ms.

APPROVE 1500773
