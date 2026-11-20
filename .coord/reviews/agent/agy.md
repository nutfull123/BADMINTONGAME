# Review of agent/agy (D1 doubles rules, BWF Law 11) — reviewer: Sonnet (xD1)

## Standards
- src/rules/index.ts:112 - JUDGEMENT - otherSlot defined after awardRally uses it (works at runtime)
- HARD: none (only src/rules touched, types unchanged, pure)

## Spec
- serving side wins: swaps only its own rightCourt, same server (Law 11.3.1)
- receiving side wins: no swap, server from new score parity (Law 11.3.2)
- new game resets rightCourt; singles never changes rightCourt
- Law 11.4 sequence N1 -> F2 -> N2 -> F1 -> N1 tested
- 8-rally worked example matches the research table row by row

## Checks
npx vitest run src/rules -> pass (24)
npx tsc --noEmit -> pass

APPROVE 5a6cea3
