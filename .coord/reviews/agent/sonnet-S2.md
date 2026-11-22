# Cross-review: agent/sonnet-S2 (59762a3) — S2 online serve timeout — by agy

## Standards
- Scope OK: only `server/match.ts` (+7/-3) and `server/match.test.ts` (+50/-1) were touched; no other files modified and no new dependencies.
- `server/match.test.ts:175` — JUDGEMENT — `describe('serve timeout', ...)` is nested inside `describe('lag compensation', ...)` rather than as a top-level describe block; moving it out would keep test hierarchy accurate.
- `server/match.test.ts:213` — JUDGEMENT — in `'a human who serves at 14 s serves normally'`, `expect(loop.tick / TICK_HZ).toBeLessThan(3 + SERVE_TIMEOUT_S + 2)` (20 s) is looser than `3 + SERVE_TIMEOUT_S` (18 s); tightening the bound to `< 3 + SERVE_TIMEOUT_S` would explicitly prove the serve occurred before the timeout threshold (it finishes at ~17.46 s).

## Spec
- All requirements in `.orchestra/briefs/S2.md` are met:
  - `SERVE_TIMEOUT_S = 15` is exported (`server/match.ts:13`).
  - Only serve-stage simulated time is counted (`server/match.ts:156`: `if (r.stage === 'serve') this.serveWait += STEP;`), and `this.serveWait = 0` resets on every new rally (`server/match.ts:140`).
  - Once `this.serveWait >= SERVE_TIMEOUT_S`, the human server's seat falls through to the existing bot (`server/match.ts:163`), while still draining their input queue (`this.nextIntent(h)`) so no stale backlog remains; once the shuttle is served (`r.stage !== 'serve'`), the human immediately regains control and the rally continues normally.
  - A bot server and a human who serves before 15 s are unaffected.
  - **Bot serve mix (65% short singles / 85% short doubles vs. always short):** Acceptable — reusing the seat's existing `botIntent` avoids duplicating serve logic, keeps `server/match.ts` minimal (+7 lines), and matches "the way a bot serves" while preventing AFK stalls under Law 16.
- **Red-before-green check:** Verified in a scratch worktree (`/tmp/s2check` on `main` `65affa5`, removed afterwards) with `agent/sonnet-S2`'s `server/match.test.ts` copied in: all 3 new serve-timeout tests failed (`3 failed | 10 passed`, exit 1), and all pass on `agent/sonnet-S2`.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ae4b551c63e4f6e07`): **PASS** — 40 test files passed, 513 tests passed.
- `npx tsc --noEmit`: **PASS** — exit 0.
- `npx tsc --noEmit -p tsconfig.server.json`: **PASS** — exit 0.
- `npm run build:server`: **PASS** — exit 0 (`dist-server/index.js` 71.78 kB).

APPROVE 59762a3
