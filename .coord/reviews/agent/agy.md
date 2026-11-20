# Review of agent/agy (t7 bot, commit b6d92ef) — reviewer: Sonnet (r7)

## Standards
- src/sim/bot.ts:103,150,189,222-224 - HARD (task rule) - loose numbers outside BOT_TUNING: 0.65 short-serve chance, 0.5 drop/basic split, 0.08 arrive threshold, 0.5 slow radius, 1e-4 vel epsilon
- src/sim/bot.ts:77-85,262-268 - JUDGEMENT - racket reach formula duplicated from sim
- src/sim/bot.ts:55,118 - JUDGEMENT - Bot.chargingShot written, never read

## Spec
- src/sim/bot.ts:186-216 - BUG - bot freezes: new-hit detection only fires on a vel.z sign change; a dead shuttle and the serving branch never reset lastVelZSign / hasReleasedThisRally, so after a point that ended on the bot's side, a serve coming toward the bot is ignored (move 0,0, no swing). Reproduced by the reviewer.
- src/sim/bot.ts:162-171 - PARTIAL - no test that the bot's serve lands in the diagonal service box

## Checks
npx vitest run src/sim -> pass (54)
npx tsc --noEmit -> pass

CHANGES
