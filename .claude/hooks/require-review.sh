#!/usr/bin/env bash
# PreToolUse(Bash) hook: block `git merge agent/<x>` unless
# .coord/reviews/agent/<x>.md ends with `APPROVE <commit>` where <commit> is
# the branch's current head, so a stale approval cannot pass.
# shortcut: only gates `git merge` of agent/* branches; rebase/cherry-pick/pull are not checked.
set -u
cmd=$(jq -r '.tool_input.command // empty')
grep -qE '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+merge([[:space:]]|$)' <<<"$cmd" || exit 0

repo="$CLAUDE_PROJECT_DIR"
status=0
for branch in $(grep -oE 'agent/[A-Za-z0-9._-]+' <<<"$cmd" | sort -u); do
  head=$(git -C "$repo" rev-parse --verify --quiet "$branch^{commit}") || continue
  file="$repo/.coord/reviews/$branch.md"
  last=$(grep -vE '^[[:space:]]*$' "$file" 2>/dev/null | tail -1)
  if [[ "$last" =~ ^APPROVE[[:space:]]+([0-9a-f]{7,40})[[:space:]]*$ ]] && [[ "$head" == "${BASH_REMATCH[1]}"* ]]; then
    continue
  fi
  echo "Blocked: merge of $branch needs a code-review approval for its current head." >&2
  echo "Expected last line of .coord/reviews/$branch.md: APPROVE ${head:0:7}" >&2
  echo "Found: ${last:-<no review file>}" >&2
  status=2
done
exit $status
