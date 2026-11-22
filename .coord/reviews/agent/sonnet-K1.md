# Cross-Review: `agent/sonnet-K1` (`fc4b4dd`)

## Standards
- Scope check (`git diff main...agent/sonnet-K1`): Only `src/career/**` (`index.ts`, `tuning.ts`, `events.ts`, `parse.ts`, `career.test.ts`), `src/rules/index.ts`, `src/rules/format1x15.test.ts`, `src/app/save.ts`, `src/app/characters.ts`, and `src/app/app.test.ts` were touched. `src/types.ts`, `src/ui/`, `src/game/`, `src/render/`, `src/input/`, `src/sim/`, and `package.json` were untouched. No new dependencies were added.
- Purity check: `src/career/` has zero DOM, Three.js, `Math.random`, or `Date` usages; all randomness flows through the deterministic `mulberry32` / `rngFor` PRNG seeded from `Tournament.seed`.
- `src/career/events.ts:3` - JUDGEMENT - `isDoubles` duplicates the 1-line helper in `src/game/teams.ts:13` - intentional and appropriate so `src/career/` stays pure without importing from `src/game/`.
- `src/career/parse.ts:81-88` - JUDGEMENT - In `parseTournament`, when `status === 'playing'`, `last.some((m) => m.winner !== null)` is not rejected for non-human matches in the active round - harmless because `settle` simulates all matches of a round simultaneously when the human match completes, so any valid in-progress round has `winner === null` on the human match (`mine[0]!.winner !== null` is checked on line 83).

## Spec
- **1. `FORMAT_1X15` (`src/rules/index.ts:20-26`, `src/rules/format1x15.test.ts:1-31`)**: PASS.
  - Exported with `{ pointsToWin: 15, deuceAt: 14, cap: 21, gamesToWin: 1, intervalAt: 8 }`. Because `gamesToWin * 2 - 2 === 0`, the single game is treated as the deciding game in `awardRally` and swaps ends at the interval (`8`).
- **2. Tier table, unlock rule, and point numbers (`src/career/tuning.ts:6-25`, `src/career/index.ts:216-244`)**: PASS.
  - `TIERS`: `club` (size `8`, `easy`, `20`), `regional` (size `16`, `medium`, `26`), `national` (size `16`, `hard`, `32`), `masters` (size `32`, `hard`, `38`), with bot totals within `±2` clamped `20..40`.
  - Match points: `WIN_POINTS` (`easy: 0.25`, `medium: 0.5`, `hard: 0.75`), loss = `0.25 * win`.
  - Placement bonus: `CHAMPION_BONUS` (`club: 0.5`, `regional: 1`, `national: 1.5`, `masters: 2`), finalist = `0.5 * champion`, semi-finalist = `0.25 * champion`.
  - Next tier unlocks on reaching semi-finals (`reached >= rounds - 2` when `tierIndex === career.unlocked - 1`).
  - Earned points capped at `MAX_EARNED_POINTS = 20`.
- **3. `createTournament` (`src/career/index.ts:82-108`)**: PASS.
  - Full bracket of `tier.size` with exactly one human entrant at a seeded random slot (`int(rng, td.size)`).
  - Doubles human entrant pairs the human character with a generated bot partner of the tier's strength and appropriate gender (`XD` = opposite gender, `MD`/`WD` = same gender).
  - All bot teams obey event gender rules (`eventsFor`, `teamFits`), have valid stats (`validateStats(..., 40) === null`) within `±2` of `tier.botPoints` (clamped `20..40`), random `BodyType`, and fictional syllable-generated names.
- **4. `humanMatch` (`src/career/index.ts:115-131`)**: PASS.
  - Returns `{ round, roundName, opponent, partner, botLevel, format }` for the active human match (or `null` when finished), with `roundName` in `'R32' | 'R16' | 'QF' | 'SF' | 'F'` and `format` set to `'1x15'` before the semi-finals (`left > 2`) and `fullFormat` in `SF` and `F` (`left <= 2`).
- **5. `recordHumanResult`, `finishTournament`, `abandonTournament` (`src/career/index.ts:160-244`)**: PASS.
  - `recordHumanResult` is pure (clones rounds/matches via `copyTournament`), records the human score in `a-b` order (`flipScore` when human is `b`), deterministically simulates all other matches using `1 / (1 + 10 ** ((strength(b) - strength(a)) / 8))` and `rngFor(t.seed, r + 1, i + 1)`, generates realistic 1-game or 3-game scores (`15-x` or deuce `16-14..21-19`), and simulates the rest of the bracket to a champion when the human is knocked out.
  - `abandonTournament` marks the human out in the current round with `score: null` and `finishTournament` awards `0` bonus on abandonment while updating `best` and clearing `current`.
- **6. `parseCareer`, `awardPoints`, `setCareer`, `loadSave` (`src/career/parse.ts:1-109`, `src/app/characters.ts:58-69`, `src/app/save.ts:57-62`)**: PASS.
  - `parseCareer` validates `unlocked` (`1..4`), `best` whole numbers in range, `current` tier unlocked status, entrants count (`8/16/32`), unique entrant IDs, single human entrant, player counts and genders per event, name lengths (`<= 40`), stats with budget `40`, round lengths (`size >> (r + 1)`), winner propagation across rounds, and status consistency, returning `undefined` without throwing on any invalid input.
  - `awardPoints` adds positive finite points capped at `20` and returns a new `SaveData` without mutating input.
  - `loadSave` drops a tampered `career` via `parseCareer(c.career)` while preserving the character.

## Checks
- `npx vitest run` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a57d96adae2784613`): PASS — 23 test files passed (303 tests).
- `npx tsc --noEmit` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a57d96adae2784613`): PASS — exit 0.
- `npx vite build` (in `/Users/knimf/BADMINTONGAME/.claude/worktrees/agent-a57d96adae2784613`): PASS — built in 558ms.

APPROVE fc4b4dd
