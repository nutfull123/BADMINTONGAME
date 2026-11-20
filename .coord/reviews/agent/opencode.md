# Review of agent/opencode (t2 rules) — reviewer: Sonnet (r2)

## Standards
- src/rules/index.ts:23-31 - JUDGEMENT - config.deuceAt never read; gameWinner assumes deuceAt === pointsToWin - 1 (true for both shipped formats)
- src/rules/index.ts:78 - JUDGEMENT - deciding-game index `gamesToWin * 2 - 2` deserves a name
- HARD: none

## Spec
- all items present; final game is pushed into completedGames (index.ts:88, test at index.test.ts:212), so the ui result screen works

## Checks
npx vitest run src/rules -> pass (21 tests)
npx tsc --noEmit -> pass

APPROVE dd14723
