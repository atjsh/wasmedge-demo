#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: Pagination"
echo "1..7"

start_mock_server

export CONFLUENCE_BASE_URL="$MOCK_URL"
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE"

# ---------------------------------------------------------------------------
# Test 1: page list --space-id 456 → response has _links
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id 456
has_links=$(echo "$STDOUT" | jq 'has("_links")' 2>/dev/null || echo "false")
if [ "$has_links" = "true" ]; then
  echo "ok $TOTAL - page list response has _links"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list response has _links"
  echo "  # _links not found in response"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 2: page list --space-id 456 --limit 2 → results array length ≤ 2
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id 456 --limit 2
count=$(echo "$STDOUT" | jq '.results | length' 2>/dev/null || echo "-1")
if [ "$count" -ge 0 ] && [ "$count" -le 2 ]; then
  echo "ok $TOTAL - page list --limit 2 returns at most 2 results (got $count)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list --limit 2 returns at most 2 results"
  echo "  # expected length <= 2, got $count"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 3: page list --space-id paginated --all → no _links.next in final output
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id paginated --all
next_link=$(echo "$STDOUT" | jq -r '._links.next // empty' 2>/dev/null)
if [ -z "$next_link" ]; then
  echo "ok $TOTAL - page list --all has no _links.next in final output"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list --all has no _links.next in final output"
  echo "  # _links.next still present: $next_link"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 4: page list --space-id paginated --all → has ._meta.total_fetched field
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id paginated --all
has_total=$(echo "$STDOUT" | jq 'has("_meta") and (._meta | has("total_fetched"))' 2>/dev/null || echo "false")
if [ "$has_total" = "true" ]; then
  echo "ok $TOTAL - page list --all has _meta.total_fetched"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list --all has _meta.total_fetched"
  echo "  # _meta.total_fetched not found"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 5: page list --space-id paginated --all → total_fetched > single page count
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id paginated
single_count=$(echo "$STDOUT" | jq '.results | length' 2>/dev/null || echo "0")
run_cli page list --space-id paginated --all
all_fetched=$(echo "$STDOUT" | jq '._meta.total_fetched' 2>/dev/null || echo "0")
if [ "$all_fetched" -gt "$single_count" ] 2>/dev/null; then
  echo "ok $TOTAL - --all total_fetched ($all_fetched) > single page count ($single_count)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - --all total_fetched ($all_fetched) > single page count ($single_count)"
  echo "  # expected total_fetched > single page results"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 6: space list --limit 1 → results array length ≤ 1
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli space list --limit 1
count=$(echo "$STDOUT" | jq '.results | length' 2>/dev/null || echo "-1")
if [ "$count" -ge 0 ] && [ "$count" -le 1 ]; then
  echo "ok $TOTAL - space list --limit 1 returns at most 1 result (got $count)"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - space list --limit 1 returns at most 1 result"
  echo "  # expected length <= 1, got $count"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Test 7: Default limit applies (no --limit flag) → results array exists
# ---------------------------------------------------------------------------
TOTAL=$((TOTAL + 1))
run_cli page list --space-id 456
has_results=$(echo "$STDOUT" | jq 'has("results")' 2>/dev/null || echo "false")
if [ "$has_results" = "true" ]; then
  echo "ok $TOTAL - default limit: results array exists"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - default limit: results array exists"
  echo "  # results array not found"
  echo "  # stdout: $(echo "$STDOUT" | head -3)"
  FAIL=$((FAIL + 1))
fi

stop_mock_server
summary
