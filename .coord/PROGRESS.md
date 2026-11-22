# Progress log (shared by claude, opencode, agy)

## In progress
<!-- - [agent] task — files owned — started YYYY-MM-DD -->

## Done
- [agy] Phase 3 V3 wood floor + linoleum mat textures, gym_01 HDRI environment (Sonnet review round 2) — main c0185ff — 2026-11-22
- [sonnet] Phase 3 V1 animated Quaternius characters (clips, team tint, racket-arm IK, capsule fallback), reviewed by agy — main d42499c — 2026-11-22
- [sonnet] F1 FPS mouse look (shoulder camera, crosshair aiming), reviewed by agy; zoom-out to 6.6 m (claude) — main 9bec0b0, 2a5d5b0 — 2026-11-22
- [sonnet] Phase 3 V2b real racket (oval frame, string grid, T-joint, octagonal grip) + 16-feather shuttlecock; reviewed by agy — main 5122fcc — 2026-11-22
- [agy] Phase 3 V2a indoor hall merged after 2 review rounds (Sonnet) — main b8a5bee — 2026-11-22
- [agy] Phase 3 V2a indoor hall (stands, crowd, ad boards, lights, RoomEnvironment, quality) — src/render/arena.ts, src/render/arena.test.ts — 833179e — 2026-11-21
- [claude] Phase 3 S0 render seam: hall floor/lights to arena.ts, racket/shuttle builders to equipment.ts, no behaviour change — main 723c30f — 2026-11-21
- [all] Phase 2 app shell: contract + app model (claude), P2 pages (agy), P3 camera presets/quality/keys (sonnet), P2fix rebind/notice/blocked storage/hints + ui split (opencode); every branch cross-reviewed; checked in Chrome — main ba04cd4 — 2026-11-21
- [opencode] P2fix app shell fixes: rebinding capture (one armed row, control clicks never bind), save-failure notice survives re-render, no-storage dead end (Home button + in-memory session save), Home hints from saved bindings, ui split into styles/overlay/widgets/pages — 7f9425d aa1f9c6 67eb253 51244db 7f7cce4 — 2026-11-21
- [all] Phase 1 doubles + five events: contract (claude), D1 rules Law 11 (agy), D2 2v2 rally + teams (sonnet), D3 doubles bot (sonnet), D4 4 players + gender/event pickers (sonnet), L1 doubles long serve (claude), seeded bot tests (claude); every branch cross-reviewed — main cd49b27 — 2026-11-20
- [all] Demo v1 complete: rules (opencode), physics/render/input/sim/game (Sonnet), ui/bot (agy), tutorial (opencode + Sonnet); every branch cross-reviewed; final Opus gate APPROVE — main e7911f7 — 2026-11-20

- [all] Demo v2: humanoid players, real shuttlecock, landing cues (agy, 5bd0ff2); assist modes A-easy/A-normal/A-pro/B-timing (Sonnet, 6693028) — 2026-11-20
- [all] Demo v3: footwork split/chasse/crossover/lunge/recover + fullscreen (F) + zoom 0.6-1.6 (Sonnet, 5511959); footwork animation + full-court camera (agy, a047d00) — 2026-11-20
- [claude] Lead session moved: old chat 31c33d33 (started in ~) continues in the BADMINTONGAME project session — 2026-11-20

## Follow-ups (from final review, not blocking)
- Phase 2: "Click to play" pause message covers the human player; overlays lack role=dialog / live regions
- Phase 2: low graphics still updates hidden shadow/trail buffers each frame; camera wiring duplicated in match.ts and tutorial.ts
- Phase 1: HUD scoreboard covers the far back player at the top of the screen; far baseline sits under the HUD
- Phase 1: bot long-serve flick aims for singles depth (landing is clamped correctly by sim; lateral aim only)
- Phase 1: game/teams.ts imports PRESETS from ui/ (move presets to a pure module)
- show "change ends" when match.endsSwapped flips (src/game/match.ts)
- tutorial: digit keys 1-8 to replay any drill; end message counts skipped drills as passed
- serve stage accepts any shot type; require serveShort/serveLong (src/game/rally.ts:75)
- move BOT_TUNING / SERVE_AIM_FLICK into sim/tuning.ts; ui should import STAT_BUDGET
- serve contact can exceed 1.15 m at high assist (sim)
- quit a match mid-game; code-split the 588 kB bundle
- tutorial loop duplicates match loop (shared loop helper)
- chasse pose moves both legs equally: needs lead/trail foot so it reads as a side slide (render/pose.ts)
- user feedback 2026-11-20: too hard, can't see — wants real-looking characters and shuttlecock (next design round)
- [claude] Design doc + BWF scoring research (agy) — commit 12bfc87 — 2026-11-20
- [claude] t1 scaffold Vite+TS+Three.js, shared contract src/types.ts — commit 005f9dc — 2026-11-20
<!-- - [agent] task — commit <hash> — YYYY-MM-DD -->
- [claude] Set up AGENTS.md, shared .coord/, worktrees for opencode and agy — 2026-11-19
