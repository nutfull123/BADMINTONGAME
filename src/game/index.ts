// App shell flow: Home -> Main menu -> (Create character if none) -> Play vs Bots / Tutorial / My Characters / Settings.
import { activeCharacter } from '../app/characters';
import { loadSave, writeSave } from '../app/save';
import { toMatchSettings } from '../app/settings';
import type { SaveData } from '../types';
import {
  showCharacters,
  showHome,
  showMainMenu,
  showMatchSetup,
  showSettingsPage,
} from '../ui';
import { fitEvent } from '../ui/events';
import { startMatch } from './match';
import { startTutorial } from './tutorial';

export { runRally, STEP } from './rally';

export function startGame(root: HTMLElement): void {
  let save: SaveData = loadSave();

  const updateSave = (next: SaveData): boolean => {
    save = next;
    return writeSave(save);
  };

  const openHome = (): void => {
    showHome(root, openMenu, save.settings.controls.keys);
  };

  const openMenu = (): void => {
    // The in-memory save is authoritative for this session: re-reading storage here would throw away a
    // character or settings change that writeSave could not persist (blocked storage, private window),
    // sending the player back to character creation with no way out.
    const active = activeCharacter(save);
    if (!active) {
      openCharacters();
      return;
    }
    showMainMenu(root, save, {
      onPlayMatch: openMatchSetup,
      onTutorial: launchTutorial,
      onCharacters: openCharacters,
      onSettings: openSettings,
    });
  };

  const openMatchSetup = (): void => {
    showMatchSetup(
      root,
      save,
      updateSave,
      (cfg) => startMatch(root, cfg, openMenu),
      openMenu,
    );
  };

  const launchTutorial = (): void => {
    const active = activeCharacter(save);
    if (!active) {
      openCharacters();
      return;
    }
    const fitted = fitEvent(save.settings.match.event, active.stats.gender);
    const settings = toMatchSettings({
      ...save.settings,
      match: { ...save.settings.match, event: fitted },
    });
    startTutorial(root, { stats: { ...active.stats }, settings }, openMenu);
  };

  const openCharacters = (): void => {
    showCharacters(root, save, updateSave, openMenu, openHome);
  };

  const openSettings = (): void => {
    showSettingsPage(root, save, updateSave, openMenu);
  };

  openHome();
}
