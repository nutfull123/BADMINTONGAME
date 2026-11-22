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
  type SignOutResult,
} from '../ui';
import { fitEvent } from '../ui/events';
import { applyCareerResult } from './careerFlow';
import { startMatch, type MatchOutcome } from './match';
import { decideAuthEventAction, runSignInSync, type AppScreen } from './syncFlow';
import { startTutorial } from './tutorial';

export { runRally, STEP } from './rally';

export function startGame(root: HTMLElement): void {
  let save: SaveData = loadSave();
  let activeUser: AccountUser | null = null;
  let cloudSync: ReturnType<typeof createCloudSync> | null = null;
  let syncedUserId: string | null = null;
  let attemptedSyncUserId: string | null = null;
  let pendingAuthSync: AccountUser | null = null;
  let syncInFlight: { userId: string; promise: Promise<void> } | null = null;
  let syncError: string | null = null;
  let screen: AppScreen = 'home';

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
    attemptedSyncUserId = null;
    pendingAuthSync = null;
    syncInFlight = null;
    syncError = null;
  };

  const syncSignedInUser = (user: AccountUser): Promise<void> => {
    activeUser = user;
    if (syncedUserId === user.id) return Promise.resolve();
    if (syncInFlight && syncInFlight.userId === user.id) return syncInFlight.promise;

    attemptedSyncUserId = user.id;
    const promise = (async () => {
      const res = await runSignInSync(user.id, () => save, {
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

  const runDeferredSyncIfReady = (): void => {
    const pending = pendingAuthSync;
    if (!pending || activeUser?.id !== pending.id) return;
    pendingAuthSync = null;
    void syncSignedInUser(pending).then(() => {
      if (activeUser?.id !== pending.id) return;
      if (screen === 'menu') openMenu();
    });
  };

  const retrySync = (): void => {
    if (!activeUser) return;
    const user = activeUser;
    attemptedSyncUserId = null;
    syncError = null;
    void syncSignedInUser(user).then(() => {
      if (activeUser?.id !== user.id) return;
      if (screen === 'menu') openMenu();
    });
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
    runDeferredSyncIfReady();
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
      onRetrySync: activeUser && syncError ? retrySync : undefined,
    });
    runDeferredSyncIfReady();
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
        screen = 'playing';
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
    runDeferredSyncIfReady();
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

    screen = 'playing';
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
    screen = 'playing';
    startTutorial(root, { stats: { ...active.stats }, settings }, openMenu);
  };

  const openCharacters = (): void => {
    screen = 'other';
    showCharacters(root, save, updateSave, openMenu, openHome);
  };

  const handleSignOut = async (): Promise<SignOutResult> => {
    const flushRes = cloudSync ? await cloudSync.flush() : ({ ok: true } as const);
    const res = await signOut();
    if (!res.ok) return res;
    clearAccountState();
    if (!flushRes.ok) {
      return {
        ok: true,
        warning:
          'ออกจากระบบแล้ว แต่การบันทึกล่าสุดขึ้นคลาวด์ไม่สำเร็จ ข้อมูลล่าสุดถูกเก็บไว้เฉพาะในอุปกรณ์นี้ (Signed out; last changes are saved only on this device)',
      };
    }
    return { ok: true };
  };

  const handleDeleteAccount = async (): Promise<AccountResult> => {
    if (cloudSync) {
      await cloudSync.flush();
    }
    const res = await deleteAccount();
    if (res.ok) clearAccountState();
    return res;
  };

  const openSettings = (): void => {
    screen = 'other';
    showSettingsPage(root, save, updateSave, openMenu, {
      user: activeUser,
      getUser: () => activeUser,
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
        const pendingSync = cloudSync;
        clearAccountState();
        // Flush stops any pending 2 s timer immediately; local save is already written and any failed push is ignored on purpose.
        if (pendingSync) void pendingSync.flush();
        if (screen === 'menu') openMenu();
        return;
      }

      const decision = decideAuthEventAction(screen, user.id, {
        syncedUserId,
        attemptedSyncUserId,
      });
      activeUser = user;

      if (decision.kind === 'ignore') return;
      if (decision.kind === 'defer') {
        pendingAuthSync = user;
        return;
      }

      void syncSignedInUser(user).then(() => {
        if (activeUser?.id !== user.id) return;
        if (decision.navigateToMenu && screen !== 'playing' && screen !== 'privacy') {
          openMenu();
        }
      });
    });
  }

  if (isPrivacyHash()) {
    openPrivacy(openHome);
  } else {
    openHome();
  }
}
