import { defineConfig, configDefaults } from 'vitest/config';

// Agent worktrees live under .claude/worktrees; never run their tests from here.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
