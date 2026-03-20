#!/bin/bash
# Tests for bulk commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test-site"
export CONFLUENCE_EMAIL="test@example.com"
export CONFLUENCE_TOKEN="test-token"

# 1. bulk export succeeds
assert_stdout_json "bulk export returns ok=true" \
  ".ok" "true" \
  bulk export --space-id 456 --output-dir /data/backup

# 2. bulk import succeeds
mkdir -p "$DATA_DIR/backup"
assert_stdout_json "bulk import returns ok=true" \
  ".ok" "true" \
  bulk import --space-id 456 --input-dir /data/backup

# 3. bulk export without --space-id fails
assert_exit "bulk export without --space-id exits 4" 4 \
  bulk export
assert_stderr_json "bulk export without --space-id has code 4" \
  ".code" "4" \
  bulk export

# 4. bulk export without --output-dir fails
assert_exit "bulk export without --output-dir exits 4" 4 \
  bulk export --space-id 456
assert_stderr_json "bulk export without --output-dir has code 4" \
  ".code" "4" \
  bulk export --space-id 456

stop_mock_server
summary
