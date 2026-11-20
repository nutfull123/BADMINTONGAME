# Cross-review — agent/sonnet-t3 @ b8281ee

Reviewer: opencode (read-only; no source edits, no commit). Fixed point: `main`.
Diff: `git diff main...agent/sonnet-t3` → 2 files added, +178: `src/physics/index.ts`, `src/physics/index.test.ts`.

## Standards

- src/physics/index.ts:40 - JUDGEMENT - net events (and floor, :46) return `vel: nv`, the velocity at the end of the substep, not at the contact fraction used for the position - a bounce, roll or impact effect that reads `state.vel` after an event gets a velocity up to 1/240 s stale; interpolate `vel` with the same `t` as the contact point.
- src/physics/index.ts:37 - JUDGEMENT - the net crossing test needs `pos.z` strictly > 0 or < 0, so a state already exactly on z = 0 is never tested and tunnels through - no current caller does this, but a hit point or a restored state on the plane would pass silently; treat `pos.z === 0 && np.z < 0` as a crossing at t = 0.
- src/physics/index.ts:62 - JUDGEMENT - `predictLanding` returns null both for a net hit (:59) and for "not landed within 5 s", while src/types.ts:53 documents null as "hits the net" - the caller cannot tell the two apart; harmless for the landing marker (it just hides), but the contract is looser than the comment states.

No HARD issue: only `src/physics/**` is touched; `src/types.ts` and `package.json` are unchanged; no three.js or DOM imports (only `import type` from `../types`); no new dependencies; `COURT` matches src/types.ts:48-51 exactly.

## Spec

- src/physics/index.test.ts:30 - JUDGEMENT - the brief's check item "a 25 m/s 50-degree clear from z = 6 lands at z < -4" is delivered with 50 m/s instead - verified independently with the mandated model (k = g/6.8², semi-implicit Euler at 1/240 s): 25 m/s from z = 6 lands at z ≈ -1.99 from y = 2.5, and never past z ≈ -2.51 even from y = 100; the minimum speed at y = 2.5 is ≈ 46 m/s, and 50 m/s lands at z ≈ -4.27. The builder's reasoning holds: the brief's number is impossible under vt = 6.8, so this is a defect in t3.md, not in the code. claude should amend the brief.
- No other missing, extra or wrong behaviour against the quoted task lines: gravity + quadratic drag with k = g/vt², substeps ≤ 1/240 s, net plane z = 0 over x ∈ [-3.05, 3.05] with the top interpolating 1.524 at x = 0 to 1.55 at the posts, floor at y ≤ 0 with in-substep contact, `predictLanding` over 5 s with the same integrator, singles bounds with lines in, and the near-right = +x / far-right = -x service-box split all match.
- Net height and floor interpolation checked by hand and by simulation: a crossing at y = 1.2 is a net at x = 3.04 and a floor at x = 3.06 (posts at ±3.05); the floor test at src/physics/index.test.ts:46 rejects both a no-interpolation (z = 2.0) and an end-of-substep (z ≈ 1.95) implementation, so it genuinely tests the interpolation.

## Checks

- `npx vitest run src/physics` in /Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a26c264e5d3c9f35a → 1 file, 11 tests passed, exit 0.
- `npx tsc --noEmit` in the same worktree → exit 0.
- Worktree is clean at b8281ee; this review changed no code.

APPROVE b8281ee
