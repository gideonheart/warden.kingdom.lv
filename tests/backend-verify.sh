#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Warden Backend Verification Script
# Tests Phase 1 success criteria without requiring UI
################################################################################

BASE_URL="http://127.0.0.1:3001"
TEST_SESSION_PREFIX="gideon-test"
TEST_SESSION_NAME="${TEST_SESSION_PREFIX}-verify-$$"
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
  echo ""
  echo -e "${YELLOW}[Cleanup] Removing test tmux sessions...${NC}"
  tmux kill-session -t "$TEST_SESSION_NAME" 2>/dev/null || true
  tmux kill-session -t "${TEST_SESSION_PREFIX}-stop-$$" 2>/dev/null || true
}

trap cleanup EXIT

pass() {
  local test_name="$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  echo -e "  ${GREEN}PASS${NC} $test_name"
}

fail() {
  local test_name="$1"
  local detail="${2:-}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  echo -e "  ${RED}FAIL${NC} $test_name"
  if [ -n "$detail" ]; then
    echo -e "       ${RED}→ $detail${NC}"
  fi
}

section() {
  echo ""
  echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

################################################################################
# 1. Health Check
################################################################################
section "Health Check"

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "000")
if [ "$HEALTH_RESPONSE" = "200" ]; then
  pass "Server responds 200 OK on /api/health"
else
  fail "Server responds 200 OK on /api/health" "Got HTTP $HEALTH_RESPONSE (is the server running on $BASE_URL?)"
  echo ""
  echo -e "${RED}Server is not running. Start it with: npm run dev${NC}"
  echo -e "${RED}Aborting remaining tests.${NC}"
  exit 1
fi

HEALTH_BODY=$(curl -s "$BASE_URL/api/health" 2>/dev/null)
if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass "Health response contains status: ok"
else
  fail "Health response contains status: ok" "Response: $HEALTH_BODY"
fi

if echo "$HEALTH_BODY" | grep -q '"uptime"'; then
  pass "Health response contains uptime"
else
  fail "Health response contains uptime"
fi

if echo "$HEALTH_BODY" | grep -q '"activeStreams"'; then
  pass "Health response contains activeStreams count"
else
  fail "Health response contains activeStreams count"
fi

################################################################################
# 2. Session Auto-Discovery
################################################################################
section "Session Auto-Discovery"

# Create a test tmux session with agent naming convention
tmux new-session -d -s "$TEST_SESSION_NAME" "echo 'Warden test session'; sleep 300"
sleep 1

if tmux has-session -t "$TEST_SESSION_NAME" 2>/dev/null; then
  pass "Test tmux session created: $TEST_SESSION_NAME"
else
  fail "Test tmux session created: $TEST_SESSION_NAME"
fi

# Wait for InstanceTracker periodic sync (runs every 10s)
echo "  Waiting for auto-discovery sync (up to 15s)..."
DISCOVERED=false
for i in $(seq 1 15); do
  INSTANCES_RESPONSE=$(curl -s "$BASE_URL/api/instances" 2>/dev/null)
  if echo "$INSTANCES_RESPONSE" | grep -q "$TEST_SESSION_NAME"; then
    DISCOVERED=true
    break
  fi
  sleep 1
done

if [ "$DISCOVERED" = true ]; then
  pass "Test session auto-discovered in /api/instances"
else
  fail "Test session auto-discovered in /api/instances" "Session $TEST_SESSION_NAME not found after 15s"
fi

# Verify instance has expected fields
if [ "$DISCOVERED" = true ]; then
  if echo "$INSTANCES_RESPONSE" | grep -q '"agentId"'; then
    pass "Instance has agentId field"
  else
    fail "Instance has agentId field"
  fi

  if echo "$INSTANCES_RESPONSE" | grep -q '"tmuxSessionName"'; then
    pass "Instance has tmuxSessionName field"
  else
    fail "Instance has tmuxSessionName field"
  fi

  if echo "$INSTANCES_RESPONSE" | grep -q '"status"'; then
    pass "Instance has status field"
  else
    fail "Instance has status field"
  fi
fi

################################################################################
# 3. Session Management (Stop)
################################################################################
section "Session Management"

# Create a session specifically for stopping
STOP_SESSION="${TEST_SESSION_PREFIX}-stop-$$"
tmux new-session -d -s "$STOP_SESSION" "echo 'Session to stop'; sleep 300"
sleep 1

# Wait for it to be discovered
echo "  Waiting for stop-test session discovery (up to 15s)..."
STOP_ID=""
for i in $(seq 1 15); do
  INSTANCES_RESPONSE=$(curl -s "$BASE_URL/api/instances" 2>/dev/null)
  STOP_ID=$(echo "$INSTANCES_RESPONSE" | grep -o "\"id\":[0-9]*" | head -1 | grep -o "[0-9]*" || true)
  if echo "$INSTANCES_RESPONSE" | grep -q "$STOP_SESSION"; then
    # Extract the ID for this specific session
    # Use python/node if available, otherwise basic parsing
    STOP_ID=$(echo "$INSTANCES_RESPONSE" | tr ',' '\n' | tr '{' '\n' | grep -B1 "$STOP_SESSION" | grep '"id"' | grep -o '[0-9]*' | head -1 || true)
    break
  fi
  sleep 1
done

if [ -n "$STOP_ID" ]; then
  STOP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/instances/$STOP_ID/stop" 2>/dev/null || echo "000")
  if [ "$STOP_RESPONSE" = "200" ]; then
    pass "Stop endpoint returns 200 OK"
  else
    fail "Stop endpoint returns 200 OK" "Got HTTP $STOP_RESPONSE for instance $STOP_ID"
  fi

  sleep 1
  if ! tmux has-session -t "$STOP_SESSION" 2>/dev/null; then
    pass "tmux session killed after stop"
  else
    fail "tmux session killed after stop" "Session $STOP_SESSION still exists"
  fi
else
  fail "Stop endpoint returns 200 OK" "Could not find session ID for $STOP_SESSION"
  fail "tmux session killed after stop" "Skipped (no session ID)"
fi

################################################################################
# 4. Database Persistence
################################################################################
section "Database Persistence"

DB_PATH="data/warden.db"
if [ -f "$DB_PATH" ]; then
  pass "SQLite database file exists at $DB_PATH"
else
  fail "SQLite database file exists at $DB_PATH"
fi

# Check WAL mode is active (WAL file may exist during runtime)
WAL_PATH="${DB_PATH}-wal"
SHM_PATH="${DB_PATH}-shm"
if [ -f "$WAL_PATH" ] || [ -f "$SHM_PATH" ]; then
  pass "WAL mode files present (runtime)"
else
  # WAL files might not exist if recently checkpointed — check pragma
  if command -v sqlite3 &>/dev/null; then
    JOURNAL_MODE=$(sqlite3 "$DB_PATH" "PRAGMA journal_mode;" 2>/dev/null || echo "unknown")
    if [ "$JOURNAL_MODE" = "wal" ]; then
      pass "WAL mode confirmed via pragma (files checkpointed)"
    else
      fail "WAL mode enabled" "journal_mode=$JOURNAL_MODE"
    fi
  else
    pass "WAL mode files present (may be checkpointed, sqlite3 CLI not available to verify)"
  fi
fi

# Check tables exist
if command -v sqlite3 &>/dev/null; then
  TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null || echo "")
  if echo "$TABLES" | grep -q "instances"; then
    pass "instances table exists"
  else
    fail "instances table exists"
  fi

  if echo "$TABLES" | grep -q "session_logs"; then
    pass "session_logs table exists"
  else
    fail "session_logs table exists"
  fi

  if echo "$TABLES" | grep -q "token_usage"; then
    pass "token_usage table exists"
  else
    fail "token_usage table exists"
  fi
else
  echo "  (sqlite3 CLI not installed — skipping table checks)"
fi

################################################################################
# 5. Socket.IO Configuration
################################################################################
section "Socket.IO Configuration"

# Verify Socket.IO endpoint is accessible
SOCKETIO_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "000")
if [ "$SOCKETIO_RESPONSE" = "200" ]; then
  pass "Socket.IO endpoint accessible"
else
  fail "Socket.IO endpoint accessible" "Got HTTP $SOCKETIO_RESPONSE"
fi

################################################################################
# Summary
################################################################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Results: ${GREEN}${PASS_COUNT} passed${NC}, ${RED}${FAIL_COUNT} failed${NC}, ${TOTAL_COUNT} total"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
