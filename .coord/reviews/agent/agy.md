# Review — branch `agent/agy` @ 4627ef6 (task P2, Phase 2 app shell)

Reviewer: opencode. Read-only review, no source file edited, nothing committed.
Diff reviewed: `git diff main...agent/agy` (4 files: `src/game/index.ts`, `src/ui/index.ts`, `src/ui/labels.ts`, `src/ui/labels.test.ts`).
Worktree `/Users/knimf/BADMINTONGAME-wt/agy` is clean and at 4627ef6.

## Standards

Rules (AGENTS.md / P2.md): **no HARD violation.** Only `src/ui/**` and `src/game/index.ts` changed; `src/types.ts`, `src/app/`, `src/game/match.ts`, `src/game/tutorial.ts` are untouched; `package.json` unchanged (no new dependencies); old `showTitle`/`showSetup` removed and `budgetLeft`/`clampStatToBudget` + `budget.test.ts` kept; `window.confirm` / `alert` appear nowhere in `src/`; frozen `DEFAULT_GAME_SETTINGS` / `DEFAULT_KEYS` are never mutated (`structuredClone(DEFAULT_KEYS)` on reset, `rebindKey` returns a sanitized copy, every settings edit goes through `structuredClone(currentSave.settings)`).

src/ui/index.ts:1-1983 — JUDGEMENT — the whole shell is one 1983-line module (CSS template string 104-558, 5 pages, HUD, result, view controls, form widgets) — the task said "one file per page is fine" so this is not a rule break, but it is now the largest source file and mixes styling, page state machines and pure-ish helpers, so every later UI task will collide here. Cheapest fix: move the style string to `src/ui/styles.ts` and each page to `src/ui/pages/<name>.ts` (no behaviour change).

src/ui/index.ts:56-64 — JUDGEMENT — `DEFAULT_SETTINGS` is exported but referenced nowhere in `src/` (`match.ts`/`tutorial.ts` only import the `Settings` type) — dead copy of `DEFAULT_GAME_SETTINGS` that will silently drift from the real defaults.

src/ui/index.ts:49,73-77 — JUDGEMENT — `STAT_BUDGET = 20` and `PRESETS` duplicate `sim/tuning` values — kept on purpose for `budget.test.ts`, but a future budget change in `sim` would not reach the sliders.

src/ui/index.ts:1497-1501 — JUDGEMENT — `listeningAction = action; renderTabs(); listeningAction = action;`: `renderTabs()` calls `stopListening()` (1307), so the row is built while nothing is listening and the re-assignment happens after the DOM exists. Capture still works, but the row never shows "กดปุ่มหรือคลิกเมาส์..." / "กำลังรอ...", so the player gets no confirmation that capture is armed (and a second click on another row's เปลี่ยน binds Mouse0 to the first action). Render once after the flag is set, or pass the listening action into `renderControlsTab`.

src/ui/index.ts:898 + 902, and 1303 + 1308 — JUDGEMENT — `appendStorageNotice` writes into `panel`, then the caller re-renders with `panel.innerHTML = ''`, wiping it. On My Characters the "cannot save on this browser" notice is therefore never visible, and on Settings it is lost for reset-keys/rebind (it survives only for slider/chip changes, which do not re-render). Notice should live outside the re-rendered subtree or be re-applied in `renderPage`/`renderTabs` from a `lastWriteOk` flag.

src/ui/index.ts:912-924 + src/game/index.ts:24-32 — JUDGEMENT — when `characters.length === 0` the back button is not rendered and `openMenu` re-reads `loadSave()`, so if `writeSave` fails the player is bounced from creation straight back into creation with no route to Home or the menu (blocked-storage dead end). Spec only asks for a notice, but the loop makes that notice the only way out.

src/ui/index.ts:628-629 — JUDGEMENT — the Home hint hard-codes WASD / Q / E / LShift / Alt / Space / C although Settings can rebind them, so the hint becomes wrong after a rebind. Render it from `loadSave().settings.controls.keys` (labels helpers already exist).

src/ui/index.ts:1556-1562 vs 1568 — JUDGEMENT — the mode `onChange` closure reads `descLines`, declared ten lines later; correct only because the callback runs after initialisation (TDZ-adjacent, fragile if the order changes).

src/ui/index.ts:1299-1304 — JUDGEMENT — every slider `input` event does `structuredClone(settings)` plus a full `JSON.stringify` + `localStorage.setItem`; correct and small today, but it writes on every pixel of a drag. Debounce or write on `change` if saves ever get heavier.

src/ui/index.ts:593-632, 884-1272, 1278-1625 — JUDGEMENT — overlays are plain `div`s: no `role="dialog"`, no focus trap, no Escape-to-close outside key capture, no live region for `stats-error` / conflict warning. Matches the pre-existing style, but the shell is now a multi-page flow and this is the moment to add the two attributes.

Positive notes: overlay lifecycle is consistent (`mountOverlay` clears stale `.bm-overlay`); every navigation path removes its overlay before calling the next page; all clickable controls are real `<button>`s with `type="button"`; text is Thai-first with English in parentheses, matching the existing UI.

## Spec

`/Users/knimf/BADMINTONGAME/.orchestra/crew/P2.md` + design doc "App shell and settings" / "Guest play":

- Home — PASS. `showHome` (593-632): title, "เล่นเลย (ไม่ต้องล็อกอิน)" → menu, login button `disabled` with เร็วๆ นี้.
- Main menu — PASS. `showMainMenu` (643-741): active character name/gender/body/height via `formatCharacterSummary`, เปลี่ยน → My Characters, แข่งกับบอท, ฝึกสอน 8 ท่า, ออนไลน์ + ทัวร์นาเมนต์ disabled with เร็วๆ นี้, ตัวละครของฉัน, ตั้งค่า.
- First run — PASS. `openMenu` (game/index.ts:24-33) with no active character opens My Characters, which starts in create mode (892, 927-931).
- Play vs bots — PASS. `showMatchSetup` (745-880): event buttons filtered by `eventsFor(gender)` and disabled otherwise (814-831), saved event re-fitted on open (760-771), bot level and 3x15/3x21 chips persisted through `persistMatchPatch` → `save.settings.match` (796-806), start passes `{...active.stats}` + `toMatchSettings(currentSave.settings)`.
- My Characters — PASS. List with active marker, create/edit/delete/activate via `createCharacter` / `updateCharacter` / `deleteCharacter` / `setActiveCharacter`; gender+body disabled on edit with height from `heightOf`; four sliders clamped by `clampStatToBudget` within `characterBudget`; `statsError` re-evaluated on every change, message shown and save disabled (1245-1254); in-page delete confirm with yes/no (955-984); no `window.confirm`/`alert`.
- Settings tabs — PASS. Camera (presets, height, distance, zoom, follow), Controls (sensitivity, one row per `ACTION_ORDER` action with Thai label + current keys, เปลี่ยน, key or Mouse0/Mouse2 capture, Escape cancels, `rebindKey` + `formatConflictMessage` warning, reset to cloned `DEFAULT_KEYS`), Assists (four modes with descriptions, hit assist, landing marker, timing ring, racket aid), Graphics (low/medium/high). Every edit goes through `updateSettings` → `onSaveChange` → `writeSave` (game/index.ts:15-18), so a reload re-reads the same values from `loadSave()`.
- Save-failure notice — PARTIAL. Implemented but transient on My Characters and on reset-keys/rebind (see Standards, 898/1303).
- `createViewControls` — PASS. 1940-1968 reads `loadSave().settings.controls.keys` and matches fullscreen/zoomIn/zoomOut via `matchesBinding`; starting zoom from `settings.camera.zoom`; wheel zoom unchanged.
- Frozen defaults — PASS. No mutation path found.
- HUD / result / fullscreen — PASS. HUD and result kept, result button returns to the menu, view controls disposed as before.
- Out of scope observation (not agy's files): `match.ts` / `render/` / `input/` still never read `settings.camera`, `settings.graphics` or `settings.assists.racketAid`, so those tabs persist values that no code consumes yet. That belongs to the render/input owner, not to this branch.

## Checks

Run in `/Users/knimf/BADMINTONGAME-wt/agy` at 4627ef6:

- `npx vitest run` — pass, 17 test files / 209 tests (includes new `src/ui/labels.test.ts`, 6 tests: 15 action labels, preset/quality labels, key formatting, conflict message, character summary with `heightOf`, `matchesBinding`).
- `npx tsc --noEmit` — pass, exit 0.
- `npx vite build` — pass, `✓ built in 245ms` (`dist/assets/index-*.js` 650.56 kB, only the usual chunk-size warning).

Verdict: no HARD issue, no spec item missing, all three checks pass. The five items worth a follow-up (listening-state feedback, notice wiped by re-render, blocked-storage dead end, hard-coded Home hints, 1983-line module) are all JUDGEMENT-level and do not block the merge.

APPROVE 4627ef6
