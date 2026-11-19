# Badminton web demo — design

Approved by the user 2026-11-20 (summary table in chat, answered "ครบ").

## Intent

A playable 3D singles badminton demo in the browser for the user to playtest
**hitting feel** and whether **body type and stats** change how the game plays.
Not for other players yet. A Roblox port may come later, so game rules stay
engine-free.

**Goals**: shots that feel distinct and chargeable; tall vs short vs balanced
feel different; full rally against a bot; tutorial that teaches every control.
**Non-goals**: sound, real character models, menus polish, mobile, multiplayer,
progression between matches (stat points are set before a match).
**Anti-goals**: controls that feel random (shots must be learnable); a bot
that never misses; rules logic tangled with Three.js.

## Approaches considered

1. **Three.js + own shuttle physics, TypeScript + Vite** — chosen. Full control
   of shuttle flight (the core of the feel), small bundle, rules/physics stay
   portable.
2. Babylon.js — built-in physics cannot model shuttle drag; heavier for no gain.
3. Three.js + Rapier — overkill for four colliders (shuttle, racket, net, floor).

## Decisions (user's)

- Camera: 3D behind the player, follows sideways smoothly; opponent's court
  always visible.
- Mouse (Pointer Lock) moves the **racket head directly** on a plane in front of
  the player: X = backhand ↔ forehand side, Y = knee ↔ overhead. Reach depends on
  height stat. Shot direction = direction the mouse is moving at contact
  ("flick"); the shot button sets depth/height.
- Keys: WASD move · Q backhand / E forehand basic swing (wrong side → weak, slow
  shot) · LMB hold = smash · RMB hold = drop · LShift hold = clear · Space hold =
  jump · C = dive, mash C to get up (presses needed by recovery stat) · Alt = net
  shot, type chosen by contact height (above tape → kill, below → spin/tumble;
  aim deep → push).
- Charging: hold to charge, release to swing; moving is slower while charging.
  Perfect = contact on racket sweet spot at release. Timing ring around the
  player (can be turned off). Hit assist 0–100% enlarges the hit radius,
  default high.
- Stats: height fixed per character (reach, jump-smash angle; slower
  acceleration and turning). 20-point budget across speed, power, recovery,
  stamina. Presets: tall / short / balanced.
- Stamina: drains on charge, dive, jump; regenerates slowly in rallies and
  partly between points; fatigue builds over long runs.
- Bot: 3 levels (easy: slow, clears/drives only; medium: all shots, some
  misses; hard: fast, cross-court angles, smashes on chances). Uses the same
  stat system, random body type.
- Rules: singles. Default **3×15** (14-all win by 2, cap 21, interval and
  third-game end change at 8); option **3×21** (20-all, cap 30, at 11). Serve:
  RMB short / Shift long, must land in the service box; right court on even
  score, left on odd. Source: `.coord/research/scoring-rules.md` (agy; links
  are search redirects, dates unverified).
- Visuals: simple shapes (capsule players, correct court lines and net). Always
  a ground shadow under the shuttle; landing marker on by default (toggle).
- Platform: desktop Chrome on Mac; block browser defaults (Alt menu, Space
  scroll, context menu) so it also works on Windows.
- Tutorial: 8 drills — move → Q/E → clear → drop → jump smash → net → dive and
  get up → serve. A feeder sends shuttles; 3 successes to pass; skip and replay
  any drill.

## Architecture (claude's call)

```
src/
  rules/     pure TS: match config (3x15 / 3x21), score, serve side, faults,
             intervals, end changes. No imports outside rules/. TDD.
  physics/   pure TS: shuttle flight (quadratic drag, terminal ≈ 6.8 m/s,
             turnover), court geometry in metres (singles 13.40 × 5.18,
             net 1.55 m at posts / 1.524 m centre), net/floor collision. Tested.
  sim/       player movement + stats + stamina, racket plane + swing + hit
             detection, shot launch from (button, charge, flick, contact),
             dive/get-up, bot AI. Depends on physics/ and rules/, not on three.
  input/     Pointer Lock, key/mouse state, charge timers, prevent defaults,
             pause on unlock.
  render/    Three.js scene, camera follow, shuttle shadow, landing marker,
             timing ring, HUD (score, stamina, charge).
  game/      fixed-timestep loop (120 Hz sim, render per frame), screens:
             title → character setup → match / tutorial → result.
  tutorial/  drills and feeder.
```

`rules/` and `physics/` are the Roblox-portable core (`AGENTS.md`).

## Left to the builders

Exact tuning numbers (drag, charge curves, stat multipliers, bot timings) —
put them in one `src/sim/tuning.ts` so the user can tweak feel in one place.
