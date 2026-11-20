# Review of agent/claude-serve-aim (serve stance + live shuttle target) — reviewer: Sonnet

## Standards
- src/game/rally.ts:84 - JUDGEMENT - clamp/isServe redefined locally (matches repo convention)
- HARD: none

## Spec
- serviceBox correct for near/far x right/left; isInServiceBox behaviour unchanged (lines and centre line in)
- receiver uses the diagonal box; freeze driven by the server's intent covers a bot receiver too
- placeFeet keeps hidden SimPlayer fields and carries the racket head; free movement after the serve is struck
- rally.ts:87 - JUDGEMENT - ~1/120 s gap between release and hit resolve where feet are only clamped, not frozen
- aimView: live shuttle while moving toward the player; null when held or leaving; radius matches the sim (<=)
- JUDGEMENT - no direct unit test for serviceBox or the tutorial serve path

## Checks
npx vitest run -> pass (150)
npx tsc --noEmit -> pass
npx vite build -> pass

APPROVE 8f7499e
