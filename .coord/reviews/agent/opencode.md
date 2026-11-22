# Cross-review: opencode branch (cde1e29) — S1 serve contact at or below 1.15 m — by Sonnet

## Standards
- Scope OK: only src/sim/index.ts, src/sim/tuning.ts (comment) and two sim test files; no new dependencies. No HARD issues.
- src/sim/index.ts:~376 — JUDGEMENT (minor) — the serve launch point can drop by up to ~0.8 m (the assisted hit radius) while the shuttle sprite was higher, a small visual jump; legal and unlikely to matter.

## Spec
- Reproduction test (swing.test.ts): serve at assist 1 with the shuttle ~1.65 m inside the 0.8 m hit radius; asserts launch y <= 1.15; passes.
- Root cause: the contact is the shuttle position inside the hit radius (larger with assist), not the clamped racket head; makeHit is the single shared point every human and bot serve goes through, so the clamp is in the right place and needs no game/ change.
- Non-serve hits unchanged (new smash test). Serve landing is re-solved from the clamped point (shots.ts), service-box test still passes with the added height check.

## Checks
- vitest 305 pass, tsc clean, vite build pass (at cde1e29).

APPROVE cde1e29
