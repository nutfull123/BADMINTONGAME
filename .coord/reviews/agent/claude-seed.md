# Review of agent/claude-seed (seeded four-bot rally tests) — reviewer: Sonnet

## Standards
- test-only change in src/game/rally.test.ts; no production code
- src/game/rally.test.ts:272,292 - JUDGEMENT - setRandom reset skipped if an assertion throws; afterEach would be sturdier

## Spec
- LCG correct, values in [0, 1); original assertions kept
- removes the artificial 0.5 stalemate (bots never miss); real play uses Math.random

## Checks
npx vitest run -> pass (181)
npx tsc --noEmit -> pass

APPROVE b3ed98a
