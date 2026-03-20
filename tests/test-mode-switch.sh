#!/bin/bash
# Test suite: Mode switching (GUI/CLI)
source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: Mode Switching"
echo "1..6"

# ---------------------------------------------------------------------------
# Helper for running wasmedge directly (not via run_cli which forces MODE=cli)
# ---------------------------------------------------------------------------
run_wasmedge_raw() {
  local tmpout="/tmp/test_stdout_$$"
  local tmperr="/tmp/test_stderr_$$"
  set +e
  "$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data "$@" \
    "$WASM" -- "$SERVER_JS" >"$tmpout" 2>"$tmperr"
  EXIT_CODE=$?
  set -e
  STDOUT=$(cat "$tmpout")
  STDERR=$(cat "$tmperr")
  rm -f "$tmpout" "$tmperr"
}

# ---------------------------------------------------------------------------
# Test 1: No MODE env → defaults to GUI server on :8080
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
TEST_DESC="No MODE env starts GUI server on :8080"
tmpout="/tmp/test_gui1_stdout_$$"
tmperr="/tmp/test_gui1_stderr_$$"
set +e
timeout 3 "$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data \
  "$WASM" -- "$SERVER_JS" >"$tmpout" 2>"$tmperr" &
GUI_PID=$!
sleep 2
CURL_RESULT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
kill "$GUI_PID" 2>/dev/null || true
wait "$GUI_PID" 2>/dev/null || true
set -e
rm -f "$tmpout" "$tmperr"
if [ "$CURL_RESULT" = "200" ]; then
  echo "ok $TOTAL - $TEST_DESC"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - $TEST_DESC"
  echo "  # expected HTTP 200 from server, got $CURL_RESULT"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 2: MODE=gui → starts GUI server on :8080
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
TEST_DESC="MODE=gui starts GUI server on :8080"
tmpout="/tmp/test_gui2_stdout_$$"
tmperr="/tmp/test_gui2_stderr_$$"
set +e
timeout 3 "$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data \
  --env MODE=gui \
  "$WASM" -- "$SERVER_JS" >"$tmpout" 2>"$tmperr" &
GUI_PID=$!
sleep 2
CURL_RESULT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
kill "$GUI_PID" 2>/dev/null || true
wait "$GUI_PID" 2>/dev/null || true
set -e
rm -f "$tmpout" "$tmperr"
if [ "$CURL_RESULT" = "200" ]; then
  echo "ok $TOTAL - $TEST_DESC"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - $TEST_DESC"
  echo "  # expected HTTP 200 from server, got $CURL_RESULT"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 3: MODE=cli with no subcommand → prints help text, exits 0
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
TEST_DESC="MODE=cli with no args prints help text and exits 0"
run_cli
if [ "$EXIT_CODE" = "0" ] && echo "$STDOUT" | grep -qiE "help|usage|commands"; then
  echo "ok $TOTAL - $TEST_DESC"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - $TEST_DESC"
  echo "  # exit=$EXIT_CODE, stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 4: MODE=cli with confluence --help → prints command tree, exits 0
# ---------------------------------------------------------------------------
assert_stdout_contains "MODE=cli confluence --help prints command tree" "confluence" "confluence" "--help"

# ---------------------------------------------------------------------------
# Test 5: MODE=cli with invalid command → error JSON to stderr, exits 1
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
TEST_DESC="MODE=cli invalid command prints error JSON to stderr and exits 1"
run_cli "not-a-real-command"
local_err_check=$(echo "$STDERR" | jq -r '.error' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "1" ] && [ -n "$local_err_check" ] && [ "$local_err_check" != "null" ]; then
  echo "ok $TOTAL - $TEST_DESC"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - $TEST_DESC"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 6: MODE=invalid → prints error about valid modes to stderr, exits 1
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
TEST_DESC="MODE=invalid prints error about valid modes and exits 1"
run_wasmedge_raw --env MODE=invalid
if [ "$EXIT_CODE" = "1" ] && echo "$STDERR" | grep -qi "valid\|mode\|gui\|cli"; then
  echo "ok $TOTAL - $TEST_DESC"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - $TEST_DESC"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

summary
