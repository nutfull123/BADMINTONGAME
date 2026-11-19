# BADMINTONGAME — shared rules for every agent

Read by Claude Code (via CLAUDE.md), OpenCode and Antigravity (agy). Read
`.coord/PROGRESS.md` (absolute path below) before you start any task.

## Team

| Agent | Role | Where it works | Branch |
|---|---|---|---|
| claude | Lead: plans, splits tasks, reviews, merges | `/Users/knimf/BADMINTONGAME` | `main` |
| opencode | Worker | `/Users/knimf/BADMINTONGAME-wt/opencode` | `agent/opencode` |
| agy | Worker | `/Users/knimf/BADMINTONGAME-wt/agy` | `agent/agy` |

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
