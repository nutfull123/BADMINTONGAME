#!/usr/bin/env bash
# Self-check for require-review.sh. Run: bash .claude/hooks/require-review.test.sh
set -u
hook="$(cd "$(dirname "$0")" && pwd)/require-review.sh"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q -b main && git -C "$tmp" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$tmp" branch agent/oc
head=$(git -C "$tmp" rev-parse --short agent/oc)
mkdir -p "$tmp/.coord/reviews/agent"
fail=0
check() { # <expected exit> <description> <command>
  CLAUDE_PROJECT_DIR="$tmp" bash "$hook" <<<"$(jq -n --arg c "$3" '{tool_input:{command:$c}}')" 2>/dev/null
  local got=$?
  [ "$got" = "$1" ] && echo "ok   $2" || { echo "FAIL $2 (got $got, want $1)"; fail=1; }
}
check 0 "non-merge command passes"        "git status"
check 0 "merging main passes"             "git merge main"
check 2 "no review file blocks"           "git merge agent/oc"
check 2 "-C form is caught"               "git -C /x merge --no-ff agent/oc"
echo "APPROVE 0000000" > "$tmp/.coord/reviews/agent/oc.md"
check 2 "stale approval blocks"           "git merge agent/oc"
printf 'file:1 — nit — why\nCHANGES\n' > "$tmp/.coord/reviews/agent/oc.md"
check 2 "CHANGES verdict blocks"          "git merge agent/oc"
printf 'looks good\n\nAPPROVE %s\n' "$head" > "$tmp/.coord/reviews/agent/oc.md"
check 0 "approval of current head passes" "git merge agent/oc"
check 0 "chained command passes"          "cd x && git merge agent/oc"
exit $fail
