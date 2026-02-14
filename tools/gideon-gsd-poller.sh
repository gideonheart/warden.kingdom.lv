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
  # Note: -J (join wrapped lines) can return empty output with some TUIs; avoid it.
  tmux capture-pane -p -t "$TARGET" -S -120 2>/dev/null || true
}

is_idle_prompt() {
  # We treat it as idle when the bottom area contains a prompt line.
  # Claude Code uses Unicode whitespace sometimes (e.g. NBSP), so match any prompt.
  local text="$1"
  echo "$text" | tail -n 12 | grep -Eq '^❯'
}

main() {
  local loops=0
  local last_action_sig=""

  while (( loops < MAX_IDLE_LOOPS )); do
    loops=$((loops+1))

    local t
    t="$(get_tail)"

    if is_idle_prompt "$t"; then
      # Derive an action signature from the visible "Next Up" recommendations to avoid spamming.
      local sig
      sig="$(echo "$t" | tail -n 120 | grep -E '/gsd:|/clear' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | head -c 200)"

      if [[ -n "$sig" && "$sig" != "$last_action_sig" ]]; then
        echo "[poller] idle prompt detected; sig=$sig" >&2
        last_action_sig="$sig"

        if echo "$t" | grep -q '/clear first' && echo "$t" | grep -q '/gsd:execute-phase'; then
          local phase
          phase="$(echo "$t" | grep -oE '/gsd:execute-phase [0-9]+' | tail -n1 | awk '{print $2}')"
          phase="${phase:-1}"
          echo "[poller] sending: /clear then /gsd:execute-phase $phase" >&2
          send_cmd "/clear"
          sleep 1
          send_cmd "/gsd:execute-phase $phase"

        elif echo "$t" | grep -q '/clear first' && echo "$t" | grep -q '/gsd:plan-phase'; then
          local phase
          phase="$(echo "$t" | grep -oE '/gsd:plan-phase [0-9]+' | tail -n1 | awk '{print $2}')"
          phase="${phase:-1}"
          echo "[poller] sending: /clear then /gsd:plan-phase $phase" >&2
          send_cmd "/clear"
          sleep 1
          send_cmd "/gsd:plan-phase $phase"

        elif echo "$t" | grep -q '/clear first' && echo "$t" | grep -q '/gsd:new-milestone'; then
          echo "[poller] sending: /clear then /gsd:new-milestone" >&2
          send_cmd "/clear"
          sleep 1
          send_cmd "/gsd:new-milestone"

        elif echo "$t" | grep -q '/gsd:verify-work'; then
          local phase
          phase="$(echo "$t" | grep -oE '/gsd:verify-work [0-9]+' | tail -n1 | awk '{print $2}')"
          if [[ -n "$phase" ]]; then
            echo "[poller] sending: /clear then /gsd:verify-work $phase" >&2
            send_cmd "/clear"
            sleep 1
            send_cmd "/gsd:verify-work $phase"
          fi

        elif echo "$t" | grep -q '/clear first' && echo "$t" | grep -q '/gsd:complete-milestone' && ! echo "$t" | grep -q '/gsd:verify-work'; then
          # Only complete milestone when it's the only next-step (verification already done).
          echo "[poller] sending: /clear then /gsd:complete-milestone" >&2
          send_cmd "/clear"
          sleep 1
          send_cmd "/gsd:complete-milestone"

        else
          echo "[poller] idle prompt but no recognized next-step; doing nothing" >&2
        fi
      fi
    fi

    sleep "$INTERVAL_SEC"
  done
}

main
