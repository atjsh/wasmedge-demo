#!/bin/bash
# Test search commands
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server
export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

echo "# Testing search commands"

# Test 1: search --cql returns results array
assert_stdout_json "search --cql returns results array" \
  ".results | type" "array" \
  search --cql "type=page"

# Test 2: search without --cql exits with error referencing --cql
run_cli search
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" -eq 4 ] && \
   [ "$(echo "$STDERR" | jq -r '.code' 2>/dev/null)" = "4" ] && \
   echo "$STDERR" | jq -r '.message' 2>/dev/null | grep -q -- "--cql"; then
  echo "ok $TOTAL - search without --cql returns exit 4 with --cql in message"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - search without --cql returns exit 4 with --cql in message"
  echo "  # exit=$EXIT_CODE, stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 3: search --cql --limit 5 limits results
assert_stdout_json "search --cql --limit 5 returns at most 5 results" \
  ".results | length <= 5" "true" \
  search --cql "type=page" --limit 5

# Test 4: search --cql --all includes _meta field
assert_stdout_json "search --cql --all includes _meta field" \
  'has("_meta")' "true" \
  search --cql "type=page" --all

# Test 5: search --cql --pretty returns multi-line JSON
assert_stdout_pretty_json "search --cql --pretty returns multi-line JSON" \
  search --cql "type=page" --pretty

stop_mock_server
summary
