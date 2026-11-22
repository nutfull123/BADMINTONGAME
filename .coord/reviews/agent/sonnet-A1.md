# Review: agent/sonnet-A1 @ f569bca (A1 — account core)

Fixed point: `main`. Diff: `git diff main...agent/sonnet-A1` (3 commits, 11 files, +477/−11).
Reviewed read-only; no source file edited, nothing committed.

## Standards

Scope (AGENTS.md + brief "Edit ONLY") — all pass:

- `docs/supabase-setup.md`, `src/account/{auth,client,cloud,sync}.ts` + their tests, `src/app/save.ts`, `src/app/app.test.ts`, `supabase/migrations/0001_user_saves.sql` — every touched file is on the allowed list.
- `git diff main...agent/sonnet-A1 -- package.json package-lock.json src/types.ts src/ui src/game src/career` is empty; no dependency added (only the already-installed `@supabase/supabase-js` 2.119.2).
- No secret: the only URLs/keys in the diff are `<project-ref>` placeholders (`docs/supabase-setup.md:35`) and prose warnings (`docs/supabase-setup.md:61`, `supabase/migrations/0001_user_saves.sql:22`). No `eyJ…`, no `service_role`/`sb_secret` value anywhere.

Smells:

- `src/account/cloud.ts:22` — JUDGEMENT — Duplicated Code: the `version === 1` gate re-implements the gate already inside `parseSave` (`src/app/save.ts:44`) to guess "invalid" from the outside — this guess is also the source of the Spec HARD below; parseSave should report validity instead of being probed.
- `src/account/cloud.ts:30` — JUDGEMENT — Duplicated Code: the Thai "not configured" string is copied from `src/account/auth.ts:7` (`NOT_CONFIGURED`) instead of imported; the two will drift.
- `src/account/cloud.ts:31` vs `supabase/migrations/0001_user_saves.sql:7` — JUDGEMENT — the two 256 KB limits measure different byte strings: the client measures `JSON.stringify(save)` (no whitespace) while Postgres measures `jsonb::text`, which inserts a space after every `:` and `,`. A save within a few percent of the cap passes the client check and is rejected by the constraint, surfacing only as the generic Thai error.
- `src/account/cloud.ts:43-60` — JUDGEMENT — `createCloudSync` has no `cancel()`/`dispose()`: a pending 2 s debounce keeps the `userId` captured at creation, so a push can land after sign-out or unmount (writes only that user's own row, so no leak — but it is an unattended write the caller cannot stop).
- `src/account/auth.ts:67-70` — JUDGEMENT — after the RPC has deleted `auth.users` (and cascade-deleted the session), `signOut()` posts `/logout` with a session that no longer exists; GoTrue can answer `session_not_found`, so `deleteAccount()` may resolve `{ ok: false }` even though the account was deleted.
- `src/account/cloud.ts:18` — JUDGEMENT — `throw new Error(describeError(error))` drops the original error, its PostgREST `code` and any `cause`; a failed fetch is undebuggable from the thrown value.
- `src/account/client.ts:4-13` — JUDGEMENT — module-level `client` cache with no reset hook; once built it can never be cleared (matters for tests that stub env after a client exists — the current test only stubs empty, so it passes).
- `src/account/auth.ts:22` — JUDGEMENT — `msg.includes('fetch')` / `msg.includes('network')` substring matching is broad; an unrelated message containing either word is reported as a network error.

## Spec

Pass, item by item:

- `src/app/save.ts:42-59` — `parseSave(raw: unknown): SaveData` is today's `loadSave` body moved verbatim (`isObject`/`version !== 1` gate, `validCharacter` filter, duplicate-id filter, `parseCareer`, `activeCharacterId` fallback, `sanitizeSettings`); `loadSave:61-70` now only reads storage + `JSON.parse` and delegates. Existing hardening tests still pass through it, plus `src/app/app.test.ts:95-103`.
- `src/account/client.ts:6-13` — one lazily created client with `flowType: 'pkce'`, `persistSession`, `autoRefreshToken`, `detectSessionInUrl`; `null` when *either* env var is missing → guest play unchanged.
- `src/account/auth.ts:56-70` — every action goes through `run()` (try/catch + returned `error`), so none throws; `signInGoogle` redirects to `window.location.origin`; `deleteAccount` calls the RPC then signs out; Thai messages exist for wrong credentials, already registered, weak password, not configured and network (`:19-22`).
- `src/account/cloud.ts:29-40` — refuses `> 256 KB` before any request; upsert carries `user_id`, `save_data`, `updated_at`; never throws.
- `src/account/cloud.ts:43-60` — debounce ~2 s, latest save wins, `flush()` sends now and clears the timer.
- `src/account/sync.ts:13-19` — all four outcomes: `upload` (no cloud characters + local), `download` (cloud characters + no local), `ask` (both, differ — key-order-independent via `stable()`), `none` (equal or both empty).
- `src/account/sync.ts:24-43` — clash: more `earnedPoints`, tie → more `career.unlocked`, tie → local; characters joined by id; settings from local; `activeCharacterId` from local with cloud fallback; `applyChoice` maps `cloud`/`local`/`merge` exactly.
- `supabase/migrations/0001_user_saves.sql` — table with `user_id uuid primary key references auth.users(id) on delete cascade`, `jsonb` save, `updated_at`, 262144-byte check; RLS enabled with select/insert/update/delete policies pinned to `auth.uid() = user_id` (update has both `using` and `with check`); `delete_own_account()` is `plpgsql` `security definer` `set search_path = ''` deleting `auth.users where id = auth.uid()`; execute revoked from `public, anon` and granted to `authenticated`.
- Security question asked: a signed-in user cannot read or change another user's row (every policy compares `auth.uid()` to `user_id`, and insert/update `with check` pins the key) and cannot call the function for someone else (`auth.uid()` comes from the signed JWT; `anon` has no execute).
- `docs/supabase-setup.md` — Thai with English menu names: Singapore project, run the SQL, Email provider with Confirm email off, Google provider with `https://<project-ref>.supabase.co/auth/v1/callback`, URL Configuration (`http://localhost:5173` + `http://localhost:5173/**`), copy Project URL + anon key into `.env.local` from `.env.example`, explicit warning never to use `service_role`.

Findings:

- `src/account/cloud.ts:21-26` — **HARD** — "invalid data gives null with one `console.warn`" is only implemented for the version gate. `{ version: 1, characters: 'x' }` (or a version-1 row whose characters all fail `validCharacter`) is run through `parseSave`, comes back as `emptySave()`, passes the `version === 1` check at `:22`, and is returned as a *valid empty save* with **no warning**. `src/account/cloud.test.ts:23-27` only exercises `version: 7`, so the gap is untested. Why it matters: the contract agy's pages will code against is "`null` = no cloud save"; a corrupt row is instead reported as a real, empty save, and the single `console.warn` that was meant to make corruption visible never fires for the likeliest corruption (a partially invalid body). (Behavioural difference vs `null` is small — `decideSync` answers `upload` either way — so this is a contract/observability miss, not data loss; fix by having `parseSave` report validity, or by a strict shape check in `fetchCloudSave` before returning.)
- `src/account/cloud.ts:18` — JUDGEMENT (accepted) — throwing on a failed request is the right call: returning `null` would make a network error indistinguishable from "no cloud save" and let the caller upload over the real row; the throw is documented at `:13-14`, and `pushCloudSave` stays non-throwing so the write side still reports `{ ok: false }`. Callers must `try/catch` (no caller exists yet — agy builds them next).
- `supabase/migrations/0001_user_saves.sql:13-19` — JUDGEMENT — policies use `auth.uid()` rather than `(select auth.uid())`, which `.coord/research/accounts-supabase.md` §2 gives as Supabase's per-statement-caching best practice. Correctness is unaffected (all four operations still limited to the owner); only repeated per-row evaluation is lost.
- `supabase/migrations/0001_user_saves.sql:3-8` — JUDGEMENT — no explicit `grant select, insert, update, delete on public.user_saves to authenticated`; access relies on Supabase's default privileges for `public`. Works on a stock project, fails `permission denied` if those defaults were changed.
- `src/account/auth.ts:67-70` — JUDGEMENT — `deleteAccount` reports the *signOut* result after a successful delete (see Standards): a real user can be told deletion failed when it succeeded. Consider treating the RPC success as final.
- `src/account/sync.ts:36-37` — JUDGEMENT — beyond spec, `mergeSaves` also falls back to `characters[0]` when the chosen `activeCharacterId` is absent from the merged set. Harmless (mirrors `parseSave`), but it is unrequested behaviour a UI test may trip over.
- `src/account/sync.ts:18` — JUDGEMENT — "same content" compares `characters` only, so saves differing only in settings or `activeCharacterId` give `none`. That matches "settings from local", but is worth stating explicitly for agy.
- `docs/supabase-setup.md` — JUDGEMENT — no verification step (sign in once, delete the account once) and no Google "Authorized JavaScript origins" line; neither was required by the brief.

## Checks

Run in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-ab56da275525ca17d` (HEAD `f569bca`, clean tree):

- `npx vitest run` — PASS: 27 test files, 334 tests passed, 6.12 s.
- `npx tsc --noEmit` — PASS: exit 0, no output.
- `npx vite build` — PASS: built in 605 ms; 60 modules; `dist/assets/index-*.js` 816.35 kB (217.52 kB gzip) with the pre-existing >500 kB chunk warning (three.js bundle).

One HARD finding, in Spec (`src/account/cloud.ts:21-26`); Standards has no hard violation.

CHANGES
