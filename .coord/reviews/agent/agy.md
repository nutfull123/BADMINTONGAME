# Cross-review: agy branch (7ebbbf5) — N3 online lobby and room pages — by Sonnet

## Standards
- Scope OK: only src/ui/** and src/game/index.ts (+tests); no new dependency, no confirm/alert, no secret. No HARD rule break.
- src/ui/pages/online.ts:4 — JUDGEMENT — circular import ui/index → online.ts → game/onlineMatch → ui; builds because use is inside functions, but fragile.
- online.ts:273 — JUDGEMENT — `active!` assertions although checked at line 84; capture in a const.
- online.ts:705-742 — JUDGEMENT — render() rebuilds the whole panel on every 'room' message; a host dragging the hit-assist slider loses the drag when someone toggles ready.
- online.ts:240-247 — JUDGEMENT — handleDrop runs in phase 'result' and draws a 'disconnected' overlay over the result screen.
- online.ts:215-233 — JUDGEMENT — doubles result title "A / B ชนะ! (YOU WIN)" reads awkwardly.

## Spec
- online.ts:305-352 (called from 463) — HARD — create-room settings handlers spread the snapshot taken when the controls were built and the form never re-renders, so a second change overwrites the first (event then format; assist mode then slider); the host's settings do not reach 'create'. Read the live draft; add a test for the pure merge.
- online.ts:668-678, 548-557, 643-651; onlineHelpers.ts canStartRoom — HARD — no handling of a 'finished' room: after a match "กลับเข้าห้อง" returns to a room where Start is disabled without explanation and ready/seat/settings only produce server errors. Show a Thai note that the match is over, hide those controls, and offer a button that sends 'leave' and returns to the lobby with the connection open.
- onlineHelpers.ts VALID_ROOM_CODE — HARD — /^[A-HJ-NP-Z2-9]{6}$/ accepts L, which the server alphabet (ABCDEFGHJKMNPQRSTUVWXYZ23456789) excludes; fix the pattern, the look-alike text, and add a test with L.
- Gap (outside agy's files) — onlineMatch.ts:103 calls createHud(root) and hud.update without names, so player names never show online.
- Passing: menu button and reasons; connect with token and character; create/join; room page (code + copy, seats, bots, choose seat, host-only settings, ready, Start gate, leave); Thai text for every ServerErrorCode; startOnlineMatch on 'start'; no points online; leaving closes the connection; offline HUD unchanged.

## Checks
- vitest 406 pass, tsc clean, vite build pass (at 7ebbbf5). online.ts has no test.

CHANGES
