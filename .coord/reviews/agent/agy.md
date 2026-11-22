# Cross-review round 2: agy branch (3cc0feb) — N3 online lobby and room pages — by Sonnet

## Standards
- Scope OK: src/ui/** (hud, index, onlineHelpers + test, mainMenu, online, result), src/game/index.ts, and a 4-line names-only change in src/game/onlineMatch.ts; no new dependency, no confirm/alert, no secret. No HARD issues.
- src/ui/pages/online.ts:193 — JUDGEMENT — `seatsListEl!` non-null assertion inside a forEach closure; capture in a const.
- src/ui/pages/online.ts:4, src/game/onlineMatch.ts:11 — JUDGEMENT — import cycle ui → online → onlineMatch → ui remains; builds because use is inside functions.
- src/ui/result.ts:36 — JUDGEMENT — null-winner title colour changed from red to neutral (offline only, harmless).
- src/ui/pages/online.ts — JUDGEMENT — no DOM test for the page or the HUD names option; only pure helpers are tested.
- src/ui/pages/online.ts:205 — JUDGEMENT — an error message during a slider drag still re-renders and drops the drag (rare).

## Spec
- All round 1 items fixed: live draft settings via pure mergeRoomSettings (five patches in a row tested); finished room with Thai note, no seat/ready/settings/Start, and "สร้างห้องใหม่ / กลับล็อบบี้" sending 'leave' with the connection open (server's leave allows create/join after); room-code pattern matches the server alphabet exactly (ROOM_CODE_ALPHABET asserted equal, L test); HUD names with the player's team near after the mirror, offline unchanged; no drop overlay on the result screen; slider drag kept (seats-only update); `active!` removed; "ทีม A / B ชนะ" title.
- Everything else from round 1 still passes. Tiny race noted: pressing "Back to Room" before the 'finished' broadcast shows 'playing' briefly; the broadcast follows 'end' immediately.

## Checks
- vitest 519 pass, tsc clean, vite build pass, server tsc pass (at 3cc0feb).

APPROVE 3cc0feb
