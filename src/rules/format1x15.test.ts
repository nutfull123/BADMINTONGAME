import { describe, expect, it } from 'vitest';
import { FORMAT_1X15, awardRally, createMatch } from './index';
import type { MatchState, Side } from '../types';

const play = (state: MatchState, winners: Side[]): MatchState => winners.reduce((s, w) => awardRally(s, w), state);
const alternate = (rallies: number): Side[] => Array.from({ length: rallies }, (_, i) => (i % 2 === 0 ? 'near' : 'far'));

describe('FORMAT_1X15', () => {
  it('is one game to 15 with deuce at 14, cap 21, interval at 8', () => {
    expect(FORMAT_1X15).toEqual({ pointsToWin: 15, deuceAt: 14, cap: 21, gamesToWin: 1, intervalAt: 8 });
  });

  it('changes ends at the interval (8) and ends the match after one game', () => {
    let s = createMatch(FORMAT_1X15, 'near');
    s = play(s, Array.from({ length: 8 }, () => 'near' as const));
    expect(s.intervalNow).toBe(true);
    expect(s.endsSwapped).toBe(true);
    s = play(s, Array.from({ length: 7 }, () => 'near' as const));
    expect(s.winner).toBe('near');
    expect(s.completedGames).toEqual([{ near: 15, far: 0 }]);
    expect(s.gamesWon.near).toBe(1);
  });

  it('needs two clear points from 14-all', () => {
    let s = play(createMatch(FORMAT_1X15, 'near'), alternate(28)); // 14-14
    s = play(s, ['near', 'far', 'near']); // 15-15, then 16-15: not over
    expect(s.winner).toBeNull();
    s = play(s, ['near']);
    expect(s.winner).toBe('near');
  });
});
