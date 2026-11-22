# Review round 2: agent/sonnet-A1 @ d86deb0 (A1 — account core)

Fixed point: `main`. Full diff: `git diff main...agent/sonnet-A1` (3 commits, 12 files, +580/−14).
Round-2 delta: `git diff f569bca..d86deb0` (9 files, +118/−18).
Reviewed read-only; no source file edited, nothing committed.

## Standards

Scope (AGENTS.md + brief "Edit ONLY") — still all pass:

- Every touched path is allowed: `docs/supabase-setup.md`, `src/account/**` (incl. the new `src/account/auth.delete.test.ts`), `src/app/save.ts`, `src/app/app.test.ts`, `supabase/migrations/0001_user_saves.sql`.
- `git diff main...agent/sonnet-A1 -- package.json package-lock.json src/types.ts src/ui src/game src/career` is empty; no dependency added.
- No secret: the only matches for key/URL patterns in the whole branch diff are `<project-ref>` placeholders and prose warnings (`docs/supabase-setup.md:30,56`, `supabase/migrations/0001_user_saves.sql:26`).

Round-1 smells fixed:

- `src/account/cloud.ts:20` — the hand-rolled `version === 1` probe that duplicated `parseSave`'s own gate is gone; `fetchCloudSave` now consumes `parseSaveReport`'s `valid`/`dropped` instead of guessing.
- `src/account/cloud.ts:30` — the duplicated Thai "not configured" literal is replaced by the exported `NOT_CONFIGURED` (`src/account/auth.ts:7`); one source of truth for both modules.

Remaining (carried from round 1, all judgement-level, none blocking):

- `src/account/cloud.ts:31` vs `supabase/migrations/0001_user_saves.sql:7` — JUDGEMENT — the two 256 KB caps measure different byte strings: the client measures `JSON.stringify(save)` (no whitespace), Postgres measures `jsonb::text` (a space after every `:` and `,`). A save within a few percent of the cap passes the client check and fails the constraint, surfacing only as the generic Thai error.
- `src/account/cloud.ts:43-60` — JUDGEMENT — `createCloudSync` still has no `cancel()`/`dispose()`; a pending 2 s debounce fires after sign-out or unmount, writing the captured `userId`'s own row.
- `src/account/cloud.ts:18` — JUDGEMENT — `throw new Error(describeError(error))` still discards the original error, its PostgREST `code` and any `cause`, so a failed fetch is hard to diagnose.
- `src/account/client.ts:4-13` — JUDGEMENT — module-level client cache with no reset hook; once built it cannot be cleared.
- `src/account/auth.ts:22` — JUDGEMENT — `msg.includes('fetch')` / `msg.includes('network')` substring matching can mislabel an unrelated error as a network error.
- `src/account/cloud.ts:25` — JUDGEMENT — the warn says "invalid character(s)" but `dropped` also counts duplicate ids, which are not invalid, only repeated.
- `src/account/auth.delete.test.ts:1-5` — JUDGEMENT — the new test replaces all of `./client` with a two-method stub, so any future import from that module inside `auth.ts` becomes `undefined` in this file only. Fine today; worth remembering if `auth.ts` grows.

## Spec

Round-1 HARD — FIXED:

- `src/app/save.ts:42-70` — `parseSaveReport(raw): { save, valid, dropped }`: `valid` is "an object with `version === 1` and a `characters` array", `dropped` is `list.length - characters.length` (invalid + duplicate ids), and the parsed save is computed exactly as before.
- `src/app/save.ts:72` — `parseSave = (raw) => parseSaveReport(raw).save`, so today's local behaviour is byte-for-byte preserved (same empty-save fallback for non-objects / `version !== 1`, same filter, same `activeCharacterId` fallback, same `sanitizeSettings`); `loadSave:74-80` still only reads storage + `JSON.parse` and delegates. All pre-existing hardening tests still pass through it.
- `src/account/cloud.ts:20-26` — `!valid` → `console.warn` once + `null` (structural junk: not an object, wrong version, `characters` not an array); `dropped > 0 && save.characters.length === 0` → warn once + `null` (a row whose characters were all dropped); `dropped > 0` with survivors → warn once and return the save with the bad characters dropped; clean or genuinely empty save → returned with no warn.
- Tests for each case: `src/account/cloud.test.ts:30` (structurally corrupt version-1), `:35` (all dropped), `:41` (some bad, one warn, survivor kept), `:50` (empty but valid, no warn), `:24` (version 7 / missing row), `src/app/app.test.ts:105-124` (clean, invalid shapes, dropped counting incl. duplicates).

Extra fixes verified:

- `src/account/auth.ts:67-71` — `deleteAccount` now returns the RPC result and only awaits `signOut()` for its side effect: `{ ok: true }` once the RPC succeeded even when `signOut` errors or rejects (the reject path is swallowed by `run`'s `try/catch`, so nothing escapes). A failed RPC still returns `{ ok: false, message }` and does not sign out. `src/account/auth.delete.test.ts:11,19` covers both.
- `supabase/migrations/0001_user_saves.sql:13` — explicit `grant select, insert, update, delete on public.user_saves to authenticated`, so access no longer depends on the project's default privileges; `:16-23` — all four policies now use `(select auth.uid())`, evaluated once per statement, still pinned to `user_id` with `with check` on insert and update. Cross-user read/write remains impossible, and `delete_own_account()` (`:27-38`) is unchanged: `security definer`, `set search_path = ''`, deletes only `auth.uid()`'s row, execute revoked from `public, anon` and granted to `authenticated`.
- `docs/supabase-setup.md:29` — Google **Authorized JavaScript origins** `http://localhost:5173` added next to the redirect URI; `:58-65` — final check list (email sign-up, sign-out/sign-in, Google login, delete account verified in `Authentication > Users` and `user_saves`).
- `src/account/sync.ts:13` — JSDoc states that "same content" compares characters only (key order ignored) and settings always come from this browser; no behaviour change, `decideSync` tests still pass.

Rest of the brief re-checked at d86deb0 (unchanged since round 1, still correct): `getSupabase` null without either env var, every auth action `{ ok }` / `{ ok: false, message }` and non-throwing, `pushCloudSave` 256 KB refusal and upsert with `updated_at`, debounced pusher, all four `decideSync` outcomes, `mergeSaves` clash/tie rules and settings/active-character sourcing, `applyChoice` for each choice, table + cascade + size check + RLS + function SQL, and the setup guide's steps.

No regression found from the fixes:

- `parseSave` output is identical for every input class the old implementation handled (the report wrapper adds fields, changes no computation), so guest play and the existing save tests are untouched.
- `valid` is only consumed by `fetchCloudSave`; `loadSave` ignores it, so a local save missing `characters` still degrades to an empty character list rather than being rejected.
- The `NOT_CONFIGURED` import creates no cycle (`cloud → auth → client`), and the SQL grant does not widen access beyond the RLS policies.

Remaining judgement notes (non-blocking):

- `src/account/auth.ts:67-71` — JUDGEMENT — when `signOut` fails after a successful delete, the stale Supabase session stays in `localStorage`, so the UI may still show the player as signed in until a refresh; the caller should clear local account state on `{ ok: true }`.
- `src/account/sync.ts:36-37` — JUDGEMENT — `mergeSaves` additionally falls back to `characters[0]` when the chosen `activeCharacterId` is absent from the merged set; sensible, but beyond the spec's wording.
- `docs/supabase-setup.md:29` — JUDGEMENT — the Google origin step lists only localhost; §5's "add the real domain to both fields" note is not repeated for the Google console.

## Checks

Run in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ab56da275525ca17d` (HEAD `d86deb0`, clean tree):

- `npx vitest run` — PASS: 28 test files, 343 tests passed, 2.00 s.
- `npx tsc --noEmit` — PASS: exit 0, no output.
- `npx vite build` — PASS: built in 321 ms; only the pre-existing >500 kB chunk warning (three.js bundle).

Round-1 HARD is fixed with tests for every branch of the new contract; the extra fixes are correct and broke nothing. No HARD issue, nothing missing, all checks pass.

APPROVE d86deb0
