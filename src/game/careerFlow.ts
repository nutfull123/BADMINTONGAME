// Pure end-of-match career progression orchestration: awards match points, records the player's result
// in the active tournament bracket, and when the tournament finishes applies finishTournament + placement bonus.
import { awardPoints, setCareer } from '../app/characters';
import {
  finishTournament,
  humanMatch,
  matchPoints,
  newCareer,
  recordHumanResult,
  tierOf,
} from '../career';
import type { CareerProgress, SaveData, TierId, Tournament } from '../types';
import type { ResultExtras } from '../ui';

export interface CareerResultOutcome {
  won: boolean;
  score: string;
}

export interface AppliedCareerResult {
  save: SaveData;
  earned: number;
  bonus: number;
  unlocked: TierId | null;
  tournament: Tournament;
  extras: ResultExtras;
}

export function applyCareerResult(
  save: SaveData,
  characterId: string,
  outcome: CareerResultOutcome,
  fullFormat: '3x15' | '3x21' = save.settings.match.format,
  fallbackTournament?: Tournament,
): AppliedCareerResult {
  const char = save.characters.find((c) => c.id === characterId);
  const prevCareer: CareerProgress = char?.career ?? newCareer();
  const activeTournament = prevCareer.current ?? fallbackTournament;
  if (!activeTournament) {
    throw new Error('applyCareerResult called without an active tournament');
  }

  const playedMatch = humanMatch(activeTournament, fullFormat);
  const botLevel = playedMatch?.botLevel ?? tierOf(activeTournament.tier).botLevel;
  const playedRoundName = playedMatch?.roundName ?? 'F';
  const earned = matchPoints(botLevel, outcome.won);

  let nextSave = awardPoints(save, characterId, earned);
  const recorded = recordHumanResult(activeTournament, outcome.won, outcome.score);

  if (recorded.status === 'playing') {
    const upcoming = humanMatch(recorded, fullFormat);
    const nextCareer: CareerProgress = { ...prevCareer, current: recorded };
    nextSave = setCareer(nextSave, characterId, nextCareer);
    const afterChar = nextSave.characters.find((c) => c.id === characterId);
    return {
      save: nextSave,
      earned,
      bonus: 0,
      unlocked: null,
      tournament: recorded,
      extras: {
        pointsEarned: earned,
        totalEarned: afterChar?.earnedPoints ?? earned,
        buttonLabel: 'กลับสู่สายการแข่งขัน (Back to Bracket)',
        tournament: {
          outcome: 'advanced',
          roundName: upcoming?.roundName ?? playedRoundName,
        },
      },
    };
  }

  const finished = finishTournament({ ...prevCareer, current: recorded }, recorded);
  nextSave = setCareer(nextSave, characterId, finished.career);
  if (finished.bonus > 0) {
    nextSave = awardPoints(nextSave, characterId, finished.bonus);
  }
  const afterChar = nextSave.characters.find((c) => c.id === characterId);
  return {
    save: nextSave,
    earned,
    bonus: finished.bonus,
    unlocked: finished.unlocked,
    tournament: recorded,
    extras: {
      pointsEarned: earned,
      totalEarned: afterChar?.earnedPoints ?? earned,
      buttonLabel: 'กลับสู่หน้าทัวร์นาเมนต์ (Back to Tournaments)',
      tournament: {
        outcome: recorded.status === 'won' ? 'champion' : 'out',
        roundName: playedRoundName,
        placementBonus: finished.bonus,
        unlockedTier: finished.unlocked,
      },
    },
  };
}
