import type { GameScore, MatchConfig, MatchState, Side } from '../types';

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
export function createMatch(config: MatchConfig, firstServer: Side): MatchState {
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
    intervalNow: state.intervalNow,
    winner: state.winner,
  };

  // Once the match is over nothing changes any more.
  if (state.winner !== null) return next;

  const leadBefore = Math.max(state.score.near, state.score.far);
  next.score[rallyWinner] += 1;
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
    // The next game starts 0-0 with the game winner serving from the right.
    next.score = { near: 0, far: 0 };
    next.server = wonBy;
    next.serviceCourt = 'right';
    next.intervalNow = false;
    // Ends change after every game.
    next.endsSwapped = !next.endsSwapped;
    if (next.gamesWon[wonBy] >= state.config.gamesToWin) next.winner = wonBy;
  }
  return next;
}
