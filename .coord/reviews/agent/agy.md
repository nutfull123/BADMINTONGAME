# Review of agent/agy (t5 ui) — reviewer: Sonnet (r5)

## Standards
- src/ui/index.ts:3 - JUDGEMENT - STAT_BUDGET redeclared in ui; should come from sim once merged (fix at t8 integration)
- src/ui/index.ts:~600-680 - JUDGEMENT - duplicated DOM code for side boxes and bars
- src/ui/index.ts:15-27 - JUDGEMENT - extra exports (PRESETS, DEFAULT_SETTINGS, clampStatToBudget, StatKey)
- HARD: none

## Spec
- showResult uses match.completedGames; verify at integration that the final game is included
- all other t5 items present

## Checks
npx vitest run src/ui -> pass (4 tests)
npx tsc --noEmit -> pass

APPROVE 9a7ec57
