// Public surface of the UI module. The screens live in pages/, their shared chrome in overlay.ts and
// widgets.ts, and the injected stylesheet in styles.ts. Other modules keep importing from '../ui'
// (createHud, createViewControls, showResult, PRESETS, Settings, ...) exactly as before.
export { DEFAULT_SETTINGS, PRESETS, STAT_BUDGET, budgetLeft, clampStatToBudget } from './model';
export type { Settings, StatKey } from './model';
export { showHome } from './pages/home';
export { showMainMenu } from './pages/mainMenu';
export type { MainMenuActions } from './pages/mainMenu';
export { showMatchSetup } from './pages/matchSetup';
export { showCharacters } from './pages/characters';
export { showSettingsPage } from './pages/settings';
export { showCareerPage } from './pages/career';
export type { CareerMatchLaunch } from './pages/career';
export { createHud } from './hud';
export { showResult } from './result';
export type { ResultExtras, ResultTournamentExtras } from './result';
export { ZOOM_MAX, ZOOM_MIN, clampZoom, createViewControls } from './viewControls';
