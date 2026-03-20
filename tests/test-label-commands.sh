#!/bin/bash
# Tests for label commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test-site"
export CONFLUENCE_EMAIL="test@example.com"
export CONFLUENCE_TOKEN="test-token"

# 1. label list returns results array
assert_stdout_json "label list returns results array" \
  ".results | type" "array" \
  label list --page-id 123

# 2. label add with multiple labels succeeds
assert_stdout_json "label add returns ok=true" \
  ".ok" "true" \
  label add --page-id 123 --label "reviewed,approved"

assert_stdout_json "label add returns 2 added labels" \
  ".added | length" "2" \
  label add --page-id 123 --label "reviewed,approved"

# 3. label remove succeeds
assert_stdout_json "label remove returns ok=true" \
  ".ok" "true" \
  label remove --page-id 123 --label "draft"

# 4. label add without --page-id fails
assert_exit "label add without --page-id exits 4" 4 \
  label add
assert_stderr_json "label add without --page-id has code 4" \
  ".code" "4" \
  label add

# 5. label add without --label fails
assert_exit "label add without --label exits 4" 4 \
  label add --page-id 123
assert_stderr_json "label add without --label has code 4" \
  ".code" "4" \
  label add --page-id 123

stop_mock_server
summary
