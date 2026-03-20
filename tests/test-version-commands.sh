#!/bin/bash
# Tests for version commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test-site"
export CONFLUENCE_EMAIL="test@example.com"
export CONFLUENCE_TOKEN="test-token"

# 1. version list returns results array
assert_stdout_json "version list returns results array" \
  ".results | type" "array" \
  version list 123

# 2. version get returns version number
assert_stdout_json "version get returns version number" \
  ".version.number | type" "number" \
  version get 123 --version 2

# 3. version list without page-id fails
assert_exit "version list without page-id exits 4" 4 \
  version list
assert_stderr_json "version list without page-id has code 4" \
  ".code" "4" \
  version list

# 4. version get without --version fails
assert_exit "version get without --version exits 4" 4 \
  version get 123
assert_stderr_json "version get without --version has code 4" \
  ".code" "4" \
  version get 123

stop_mock_server
summary
