#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data
echo "# Test Suite: Argument Parser"
echo "1..10"

# Test 1: page list parses correctly (exit != 4)
run_cli confluence page list
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" != "4" ]; then
  echo "ok $TOTAL - page list parses without validation error"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list got unexpected exit 4"
  echo "  # exit code: $EXIT_CODE"
  FAIL=$((FAIL + 1))
fi

# Test 2: positional arg parsed (exit != 4, no missing page-id validation error)
run_cli confluence page get 12345
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" != "4" ]; then
  echo "ok $TOTAL - page get with positional arg parses without validation error"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page get 12345 got unexpected exit 4 (positional arg not parsed)"
  echo "  # exit code: $EXIT_CODE"
  FAIL=$((FAIL + 1))
fi

# Test 3: named flags parsed (exit != 4)
run_cli confluence page list --space-id 456 --limit 50
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" != "4" ]; then
  echo "ok $TOTAL - page list with --space-id and --limit parses without validation error"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - page list with flags got unexpected exit 4"
  echo "  # exit code: $EXIT_CODE"
  FAIL=$((FAIL + 1))
fi

# Test 4: boolean flags parsed (exit != 4)
run_cli confluence page list --pretty --verbose --all
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" != "4" ]; then
  echo "ok $TOTAL - boolean flags --pretty --verbose --all parsed without validation error"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - boolean flags got unexpected exit 4"
  echo "  # exit code: $EXIT_CODE"
  FAIL=$((FAIL + 1))
fi

# Test 5: short flag -h triggers help (exit 0)
assert_exit "short flag -h shows help and exits 0" 0 confluence page list -h

# Test 6: unrecognized flag exits 1
assert_exit "unrecognized flag --unknown-flag exits 1" 1 confluence page list --unknown-flag

# Test 7: dangling flag missing value exits 4
assert_exit "dangling flag --space-id with no value exits 4" 4 confluence page list --space-id

# Test 8: no args shows help (exit 0)
assert_exit "no args shows help and exits 0" 0 confluence

# Test 9: resource with no action shows help (exit 0)
assert_exit "resource with no action shows help and exits 0" 0 confluence page

# Test 10: unknown resource exits 1
assert_exit "unknown resource exits 1" 1 confluence nonexistent

summary
