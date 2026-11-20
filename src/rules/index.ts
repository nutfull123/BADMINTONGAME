import type { GameScore, MatchConfig, MatchState, Side, Slot } from '../types';

export const FORMAT_3X15: MatchConfig = {
  pointsToWin: 15,
  deuceAt: 14,
  cap: 21,
  gamesToWin: 2,
  intervalAt: 8,
};

export const FORMAT_3X21: MatchConfig = {
  pointsToWin: 21,
  deuceAt: 20,
  cap: 30,
  gamesToWin: 2,
  intervalAt: 11,
};

const opposite = (side: Side): Side => (side === 'near' ? 'far' : 'near');

// A game is won by two points from pointsToWin on, or by whoever reaches the cap
// first. deuceAt is always pointsToWin - 1, so "from deuceAt-all win by two" is
// exactly this: at 14-all (3x15) or 20-all (3x21) no one can be two clear.
function gameWinner(config: MatchConfig, score: GameScore): Side | null {
  for (const side of ['near', 'far'] as const) {
    const own = score[side];
    const other = score[opposite(side)];
    if (own >= config.cap) return side;
    if (own >= config.pointsToWin && own - other >= 2) return side;
  }
  return null;
}

// A fresh match: no games played, the given side serves first. Serving from the
// right court follows from the server's own score being 0 (even).
export function createMatch(config: MatchConfig, firstServer: Side, doubles = false): MatchState {
  return {
    config: { ...config },
    score: { near: 0, far: 0 },
    completedGames: [],
    gamesWon: { near: 0, far: 0 },
    server: firstServer,
    serviceCourt: 'right',
    endsSwapped: false,
    intervalNow: false,
    winner: null,
    doubles,
    rightCourt: { near: 0, far: 0 },
  };
}

// Pure reducer: the rally winner scores a point and serves the next rally.
// Always returns a new object; `state` is never mutated.
export function awardRally(state: MatchState, rallyWinner: Side): MatchState {
  const next: MatchState = {
    config: state.config,
    score: { ...state.score },
    completedGames: [...state.completedGames],
    gamesWon: { ...state.gamesWon },
    server: state.server,
    serviceCourt: state.serviceCourt,
    endsSwapped: state.endsSwapped,
    doubles: state.doubles,
    rightCourt: { ...state.rightCourt },
    intervalNow: state.intervalNow,
    winner: state.winner,
  };

  // Once the match is over nothing changes any more.
  if (state.winner !== null) return next;

  const leadBefore = Math.max(state.score.near, state.score.far);
  next.score[rallyWinner] += 1;
  // BWF Law 11.3.1: in doubles, when the serving side wins a rally its partners swap service courts;
  // when the receiving side wins (Law 11.3.2), nobody swaps courts.
  if (state.doubles && rallyWinner === state.server) {
    next.rightCourt[rallyWinner] = otherSlot(state.rightCourt[rallyWinner]);
  }
  next.server = rallyWinner;
  // The server stands in the right service court on an even own score, left on odd.
  next.serviceCourt = next.score[rallyWinner] % 2 === 0 ? 'right' : 'left';

  // The interval happens once per game, on the rally where the leading score
  // first reaches intervalAt.
  next.intervalNow =
    leadBefore < state.config.intervalAt &&
    Math.max(next.score.near, next.score.far) === state.config.intervalAt;
  if (next.intervalNow) {
    // In the deciding game (all other games played) the ends also change now.
    const isDecidingGame =
      state.completedGames.length === state.config.gamesToWin * 2 - 2;
    if (isDecidingGame) next.endsSwapped = !next.endsSwapped;
  }

  const wonBy = gameWinner(state.config, next.score);
  if (wonBy !== null) {
    next.completedGames.push({ ...next.score });
    next.gamesWon[wonBy] += 1;
    // The next game starts 0-0 with the game winner serving from the right and slot 0 of each side in the right court.
    next.score = { near: 0, far: 0 };
    next.server = wonBy;
    next.serviceCourt = 'right';
    next.rightCourt = { near: 0, far: 0 };
    next.intervalNow = false;
    // Ends change after every game.
    next.endsSwapped = !next.endsSwapped;
    if (next.gamesWon[wonBy] >= state.config.gamesToWin) next.winner = wonBy;
  }
  return next;
}

const otherSlot = (s: Slot): Slot => (s === 0 ? 1 : 0);

// The serving side's player in the service court for its score (BWF Law 11.1). Singles: always 0.
export function serverSlot(state: MatchState): Slot {
  if (!state.doubles) return 0;
  const right = state.rightCourt[state.server];
  return state.serviceCourt === 'right' ? right : otherSlot(right);
}

// The receiving side's player in the same-named (diagonal) service court (BWF Law 11.1.4). Singles: always 0.
export function receiverSlot(state: MatchState): Slot {
  if (!state.doubles) return 0;
  const right = state.rightCourt[opposite(state.server)];
  return state.serviceCourt === 'right' ? right : otherSlot(right);
}
