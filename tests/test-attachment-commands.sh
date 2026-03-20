#!/bin/bash
# Tests for attachment commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

setup_test_data
start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test-site"
export CONFLUENCE_EMAIL="test@example.com"
export CONFLUENCE_TOKEN="test-token"

# 1. attachment list returns results array
assert_stdout_json "attachment list returns results array" \
  ".results | type" "array" \
  attachment list --page-id 123

# 2. attachment upload with valid file succeeds
echo "test content" > "$DATA_DIR/test.txt"
assert_stdout_json "attachment upload returns ok=true" \
  ".ok" "true" \
  attachment upload --page-id 123 --file /data/test.txt

# 3. attachment upload with missing file fails
assert_exit "attachment upload with missing file exits 4" 4 \
  attachment upload --page-id 123 --file /data/missing.txt
assert_stderr_json "attachment upload with missing file has code 4" \
  ".code" "4" \
  attachment upload --page-id 123 --file /data/missing.txt

# 4. attachment download succeeds
assert_stdout_json "attachment download returns ok=true" \
  ".ok" "true" \
  attachment download ATT1 --output /data/out.txt

# 5. attachment list without --page-id fails
assert_exit "attachment list without --page-id exits 4" 4 \
  attachment list
assert_stderr_json "attachment list without --page-id has code 4" \
  ".code" "4" \
  attachment list

stop_mock_server
summary
