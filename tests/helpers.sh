#!/bin/bash
# Test helpers — TAP-compatible assertions for WasmEdge Confluence CLI
# Usage: source ./tests/helpers.sh

set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

# Configurable CLI command — override with CLI_CMD env var
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WASMEDGE="${WASMEDGE:-wasmedge}"
WASM="${WASM:-${REPO_DIR}/wasmedge_quickjs.wasm}"
SERVER_JS="${SERVER_JS:-${REPO_DIR}/server.js}"
DATA_DIR="${DATA_DIR:-/data}"
MOCK_PORT="${MOCK_PORT:-8090}"
MOCK_URL="http://localhost:${MOCK_PORT}/wiki/api/v2"

# Run CLI command in CLI mode
# Usage: run_cli [args...]
# Sets: EXIT_CODE, STDOUT, STDERR
run_cli() {
  local tmpout="/tmp/test_stdout_$$"
  local tmperr="/tmp/test_stderr_$$"
  set +e
  "$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data \
    --env MODE=cli \
    --env CLI_DATA_DIR="/data" \
    --env CONFLUENCE_BASE_URL="${CONFLUENCE_BASE_URL:-}" \
    --env CONFLUENCE_SITE="${CONFLUENCE_SITE:-}" \
    --env CONFLUENCE_EMAIL="${CONFLUENCE_EMAIL:-}" \
    --env CONFLUENCE_TOKEN="${CONFLUENCE_TOKEN:-}" \
    "$WASM" -- "$SERVER_JS" "$@" >"$tmpout" 2>"$tmperr"
  EXIT_CODE=$?
  set -e
  STDOUT=$(cat "$tmpout")
  STDERR=$(cat "$tmperr")
  rm -f "$tmpout" "$tmperr"
}

# Run GUI server (background), sets GUI_PID
start_gui_server() {
  local port="${1:-8080}"
  "$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir "${DATA_DIR}:${DATA_DIR}" \
    --env MODE=gui \
    "$WASM" -- "$SERVER_JS" &
  GUI_PID=$!
  sleep 2  # wait for server startup
}

stop_gui_server() {
  if [ -n "${GUI_PID:-}" ]; then
    kill "$GUI_PID" 2>/dev/null || true
    wait "$GUI_PID" 2>/dev/null || true
    unset GUI_PID
  fi
}

# Start mock Confluence server (background), sets MOCK_PID
start_mock_server() {
  node "${REPO_DIR}/tests/mock-server.mjs" &
  MOCK_PID=$!
  sleep 2  # wait for server startup
}

stop_mock_server() {
  if [ -n "${MOCK_PID:-}" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
    unset MOCK_PID
  fi
}

# Setup test data directory
setup_test_data() {
  mkdir -p "$DATA_DIR"
}

# Cleanup test data directory
cleanup_test_data() {
  # Clean up test artifacts but don't remove /data itself
  rm -f "$DATA_DIR/auth.json" "$DATA_DIR/test.txt" "$DATA_DIR/out.txt"
  rm -rf "$DATA_DIR/backup"
}

# TAP assertion: check exit code
# Usage: assert_exit "description" EXPECTED_CODE args...
assert_exit() {
  local desc="$1"
  local expected="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  if [ "$EXIT_CODE" = "$expected" ]; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # expected exit $expected, got $EXIT_CODE"
    [ -n "$STDERR" ] && echo "  # stderr: $(echo "$STDERR" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: check stdout JSON field value
# Usage: assert_stdout_json "description" "jq_filter" "expected_value" args...
assert_stdout_json() {
  local desc="$1"
  local filter="$2"
  local expected="$3"
  shift 3
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  local actual
  actual=$(echo "$STDOUT" | jq -r "$filter" 2>/dev/null || echo "__jq_error__")
  if [ "$actual" = "$expected" ]; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # expected '$expected', got '$actual'"
    echo "  # stdout: $(echo "$STDOUT" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: check stderr JSON field value
# Usage: assert_stderr_json "description" "jq_filter" "expected_value" args...
assert_stderr_json() {
  local desc="$1"
  local filter="$2"
  local expected="$3"
  shift 3
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  local actual
  actual=$(echo "$STDERR" | jq -r "$filter" 2>/dev/null || echo "__jq_error__")
  if [ "$actual" = "$expected" ]; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # expected '$expected', got '$actual'"
    echo "  # stderr: $(echo "$STDERR" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: stdout contains a string
# Usage: assert_stdout_contains "description" "substring" args...
assert_stdout_contains() {
  local desc="$1"
  local substring="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  if echo "$STDOUT" | grep -qF "$substring"; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # stdout did not contain '$substring'"
    echo "  # stdout: $(echo "$STDOUT" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: stderr contains a string
# Usage: assert_stderr_contains "description" "substring" args...
assert_stderr_contains() {
  local desc="$1"
  local substring="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  if echo "$STDERR" | grep -qF "$substring"; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # stderr did not contain '$substring'"
    echo "  # stderr: $(echo "$STDERR" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: stdout is valid JSON
# Usage: assert_stdout_valid_json "description" args...
assert_stdout_valid_json() {
  local desc="$1"
  shift
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  if echo "$STDOUT" | jq . >/dev/null 2>&1; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # stdout is not valid JSON"
    echo "  # stdout: $(echo "$STDOUT" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: stdout JSON is compact (single line)
# Usage: assert_stdout_compact_json "description" args...
assert_stdout_compact_json() {
  local desc="$1"
  shift
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  local lines
  lines=$(echo "$STDOUT" | wc -l)
  if [ "$lines" -le 1 ] && echo "$STDOUT" | jq . >/dev/null 2>&1; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # expected single-line JSON, got $lines lines"
    FAIL=$((FAIL + 1))
  fi
}

# TAP assertion: stdout JSON is pretty (multi-line)
# Usage: assert_stdout_pretty_json "description" args...
assert_stdout_pretty_json() {
  local desc="$1"
  shift
  TOTAL=$((TOTAL + 1))
  run_cli "$@"
  local lines
  lines=$(echo "$STDOUT" | wc -l)
  if [ "$lines" -gt 1 ] && echo "$STDOUT" | jq . >/dev/null 2>&1; then
    echo "ok $TOTAL - $desc"
    PASS=$((PASS + 1))
  else
    echo "not ok $TOTAL - $desc"
    echo "  # expected multi-line JSON, got $lines lines"
    FAIL=$((FAIL + 1))
  fi
}

# Print test summary and exit
summary() {
  echo "---"
  echo "# Tests: $TOTAL, Pass: $PASS, Fail: $FAIL"
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
}

# Trap cleanup
trap 'stop_gui_server; stop_mock_server; cleanup_test_data' EXIT
