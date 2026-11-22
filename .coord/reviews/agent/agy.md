# Cross-review: agy branch (f19fbb0) — K2 career pages, bracket view, match wiring — by Sonnet

## Standards
- Scope OK: only src/ui/** and src/game/** (+tests); no new dependencies; no window.confirm/alert/prompt; abandon confirm is in-page (career.ts:285-335). No HARD issues.
- src/game/index.ts:~100-180 — JUDGEMENT — end-of-match orchestration (awardPoints, recordHumanResult, finishTournament, bonus, setCareer) is an untested inline closure — extract a pure applyCareerResult(save, charId, tournament, outcome) and test the player as entrant a and b.
- src/ui/labels.ts (roundNameFor / ROUND_ORDER_FROM_FINAL) — JUDGEMENT — duplicates career's private ROUND_NAMES; low risk.
- src/ui/pages/career.ts — JUDGEMENT — one 480-line function with inline styles; follows the other pages' pattern.
- src/ui/labels.ts (formatEarnedPointsSummary, progressText) — JUDGEMENT — "(x / 100)" repeats the percentage and reads like hundredths of a point — show the percentage only.

## Spec
- All K2 items present: menu → career page; tiers locked/open with best round; event picker via eventsFor; start/continue/abandon; bracket with highlighted player and player-side scores; next-match card; '1x15' before the semi-finals, tournament stats and tier bot level; onFinish only when the match has a winner (mid-match leave records nothing); points, recordHumanResult, setCareer, writeSave after each match; finishTournament + bonus at the end; quick-match points; result extras; My Characters points and progress; match budget floored.

## Checks
- vitest 307 pass, tsc clean, vite build pass (at f19fbb0). Lead checked in Chrome: tiers, event picker, bracket, next-match card, match start, mid-match reload records nothing.

APPROVE f19fbb0
