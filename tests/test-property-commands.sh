#!/bin/bash
# Tests for property commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test-site"
export CONFLUENCE_EMAIL="test@example.com"
export CONFLUENCE_TOKEN="test-token"

# 1. property list returns results array
assert_stdout_json "property list returns results array" \
  ".results | type" "array" \
  property list --page-id 123

# 2. property get returns matching key
assert_stdout_json "property get returns key=custom" \
  ".key" "custom" \
  property get --page-id 123 --key "custom"

# 3. property set succeeds
assert_stdout_json "property set returns ok=true" \
  ".ok" "true" \
  property set --page-id 123 --key "custom" --value '{"a":1}'

# 4. property list without --page-id fails
assert_exit "property list without --page-id exits 4" 4 \
  property list
assert_stderr_json "property list without --page-id has code 4" \
  ".code" "4" \
  property list

stop_mock_server
summary
