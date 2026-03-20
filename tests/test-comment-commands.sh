#!/bin/bash
# Test comment commands
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server
export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

echo "# Testing comment commands"

# Test 1: comment list --page-id 123 returns results array
assert_stdout_json "comment list --page-id 123 returns results array" \
  ".results | type" "array" \
  comment list --page-id 123

# Test 2: comment create --page-id 123 --body returns an id
assert_stdout_json "comment create returns id" \
  'has("id")' "true" \
  comment create --page-id 123 --body "<p>Hi</p>"

# Test 3: comment create without --page-id exits with error code 4
run_cli comment create
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" -eq 4 ] && [ "$(echo "$STDERR" | jq -r '.code' 2>/dev/null)" = "4" ]; then
  echo "ok $TOTAL - comment create without --page-id returns exit 4 and error code 4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - comment create without --page-id returns exit 4 and error code 4"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 4: comment create --page-id 123 without --body exits with error code 4
run_cli comment create --page-id 123
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" -eq 4 ] && [ "$(echo "$STDERR" | jq -r '.code' 2>/dev/null)" = "4" ]; then
  echo "ok $TOTAL - comment create without --body returns exit 4 and error code 4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - comment create without --body returns exit 4 and error code 4"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 5: comment delete 555 returns ok
assert_stdout_json "comment delete 555 returns ok true" \
  ".ok" "true" \
  comment delete 555

stop_mock_server
summary
