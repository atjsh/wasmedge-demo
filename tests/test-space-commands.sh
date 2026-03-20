#!/bin/bash
# Test space commands
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server
export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

echo "# Testing space commands"

# Test 1: space list returns results array
assert_stdout_json "space list returns results array" \
  ".results | type" "array" \
  space list

# Test 2: space list --limit 1 limits results
assert_stdout_json "space list --limit 1 returns at most 1 result" \
  ".results | length <= 1" "true" \
  space list --limit 1

# Test 3: space get 456 returns space with matching id
assert_stdout_json "space get 456 returns correct space" \
  ".id" "456" \
  space get 456

# Test 4: space get without id exits with error code 4
run_cli space get
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" -eq 4 ] && [ "$(echo "$STDERR" | jq -r '.code' 2>/dev/null)" = "4" ]; then
  echo "ok $TOTAL - space get without id returns exit 4 and error code 4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - space get without id returns exit 4 and error code 4"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

stop_mock_server
summary
