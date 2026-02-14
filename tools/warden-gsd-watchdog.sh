#!/usr/bin/env bash
set -euo pipefail

# Warden GSD watchdog
# Ensures tmux session `warden-gsd-main` exists and is running Claude Code in the repo.
# Intended to run under Laravel Forge Daemon (supervisord) so it survives reboots.

SESSION="${WARDEN_GSD_SESSION:-warden-gsd-main}"
WORKDIR="${WARDEN_WORKDIR:-/home/forge/warden.kingdom.lv}"
CLAUDE_CMD="${CLAUDE_CMD:-claude --dangerously-skip-permissions}"
INTERVAL_SEC="${INTERVAL_SEC:-30}"

log() { printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

ensure_session() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    return 0
  fi

  log "Session $SESSION missing; creating + launching Claude Code"
  tmux new-session -d -s "$SESSION" -n shell "cd '$WORKDIR' && exec $CLAUDE_CMD"

  # Give Claude a moment to start, then resume the last session.
  # Rolands workflow when Claude was shut down unexpectedly:
  # 1) launch Claude Code
  # 2) run /resume
  # 3) select the first session in the resume list (Enter)
  # 4) type 'continue' to proceed
  sleep 2

  tmux send-keys -t "$SESSION":0.0 -l -- "/resume"
  sleep 0.2
  tmux send-keys -t "$SESSION":0.0 Enter

  # Wait for resume UI to populate, then pick the first entry.
  sleep 1
  tmux send-keys -t "$SESSION":0.0 Enter

  # Nudge the resumed session.
  sleep 0.5
  tmux send-keys -t "$SESSION":0.0 -l -- "continue"
  sleep 0.2
  tmux send-keys -t "$SESSION":0.0 Enter

  log "Launched $SESSION and ran /resume -> selected first session -> continue"
}

main() {
  log "Starting watchdog: session=$SESSION interval=${INTERVAL_SEC}s workdir=$WORKDIR"
  while true; do
    ensure_session || true
    sleep "$INTERVAL_SEC"
  done
}

main
