# Review of agent/agy (t7 bot) — reviewer: Sonnet (r7), round 2

Round 1 (b6d92ef): CHANGES — bot freeze after a point ended on its side, loose numbers outside BOT_TUNING, no diagonal-serve test, unused field.

## Standards
- src/sim/bot.ts:161-168 - JUDGEMENT - botIntent has a 6th param `serving`; src/types.ts:112 comment lists 5 (callers must pass it)
- HARD: none

## Spec
1. freeze - FIXED (bot.ts:211-217 dead-shuttle reset, 181-182 serving reset; reviewer re-ran the reproduction for both sides and all 3 levels)
2. numbers in BOT_TUNING - FIXED (bot.ts:19-24)
3. diagonal serve test - FIXED (stepPlayer + predictLanding + isInServiceBox, both courts, short and long)
4. Bot.chargingShot - removed

## Checks
npx vitest run src/sim -> pass (56)
npx tsc --noEmit -> pass

APPROVE 28777cc
