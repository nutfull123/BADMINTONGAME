# Cross-review round 2: agy branch (cbaf842) — A2 account pages and sync flow — by Sonnet

## Standards
- Scope OK: 12 files in src/ui/** and src/game/** only; no new dependencies; no window.confirm/alert; no key, URL or secret. No HARD issues.
- src/game/index.ts:49-56, 73-105 — JUDGEMENT (minor) — cloudSync is created after the sync finishes, so a local write during the upload/'none' step is saved locally but reaches the cloud only with the next write (not lost).
- src/game/index.ts:346-352 — JUDGEMENT (minor) — on an external sign-out, flush() sends one futile push without a session; the timer is cleared, so nothing fires later.
- src/game/index.ts — JUDGEMENT (minor) — app-level orchestration (deferred sync, flush on sign-out/delete, retry) has no automated test; the pure runSignInSync and decideAuthEventAction are tested.

## Spec
- Round 1 fixes confirmed: stale save write removed (runSignInSync reads the local save after the fetch; tested for none/upload/failed fetch with an edit during the fetch); flush before deleteAccount; awaited flush on sign out with an in-page warning if it fails; external sign-out clears the timer; repeated SIGNED_IN ignored without navigation (tested); no sync during a match or tutorial, deferred to the next menu page (tested); retry button after a failed sync; privacy page as one Thai block then one English block, placeholders kept, reachable by #privacy; Account tab refreshes the user when opened.
- Everything else from round 1 still present; no regressions found.

## Checks
- vitest 356 pass, tsc clean, vite build pass (at cbaf842). Not run in a browser or against a real Supabase.

APPROVE cbaf842
