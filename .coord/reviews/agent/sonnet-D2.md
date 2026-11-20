# Cross-Review: `agent/sonnet-D2` (`2ce9d8c` vs `main`)

## Standards
src/game/teams.ts:2 - JUDGEMENT - Feature Envy / Coupling to UI module - `src/game/teams.ts` is a pure helper (`buildTeams`, `isDoubles`) but imports `PRESETS` from `../ui` (which contains DOM overlay logic). While `PRESETS` itself is a pure object and `teams.ts` calls no DOM APIs, moving or re-exporting `PRESETS` from a pure module would decouple pure team generation from `src/ui/`.
src/game/match.ts:128 - JUDGEMENT - Duplicated Code on `chargeLevel` calculation - `chargeLevel(me, human.chargeTime)` is computed in both `view()` (`src/game/match.ts:128`) and `frame()` (`src/game/match.ts:151`).
src/game/match.ts:40 - JUDGEMENT - Inline cast `(renderer as { setZoom?: (z: number) => void }).setZoom?.(z)` - `createRenderer` in `src/render/index.ts` on `main` already exposes `setZoom(z: number): void` on its return type.

## Spec
src/game/rally.ts:167 - JUDGEMENT - `botContext()` keeps `receiving: r.stage !== 'rally' && side !== r.server && slot === r.receiverSlot` true across both `'serve'` and `'serveFlight'` stages - Brief (`D2.md:49`) says "receiving: this player is the designated receiver in the serve stage", while `rally.ts:161` notes "`receiving` stays true until the serve is returned: after that either partner may play the shuttle"; keeping `receiving` true through `serveFlight` is necessary so only the designated receiver bot returns the flying serve (matching `types.ts:128`).
src/game/rally.ts:85 - JUDGEMENT - Out-of-scope note reported by builder: `serveLong` in `src/sim/shots.ts` targets `COURT.halfLength` (6.70 m) rather than `COURT.longServiceLineDoubles` (5.94 m), so long serves in doubles land beyond the 5.94 m doubles long service line - `judgeFloor` in `src/game/rally.ts` properly judges against `isInServiceBox(at, receiver, court, doubles)` (5.94 m), and `src/sim/shots.ts` is outside `D2`'s `src/game/**` scope.

## Checks
- `git diff --stat main...agent/sonnet-D2`: only `src/game/**` touched (`src/types.ts` and `package.json` untouched; `src/game/rally.ts` and `src/game/teams.ts` use no DOM or `three` APIs) — PASS
- `npx vitest run`: 14 passed (168 tests) — PASS
- `npx tsc --noEmit`: exit 0 — PASS
- `npx vite build`: exit 0 (built in 284ms) — PASS

APPROVE 2ce9d8c
