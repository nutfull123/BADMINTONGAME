# Review of agent/claude-l1 (doubles long serve) — reviewer: Sonnet

## Standards
- src/types.ts:125 - JUDGEMENT - contract comment still shows the 5-argument stepPlayer
- HARD: none (pure, no new deps, optional params keep callers compiling)

## Spec
- grid probe: doubles serveLong lands 4.54..5.94 m for every charge and random error, both sides
- singles unchanged (back = halfLength when doubles is false); short serves identical
- non-serve doubles shots keep the full 6.70 m court
- only rally.ts needs to pass doubles; tutorial is singles

## Checks
npx vitest run -> pass (174)
npx tsc --noEmit -> pass
npx vite build -> pass

APPROVE 5b76ad5
