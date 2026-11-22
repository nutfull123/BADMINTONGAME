// App shell flow: Home -> Account / Main menu -> (Create character if none) -> Play vs Bots / Tutorial / Tournaments / My Characters / Settings.
import {
  currentUser,
  deleteAccount,
  isConfigured,
  onAuthChange,
  signOut,
  type AccountResult,
} from '../account/auth';
import { createCloudSync, fetchCloudSave, pushCloudSave } from '../account/cloud';
import { activeCharacter, awardPoints, characterBudget } from '../app/characters';
import { loadSave, writeSave } from '../app/save';
import { toMatchSettings } from '../app/settings';
import { matchPoints } from '../career';
import type { AccountUser, SaveData, SyncChoice } from '../types';
import {
  showAccountPage,
  showCareerPage,
  showCharacters,
  showHome,
  showMainMenu,
  showMatchSetup,
  showPrivacyPage,
  showSettingsPage,
  showSyncChoiceDialog,
  type CareerMatchLaunch,
  type ResultExtras,
} from '../ui';
import { fitEvent } from '../ui/events';
import { applyCareerResult } from './careerFlow';
import { startMatch, type MatchOutcome } from './match';
import { runSignInSync } from './syncFlow';
import { startTutorial } from './tutorial';

export { runRally, STEP } from './rally';

type Screen = 'home' | 'account' | 'privacy' | 'menu' | 'other';

export function startGame(root: HTMLElement): void {
  let save: SaveData = loadSave();
  let activeUser: AccountUser | null = null;
  let cloudSync: ReturnType<typeof createCloudSync> | null = null;
  let syncedUserId: string | null = null;
  let syncInFlight: { userId: string; promise: Promise<void> } | null = null;
  let syncError: string | null = null;
  let screen: Screen = 'home';

  const updateSave = (next: SaveData): boolean => {
    save = next;
    const ok = writeSave(save);
    if (activeUser && cloudSync) {
      cloudSync.push(save);
    }
    return ok;
  };

  const askSyncChoice = (local: SaveData, cloud: SaveData): Promise<SyncChoice> =>
    new Promise((resolve) => {
      showSyncChoiceDialog(root, local, cloud, resolve);
    });

  const clearAccountState = (): void => {
    activeUser = null;
    cloudSync = null;
    syncedUserId = null;
    syncInFlight = null;
    syncError = null;
  };

  const syncSignedInUser = (user: AccountUser): Promise<void> => {
    activeUser = user;
    if (syncedUserId === user.id) return Promise.resolve();
    if (syncInFlight && syncInFlight.userId === user.id) return syncInFlight.promise;

    const promise = (async () => {
      const res = await runSignInSync(user.id, save, {
        fetchCloudSave,
        pushCloudSave,
        saveLocal: (next) => {
          save = next;
          writeSave(save);
        },
        askChoice: askSyncChoice,
      });
      // Ignore stale result if the user signed out while syncing.
      if (activeUser?.id !== user.id) return;
      save = res.save;
      if (res.ok) {
        syncError = null;
        syncedUserId = user.id;
        cloudSync = createCloudSync(user.id);
      } else {
        syncError = res.error;
        cloudSync = null;
      }
    })().finally(() => {
      if (syncInFlight?.userId === user.id) syncInFlight = null;
    });

    syncInFlight = { userId: user.id, promise };
    return promise;
  };

  const openPrivacy = (returnTo: () => void): void => {
    screen = 'privacy';
    showPrivacyPage(root, returnTo);
  };

  const openAccount = (returnTo: () => void): void => {
    screen = 'account';
    showAccountPage(root, {
      onSuccess: () => {
        void (async () => {
          const user = activeUser ?? (await currentUser());
          if (user) await syncSignedInUser(user);
          openMenu();
        })();
      },
      onOpenPrivacy: () => openPrivacy(() => openAccount(returnTo)),
      onBack: returnTo,
    });
  };

  const openHome = (): void => {
    screen = 'home';
    showHome(root, openMenu, save.settings.controls.keys, {
      configured: isConfigured(),
      onOpenAccount: () => openAccount(openHome),
      onOpenPrivacy: () => openPrivacy(openHome),
    });
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
    screen = 'menu';
    showMainMenu(root, save, {
      onPlayMatch: openMatchSetup,
      onTutorial: launchTutorial,
      onTournament: openCareer,
      onCharacters: openCharacters,
      onSettings: openSettings,
      user: activeUser,
      syncError,
    });
  };

  const openMatchSetup = (): void => {
    screen = 'other';
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
    screen = 'other';
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
    screen = 'other';
    showCharacters(root, save, updateSave, openMenu, openHome);
  };

  const handleSignOut = async (): Promise<AccountResult> => {
    if (cloudSync) await cloudSync.flush();
    const res = await signOut();
    if (res.ok) clearAccountState();
    return res;
  };

  const handleDeleteAccount = async (): Promise<AccountResult> => {
    const res = await deleteAccount();
    if (res.ok) clearAccountState();
    return res;
  };

  const openSettings = (): void => {
    screen = 'other';
    showSettingsPage(root, save, updateSave, openMenu, {
      user: activeUser,
      configured: isConfigured(),
      onOpenAccount: () => openAccount(openSettings),
      onSignOut: handleSignOut,
      onDeleteAccount: handleDeleteAccount,
    });
  };

  const isPrivacyHash = (): boolean =>
    typeof window !== 'undefined' && window.location.hash === '#privacy';

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      if (isPrivacyHash() && screen !== 'privacy') {
        openPrivacy(screen === 'menu' ? openMenu : openHome);
      }
    });
  }

  if (isConfigured()) {
    onAuthChange((user) => {
      if (!user) {
        clearAccountState();
        if (screen === 'menu') openMenu();
        return;
      }
      const shouldRefreshMenu = screen === 'home' || screen === 'account' || screen === 'menu';
      void syncSignedInUser(user).then(() => {
        if (activeUser?.id !== user.id) return;
        if (shouldRefreshMenu) openMenu();
      });
    });
  }

  if (isPrivacyHash()) {
    openPrivacy(openHome);
  } else {
    openHome();
  }
}
