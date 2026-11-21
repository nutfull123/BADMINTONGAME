# Cross-Review: `agent/opencode` (`85c7ea1`)

## Standards
- Scope check (`git diff main...agent/opencode`): Only `src/ui/**` (`src/ui/index.ts`, `src/ui/capture.ts`, `src/ui/capture.test.ts`, `src/ui/overlay.ts`, `src/ui/labels.ts`, `src/ui/labels.test.ts`, `src/ui/model.ts`, `src/ui/styles.ts`, `src/ui/hud.ts`, `src/ui/result.ts`, `src/ui/viewControls.ts`, and `src/ui/pages/*.ts`) and `src/game/index.ts` were touched. `src/types.ts`, `src/app/`, `src/render/`, `src/input/`, `src/game/match.ts`, `src/game/tutorial.ts`, and `package.json` were untouched. No new dependencies were added.
- `src/ui/pages/characters.ts:15-416` - JUDGEMENT - Long Function in `showCharacters` / `renderCharacterForm` - `showCharacters` builds the list and form imperatively in one ~400-line closure; acceptable for DOM page construction, though form field builders could be extracted if the form grows further.
- `src/ui/pages/settings.ts:262-315` - JUDGEMENT - Window capture listeners rely on page button callbacks (`stopListening()`) for cleanup - `startListeningForAction` attaches `keydown`/`mousedown`/`contextmenu` listeners on `window` and cleans them up on capture, Escape, tab switch, or Back button click, but if another page ever called `clearOverlays()` directly while capture was active, those window listeners would remain until the next key/mouse event.

## Spec
- **1. Key rebinding waiting state (`src/ui/pages/settings.ts:238-315`, `src/ui/capture.ts:9-19`)**: PASS.
  - `startListeningForAction` sets `listeningAction = action` before calling `renderTabs()`, and `renderTabs()` no longer resets `listeningAction`, so the waiting state (`"กดปุ่มหรือคลิกเมาส์... (Esc ยกเลิก)"` and button `"ยกเลิก (Cancel)"`) renders on that single row.
  - Clicking `เปลี่ยน` on another row evaluates `captureStep(listeningAction, action)` to `'arm'`, calls `stopListening()` to cancel the previous capture, and arms the new row; clicking the active row's button evaluates to `'cancel'` and stops capture.
  - `onMouseDown` checks `isCaptureIgnoredTarget(e.target as Element | null)` (`'button, input, select, textarea, a[href], [data-rebind]'`), so clicking `เปลี่ยน` or any button/control is never bound as `Mouse0`.
  - Unit tests in `src/ui/capture.test.ts` cover `captureStep` transitions and `isCaptureIgnoredTarget`.
- **2. Save-failure notice persistence (`src/ui/overlay.ts:30-55`, `src/ui/pages/characters.ts:25,33`, `src/ui/pages/settings.ts:46,64`, `src/ui/pages/matchSetup.ts:25,36,70`)**: PASS.
  - `createStorageNotice(overlay)` appends the warning banner (`data-testid="storage-warning"`) directly to `overlay` outside `panel`, and tracks `lastWriteOk`. Clearing `panel.innerHTML = ''` on page/tab re-renders preserves the warning banner on `overlay`.
- **3. Blocked storage + no characters (`src/ui/pages/characters.ts:57-70`, `src/game/index.ts:20-39,72-74`)**: PASS.
  - When `currentSave.characters.length === 0`, `showCharacters` renders a `"← กลับหน้าแรก (Home)"` button (`data-testid="characters-back-home"`) wired to `onHome` (`openHome`), so the user is never trapped on the first-character screen.
  - `src/game/index.ts` keeps the in-memory `save: SaveFile` across `openHome`, `openMenu`, `openCharacters`, `openSettings`, and `openSetup` instead of re-reading `loadSave()` on each navigation, so a character created while `localStorage` is blocked remains active and playable for the entire session.
- **4. Home control hints (`src/ui/pages/home.ts:11,48`, `src/ui/labels.ts:104-123`, `src/game/index.ts:28`)**: PASS.
  - `showHome(container, onStart, keys = loadSave().settings.controls.keys)` (and `openHome` passing `save.settings.controls.keys`) renders `formatControlHints(keys)` with dynamic movement and action bindings (`formatMovementHint`, `formatBindingList`), tested in `src/ui/labels.test.ts`.
- **5. Split `src/ui/index.ts` (`src/ui/index.ts:1-14`)**: PASS.
  - `src/ui/index.ts` is now a clean 14-line barrel re-exporting all existing public symbols (`DEFAULT_SETTINGS`, `PRESETS`, `STAT_BUDGET`, `budgetLeft`, `clampStatToBudget`, `Settings`, `StatKey`, `showHome`, `showMainMenu`, `MainMenuActions`, `showMatchSetup`, `showCharacters`, `showSettingsPage`, `createHud`, `showResult`, `ZOOM_MAX`, `ZOOM_MIN`, `clampZoom`, `createViewControls`) from focused modules (`model.ts`, `overlay.ts`, `styles.ts`, `labels.ts`, `capture.ts`, `hud.ts`, `result.ts`, `viewControls.ts`, `pages/*.ts`).

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME-wt/opencode`): PASS — 18 test files passed (226 tests).
- `npx tsc --noEmit` (in `/Users/knimf/BADMINTONGAME-wt/opencode`): PASS — exit 0.
- `npx vite build` (in `/Users/knimf/BADMINTONGAME-wt/opencode`): PASS — built in 229ms.

APPROVE 85c7ea1
