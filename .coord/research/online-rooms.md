# Phase 6 Research: Online Rooms, Netcode, Fly.io & Hosting

> **Verification date:** 2026-11-22. Versions, prices, and API details below were checked against official documentation and package registries on that date. Anything not directly verifiable from an official page is marked `[uncertain]`.

---

## 1. Server Stack: `ws` vs. Colyseus vs. `uWebSockets.js`

| Option | Latest Version | License | Maturity & Fit | Fixed-Step (`STEP = 1/120`) Loop |
|---|---|---|---|---|
| **Node.js + `ws`** | `ws@8.23.0` (`https://www.npmjs.com/package/ws`) | MIT (`https://github.com/websockets/ws/blob/master/LICENSE`) | Industry-standard Node WebSocket library; zero framework lock-in; tiny footprint. Room map, 6-char room codes, seat assignment, and reconnect tokens are ~150–200 lines of plain TypeScript. | Run our own `setInterval` + `performance.now()` fixed-step accumulator calling `stepRally(..., STEP, ...)` directly on our existing `Rally` / `MatchState` objects, broadcasting compact snapshots at 20–30 Hz. |
| **Colyseus** | `colyseus@0.18.12` (`https://www.npmjs.com/package/colyseus`) | MIT (`https://github.com/colyseus/colyseus`) | Mature multiplayer room framework (`https://docs.colyseus.io/`). Built-in room lifecycle, matchmaking/join-by-id, and `allowReconnection(client, seconds)` (`https://docs.colyseus.io/server/room/`). | Supports `setSimulationInterval()` / `setFixedTimestep(step, tickRate)`. **Catch:** its automatic binary state sync (`@colyseus/schema`) requires mirroring our pure `Rally`/`PlayerState`/`ShuttleState` types into decorated `Schema` classes, and its built-in patch broadcast does not implement client-side prediction or lag-compensated shuttle rewind for us. |
| **`uWebSockets.js`** | `v20.70.0` `[uncertain: exact latest GitHub tag]` (`https://github.com/uNetworking/uWebSockets.js`) | Apache-2.0 (`https://github.com/uNetworking/uWebSockets.js`) | Extremely fast C++ bindings, but **not published on npm** (installed via GitHub tag tarball) with precompiled native binaries per OS/arch/Node ABI. Overkill for a small room server and adds Docker/CI fragility. | Same custom accumulator loop as `ws`, but with non-standard HTTP/WS APIs and native binary constraints. |

**Recommendation for a small team:** **Node.js + plain `ws`**. Our simulation (`src/rules`, `src/physics`, `src/sim`, `src/game/rally.ts`) is already written as pure TypeScript functions operating on plain objects. Plain `ws` lets the server run `stepRally` directly with zero schema duplication, gives full control over binary/JSON snapshots and lag-compensated hit checks, and keeps dependencies minimal.

---

## 2. Netcode for a Fast Racket Game (30–80 ms RTT)

A badminton smash moves fast (~40–70 m/s off the racket before drag slows it), so at 30–80 ms round-trip time (15–40 ms one-way) naïve lockstep or pure server-rendered movement feels sluggish. Standard fast-paced client-server architecture applies cleanly:

- **Server tick rate:** **120 Hz** (`STEP = 1 / 120` s = 8.33 ms, matching `src/game/rally.ts` exactly). Stepping 4 players + 1 shuttle in pure JS takes microseconds, so one Fly shared-CPU machine can run many concurrent rooms at 120 Hz while guaranteeing 100% physics parity with offline play. (See Glenn Fiedler, *Fix Your Timestep!*: `https://gafferongames.com/post/fix_your_timestep/`.)
- **Snapshot rate:** **20–30 Hz** (every 4th–6th physics tick, i.e. 33–50 ms). Each snapshot carries `{ tick, ackSeq, match, rallyStage, server, serverSlot, receiverSlot, players, shuttle }`. Client sends input frames (`Intent` + monotonic `seq` + `renderedShuttleTick`) at 30–60 Hz (or on change + heartbeat).
- **Client-side prediction & reconciliation (local player):** The local client runs `stepPlayer` immediately on its own `Intent` at `STEP = 1/120`, buffers unacknowledged inputs by `seq`, and when an authoritative snapshot arrives with `ackSeq`, snaps/blends the local player to the server state and replays inputs with `seq > ackSeq`. (See Gabriel Gambetta, *Client-Side Prediction and Server Reconciliation*: `https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html`.)
- **Interpolation (remote players & shuttle):** Buffer at least 2 snapshots and render remote players ~50–80 ms behind the latest snapshot (`~2 × snapshotInterval`), interpolating smoothly between them. For the shuttle, interpolate between snapshots or step locally from the last authoritative launch state with `stepShuttle` (deterministic drag) and smoothly reconcile on hit/net/floor events. (See Glenn Fiedler, *Snapshot Interpolation*: `https://gafferongames.com/post/snapshot_interpolation/`.)
- **Fair racket-shuttle contact (lag compensation):** At 30–80 ms RTT + interpolation delay, a player swings when *they* see the shuttle at their racket, which is 40–100 ms behind the server's current tick. To honor the design spec's rule (*"the player who sees the racket on the shuttle must hit it"*):
  1. Server keeps a short ring buffer of recent shuttle states (~150 ms = 18 ticks at 120 Hz).
  2. When a swing/release `Intent` arrives tagged with `renderedShuttleTick`, the server looks up the shuttle state at that tick (clamped to a max rewind window of ~100–120 ms to prevent abuse), evaluates `stepPlayer` contact against that rewound shuttle, and if it hits, launches the shuttle and fast-forwards `stepShuttle` by the rewind delta to bring it to the current server tick.
  3. Reference: Valve Developer Community, *Source Multiplayer Networking* (lag compensation & entity interpolation): `https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking`.
- **Per-player assists note:** `stepRally` (`src/game/rally.ts:117`) currently accepts a single `assist: number` for all players. In Phase 6, extend it to per-player assist settings so ranked matches enforce manual control + one fixed hit-assist radius for everyone while private friend rooms apply the host's chosen assists (with slow motion kept offline-only).

---

## 3. Fly.io (Singapore `sin` Region)

Sources: `https://fly.io/docs/about/pricing/`, `https://fly.io/docs/launch/autostop-autostart/`, `https://fly.io/docs/reference/configuration/`, `https://fly.io/docs/languages-and-frameworks/node/`, `https://fly.io/docs/apps/secrets/`.

- **Compute pricing (Singapore `sin`, billed per second while running):**
  - Fly.io applies a regional multiplier in Singapore (`~1.269×` vs. lowest US baseline `[uncertain: exact multiplier is derived from Fly's published regional table and can change]`).
  - **`shared-cpu-1x` + 256 MB RAM:** **~$2.78/month** (~$0.0038/hr) if running 24/7.
  - **`shared-cpu-1x` + 512 MB RAM:** **~$4.69/month** (~$0.0065/hr) if running 24/7 (extra RAM ~$6.00/GB/mo scaled by region).
  - **Other charges:** Stopped rootfs storage **$0.15/GB/month**; outbound APAC bandwidth **$0.04/GB**; shared IPv4 + IPv6 **$0** (optional dedicated IPv4 is $2.00/mo, not needed).
- **WebSockets & `auto_stop_machines` / `auto_start_machines`:**
  - Fly Proxy terminates TLS and forwards `wss://` WebSockets natively (`force_https = true`).
  - **Auto-stop caveat:** When `auto_stop_machines = "stop"` (or `"suspend"`) is enabled, Fly Proxy stops idle Machines and sends a WebSocket `GoAway` / close code `1012` to active sockets before shutting down. Because active rooms live in memory, an auto-stop **drops all live sockets and destroys in-memory room state**.
  - **Practical options:**
    - **Always-on (`auto_stop_machines = "off"`, `min_machines_running = 1`):** Zero unexpected disconnects, zero cold-start wait (~$2.78–$4.69/mo).
    - **Auto-stop during early dev (`auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0`):** Costs near $0 when nobody plays; wakes on first connection (~1–2 s cold start). Still requires client heartbeat pings (every ~20–30 s) and reconnect logic for deploys/restarts.
- **Deploying Node with `Dockerfile` + `flyctl`:**
  - Multi-stage `Dockerfile` (`FROM node:22-alpine`), bind `HOST=0.0.0.0`, `PORT=8080`, matching `internal_port = 8080` in `fly.toml`.
  - Initialize with `fly launch --no-deploy` (pick region `sin`), then deploy with `fly deploy` (Fly's remote builder builds the image — no local Docker needed).
- **Secrets:**
  - `fly secrets set SUPABASE_URL="https://<ref>.supabase.co" SUPABASE_ANON_KEY="..."` stores encrypted secrets and injects them as runtime `process.env.*` variables (triggers a rolling restart). Never bake secrets into the Dockerfile or repo.
- **What the user must create & pay for:**
  - A Fly.io account with a credit card attached, `flyctl` installed and authenticated (`fly auth login`), and monthly usage (~$3–$5/mo for 1 always-on `sin` machine, or <$1/mo with auto-stop while testing with friends).

---

## 4. Identifying Players on the Game Server (Supabase JWT)

Sources: `https://supabase.com/docs/guides/auth/jwts`, `https://supabase.com/docs/guides/auth/signing-keys`, `https://supabase.com/docs/reference/javascript/auth-getclaims`.

- **Recommended server verification (Asymmetric JWT Signing Keys / JWKS):**
  - Supabase exposes your project's public keys at `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` (edge-cached 10 minutes).
  - Verify the player's `access_token` locally on the game server using either:
    1. **`supabase.auth.getClaims(token)`** (via `@supabase/supabase-js` already in our repo — verifies locally via cached JWKS for asymmetric keys, and automatically falls back to calling Supabase Auth if the project is still on legacy symmetric `HS256`), **or**
    2. Standard Node **`jose`** (`createRemoteJWKSet` + `jwtVerify`) against the JWKS URL (zero Supabase SDK needed on the server, works when asymmetric signing keys are enabled).
  - The verified `sub` claim is the player's authoritative Supabase `user.id` (UUID).
  - *Note:* If the project still uses legacy symmetric `HS256` tokens, `getClaims(token)` performs one HTTPS check at room-join time (not per tick), so it works seamlessly without ever putting the `service_role` key or JWT secret on the game server.
- **What the client sends when joining a room:**
  - Do **not** pass the JWT in the WebSocket URL query string (`?token=...` leaks into proxy logs).
  - Instead, open `wss://<server>/ws` and immediately send an initial JSON message `{ type: "join", token: session.access_token, roomCode, character }` (or `{ type: "create", token, ... }`). The server disconnects any socket that does not authenticate within ~5 seconds.

---

## 5. Hosting the Web Client & Updating Auth URLs

| Host | Free Tier Cost | Static Bandwidth | Custom Domain + SSL | Commercial Use on Free Tier? | Notes |
|---|---|---|---|---|---|
| **Cloudflare Pages** (`https://pages.cloudflare.com/`) | **$0/mo** | **Unlimited** | Yes (free) | **Allowed** | 500 builds/mo; global edge CDN (includes Bangkok POP); best free tier for static Vite SPAs. |
| **Vercel Hobby** (`https://vercel.com/pricing`) | **$0/mo** | 100 GB/mo | Yes (free) | **Not allowed** (Pro $20/mo required for commercial use) | Fine for personal/friend testing; pauses if limit exceeded. |
| **Netlify Free** (`https://www.netlify.com/pricing/`) | **$0/mo** | ~15 GB/mo (300-credit pool) | Yes (free) | **Allowed** | Hard-pauses when 300 monthly credits run out; tight for a 3D game with GLB/HDRI assets. |
| **Same Fly.io App** (`https://fly.io/docs/about/pricing/`) | **$0 extra compute** | $0.04/GB (APAC) | Yes (free) | **Allowed** | Serves Vite `dist/` from the same Node server (`https://<app>.fly.dev`); single deploy, zero CORS, served from Singapore. |

**Recommendation:** **Cloudflare Pages** (free, unlimited bandwidth for our 3D assets, fast in Thailand, commercial-friendly) paired with the Fly.io Singapore WebSocket server. (Serving `dist/` from the same Fly.io app is a solid backup if you want one deploy during private friend tests.)

**Required Auth configuration changes once hosted on a real domain (`https://<domain>`):**
1. **Supabase Dashboard** (*Authentication > URL Configuration*, `https://supabase.com/docs/guides/auth/redirect-urls`):
   - Set **Site URL** to `https://<domain>`.
   - Add `https://<domain>/**` to **Redirect URLs** (keep `http://localhost:5173/**` for local development).
2. **Google Cloud Console** (*APIs & Services > Credentials > OAuth 2.0 Client ID*, `https://supabase.com/docs/guides/auth/social-sign-in/auth-google`):
   - Add `https://<domain>` to **Authorized JavaScript origins**.
   - Keep `https://<project-ref>.supabase.co/auth/v1/callback` in **Authorized redirect URIs**.
   - Update OAuth consent screen **Application Home Page** (`https://<domain>`) and **Privacy Policy** (`https://<domain>/#privacy`) before moving from Testing to Production.

---

## 6. Sharing Game Code Between Browser and Node

- **Current repo audit (checked 2026-11-22):**
  - `src/rules/`, `src/physics/`, `src/sim/`, `src/game/rally.ts`, and `src/types.ts` contain **zero** DOM, `window`, `document`, `localStorage`, or `three` imports. They already run headless in Node via Vitest.
  - Known follow-up (already in `PROGRESS.md`): `src/game/teams.ts` imports `PRESETS` from `src/ui/` — keep server code off `src/game/teams.ts` (or move `PRESETS` to a pure module when needed).
- **Building the server from the same repo:**
  - Place server code in `server/` (e.g., `server/index.ts`, `server/room.ts`) importing directly from `../src/rules`, `../src/physics`, `../src/sim`, `../src/game/rally`, and `../src/types`.
  - Add a `tsconfig.server.json` with `"lib": ["ES2022"]` (omitting `"DOM"`) so `tsc --noEmit -p tsconfig.server.json` fails at compile time if any browser global leaks into server-imported code.
  - Because `tsconfig.json` uses `"moduleResolution": "bundler"` and extensionless imports (`../physics`), bundle `server/index.ts` into a single ESM file `dist-server/index.js` using **esbuild** (`esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/index.js`) — Vite already depends on/pairs cleanly with esbuild, avoiding `.js` extension churn across `src/` and giving a tiny Docker image running `node dist-server/index.js`.

---

## Decisions for the User

1. **Game server runtime on Fly.io (`sin`, Singapore):**
   - **Option A (Recommended for testing with friends):** `shared-cpu-1x` (256 MB RAM) with `auto_stop_machines = "stop"` and `min_machines_running = 0` — **~$0–$1/month** (wakes in ~1–2 s when someone creates a room; sleeps when idle).
   - **Option B (Recommended once public / active daily):** `shared-cpu-1x` (256 MB or 512 MB RAM) always-on (`auto_stop_machines = "off"`, `min_machines_running = 1`) — **~$2.78/month (256 MB)** or **~$4.69/month (512 MB)**.
   - *Action required by user:* Create a Fly.io account (credit card required) and log in with `flyctl`.
2. **Web client hosting (so friends can open a URL):**
   - **Option A (Recommended):** **Cloudflare Pages** — **$0/month** (unlimited static bandwidth for 3D assets, fast edge in Thailand, custom domain + SSL free).
   - **Option B:** Serve the Vite build directly from the **same Fly.io app** — **$0 extra compute** (+ $0.04/GB egress), one deploy and one URL (`https://<app>.fly.dev`).
   - **Option C:** **Vercel Hobby** — **$0/month** (non-commercial use only; Pro is $20/mo).
3. **Custom domain (optional):**
   - **Option A (Recommended for now):** Use the free `*.pages.dev` (or `*.fly.dev`) subdomain — **$0**.
   - **Option B:** Buy a custom domain (e.g. `.com` via Cloudflare Registrar) — **~$10–$12/year** `[uncertain: varies by TLD]`.
4. **Server package to approve before Phase 6 starts:**
   - **Recommended:** Plain **`ws`** (`8.23.0`, MIT) + **`esbuild`** (devDependency for server build) — **$0**, simplest to maintain with our existing pure simulation loop.
   - *Alternative:* **Colyseus** (`0.18.12`, MIT) — **$0**, more boilerplate to mirror our existing `Rally`/`PlayerState` types into `@colyseus/schema`.
