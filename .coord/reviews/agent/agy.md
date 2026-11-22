# Cross-review: agy branch (c43c730) — A2 account pages and sync flow — by Sonnet

## Standards
- Scope OK: only src/ui/** and src/game/** (12 files); no new dependency; no window.confirm/alert; no key, URL or secret. No HARD rule break.
- src/game/index.ts:87 — JUDGEMENT (must fix, data loss) — `save = res.save` after every sync puts back the `local` captured before fetchCloudSave for none/upload/failure, wiping changes made while the fetch was in flight (e.g. a character created after the Google redirect); the next updateSave then writes the old save over localStorage. saveLocal already sets `save` for download/ask — delete line 87.
- src/game/index.ts:267-272 — JUDGEMENT — handleSignOut ignores the result of cloudSync.flush(); a failed final push is lost silently.
- src/game/index.ts:304-306 — JUDGEMENT — onAuthChange(null) drops the pusher without flushing; its 2 s timer still fires after sign-out.
- src/game/index.ts:309-313 — JUDGEMENT — Supabase re-emits SIGNED_IN on tab refocus and token refresh; the sync is skipped but openMenu() still runs, so a player on Home is pushed to the menu on every refocus.
- src/game/index.ts:92-95, 310 — JUDGEMENT — no retry after a failed sync; the next auth event retries even during a match, where the 'ask' dialog would replace the match overlay.
- src/ui/pages/settings.ts — JUDGEMENT — accountInfo not cleared when switching tabs; user snapshot fixed at open.

## Spec
- Present: guest play unchanged without Supabase; Home button; account page (email/password ≥ 8, Google, required unchecked consent linking privacy, in-page errors); privacy page (6 sections, placeholders, Home + sign-up + #privacy); Account tab (email, sign out keeps local save, in-page delete confirm); menu shows email or Guest; sync for all four outcomes with the three-choice dialog; fetchCloudSave throw caught, nothing pushed or saved on failure (tested); no push before the sync decision; Google redirect handled via INITIAL_SESSION; debounced push on every updateSave.
- Gap — src/game/index.ts:274-278 — deleting the account does not stop the pending pusher timer (only the reference is cleared); flush it before deleteAccount().
- src/ui/pages/privacy.ts:61-89 — JUDGEMENT — Thai and English interleaved per section rather than a Thai block followed by an English block.

## Checks
- vitest 351 pass, tsc clean, vite build pass (at c43c730).

CHANGES
