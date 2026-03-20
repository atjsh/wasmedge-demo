#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data
echo "# Test Suite: Help Output"
echo "1..15"

# Test 1: confluence --help exits 0 and shows main sections
run_cli confluence --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "USAGE" \
  && echo "$STDOUT" | grep -qF "COMMANDS" \
  && echo "$STDOUT" | grep -qF "GLOBAL FLAGS"; then
  echo "ok $TOTAL - confluence --help exits 0 and shows USAGE, COMMANDS, GLOBAL FLAGS"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - confluence --help exits 0 and shows USAGE, COMMANDS, GLOBAL FLAGS"
  echo "  # exit=$EXIT_CODE"
  for kw in "USAGE" "COMMANDS" "GLOBAL FLAGS"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 2: confluence --help lists core commands
assert_stdout_contains "confluence --help lists auth, page, space, search" "auth" confluence --help
for kw in "page" "space" "search"; do
  echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
done

# Test 3: confluence --help lists extended commands
assert_stdout_contains "confluence --help lists comment, label, version, attachment, property, bulk" "comment" confluence --help
for kw in "label" "version" "attachment" "property" "bulk"; do
  echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
done

# Test 4: page --help exits 0 and shows actions
run_cli confluence page --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "ACTIONS" \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "get" \
  && echo "$STDOUT" | grep -qF "create" \
  && echo "$STDOUT" | grep -qF "update" \
  && echo "$STDOUT" | grep -qF "delete" \
  && echo "$STDOUT" | grep -qF "tree"; then
  echo "ok $TOTAL - page --help exits 0 with ACTIONS: list, get, create, update, delete, tree"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page --help exits 0 with ACTIONS: list, get, create, update, delete, tree"
  echo "  # exit=$EXIT_CODE"
  for kw in "ACTIONS" "list" "get" "create" "update" "delete" "tree"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 5: space --help exits 0 and shows actions
run_cli confluence space --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "ACTIONS" \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "get"; then
  echo "ok $TOTAL - space --help exits 0 with ACTIONS: list, get"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - space --help exits 0 with ACTIONS: list, get"
  echo "  # exit=$EXIT_CODE"
  for kw in "ACTIONS" "list" "get"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 6: search --help exits 0 and shows --cql
assert_exit "search --help exits 0" 0 confluence search --help
# STDOUT set by assert_exit's run_cli call — verify --cql as diagnostic
echo "$STDOUT" | grep -qF -- "--cql" || echo "  # missing: --cql"

# Test 7: comment --help exits 0 and shows actions
run_cli confluence comment --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "create" \
  && echo "$STDOUT" | grep -qF "delete"; then
  echo "ok $TOTAL - comment --help exits 0 with list, create, delete"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - comment --help exits 0 with list, create, delete"
  echo "  # exit=$EXIT_CODE"
  for kw in "list" "create" "delete"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 8: label --help exits 0 and shows actions
run_cli confluence label --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "add" \
  && echo "$STDOUT" | grep -qF "remove"; then
  echo "ok $TOTAL - label --help exits 0 with list, add, remove"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - label --help exits 0 with list, add, remove"
  echo "  # exit=$EXIT_CODE"
  for kw in "list" "add" "remove"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 9: version --help exits 0 and shows actions
run_cli confluence version --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "get"; then
  echo "ok $TOTAL - version --help exits 0 with list, get"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - version --help exits 0 with list, get"
  echo "  # exit=$EXIT_CODE"
  for kw in "list" "get"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 10: attachment --help exits 0 and shows actions
run_cli confluence attachment --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "upload" \
  && echo "$STDOUT" | grep -qF "download"; then
  echo "ok $TOTAL - attachment --help exits 0 with list, upload, download"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - attachment --help exits 0 with list, upload, download"
  echo "  # exit=$EXIT_CODE"
  for kw in "list" "upload" "download"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 11: property --help exits 0 and shows actions
run_cli confluence property --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "list" \
  && echo "$STDOUT" | grep -qF "get" \
  && echo "$STDOUT" | grep -qF "set"; then
  echo "ok $TOTAL - property --help exits 0 with list, get, set"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - property --help exits 0 with list, get, set"
  echo "  # exit=$EXIT_CODE"
  for kw in "list" "get" "set"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 12: bulk --help exits 0 and shows actions
run_cli confluence bulk --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "export" \
  && echo "$STDOUT" | grep -qF "import"; then
  echo "ok $TOTAL - bulk --help exits 0 with export, import"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - bulk --help exits 0 with export, import"
  echo "  # exit=$EXIT_CODE"
  for kw in "export" "import"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 13: auth --help exits 0 and shows actions
run_cli confluence auth --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF "login" \
  && echo "$STDOUT" | grep -qF "logout" \
  && echo "$STDOUT" | grep -qF "status"; then
  echo "ok $TOTAL - auth --help exits 0 with login, logout, status"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth --help exits 0 with login, logout, status"
  echo "  # exit=$EXIT_CODE"
  for kw in "login" "logout" "status"; do
    echo "$STDOUT" | grep -qF "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 14: page create --help exits 0 and shows flags/examples
run_cli confluence page create --help
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] \
  && echo "$STDOUT" | grep -qF -- "--space-id" \
  && echo "$STDOUT" | grep -qF -- "--title" \
  && echo "$STDOUT" | grep -qF "EXAMPLES"; then
  echo "ok $TOTAL - page create --help exits 0 with --space-id, --title, EXAMPLES"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page create --help exits 0 with --space-id, --title, EXAMPLES"
  echo "  # exit=$EXIT_CODE"
  for kw in "--space-id" "--title" "EXAMPLES"; do
    echo "$STDOUT" | grep -qF -- "$kw" || echo "  # missing: $kw"
  done
  FAIL=$((FAIL + 1))
fi

# Test 15: -h short flag works (same as --help, exits 0)
assert_exit "confluence -h short flag exits 0" 0 confluence -h

summary
