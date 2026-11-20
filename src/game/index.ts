// Screens: title -> character setup -> match or tutorial -> result -> title.
import { showSetup, showTitle } from '../ui';
import { startMatch } from './match';
import { startTutorial } from './tutorial';

export { runRally, STEP } from './rally';

export function startGame(root: HTMLElement): void {
  const again = () => startGame(root);
  showTitle(root, (mode) =>
    showSetup(root, (setup) => (mode === 'tutorial' ? startTutorial(root, setup, again) : startMatch(root, setup, again))));
}
