# BADMINTONGAME — shared rules for every agent

Read by Claude Code (via CLAUDE.md), OpenCode and Antigravity (agy). Read
`.coord/PROGRESS.md` (absolute path below) before you start any task.

## Team

| Agent | Role | Where it works | Branch |
|---|---|---|---|
| claude | Lead: plans, splits tasks, reviews, merges | `/Users/knimf/BADMINTONGAME` | `main` |
| opencode | Worker | `/Users/knimf/BADMINTONGAME-wt/opencode` | `agent/opencode` |
| agy | Worker | `/Users/knimf/BADMINTONGAME-wt/agy` | `agent/agy` |

Models: claude plans on Opus 5.5 and also dispatches Sonnet 5.5 subagents;
opencode runs `opencode/deepseek-v4.1-flash-free`; agy is strongest at research.

## Workflow (claude dispatches automatically)

opencode and agy run in long-lived tmux sessions `crew-oc` and `crew-agy`; the
user watches them with `tmux attach -r -t crew-oc|crew-agy`. Keep them alive
between tasks. claude sends work with `crew send`, waits for the marker, and
reads the result.

1. Plan: claude splits work and claims files in PROGRESS.md. agy researches
   first when facts are needed, writing `.coord/research/<topic>.md` with
   source links.
2. Write: each agent edits only its claimed files in its own worktree and
   commits on its own branch.
3. Cross-review (never review your own work): opencode → reviewed by Sonnet;
   Sonnet → by opencode or agy; agy → by Sonnet. Reviewers do not edit code;
   they write `.coord/reviews/<branch>.md` as `file:line — problem — why`,
   ending with `APPROVE` or `CHANGES`. At most 2 review rounds, then claude
   decides. Real disagreements go to an agent-discussion.
4. Merge: claude does the final review and merges into `main`; workers then
   run `git merge main`.

Every task sent to a worker ends with: "When finished, print exactly
`DONE <commit-hash> <one-line summary>` (or `BLOCKED <reason>`)."

### When a model runs out

If you hit a quota, rate limit (429) or "model unavailable" error, stop and print
`BLOCKED quota <model>`. claude watches for that (and for raw quota errors),
does not switch models on its own, and asks the user to pick a replacement,
recommending from the agent's own list (`opencode models`, `agy models`):

- opencode: deepseek-v4.1-flash (paid) → qwen3.8-flash / glm-5.3-flash →
  other `-free` models (mimo-v2.6-flash-free, hy4-flash-free)
- agy: another Gemini 4 family (Argon ↔ Neon) → gemini-3.8-flash →
  claude-sonnet-5-5 inside agy

claude then restarts that crew session on the chosen model and resends the task.

## Shared memory (one copy, absolute paths)

Worktrees each have their own copy of tracked files, so always use these
absolute paths, never the copy inside your own worktree:

- Progress log: `/Users/knimf/BADMINTONGAME/.coord/PROGRESS.md`
- Discussions: `/Users/knimf/BADMINTONGAME/.coord/discussions/<topic>.md`

When you start a task, add a line under **In progress** with your name and the
files you own. When you finish, move it to **Done** with the commit hash.
Append only; never rewrite another agent's lines.

## Not getting in each other's way

1. Work only in your own worktree and branch. Never `git checkout` another
   agent's branch or edit files in another worktree.
2. One file has one owner at a time. Claim files in PROGRESS.md before editing;
   if another agent has claimed a file, ask in a discussion instead of editing.
3. Commit small and often on your own branch. Do not merge or push; claude
   merges into `main`.
4. Before a new task, sync with main: `git merge main` in your worktree.

## Talking to each other (agent-discussion)

Use the `agent-discussion` skill with your name (`claude`, `opencode`, `agy`)
and a file under `.coord/discussions/`. Rules if you cannot load the skill:

- Write only when the last turn marker is `[TURN: <your-name>]`; re-read the
  last 10 lines right before writing, and skip if it changed.
- Append only. End your entry with `[TURN: <next-agent>]`.
- Turn order with three agents: claude → opencode → agy → claude. With two,
  alternate.
- Finish with `[AGREED: <summary>]` or, after 12 rounds, `[DEADLOCKED]`.
- Wait for your turn with:
  `bash ~/.agents/skills/agent-discussion/scripts/watch_turn.sh <file> <your-name>`
  (exit 0 = your turn, exit 1 = discussion over).
