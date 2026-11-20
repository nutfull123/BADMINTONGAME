# Progress log (shared by claude, opencode, agy)

## In progress
<!-- - [agent] task — files owned — started YYYY-MM-DD -->

## Done
- [all] Demo v1 complete: rules (opencode), physics/render/input/sim/game (Sonnet), ui/bot (agy), tutorial (opencode + Sonnet); every branch cross-reviewed; final Opus gate APPROVE — main e7911f7 — 2026-11-20

- [all] Demo v2: humanoid players, real shuttlecock, landing cues (agy, 5bd0ff2); assist modes A-easy/A-normal/A-pro/B-timing (Sonnet, 6693028) — 2026-11-20
- [all] Demo v3: footwork split/chasse/crossover/lunge/recover + fullscreen (F) + zoom 0.6-1.6 (Sonnet, 5511959); footwork animation + full-court camera (agy, a047d00) — 2026-11-20
- [claude] Lead session moved: old chat 31c33d33 (started in ~) continues in the BADMINTONGAME project session — 2026-11-20

## Follow-ups (from final review, not blocking)
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
