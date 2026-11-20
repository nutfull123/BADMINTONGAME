import { describe, expect, it } from 'vitest';
import { FORMAT_3X15, FORMAT_3X21, awardRally, createMatch, receiverSlot, serverSlot } from './index';
import type { MatchState, ServiceCourt, Side, Slot } from '../types';

// Fold a list of rally winners through the pure reducer.
const play = (state: MatchState, winners: Side[]): MatchState =>
  winners.reduce((s, w) => awardRally(s, w), state);

// Alternating winners keep the game tied: after 2n rallies it is n-all.
const alternate = (rallies: number): Side[] =>
  Array.from({ length: rallies }, (_, i) => (i % 2 === 0 ? 'near' : 'far'));

describe('match formats', () => {
  it('FORMAT_3X15 is best of 3 to 15, deuce at 14, cap 21, interval at 8', () => {
    expect(FORMAT_3X15).toEqual({
      pointsToWin: 15,
      deuceAt: 14,
      cap: 21,
      gamesToWin: 2,
      intervalAt: 8,
    });
  });

  it('FORMAT_3X21 is best of 3 to 21, deuce at 20, cap 30, interval at 11', () => {
    expect(FORMAT_3X21).toEqual({
      pointsToWin: 21,
      deuceAt: 20,
      cap: 30,
      gamesToWin: 2,
      intervalAt: 11,
    });
  });
});

describe('createMatch', () => {
  it('starts 0-0, no games played, given server serving from the right court', () => {
    const state = createMatch(FORMAT_3X15, 'far');
    expect(state).toEqual({
      config: FORMAT_3X15,
      score: { near: 0, far: 0 },
      completedGames: [],
      gamesWon: { near: 0, far: 0 },
      server: 'far',
      serviceCourt: 'right',
      endsSwapped: false,
      intervalNow: false,
      winner: null,
      doubles: false,
      rightCourt: { near: 0, far: 0 },
    });
  });
});

describe('awardRally', () => {
  it('gives the rally winner a point and the next serve', () => {
    const start = createMatch(FORMAT_3X15, 'near');
    const after = awardRally(start, 'far');
    expect(after.score).toEqual({ near: 0, far: 1 });
    expect(after.server).toBe('far');
  });
});

describe('service court', () => {
  it('is right on the server own even score and left on odd', () => {
    const start = createMatch(FORMAT_3X15, 'near');
    expect(start.serviceCourt).toBe('right');
    const one = awardRally(start, 'near');
    expect(one.serviceCourt).toBe('left');
    const two = awardRally(one, 'near');
    expect(two.serviceCourt).toBe('right');
    const three = awardRally(two, 'near');
    expect(three.serviceCourt).toBe('left');
  });

  it('puts a receiver who wins the rally on serve from their own parity', () => {
    const start = createMatch(FORMAT_3X15, 'near');
    const farOne = awardRally(start, 'far');
    expect(farOne.server).toBe('far');
    expect(farOne.serviceCourt).toBe('left');
    const farTwo = awardRally(farOne, 'far');
    expect(farTwo.serviceCourt).toBe('right');
  });
});

describe('winning a game', () => {
  it('wins at 15 when two points clear', () => {
    const s = play(createMatch(FORMAT_3X15, 'near'), alternate(27)); // 14-13
    expect(s.score).toEqual({ near: 14, far: 13 });
    const won = awardRally(s, 'near');
    expect(won.completedGames).toEqual([{ near: 15, far: 13 }]);
    expect(won.gamesWon).toEqual({ near: 1, far: 0 });
  });

  it('does not win at 15-14 and wins 16-14 from deuce', () => {
    const tied = play(createMatch(FORMAT_3X15, 'near'), alternate(28)); // 14-14
    expect(tied.score).toEqual({ near: 14, far: 14 });
    const at15 = awardRally(tied, 'near');
    expect(at15.score).toEqual({ near: 15, far: 14 });
    expect(at15.completedGames).toEqual([]);
    const at16 = awardRally(at15, 'near');
    expect(at16.completedGames).toEqual([{ near: 16, far: 14 }]);
  });

  it('caps the game at 21-20 in 3x15', () => {
    const tied = play(createMatch(FORMAT_3X15, 'near'), alternate(40)); // 20-20
    expect(tied.score).toEqual({ near: 20, far: 20 });
    const won = awardRally(tied, 'far');
    expect(won.completedGames).toEqual([{ near: 20, far: 21 }]);
  });

  it('caps the game at 30-29 in 3x21', () => {
    const tied = play(createMatch(FORMAT_3X21, 'near'), alternate(58)); // 29-29
    expect(tied.score).toEqual({ near: 29, far: 29 });
    const won = awardRally(tied, 'near');
    expect(won.completedGames).toEqual([{ near: 30, far: 29 }]);
  });
});

describe('between games', () => {
  const gameOneToNear = () =>
    awardRally(play(createMatch(FORMAT_3X15, 'near'), alternate(27)), 'near'); // 15-13

  it('resets the score and starts the next game with the winner serving from the right', () => {
    const nextGame = gameOneToNear();
    expect(nextGame.score).toEqual({ near: 0, far: 0 });
    expect(nextGame.server).toBe('near');
    expect(nextGame.serviceCourt).toBe('right');
    expect(nextGame.intervalNow).toBe(false);
    expect(nextGame.completedGames).toEqual([{ near: 15, far: 13 }]);
    expect(nextGame.gamesWon).toEqual({ near: 1, far: 0 });
  });

  it('flips the ends after each game', () => {
    const afterOne = gameOneToNear();
    expect(afterOne.endsSwapped).toBe(true);

    const farFirst = (rallies: number): Side[] =>
      alternate(rallies).map((s) => (s === 'near' ? 'far' : 'near'));
    const afterTwo = awardRally(play(afterOne, farFirst(27)), 'far'); // far 15-13
    expect(afterTwo.completedGames).toEqual([
      { near: 15, far: 13 },
      { near: 13, far: 15 },
    ]);
    expect(afterTwo.server).toBe('far');
    expect(afterTwo.endsSwapped).toBe(false);
  });
});

describe('interval', () => {
  const run = (side: Side, count: number): Side[] => Array<Side>(count).fill(side);

  it('is true only on the rally where the leader first reaches 8 in 3x15', () => {
    const seven = play(createMatch(FORMAT_3X15, 'near'), run('near', 7));
    expect(seven.score).toEqual({ near: 7, far: 0 });
    expect(seven.intervalNow).toBe(false);

    const eight = awardRally(seven, 'near');
    expect(eight.intervalNow).toBe(true);
    expect(eight.endsSwapped).toBe(false);

    const nine = awardRally(eight, 'near');
    expect(nine.intervalNow).toBe(false);
  });

  it('triggers when the other side is the first to lead at 8', () => {
    const nearSeven = play(createMatch(FORMAT_3X15, 'near'), run('near', 7));
    const farOne = awardRally(nearSeven, 'far'); // 7-1, leader still 7
    expect(farOne.intervalNow).toBe(false);
    const farTwo = awardRally(farOne, 'far'); // 7-2
    expect(farTwo.intervalNow).toBe(false);
    const farEight = play(farTwo, run('far', 6)); // far reaches 8
    expect(farEight.score).toEqual({ near: 7, far: 8 });
    expect(farEight.intervalNow).toBe(true);
  });

  it('uses 11 as the interval in 3x21', () => {
    const ten = play(createMatch(FORMAT_3X21, 'near'), run('near', 10));
    expect(ten.intervalNow).toBe(false);
    expect(awardRally(ten, 'near').intervalNow).toBe(true);
  });
});

describe('deciding game', () => {
  const run = (side: Side, count: number): Side[] => Array<Side>(count).fill(side);
  const farFirst = (rallies: number): Side[] =>
    alternate(rallies).map((s) => (s === 'near' ? 'far' : 'near'));

  const intoGameThree = (): MatchState => {
    const afterOne = awardRally(play(createMatch(FORMAT_3X15, 'near'), alternate(27)), 'near');
    return awardRally(play(afterOne, farFirst(27)), 'far');
  };

  it('changes ends when a side first reaches 8 in the third game', () => {
    const gameThree = intoGameThree();
    expect(gameThree.completedGames).toHaveLength(2);
    expect(gameThree.endsSwapped).toBe(false);

    const seven = play(gameThree, run('near', 7));
    expect(seven.endsSwapped).toBe(false);

    const eight = awardRally(seven, 'near');
    expect(eight.intervalNow).toBe(true);
    expect(eight.endsSwapped).toBe(true);

    const nine = awardRally(eight, 'near');
    expect(nine.endsSwapped).toBe(true);
  });
});

describe('match end', () => {
  const nearWinsGame = (state: MatchState): MatchState =>
    awardRally(play(state, alternate(27)), 'near'); // 15-13

  it('sets the winner once a side has two games and freezes the match', () => {
    const afterTwo = nearWinsGame(nearWinsGame(createMatch(FORMAT_3X15, 'near')));
    expect(afterTwo.gamesWon).toEqual({ near: 2, far: 0 });
    expect(afterTwo.completedGames).toHaveLength(2);
    expect(afterTwo.winner).toBe('near');

    const extra = awardRally(afterTwo, 'far');
    expect(extra).not.toBe(afterTwo);
    expect(extra.score).toEqual(afterTwo.score);
    expect(extra.gamesWon).toEqual(afterTwo.gamesWon);
    expect(extra.completedGames).toEqual(afterTwo.completedGames);
    expect(extra.winner).toBe('near');
  });

  it('leaves the match open after only one game', () => {
    expect(nearWinsGame(createMatch(FORMAT_3X15, 'near')).winner).toBeNull();
  });
});

describe('purity', () => {
  it('returns new objects and never mutates the given state', () => {
    const state = play(createMatch(FORMAT_3X15, 'near'), alternate(28)); // 14-14
    const snapshot = structuredClone(state);

    const after = awardRally(state, 'near');

    expect(state).toEqual(snapshot);
    expect(after).not.toBe(state);
    expect(after.score).not.toBe(state.score);
    expect(after.completedGames).not.toBe(state.completedGames);
    expect(after.gamesWon).not.toBe(state.gamesWon);
  });

  it('does not mutate the state when the rally ends a game', () => {
    const state = play(createMatch(FORMAT_3X15, 'near'), alternate(27)); // 14-13
    const snapshot = structuredClone(state);

    awardRally(state, 'near');

    expect(state).toEqual(snapshot);
  });
});

describe('3x21 deuce', () => {
  it('plays on from 20-all and wins at 22-20', () => {
    const tied = play(createMatch(FORMAT_3X21, 'near'), alternate(40)); // 20-20
    const at21 = awardRally(tied, 'near');
    expect(at21.score).toEqual({ near: 21, far: 20 });
    expect(at21.completedGames).toEqual([]);
    const at22 = awardRally(at21, 'near');
    expect(at22.completedGames).toEqual([{ near: 22, far: 20 }]);
  });
});

describe('doubles service order (BWF Law 11)', () => {
  it('matches the 8-rally worked example from doubles-rules.md (N1=near 0, N2=near 1, F1=far 0, F2=far 1)', () => {
    let s = createMatch(FORMAT_3X15, 'near', true);
    // Initial 0-0 before Rally 1: N1 (0) serves from right to F1 (0)
    expect(s.score).toEqual({ near: 0, far: 0 });
    expect(s.server).toBe('near');
    expect(s.serviceCourt).toBe('right');
    expect(serverSlot(s)).toBe(0);
    expect(receiverSlot(s)).toBe(0);

    const rallies: Array<{
      winner: Side;
      scoreAfter: { near: number; far: number };
      nextServer: Side;
      nextCourt: ServiceCourt;
      nextServerSlot: Slot;
      nextReceiverSlot: Slot;
    }> = [
      // Rally 1: near wins -> 1-0, N1 (0) serves from left to F2 (1)
      { winner: 'near', scoreAfter: { near: 1, far: 0 }, nextServer: 'near', nextCourt: 'left', nextServerSlot: 0, nextReceiverSlot: 1 },
      // Rally 2: far wins -> 1-1, F2 (1) serves from left to N1 (0)
      { winner: 'far', scoreAfter: { near: 1, far: 1 }, nextServer: 'far', nextCourt: 'left', nextServerSlot: 1, nextReceiverSlot: 0 },
      // Rally 3: far wins -> 1-2, F2 (1) serves from right to N2 (1)
      { winner: 'far', scoreAfter: { near: 1, far: 2 }, nextServer: 'far', nextCourt: 'right', nextServerSlot: 1, nextReceiverSlot: 1 },
      // Rally 4: far wins -> 1-3, F2 (1) serves from left to N1 (0)
      { winner: 'far', scoreAfter: { near: 1, far: 3 }, nextServer: 'far', nextCourt: 'left', nextServerSlot: 1, nextReceiverSlot: 0 },
      // Rally 5: near wins -> 2-3, N2 (1) serves from right to F1 (0)
      { winner: 'near', scoreAfter: { near: 2, far: 3 }, nextServer: 'near', nextCourt: 'right', nextServerSlot: 1, nextReceiverSlot: 0 },
      // Rally 6: near wins -> 3-3, N2 (1) serves from left to F2 (1)
      { winner: 'near', scoreAfter: { near: 3, far: 3 }, nextServer: 'near', nextCourt: 'left', nextServerSlot: 1, nextReceiverSlot: 1 },
      // Rally 7: far wins -> 3-4, F1 (0) serves from right to N1 (0)
      { winner: 'far', scoreAfter: { near: 3, far: 4 }, nextServer: 'far', nextCourt: 'right', nextServerSlot: 0, nextReceiverSlot: 0 },
      // Rally 8: near wins -> 4-4, N1 (0) serves from right to F1 (0)
      { winner: 'near', scoreAfter: { near: 4, far: 4 }, nextServer: 'near', nextCourt: 'right', nextServerSlot: 0, nextReceiverSlot: 0 },
    ];

    for (const r of rallies) {
      s = awardRally(s, r.winner);
      expect(s.score).toEqual(r.scoreAfter);
      expect(s.server).toBe(r.nextServer);
      expect(s.serviceCourt).toBe(r.nextCourt);
      expect(serverSlot(s)).toBe(r.nextServerSlot);
      expect(receiverSlot(s)).toBe(r.nextReceiverSlot);
    }
  });

  it('cycles serve N1 -> F2 -> N2 -> F1 -> N1 across consecutive side-outs (Law 11.4)', () => {
    const tag = (s: MatchState) => `${s.server === 'near' ? 'N' : 'F'}${serverSlot(s) + 1}`;
    let s = createMatch(FORMAT_3X15, 'near', true);
    expect(tag(s)).toBe('N1');

    s = awardRally(s, 'far'); // side-out 1: 0-1
    expect(tag(s)).toBe('F2');

    s = awardRally(s, 'near'); // side-out 2: 1-1
    expect(tag(s)).toBe('N2');

    s = awardRally(s, 'far'); // side-out 3: 1-2
    expect(tag(s)).toBe('F1');

    s = awardRally(s, 'near'); // side-out 4: 2-2
    expect(tag(s)).toBe('N1');
  });

  it('resets rightCourt to { near: 0, far: 0 } at the start of a new game and never mutates rightCourt in singles', () => {
    // Doubles: play 15 straight points for near (odd number of points won while serving swaps near's rightCourt to 1 before game end)
    let doublesState = createMatch(FORMAT_3X15, 'near', true);
    doublesState = awardRally(doublesState, 'near'); // 1-0 -> rightCourt.near === 1
    expect(doublesState.rightCourt).toEqual({ near: 1, far: 0 });
    for (let i = 1; i < 15; i++) {
      doublesState = awardRally(doublesState, 'near');
    }
    expect(doublesState.completedGames).toEqual([{ near: 15, far: 0 }]);
    expect(doublesState.score).toEqual({ near: 0, far: 0 });
    expect(doublesState.rightCourt).toEqual({ near: 0, far: 0 });
    expect(serverSlot(doublesState)).toBe(0);
    expect(receiverSlot(doublesState)).toBe(0);

    // Singles: rightCourt stays { near: 0, far: 0 } and serverSlot/receiverSlot stay 0
    let singlesState = createMatch(FORMAT_3X15, 'near', false);
    for (const w of ['near', 'near', 'far', 'near', 'far', 'far'] as const) {
      singlesState = awardRally(singlesState, w);
      expect(singlesState.rightCourt).toEqual({ near: 0, far: 0 });
      expect(serverSlot(singlesState)).toBe(0);
      expect(receiverSlot(singlesState)).toBe(0);
    }
  });
});
