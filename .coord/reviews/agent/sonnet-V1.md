# Cross-Review: `agent/sonnet-V1` (`76ceb2b`)

## Standards
- Scope check (`git diff main...agent/sonnet-V1`): Only `src/render/index.ts`, `src/render/characters.ts`, and `src/render/characters.test.ts` were touched. `src/render/arena.ts`, `src/render/equipment.ts`, `src/types.ts`, `public/assets/`, and `package.json` were untouched. No new dependencies were added.
- Per-frame allocation check: `src/render/characters.ts:183-186` pre-allocates `choice`, `P`, `C`, `D`, `T`, `S`, `E`, `W`, `dq`, `wq`, and `pq` once at module level and reuses them in `updateCharacter`, `reachGrip`, and `aimBone`. Shirt materials are cloned once per character instance in `createCharacter` (`src/render/characters.ts:149`) and re-tinted in `tintShirt` only when `side` or `slot` changes (`src/render/characters.ts:216-220`).
- `src/render/index.ts:276-433` - JUDGEMENT - Capsule limb transforms in `updateHumanRig` are still computed after `rig.body.visible = !ch` hides the capsule group - `updateHumanRig` still needs `pose`, `shoulderR`, `gripTarget`, `poleHint`, and `racketGroup` orientation for the real character and human marker, and keeping the capsule leg/arm updates avoids branching the rig math at negligible CPU cost.
- `src/render/characters.ts:226-234` - JUDGEMENT - Long Parameter List in `updateCharacter(c, p, dt, yaw, hipYOffset, grip, pole)` (7 parameters) - internal module boundary called at a single site (`src/render/index.ts:447`), keeping `characters.ts` decoupled from `HumanRig`.

## Spec
- **1. GLB loading, `SkeletonUtils.clone`, `AnimationMixer`, gender selection, height scaling, and shirt tinting (`src/render/characters.ts:34-38,92-113,141-181,216-220,255`)**: PASS.
  - `loadCharacterTemplates()` loads `/assets/characters/male_casual.glb` and `/assets/characters/female_casual.glb` once asynchronously with `GLTFLoader`.
  - `createCharacter()` clones each rig with `cloneSkinned` (`SkeletonUtils.clone`), sets `frustumCulled = false` on skinned meshes, clones `*_Body_1` shirt materials per instance, and creates a dedicated `THREE.AnimationMixer`.
  - `modelFileFor(gender)` picks the male or female GLB; `m.scale.setScalar(heightScale(heightOf(p.stats), c.modelHeight))` scales the model to match `heightOf(p.stats)`; `tintShirt` tints the instance's cloned shirt materials with `teamColor(p.side, p.slot)`.
- **2. Pure `clipFor`, directional clips, `Roll`, upper-body swing overlay, and `0.15 s` crossfade (`src/render/characters.ts:13-30,57-80,101-103,237-249`)**: PASS.
  - `clipFor(p)` returns `Idle` when still (`speed <= MOVING_SPEED`), `Run` / `Run_Back` / `Run_Left` / `Run_Right` from velocity projected onto the player's facing axes (for both `near` and `far` sides), with `timeScale` clamped in `0.5..1.6`.
  - Returns `Roll` (`THREE.LoopOnce`, `clampWhenFinished = true`) when `p.action === 'diving' || p.action === 'down'`.
  - Sets `swing: true` when `p.action === 'swinging'`, playing the upper-body filtered `Sword_Slash` clip (`isUpperBodyTrack`) with ramped weight (`swingWeight`).
  - Crossfades base clips over `CROSSFADE = 0.15` seconds (`fadeIn(0.15)` / `fadeOut(0.15)`).
- **3. Right-arm two-bone IK to racket grip (`src/render/characters.ts:189-214,259`, `src/render/index.ts:321-359,447`)**: PASS.
  - After `c.mixer.update(dt)` and `m.updateMatrixWorld(true)`, `reachGrip` reads world positions of `UpperArmR`, `LowerArmR`, and `WristR`, solves two-bone IK with `solveTwoBoneIK` toward `gripTarget` (`0.44 m` down the shaft from `p.racketHead`) with `poleHint`, stretches the upper arm up to `MAX_ARM_STRETCH = 1.35` when needed, and rotates `UpperArmR` and `LowerArmR` via `aimBone`. Racket placement (`rig.racketGroup`) is unchanged.
- **4. Human marker, team colours, `rigVisibility`, facing, capsule fallback, and safe `dispose` (`src/render/index.ts:304-305,436-447,592-597,659-665,789-807`)**: PASS.
  - Human marker (`rig.marker`), team colours, `rigVisibility(view.players.length)`, and near/far `yaw` facing are preserved.
  - Capsule rigs (`rig.body`) remain visible while `templates === null` and if `loadCharacterTemplates()` rejects (which logs a single `console.warn`).
  - `dispose()` sets `disposed = true` before traversing and disposing scene geometries/materials, so a late load completion after `dispose()` is safely ignored.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a743aa76b9da917f4`): PASS — 21 test files passed (272 tests).
- `npx tsc --noEmit` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a743aa76b9da917f4`): PASS — exit 0.
- `npx vite build` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a743aa76b9da917f4`): PASS — built in 611ms.

APPROVE 76ceb2b
