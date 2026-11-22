# Cross-review — agent/agy @ e1c005e (K2b: pure applyCareerResult + progress label)

Reviewer: opencode (read-only; no source edits, no commit). Fixed point: `main` (e3aa67a), head `e1c005e`.
Diff: `git diff main...agent/agy` → 5 files, +233/-54: `src/game/careerFlow.ts` (new), `src/game/careerFlow.test.ts` (new), `src/game/index.ts`, `src/ui/labels.ts`, `src/ui/labels.test.ts`.

## Standards

- Scope: only `src/game/**` and `src/ui/labels.ts` (+ its test) touched. `src/career/`, `src/app/`, `src/types.ts`, `package.json` and every other file are unchanged; no new dependencies. No HARD issues.
- src/game/careerFlow.ts:34,38 — JUDGEMENT — the optional `fallbackTournament` parameter is never needed in the real flow (`career.current` is always set for a launched career match) and no test exercises it — Speculative Generality; the brief's suggested signature had no fallback. Harmless, but it leaves a second, untested source of truth for "which tournament".
- src/game/careerFlow.ts:62-70,86-96 — JUDGEMENT — the "pure orchestration" function also builds UI copy (`ResultExtras` button labels and bracket summary) — Divergent Change: career maths and presentation change for different reasons; the strings could stay in `index.ts` or move to a small formatter. Acceptable because it removes the duplicated branches from `index.ts`, but rename/comment should not imply the function is career-only.
- src/game/careerFlow.ts:55-64 and 79-88 — JUDGEMENT — `nextSave.characters.find(...)` + `afterChar?.earnedPoints ?? earned` is duplicated in both return branches — Duplicated Code; one tail/helper would keep the two early/late returns in sync.
- src/game/careerFlow.test.ts:23-33 — JUDGEMENT — `findSeedForEntrantSide` brute-forces 200 seeds to find an entrant-b bracket — deterministic and the test asserts `m.a === hi` so a miss fails loudly, but a direct entrant-order fixture would read better.
- src/game/index.ts:130-142 — GOOD: the closure now only calls `applyCareerResult` and `updateSave(applied.save)`; no orchestration is left inline.

## Spec

- Pure function exists and is called before the save write: src/game/careerFlow.ts:29-98, src/game/index.ts:131-141 (`updateSave(applied.save)` then `return applied.extras`). It matches the old inline code: match points from the played round's bot level (careerFlow.ts:43-46), `awardPoints` (48), `recordHumanResult` (49), `setCareer` (54,75), `finishTournament` + placement bonus (74-78); the `ResultExtras` fields and Thai button labels are identical to the old closure.
- Same-behaviour caveats checked: `prevCareer` is read before `awardPoints` (which never touches career); `playedMatch` is recomputed from `career.current`, which is the launch `tournament` in the UI flow (src/ui/pages/career.ts:258-265); the advanced branch still uses the full format for `humanMatch`; `roundName` falls back the same way. No behavioural drift found.
- Tests: entrant a and b with the score stored a-b and shown player-side (careerFlow.test.ts:35-55), win advances (57-74), semi-final loss ends the tournament with bonus + unlock + cleared `current` (76-96), champion run with full bonus and next-tier unlock (98-117). All four pass.
- Label: src/ui/labels.ts:199-201 now prints only `ความคืบหน้าแต้มถัดไป ${progressPct}%`, matching the requested example; `labels.test.ts:117-131` asserts the exact strings and that `/ 100` is gone. No other user-visible change in the diff.
- Nothing missing from K2b and no unrequested behaviour change. The only extras are the `fallbackTournament` parameter and the `extras` return field (both benign; see Standards).

## Checks

- `/Users/knimf/BADMINTONGAME-wt/agy` at e1c005e, worktree clean.
- `npx vitest run` → 24 files, 311 tests passed (careerFlow: 4/4).
- `npx tsc --noEmit` → exit 0, no output.
- `npx vite build` → built (60 modules); only the pre-existing >500 kB chunk-size warning.

APPROVE e1c005e
