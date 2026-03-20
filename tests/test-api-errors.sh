#!/bin/bash
# Tests for Confluence API error handling using mock server magic page IDs
# Magic IDs: "401" → 401, "403" → 403, "404" → 404, "429" → 429, "500" → 500

source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: API Error Handling"
echo "1..8"

start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

# Test 1: 401 Unauthorized → stderr .code = 2 (auth error), exit 2
run_cli page get 401
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "2" ] && [ "$EXIT_CODE" = "2" ]; then
  echo "ok $TOTAL - 401 returns error code 2 and exit 2 (auth error)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 401 returns error code 2 and exit 2 (auth error)"
  echo "  # expected .code=2 exit=2, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 2: 403 Forbidden → stderr .code = 2 (permission denied), exit 2
run_cli page get 403
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "2" ] && [ "$EXIT_CODE" = "2" ]; then
  echo "ok $TOTAL - 403 returns error code 2 and exit 2 (permission denied)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 403 returns error code 2 and exit 2 (permission denied)"
  echo "  # expected .code=2 exit=2, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 3: 404 Not Found → stderr .code = 3 (not found), exit 3
run_cli page get 404
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "3" ] && [ "$EXIT_CODE" = "3" ]; then
  echo "ok $TOTAL - 404 returns error code 3 and exit 3 (not found)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 404 returns error code 3 and exit 3 (not found)"
  echo "  # expected .code=3 exit=3, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 4: 429 Too Many Requests → stderr .code = 1 (rate limited), exit 1
run_cli page get 429
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "1" ] && [ "$EXIT_CODE" = "1" ]; then
  echo "ok $TOTAL - 429 returns error code 1 and exit 1 (rate limited)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 429 returns error code 1 and exit 1 (rate limited)"
  echo "  # expected .code=1 exit=1, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 5: 500 Internal Server Error → stderr .code = 1 (server error), exit 1
run_cli page get 500
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "1" ] && [ "$EXIT_CODE" = "1" ]; then
  echo "ok $TOTAL - 500 returns error code 1 and exit 1 (server error)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 500 returns error code 1 and exit 1 (server error)"
  echo "  # expected .code=1 exit=1, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 6: 404 error message contains "not found" (case insensitive)
run_cli page get 404
TOTAL=$((TOTAL + 1))
msg=$(echo "$STDERR" | jq -r '.message' 2>/dev/null || echo "__jq_error__")
if echo "$msg" | grep -qi "not found"; then
  echo "ok $TOTAL - 404 error message contains 'not found'"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 404 error message contains 'not found'"
  echo "  # message was: '$msg'"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# Test 7: --verbose on 401 includes debug info with .request.url field
run_cli page get 401 --verbose
TOTAL=$((TOTAL + 1))
req_url=$(echo "$STDERR" | jq -r '.request.url' 2>/dev/null || echo "__jq_error__")
if [ "$req_url" != "null" ] && [ "$req_url" != "__jq_error__" ] && [ -n "$req_url" ]; then
  echo "ok $TOTAL - 401 --verbose stderr includes .request.url"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - 401 --verbose stderr includes .request.url"
  echo "  # .request.url was: '$req_url'"
  echo "  # stderr: $(echo "$STDERR" | head -5)"
  FAIL=$((FAIL + 1))
fi

# Test 8: No auth (unset all env vars) → page list returns .code = 2, exit 2
unset CONFLUENCE_EMAIL
unset CONFLUENCE_TOKEN
unset CONFLUENCE_SITE
unset CONFLUENCE_BASE_URL
run_cli page list
TOTAL=$((TOTAL + 1))
code=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "__jq_error__")
if [ "$code" = "2" ] && [ "$EXIT_CODE" = "2" ]; then
  echo "ok $TOTAL - no auth returns error code 2 and exit 2"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - no auth returns error code 2 and exit 2"
  echo "  # expected .code=2 exit=2, got .code=$code exit=$EXIT_CODE"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

stop_mock_server
summary
