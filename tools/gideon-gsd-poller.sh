#!/usr/bin/env bash
set -euo pipefail

# Simple tmux poller for GSD-driven Claude Code sessions.
# Watches a target pane; when it detects an idle prompt and an explicit next-step
# recommendation, it sends the next command(s) (text+Enter separated).
#
# Safety: only auto-advances within /gsd:* and /clear. Anything else is logged and ignored.

TARGET="${1:-warden-gsd-main:0.0}"
INTERVAL_SEC="${INTERVAL_SEC:-3}"
MAX_IDLE_LOOPS="${MAX_IDLE_LOOPS:-1200}" # ~1h

send_cmd() {
  local cmd="$1"
  tmux send-keys -t "$TARGET" -l -- "$cmd"
  sleep 0.2
  tmux send-keys -t "$TARGET" Enter
}

get_tail() {
  tmux capture-pane -p -J -t "$TARGET" -S -120 2>/dev/null || true
}

is_idle_prompt() {
  # We treat it as idle when the bottom area contains a lone prompt line.
  # Claude Code sometimes shows "❯" or "❯ <prefilled>".
  local text="$1"
  echo "$text" | tail -n 8 | grep -Eq '^❯( |$)'
}

main() {
  local loops=0
  local last_hash=""

  while (( loops < MAX_IDLE_LOOPS )); do
    loops=$((loops+1))
    local t
    t="$(get_tail)"
    local h
    h="$(printf '%s' "$t" | sha1sum | awk '{print $1}')"

    # Only act when output changed and we're idle.
    if [[ "$h" != "$last_hash" ]]; then
      last_hash="$h"

      if is_idle_prompt "$t"; then
        # Common next-steps
        if echo "$t" | grep -q '/clear first' && echo "$t" | grep -q '/gsd:execute-phase'; then
          send_cmd "/clear"
          sleep 1
          # Extract phase number if present; default 6.
          local phase
          phase="$(echo "$t" | grep -oE '/gsd:execute-phase [0-9]+' | tail -n1 | awk '{print $2}')"
          phase="${phase:-6}"
          send_cmd "/gsd:execute-phase $phase"
        elif echo "$t" | grep -q '/gsd:verify-work'; then
          local phase
          phase="$(echo "$t" | grep -oE '/gsd:verify-work [0-9]+' | tail -n1 | awk '{print $2}')"
          phase="${phase:-}"
          if [[ -n "$phase" ]]; then
            send_cmd "/clear"
            sleep 1
            send_cmd "/gsd:verify-work $phase"
          fi
        elif echo "$t" | grep -q '/gsd:complete-milestone'; then
          # Don't auto-complete milestone without explicit human OK.
          echo "[poller] Detected /gsd:complete-milestone suggestion; pausing for human confirmation." >&2
        fi
      fi
    fi

    sleep "$INTERVAL_SEC"
  done
}

main
