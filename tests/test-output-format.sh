#!/bin/bash
# Tests for output formatting (compact/pretty JSON, error formatting, verbose mode)

source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: Output Formatting"
echo "1..8"

start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

# Test 1: compact JSON output (default, no --pretty)
assert_stdout_compact_json "page list without --pretty produces compact JSON" \
  confluence page list --space-id 456

# Test 2: pretty JSON output (--pretty flag)
assert_stdout_pretty_json "page list with --pretty produces multi-line JSON" \
  confluence page list --space-id 456 --pretty

# Test 3: invalid command writes error JSON to stderr, nothing to stdout
run_cli confluence xyz
TOTAL=$((TOTAL + 1))
stderr_error=$(echo "$STDERR" | jq -r '.error' 2>/dev/null || echo "__jq_error__")
if [ "$stderr_error" = "true" ] && [ -z "$STDOUT" ]; then
  echo "ok $TOTAL - invalid command writes error JSON to stderr, stdout is empty"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - invalid command error formatting"
  echo "  # stderr .error = '$stderr_error' (expected 'true')"
  echo "  # stdout empty = $([ -z "$STDOUT" ] && echo yes || echo no)"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 4: API 404 writes error JSON to stderr, nothing to stdout
run_cli confluence page get 404_trigger
TOTAL=$((TOTAL + 1))
stderr_error=$(echo "$STDERR" | jq -r '.error' 2>/dev/null || echo "__jq_error__")
if [ "$stderr_error" = "true" ] && [ -z "$STDOUT" ]; then
  echo "ok $TOTAL - 404 response writes error JSON to stderr, stdout is empty"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 404 error formatting"
  echo "  # stderr .error = '$stderr_error' (expected 'true')"
  echo "  # stdout empty = $([ -z "$STDOUT" ] && echo yes || echo no)"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 5: --verbose writes debug JSON to stderr
run_cli confluence page list --space-id 456 --verbose
TOTAL=$((TOTAL + 1))
stderr_debug=$(echo "$STDERR" | jq -r '.debug' 2>/dev/null || echo "__jq_error__")
if [ "$stderr_debug" = "true" ]; then
  echo "ok $TOTAL - verbose mode writes debug JSON with .debug=true to stderr"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - verbose mode debug output"
  echo "  # stderr .debug = '$stderr_debug' (expected 'true')"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 6: --verbose does not affect stdout (still has normal result)
TOTAL=$((TOTAL + 1))
# reuse STDOUT from the --verbose run above
if echo "$STDOUT" | jq . >/dev/null 2>&1 && [ -n "$STDOUT" ]; then
  echo "ok $TOTAL - verbose mode stdout still contains valid JSON result"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - verbose mode stdout should have normal result"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 7: pretty output is valid JSON (parseable by jq)
assert_stdout_valid_json "pretty output is valid JSON parseable by jq" \
  confluence page list --space-id 456 --pretty

# Test 8: compact output piped to jq .results produces valid output
run_cli confluence page list --space-id 456
TOTAL=$((TOTAL + 1))
jq_result=$(echo "$STDOUT" | jq '.results' 2>/dev/null)
jq_exit=$?
if [ "$jq_exit" -eq 0 ] && [ -n "$jq_result" ] && [ "$jq_result" != "null" ]; then
  echo "ok $TOTAL - compact output piped to jq .results produces valid output"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - compact output piped to jq .results"
  echo "  # jq exit: $jq_exit"
  echo "  # jq result: $(echo "$jq_result" | head -3)"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

stop_mock_server
summary
