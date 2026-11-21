#!/bin/bash
# Read-only live view of a worker's tmux session (oc or agy). Waits until Claude starts the worker.
# Usage: scripts/view-crew.sh oc|agy
s="crew-$1" v="view-$1"
until tmux has-session -t "$s" 2>/dev/null; do echo "waiting for $s ..."; sleep 5; done
tmux has-session -t "$v" 2>/dev/null || tmux new-session -d -s "$v" -t "$s"
exec tmux attach -r -t "$v"
