# Phase 5 Research: Supabase Auth, Cloud Save, PDPA & Account Deletion

> **Scope & Verification:** All version numbers, bundle sizes, API behaviors, RLS SQL examples, and limits below were verified on **2026-11-22** against official primary sources (`registry.npmjs.org`, `bundlephobia.com`, `supabase.com/docs`, `supabase.com/pricing`, and `developers.google.com/identity`).

---

## 1. `@supabase/supabase-js` v2 in a Vite SPA

- **Current Version & Bundle Size (verified 2026-11-22):**
  - **Latest npm release:** `@supabase/supabase-js@2.119.2` (`https://registry.npmjs.org/@supabase/supabase-js/latest`, unpacked size `676.9 kB`).
  - **Browser bundle impact:** `222.4 kB` minified / **`57.4 kB` gzipped** (`https://bundlephobia.com/api/size?package=@supabase/supabase-js@latest`).
- **Client Setup (`VITE_SUPABASE_URL` & Publishable / Anon Key):**
  - Read `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`). If either env var is absent, the app runs in **offline guest-only mode** without throwing, keeping `npm test` and local guest play working out of the box.
  - Reference: `https://supabase.com/docs/reference/javascript/initializing`
  ```ts
  import { createClient } from '@supabase/supabase-js';

  export const supabase =
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
      ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
          auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        })
      : null;
  ```
- **Session Persistence:**
  - In a browser SPA, `persistSession: true` (default) stores the session JWT and refresh token in `window.localStorage` under `sb-<project-ref>-auth-token`, automatically refreshes expiring access tokens (`autoRefreshToken: true`), and notifies the app via `supabase.auth.onAuthStateChange((event, session) => ...)`.
- **Email + Password Sign-Up & Sign-In:**
  - Reference: `https://supabase.com/docs/guides/auth/passwords`
  - Sign-up: `await supabase.auth.signUp({ email, password })`.
  - Sign-in: `await supabase.auth.signInWithPassword({ email, password })`.
  - **Email confirmation ON vs. OFF** (*Authentication > Providers > Email > Confirm email* in Supabase Dashboard):
    - **ON (Supabase default):** `signUp` returns `data.user` with `data.session === null` until the user clicks the confirmation link sent to their email. **Warning:** Supabase's built-in email server is rate-limited to **2 emails/hour** and only sends to project team addresses unless custom SMTP is configured (see Section 6).
    - **OFF:** `signUp` immediately returns a live `data.session` and logs the player in without sending an email.
- **Google Sign-In with PKCE & Redirect URLs:**
  - Reference: `https://supabase.com/docs/guides/auth/social-sign-in/auth-google` and `https://supabase.com/docs/guides/auth/redirect-urls`
  - With `flowType: 'pkce'` and `detectSessionInUrl: true`, calling:
    ```ts
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    ```
    stores a PKCE code verifier in `localStorage`, redirects to Google → Supabase callback → back to `window.location.origin/?code=...`, where `supabase-js` automatically exchanges `?code=` for a session and fires `SIGNED_IN` on `onAuthStateChange`.
  - **URLs to configure:**
    1. **Google Cloud Console** (*APIs & Services > Credentials > OAuth 2.0 Client ID > Authorized redirect URIs*):
       - `https://<project-ref>.supabase.co/auth/v1/callback`
       - **Authorized JavaScript origins:** `http://localhost:5173` and `https://<production-domain>`
    2. **Supabase Dashboard** (*Authentication > URL Configuration*):
       - **Site URL:** `https://<production-domain>` (or `http://localhost:5173` during dev)
       - **Redirect URLs allow-list:** `http://localhost:5173/**` and `https://<production-domain>/**`

---

## 2. Cloud Save Data Model & Row-Level Security (RLS)

### Option A (Recommended for Phase 5): One Row per User with a `jsonb` Save Blob (`public.user_saves`)
Because our game already validates the entire untrusted `SaveData` blob (`{ version: 1, characters, activeCharacterId, settings }`) through `loadSave` / `sanitizeSettings` / `parseCareer` in `src/app/save.ts`, storing a single `jsonb` column per user in `public.user_saves` gives **atomic single-request load/save**, zero multi-table drift, and 100% reuse of our existing validation pipeline.

### Option B: Normalized Tables (`profiles`, `characters`, `user_settings`)
Needed only when the Phase 6/7 server or public leaderboards must query individual characters or Elo ratings across users via SQL. Note: we can keep `save_data jsonb` as the single source of truth for offline/cloud save in Phase 5 and add a separate server-authoritative `ratings` table in Phase 7.

| Aspect | Single `jsonb` Row (`user_saves`) | Normalized Tables (`characters`, `settings`) |
|---|---|---|
| **Reads / Writes per sync** | 1 `SELECT` on login, 1 `UPSERT` on save | 3+ queries or custom RPC transaction |
| **Reuses `loadSave()` / `parseCareer()`** | Directly validates the `jsonb` payload with existing pure code | Requires a new mapper layer and duplicate schema checks |
| **Payload size vs. limits** | Typical save (5 characters + active 32-draw tournament) is **~4–8 KB**; Postgres `jsonb` supports up to 255 MB (and a `CHECK (octet_length(save_data::text) <= 65536)` easily caps abuse at 64 KB) | More index overhead per row |

### Exact SQL Schema & RLS Policies (`https://supabase.com/docs/guides/database/postgres/row-level-security`)

```sql
create table public.user_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) <= 24),
  save_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint save_data_max_size check (octet_length(save_data::text) <= 65536)
);

alter table public.user_saves enable row level security;

create policy "Users can read own save"
  on public.user_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own save"
  on public.user_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own save"
  on public.user_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own save"
  on public.user_saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);
```
*(Note: Wrapping `(select auth.uid())` in a subselect is Supabase's documented RLS performance best practice so Postgres caches the JWT UUID once per statement.)*

---

## 3. Guest-to-Account Sync & Conflict Resolution

From the design spec (`docs/superpowers/specs/2026-11-20-badminton-full-game-design.md`, "Guest play"):
> *"On first login, local characters, settings and career progress are imported into the account (if the account already has data, the player chooses which to keep)."*

### Recommended Sync Flow on `SIGNED_IN`
1. **Fetch cloud row:** Query `supabase.from('user_saves').select('save_data, updated_at').eq('user_id', user.id).maybeSingle()`.
2. **Case 1 — New account (no cloud row exists) & local guest has characters:**
   - Immediately `upsert` the local `SaveData` to `public.user_saves` and mark the browser's local save as synced with `user.id`.
3. **Case 2 — Returning account (cloud row exists) & local guest save is empty (0 characters) or already belongs to this `user.id`:**
   - Load the cloud `save_data` (validated through `loadSave` / `parseCareer`) into `localStorage` and memory.
4. **Case 3 — Conflict (cloud row has characters AND local storage has unsynced guest characters):**
   - Show an in-page conflict modal (never `window.confirm`) with summary cards of both saves (character names, earned points, unlocked tournament tiers, last updated) and let the player choose:
     - **"ใช้ข้อมูลในบัญชี (Keep Cloud Save)"**: overwrites local storage with the cloud save.
     - **"ใช้ข้อมูลในเครื่องนี้ (Keep Local Guest Save)"**: overwrites the cloud row with the local save.
     - *(Optional convenience)* **"รวมตัวละครทั้งหมด (Merge Characters)"**: unions characters by `id` (taking the higher `earnedPoints`/`career.unlocked` on ID collision) and keeps local settings.

---

## 4. Self-Service Account Deletion

- **Why a client cannot call `auth.admin.deleteUser` directly:**
  - Deleting a row in `auth.users` requires the `service_role` / `sb_secret_` key (`https://supabase.com/docs/reference/javascript/auth-admin-deleteuser`), which must never live in the browser.
- **Two Supported Approaches:**
  1. **Recommended — Supabase Edge Function (`delete-account`)** (or an endpoint on our Phase 6 Fly.io game server):
     - The client calls `await supabase.functions.invoke('delete-account')`.
     - The Edge Function verifies the caller's JWT using the request `Authorization` header (`supabaseClient.auth.getUser()`), then uses an admin client initialized with `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` to call `await supabaseAdmin.auth.admin.deleteUser(user.id)`.
     - Because `public.user_saves.user_id` has `ON DELETE CASCADE`, deleting the `auth.users` row automatically deletes the user's cloud save row in the same transaction.
     ```ts
     // supabase/functions/delete-account/index.ts
     import { createClient } from 'npm:@supabase/supabase-js@2';

     Deno.serve(async (req) => {
       const authHeader = req.headers.get('Authorization');
       if (!authHeader) return new Response('Unauthorized', { status: 401 });

       const userClient = createClient(
         Deno.env.get('SUPABASE_URL')!,
         Deno.env.get('SUPABASE_ANON_KEY')!,
         { global: { headers: { Authorization: authHeader } } },
       );
       const { data: { user }, error: userErr } = await userClient.auth.getUser();
       if (userErr || !user) return new Response('Unauthorized', { status: 401 });

       const adminClient = createClient(
         Deno.env.get('SUPABASE_URL')!,
         Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
       );
       const { error } = await adminClient.auth.admin.deleteUser(user.id);
       if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

       return new Response(JSON.stringify({ deleted: true }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' },
       });
     });
     ```
  2. **Zero-Edge-Function Alternative (`SECURITY DEFINER` Postgres RPC):**
     - If the user prefers not to deploy a Deno Edge Function in Phase 5, a SQL function `create function public.delete_own_account() returns void language sql security definer set search_path = '' as $$ delete from auth.users where id = (select auth.uid()); $$;` callable via `supabase.rpc('delete_own_account')` deletes the caller's `auth.users` row and cascades to `public.user_saves`. *(Note: Supabase docs recommend `auth.admin.deleteUser` via Edge Function/server when Storage objects are involved, because direct SQL deletion from `auth.users` does not clean up Supabase Storage buckets; since our game uses no Storage buckets, either works, with the Edge Function being the official standard.)*

---

## 5. Anon (Publishable) Key vs. Service Role (Secret) Key

Reference: `https://supabase.com/docs/guides/getting-started/api-keys`

- **Anon / Publishable Key (`anon` JWT or `sb_publishable_...`):**
  - **May be used for:** Shipping in client-side Vite browser code (`VITE_SUPABASE_ANON_KEY`). It identifies the project to Supabase APIs and sets the Postgres role to `anon` (or `authenticated` once a user signs in and attaches their user JWT).
  - **May NOT be used for:** Bypassing Row-Level Security (RLS) or calling `supabase.auth.admin.*`. Every table in `public` **must** have RLS enabled, because anyone can inspect the browser network tab and extract the anon key.
- **Service Role / Secret Key (`service_role` JWT or `sb_secret_...`):**
  - **Bypasses all RLS policies** and has full superuser-like read/write/delete access to every table and `auth.admin.*`.
  - **Where it must live:** **Only** in server environment variables — automatic `SUPABASE_SERVICE_ROLE_KEY` inside Supabase Edge Functions, or `fly secrets set` on the Phase 6 Fly.io server. **Never** in `VITE_*` variables, client code, git commits, or browser requests (modern `sb_secret_` keys also return HTTP `401` if sent from a browser User-Agent).

---

## 6. Supabase Free Plan Limits & Google OAuth Consent Screen Requirements

### Supabase Free Plan Limits (`https://supabase.com/pricing` & `https://supabase.com/docs/guides/platform/billing-on-supabase`)
| Resource | Free Plan Limit | Operational Impact on Our Game |
|---|---|---|
| **Inactivity Pausing** | **Pauses after 7 days** of low database activity | A paused project rejects logins and saves until clicked ("Restore") in the Supabase Dashboard (restorable within 1 year). Guest local save keeps offline play working even if paused. |
| **Monthly Active Users (MAU)** | **50,000 MAU** / month | Far above expected early player traffic. |
| **Database Size** | **500 MB** Postgres storage | At ~6 KB per `user_saves` row, 500 MB holds **~75,000+ player saves**. |
| **Built-in Auth Emails** | **2 emails / hour** (and restricted to project team member emails) | **Critical:** Built-in email sending cannot serve public players if "Confirm email" is left ON. Must either **turn off "Confirm email"** for password sign-ups or **connect a custom SMTP provider** (e.g. Resend / Brevo free tier) (`https://supabase.com/docs/guides/auth/auth-smtp`). |
| **Edge Function Invocations** | **500,000 invocations / month** | Plenty for account deletions. |

### Google OAuth Consent Screen Requirements (`https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance`)
- **Scopes used by Supabase Google login:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
- **Classification:** All three are **Non-Sensitive Scopes**.
- **Verification Requirement:**
  - Requesting **only** `openid`, `email`, and `profile` does **not** require a paid security assessment or sensitive-scope review.
  - When switched from **Testing** (capped at 100 listed test users) to **In Production** in Google Cloud Console (*APIs & Services > OAuth consent screen*), Google only requires basic **Brand Verification** (verifying domain ownership in Google Search Console and providing an Application Home Page link and a public Privacy Policy link on that domain) if you display a custom app logo/name.

---

## 7. Privacy Policy Requirements (Thailand PDPA & Google OAuth Policy)

*(Plain engineering summary for a web game storing email + display name + game progress; not legal advice.)*

1. **Thailand's PDPA (Personal Data Protection Act B.E. 2562 / 2019 — Sections 19, 23, 33):**
   - **Privacy Notice before/at collection (Section 23):** Before the user signs up, provide an in-app/public **Privacy Policy (นโยบายความเป็นส่วนตัว)** in Thai (with English summary) stating:
     - **What data is collected:** Email address (from email signup or Google Sign-In), display name, character names/stats, game settings, and tournament progress.
     - **Why it is collected (Purpose):** Solely to authenticate the player, sync game progress across devices, and enable online play.
     - **Where it is stored / Third-party processors:** Stored in Supabase (cloud database/auth) and, when online play launches, processed on the Fly.io game server (Singapore region).
     - **Retention period:** Kept while the account is active and erased immediately when the user deletes their account.
     - **Data subject rights & contact:** How the user can view, edit, or erase their data, plus a contact email for the data controller (project owner).
   - **Explicit Consent at Sign-Up (Section 19):** The sign-up / first-login screen must have an unchecked-by-default checkbox: *"ฉันอ่านและยอมรับนโยบายความเป็นส่วนตัว (I have read and accept the Privacy Policy)"* linking to the Privacy Policy page before creating an account.
   - **Right to Erasure / Withdrawal (Section 33):** Provide a self-service **"ลบบัญชีและข้อมูลทั้งหมด (Delete Account & Data)"** button in Settings > Account with an in-page confirmation that permanently deletes both the cloud save and the `auth.users` record (plus an option to clear local browser storage).
2. **Google OAuth User Data Policy:**
   - The Privacy Policy must be accessible at a **public URL** (e.g. `https://<domain>/privacy` or a dedicated route/modal addressable by URL) linked both from the game's Home screen and in the Google Cloud Console OAuth consent screen settings.
   - It must explicitly state that Google user data (`email` and basic `profile`) is used only for login and account identification and is never sold or shared for advertising.

---

## Decisions for the User

Before Phase 5 implementation begins, only the user can decide or provision the following items:

1. **Email Confirmation Mode on Sign-Up:**
   - *Options:*
     - **A (Recommended for immediate testing & launch without SMTP setup):** Turn **OFF** *"Confirm email"* in Supabase (*Authentication > Providers > Email*) so email+password sign-ups work immediately without hitting Supabase's 2-emails/hour built-in cap.
     - **B:** Keep *"Confirm email"* **ON** and configure a custom SMTP provider (e.g. Resend free tier) in Supabase Dashboard.
2. **Guest-to-Account Conflict Strategy (when both Local Guest and Cloud Account already have characters):**
   - *Options:*
     - **A (Recommended — matches design spec + safest):** Prompt the user in-page with three buttons: **"Keep Cloud Save"**, **"Keep Local Save"**, or **"Merge Characters (รวมตัวละครทั้งหมด)"**.
     - **B:** Prompt with only **"Keep Cloud Save"** vs. **"Keep Local Save"**.
3. **Account Deletion Backend Mechanism:**
   - *Options:*
     - **A (Recommended for Phase 5 standalone):** Use a `SECURITY DEFINER` Postgres RPC (`delete_own_account()`) or a 20-line Supabase Edge Function (`delete-account`) so account deletion works in Phase 5 before the Phase 6 Fly.io server exists.
     - **B:** Wait and host the deletion endpoint on the Phase 6 Fly.io server.
4. **Data Controller Contact Details for the PDPA Privacy Policy:**
   - *Required from user:* The display name / organization name and a contact email address to list as the Data Controller in the Thai/English Privacy Policy page.
5. **External Credentials the User Will Provision:**
   - Supabase Project URL (`VITE_SUPABASE_URL`) and Anon/Publishable Key (`VITE_SUPABASE_ANON_KEY`).
   - Google Cloud OAuth 2.0 Client ID & Secret pasted into Supabase (*Authentication > Providers > Google*).
