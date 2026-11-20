import { startMatch, type MatchSetup } from './match';

// Hook for t9: replace the body with the real tutorial (src/tutorial/). Until then it starts a match with a notice.
export function startTutorial(root: HTMLElement, setup: MatchSetup, onAgain: () => void): void {
  startMatch(root, setup, onAgain, 'Tutorial coming soon');
}
