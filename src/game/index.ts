// App shell flow: Home -> Main menu -> (Create character if none) -> Play vs Bots / Tutorial / Tournaments / My Characters / Settings.
import { activeCharacter, awardPoints, characterBudget } from '../app/characters';
import { loadSave, writeSave } from '../app/save';
import { toMatchSettings } from '../app/settings';
import { matchPoints } from '../career';
import type { SaveData } from '../types';
import {
  showCareerPage,
  showCharacters,
  showHome,
  showMainMenu,
  showMatchSetup,
  showSettingsPage,
  type CareerMatchLaunch,
  type ResultExtras,
} from '../ui';
import { fitEvent } from '../ui/events';
import { applyCareerResult } from './careerFlow';
import { startMatch, type MatchOutcome } from './match';
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
      onTournament: openCareer,
      onCharacters: openCharacters,
      onSettings: openSettings,
    });
  };

  const openMatchSetup = (): void => {
    showMatchSetup(
      root,
      save,
      updateSave,
      (cfg) => {
        const active = activeCharacter(save);
        const charId = active?.id ?? null;
        startMatch(
          root,
          {
            ...cfg,
            budget: active ? Math.floor(characterBudget(active)) : undefined,
            onFinish: ({ won }: MatchOutcome): ResultExtras | void => {
              if (!charId) return;
              const pts = matchPoints(cfg.settings.botLevel, won);
              updateSave(awardPoints(save, charId, pts));
              const updated = activeCharacter(save);
              return {
                pointsEarned: pts,
                totalEarned: updated?.earnedPoints ?? pts,
              };
            },
          },
          openMenu,
        );
      },
      openMenu,
    );
  };

  const openCareer = (): void => {
    const active = activeCharacter(save);
    if (!active) {
      openCharacters();
      return;
    }
    showCareerPage(
      root,
      save,
      updateSave,
      (launch: CareerMatchLaunch) => launchCareerMatch(active.id, launch),
      openMenu,
    );
  };

  const launchCareerMatch = (characterId: string, launch: CareerMatchLaunch): void => {
    const active = save.characters.find((c) => c.id === characterId) ?? activeCharacter(save);
    if (!active) {
      openCharacters();
      return;
    }
    const { tournament, next } = launch;
    const baseMatchSettings = toMatchSettings({
      ...save.settings,
      match: {
        ...save.settings.match,
        event: tournament.event,
        botLevel: next.botLevel,
      },
    });
    const settings = {
      ...baseMatchSettings,
      format: next.format,
    };

    startMatch(
      root,
      {
        stats: { ...active.stats },
        settings,
        budget: Math.floor(characterBudget(active)),
        givenTeams: {
          partner: next.partner?.stats ?? null,
          opponents: next.opponent.players.map((p) => p.stats),
        },
        onFinish: ({ won, score }: MatchOutcome): ResultExtras => {
          const applied = applyCareerResult(
            save,
            characterId,
            { won, score },
            save.settings.match.format,
            tournament,
          );
          updateSave(applied.save);
          return applied.extras;
        },
      },
      openCareer,
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
