# Cross-review — agent/sonnet-t6 @ 1e5a4d3

Reviewer: opencode (read-only; no source edits, no commit). Fixed point: `main`, scope `src/sim` only.
Diff: `git diff main...agent/sonnet-t6 -- src/sim` → 6 files added, +1030 (`index.ts`, `shots.ts`, `tuning.ts`, three test files). `src/physics` is identical to main, `src/types.ts` and `package.json` are unchanged, and no `src/sim/bot.ts` was created.

## Standards

- src/sim/index.ts:183 - JUDGEMENT - the 0.5 m/s threshold that picks the "turn while moving" branch is an unnamed literal outside tuning.ts - it reads as a numerical guard (both branches agree at low speed) rather than a feel parameter, so I did not treat it as a breach of the "EVERY tuning number" rule; if the lead reads that rule literally, move it into tuning.ts.
- src/sim/shots.ts:47 - JUDGEMENT - the 0.2 m floor in `target()` is also unnamed outside tuning.ts - same reasoning: it is the clamp that keeps a jittered drop out of the net while the real depths live in tuning; worth naming if the one-place promise is to be exact.
- src/sim/index.ts:24-31 - JUDGEMENT - swing, cooldown and dive bookkeeping ride on `PlayerState` as optional fields of the exported `SimPlayer` - a caller that rebuilds or serialises a `PlayerState` (save, replay, network) silently loses the swing/dive state; a side table or an explicit sub-state would make the loss visible.
- src/sim/shots.ts:7-9 - JUDGEMENT - the shot solver draws spread from a module-global `rng` with a public `setRandom` - global mutable state in a module documented as pure; passing an rng through `LaunchInput` (or a seeded generator per match) would keep the sim pure and replays exact.
- src/sim/index.ts:100-283 - JUDGEMENT - `stepPlayer` is one ~180-line function covering down, dive start, jump, movement, stamina/fatigue, facing, swing, hit resolution and action selection - it works and is commented, but each concern is only reachable through a full PlayerState + Intent + ShuttleState setup.
- src/sim/index.test.ts:37-39 - JUDGEMENT - the "body fixes height" test only asserts `racketHead.y > 0`, which passes for every body - assert the three HEIGHT values (1.95 / 1.78 / 1.63) or the top reach per body.

HARD: none. Only `src/sim/**` is touched; no three.js or DOM; imports are `../types`, `../physics` and sim-local modules; no new dependencies; the feel parameters (speeds, reaches, charges, costs, angles, depths, get-up) are all in `tuning.ts` with comments.

## Spec

- src/sim/index.ts:89-98 - JUDGEMENT - extra export `recoverBetweenPoints(p, at)` is not in src/types.ts or the t6 brief - justified: the design doc says stamina "regenerates slowly in rallies and partly between points" (docs/superpowers/specs/2026-11-20-badminton-demo-design.md:47-48), and the brief's stamina line omits it; the teleport/reset goes a little beyond stamina but gives the game loop one place to reset between points.
- src/sim/index.ts:9 - JUDGEMENT - extra export `setRandom(f)` - justified: the solver adds up to 0.8 m depth and 3° angle jitter, so "clear lands deep" and "drop lands short" would be flaky without pinning the rng; keep it test-only or inject the rng (see Standards).
- src/sim/index.ts:74 - JUDGEMENT - the serve 1.15 m limit is applied to the racket head, while the launch starts at the shuttle's closest point, so at high assist a serve can be contacted above 1.15 m (racket 1.15, shuttle up to +0.8 m) - the test at src/sim/swing.test.ts:229 only checks `racketHead.y`; if the brief means the shuttle, clamp or reject the contact.
- Everything else matches the quoted lines: tall reaches farther (lateral 1.07 vs 0.75 m, top 2.69 vs 2.27 m) and is slower (0.92 vs 1.08 top speed, 0.7 vs 1.25 accel, 0.55 vs 1.3 turn); charging moves at 60%; wrong-side Q/E is weak (under 0.7x speed, lobbed 2.5 m past the net, never perfect); netShot picks kill above the tape / tumble below / push when racketVel.y >= 3; serves land just past the short service line or near the back line; get-up presses are exactly max(4, round(12 - 0.8 * recovery)); charge, jump and dive drain stamina, it regenerates, fatigue builds and decays; every item in the brief's check list has a test.

## Checks

- `npx vitest run src/sim` in /Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a4ad935dd048a735d → 3 files, 48 tests passed, exit 0.
- `npx tsc --noEmit` in the same worktree → exit 0.
- Worktree clean at 1e5a4d3; this review changed no code.

APPROVE 1e5a4d3
