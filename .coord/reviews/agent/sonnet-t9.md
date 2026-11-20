# Review of agent/sonnet-t9 (t9 tutorial: written by opencode, finished by Sonnet) — reviewer: Sonnet (r9)

## Standards
- src/game/tutorial.ts:20-28 - JUDGEMENT - dropEdges / heldShuttle copied from match.ts / rally.ts
- src/game/tutorial.ts:46-373 - JUDGEMENT - setup + fixed-step loop near-copy of match.ts (follow-up: shared loop helper)
- src/tutorial/drills.ts:44,78-79 - JUDGEMENT - Drill.keys unused; successesNeeded constant everywhere
- src/tutorial/state.ts:19-31 - JUDGEMENT - interface mirrors single class; attempts counted but unused
- HARD: none

## Spec
- src/game/tutorial.ts:297-314 - minor - R replays the current drill only; earlier drills not reachable from UI
- src/game/tutorial.ts:177-187 - minor - dive drill: hitting instead of diving waits 10 s and counts a failure
- order, 3 successes, 8 drills all match

## Checks
npx vitest run -> pass (116)
npx tsc --noEmit -> pass
npx vite build -> pass

APPROVE 6b8bb3e
