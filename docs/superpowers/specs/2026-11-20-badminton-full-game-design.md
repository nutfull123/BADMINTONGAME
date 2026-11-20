# Badminton web game — full game design

Status: draft for the user's approval (decisions taken in chat on 2026-11-20).
Builds on the playable demo (`2026-11-20-badminton-demo-design.md`), which stays the source of truth for
shot controls, physics and the single-player feel unless this document changes them.

## Intent

Turn the demo into a real, public web game people can play against bots, in tournaments and online
against each other. The user's words: make it "a real web app game", "more realistic scene and
characters", "online and doubles: men's doubles, women's doubles, mixed doubles, men's singles,
women's singles", "a tournament system too", plus "a home page, login/signup and settings such as
camera angle".

What makes it this game and not another: the player controls the racket face directly with the
mouse (with optional assists), footwork matters (split step, lunge), and body type changes how a
character plays. Everything below must keep that feel.

## Goals

1. All five events: men's singles (MS), women's singles (WS), men's doubles (MD), women's doubles
   (WD), mixed doubles (XD), playable against bots.
2. A realistic look: semi-realistic rigged male and female characters with animations, a real
   racket and shuttlecock, and an indoor hall with lighting and spectators.
3. App shell: home page, login and signup, main menu, settings (including camera angle),
   character management.
4. Character progression and an offline career of tournaments against bots.
5. Accounts with cloud save.
6. Online play: private rooms with friends by room code (first), then matchmaking with ranking,
   then private tournaments with friends.

## Non-goals (for this project)

- Mobile and touch controls. Desktop browser with mouse and keyboard only (user's decision).
  Write code so mobile could be added later, but build no touch controls.
- Public scheduled online tournaments (user's decision: not now).
- Payments, ads, cosmetics shop. (Claude's call: nothing in the request asks for monetization.)
- Text or voice chat. (Claude's call: avoids moderation work; room codes are shared outside the game.)
- Spectator mode and replays. (Claude's call.)
- Sound. (Claude's call: not requested; can be added later with CC0 sounds.)

## Anti-goals (would make it a failure even if it works)

- Pay-to-win or grind-to-win in ranked play: ranked must be fair (see Progression).
- Online lag that makes hits feel random: the player who sees the racket on the shuttle must hit it.
- Losing the direct racket control, the racket aid, or footwork in the move to realistic models.
- Assets whose license does not allow shipping them inside a public web game.

## Constraints

- Desktop Chrome first (also works in other desktop browsers); Thai is the main UI language,
  English labels alongside as the demo does now.
- Keep the architecture rule from `AGENTS.md`: `rules/`, `physics/`, `sim/` (and `game/rally.ts`)
  stay pure TypeScript with no DOM or Three.js, so the same code runs in the browser, on the game
  server, and could be ported to Roblox/Luau later.
- Secrets (Supabase service-role key, any server tokens) live only in server environment variables.
  Never in client code, the repo, or prompts.
- Thailand's PDPA applies to accounts: privacy policy page, consent at signup, and self-service
  account deletion.
- Every downloaded asset needs the user's explicit approval (file name, source, size) before download.

## Approaches considered

### Online backend (user picked A)
- **A. Supabase (auth + Postgres) + our own authoritative game server on Fly.io (Singapore).** Picked:
  the server runs the existing pure game code, so the server decides hits and ranked play is fair and
  hard to cheat; Singapore is close to Thai players; Supabase handles passwords and Google login.
  Cost: Supabase free tier; Fly.io smallest machine about USD 2–5/month (verify the Singapore price).
- B. Cloudflare Workers + Durable Objects + D1: one provider and edge latency, but daily free-tier
  compute caps break active matches, and login must be written by hand.
- C. Supabase only, the room host's browser runs the match: cheapest, but the host has zero lag and can
  cheat, and the free Realtime cap (about 100 messages/second per project) is exceeded by one doubles match.

### Realistic visuals (user picked B)
- A. Keep modelling in code, more detail: no downloads, but capped at a low-poly look.
- **B. Free CC0 (or equally permissive) rigged characters, animations, PBR textures and an HDRI.** Picked:
  the only free way past the low-poly look. Costs: bundle grows about 5–15 MB, and the downloaded
  animations must be blended with the existing footwork poses and racket-arm IK.
  agy is researching candidates now (`.coord/research/assets-cc0.md`); the user picks the set and
  approves each download.
- C. AI text-to-3D (e.g. Meshy): paid, inconsistent, needs manual rigging.

### Platform (user picked desktop only)
Desktop mouse+keyboard only now; mobile later would need a different control scheme.

## Decisions (the user's)

### Events and characters
- Five events: MS, WS, MD, WD, XD.
- A character has a gender (male/female) chosen at creation. Gender changes the look and the height
  range on offer; it does not change the stat budget.
  Claude's call for heights: male tall 1.95 / balanced 1.78 / short 1.63 m (unchanged from the demo);
  female tall 1.82 / balanced 1.68 / short 1.58 m.
- Gender and height are fixed after creation. A player can own several characters.
- Event gender rules (MS men, WS women, MD two men, WD two women, XD one man + one woman per side) are
  enforced in tournaments and ranked play; private rooms with friends may mix freely.

### Doubles
- Doubles court lines (full 6.10 m width; long service line for doubles 0.76 m inside the back
  boundary) and BWF doubles service rules (server/receiver order and service courts by score), for
  both 3x15 (default) and 3x21. Use the official BWF Laws of Badminton as the source.
- The player controls one character; the partner is a bot.
- Partner bot positions like real doubles: front-and-back when its side is attacking, side-by-side
  when defending, and covers the court the human leaves open.
- Online doubles: up to four humans per match; empty seats are filled by bots.
- The camera must keep all four players readable.

### Progression (option C)
- A new character starts with 20 stat points (each stat 0–10, as now).
- Points are earned only offline: playing bots (a win earns more than a loss) and career
  tournaments (bonus by the round reached). Maximum 40 (all stats at 10).
- Online ranked: everyone plays at 20 points; each character keeps a separate "ranked" 20-point
  stat set the player arranges.
- Private online rooms: the host chooses "real points" or "everyone at 20".

### Tournaments
- First: offline career tournaments against bots: knockout brackets of 8, 16 or 32, in any of the five
  events, in tiers from small to big events; bots get stronger by tier; points earned by round reached.
- Second (after online): private tournaments with friends: create a bracket, share a code, each match
  is played as an online room, empty slots become bots.
- Not now: public scheduled tournaments.

### Online
- First: private rooms by room code (simplest to test).
- Then: automatic matchmaking and a ranking per event.

### App shell and settings
Flow:

```
Home ──▶ Login / Signup ──▶ Main menu
                             ├─ Play vs bots   (MS · WS · MD · WD · XD)
                             ├─ Online         (room with friends · find a match)
                             ├─ Tournaments
                             ├─ My characters
                             └─ Settings
```

Settings (Claude's proposal the user accepted in outline):
- Camera: presets "behind, low" / "behind, high" / "broadcast"; height; distance; default zoom;
  follow the player on/off.
- Controls: mouse sensitivity; rebindable keys.
- Assists: mode (A-easy / A-normal / A-pro / B-timing), hit assist, landing marker, timing ring,
  racket aid.
- Graphics: quality level (for weaker machines).
- Account: display name; characters.
Settings are saved locally before accounts exist and synced to the account afterwards.

## What exists today (the demo, on `main`)

- `rules/` 3x15 and 3x21 scoring, singles service courts (tested).
- `physics/` shuttle flight with drag, net/floor events, landing prediction, singles in/out,
  `serviceBox` for singles.
- `sim/` player movement, stats, stamina, racket plane, swings and shots, dive, footwork
  (split step boost, chasse, crossover, lunge, recover), assists (`assist.ts`), bot (`bot.ts`).
- `game/` fixed 120 Hz loop, singles match flow (`rally.ts` pure), serve stance per BWF Law 9.1,
  tutorial wiring.
- `render/` low-poly humans built from primitives with footwork poses and racket-arm IK, shuttle with
  trail and drop line, landing marker, racket aid (FH/BH ring, live shuttle target), camera framing
  that fits the whole court, zoom.
- `ui/` title, setup (presets, stats, modes, settings), HUD, result, fullscreen/zoom controls.
- `tutorial/` eight drills.
- One near (human) and one far (bot) player everywhere; `WorldView.players` is a list.

## Phases (build order)

Each phase ends playable, tested, cross-reviewed, merged and pushed. Later phases get a short
design check with the user before they start (especially phases 5 and 6).

1. **Doubles and the five events (offline).** Doubles rules and court, two players per side,
   partner bot, gender on characters, event selection, camera for four players.
2. **App shell.** Home, main menu, settings (camera presets and the rest), character management with
   local save; the current title/setup screens fold into this.
3. **Realistic visuals.** Approved CC0 assets: characters with animations blended with footwork and
   racket IK, real racket and shuttlecock, indoor hall, lighting, spectators, graphics quality setting.
4. **Career and progression.** Earning points, offline tournaments with brackets and tiers.
5. **Accounts.** Supabase login/signup (email + Google), cloud save of characters, settings and
   progress, privacy policy, account deletion.
6. **Online rooms.** Authoritative game server on Fly.io (Singapore) running the shared game code;
   room codes; up to four humans; bots fill seats; reconnect handling.
7. **Matchmaking and ranking** per event, ranked 20-point stat sets.
8. **Private tournaments with friends** over online rooms.

## Left to the builder

- Data model details (tables, columns, row-level security policies) within the decisions above.
- Netcode specifics: tick and snapshot rates, client prediction, interpolation and lag compensation,
  as long as hits feel right at about 30–80 ms round trip.
- Rating formula (Elo or Glicko) and matchmaking windows.
- Partner bot tuning and doubles rotation details beyond front-back / side-by-side.
- How downloaded animations are retargeted and blended with procedural footwork and IK.
- Tournament tier names (fictional, no real event or brand names) and point amounts (in `tuning.ts`).
