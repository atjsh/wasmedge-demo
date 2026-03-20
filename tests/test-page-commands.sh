#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data
echo "# Test Suite: Page Commands"
echo "1..16"

start_mock_server
export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

# 1. page list --space-id 456 → exit 0, stdout JSON has .results array
assert_stdout_json "page list returns results array" \
  '.results | type' "array" \
  page list --space-id 456

# 2. page list --space-id 456 --limit 2 → exit 0, .results | length ≤ 2
TOTAL=$((TOTAL + 1))
run_cli page list --space-id 456 --limit 2
len=$(echo "$STDOUT" | jq '.results | length' 2>/dev/null || echo "-1")
if [ "$EXIT_CODE" -eq 0 ] && [ "$len" -ge 0 ] && [ "$len" -le 2 ]; then
  echo "ok $TOTAL - page list --limit 2 returns at most 2 results"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list --limit 2 returns at most 2 results"
  echo "  # exit=$EXIT_CODE, results length=$len"
  FAIL=$((FAIL + 1))
fi

# 3. page list --space-id 456 --all → exit 0, no ._links.next in output
assert_stdout_json "page list --all has no next link" \
  '._links.next' "null" \
  page list --space-id 456 --all

# 4. page get 123 → exit 0, stdout JSON has .id = "123"
assert_stdout_json "page get returns correct id" \
  '.id' "123" \
  page get 123

# 5. page get 123 → stdout has .title field (string)
assert_stdout_json "page get returns title as string" \
  '.title | type' "string" \
  page get 123

# 6. page get 123 --body-format storage → stdout has .body.storage.value field
assert_stdout_json "page get body-format storage returns body value" \
  '.body.storage.value | type' "string" \
  page get 123 --body-format storage

# 7. page get (no id) → exit 4, stderr JSON .code = 4
assert_stderr_json "page get without id returns error code 4" \
  '.code' "4" \
  page get

# 8. page create --space-id 456 --title "Test Page" → exit 0, stdout has .id
assert_stdout_json "page create returns id" \
  'has("id")' "true" \
  page create --space-id 456 --title "Test Page"

# 9. page create (no --space-id) → exit 4, stderr .message contains "--space-id"
assert_stderr_json "page create without space-id mentions --space-id" \
  '.message | test("--space-id")' "true" \
  page create

# 10. page create --space-id 456 (no --title) → exit 4, stderr .message contains "--title"
assert_stderr_json "page create without title mentions --title" \
  '.message | test("--title")' "true" \
  page create --space-id 456

# 11. page update 123 --title "New" --version 3 → exit 0, stdout has .id = "123"
assert_stdout_json "page update returns correct id" \
  '.id' "123" \
  page update 123 --title "New" --version 3

# 12. page update 123 (no --version) → exit 4, stderr .message contains "--version"
assert_stderr_json "page update without version mentions --version" \
  '.message | test("--version")' "true" \
  page update 123

# 13. page delete 123 → exit 0, stdout .ok = true
assert_stdout_json "page delete returns ok" \
  '.ok' "true" \
  page delete 123

# 14. page delete 123 --purge → exit 0, stdout .purged = true
assert_stdout_json "page delete with purge returns purged" \
  '.purged' "true" \
  page delete 123 --purge

# 15. page tree 123 --depth 2 → exit 0, stdout has .children array
assert_stdout_json "page tree returns children array" \
  '.children | type' "array" \
  page tree 123 --depth 2

# 16. page get 123 --pretty → exit 0, multi-line JSON output
assert_stdout_pretty_json "page get --pretty outputs multi-line JSON" \
  page get 123 --pretty

stop_mock_server
summary
