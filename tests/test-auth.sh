#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: Authentication"
echo "1..12"

# ── Test 1: Env vars set → auth status returns authenticated=true, source=env, exit 0
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE_TOKEN"
run_cli confluence auth status
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN
TOTAL=$((TOTAL + 1))
auth_val=$(echo "$STDOUT" | jq -r '.authenticated' 2>/dev/null || echo "")
source_val=$(echo "$STDOUT" | jq -r '.source' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "0" ] && [ "$auth_val" = "true" ] && [ "$source_val" = "env" ]; then
  echo "ok $TOTAL - auth status with env vars returns authenticated=true, source=env, exit 0"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth status with env vars returns authenticated=true, source=env, exit 0"
  echo "  # exit=$EXIT_CODE authenticated=$auth_val source=$source_val"
  FAIL=$((FAIL + 1))
fi

# ── Test 2: Env vars set → auth status .site matches CONFLUENCE_SITE
export CONFLUENCE_SITE="test.atlassian.net"
export CONFLUENCE_EMAIL="test@test.com"
export CONFLUENCE_TOKEN="FAKE_TOKEN"
assert_stdout_json "auth status .site matches CONFLUENCE_SITE" ".site" "test.atlassian.net" confluence auth status
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN

# ── Test 3: No env, no stored → auth status returns error, exit 2
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN 2>/dev/null || true
assert_exit "auth status with no credentials returns exit 2" 2 confluence auth status

# ── Test 4: auth login creates /data/auth.json, exit 0
run_cli confluence auth login --site test.atlassian.net --email test@test.com --token FAKE
TOTAL=$((TOTAL + 1))
if [ "$EXIT_CODE" = "0" ] && [ -f "$DATA_DIR/auth.json" ]; then
  echo "ok $TOTAL - auth login creates auth.json, exit 0"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth login creates auth.json, exit 0"
  echo "  # exit=$EXIT_CODE file_exists=$([ -f "$DATA_DIR/auth.json" ] && echo yes || echo no)"
  FAIL=$((FAIL + 1))
fi

# ── Test 5: After login, auth status with no env vars returns source=stored, exit 0
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN 2>/dev/null || true
assert_stdout_json "auth status with stored creds returns source=stored" ".source" "stored" confluence auth status

# ── Test 6: auth logout removes auth.json, exit 0, stdout has ok:true
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN 2>/dev/null || true
run_cli confluence auth logout
TOTAL=$((TOTAL + 1))
ok_val=$(echo "$STDOUT" | jq -r '.ok' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "0" ] && [ ! -f "$DATA_DIR/auth.json" ] && [ "$ok_val" = "true" ]; then
  echo "ok $TOTAL - auth logout removes auth.json, exit 0, ok=true"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth logout removes auth.json, exit 0, ok=true"
  echo "  # exit=$EXIT_CODE file_exists=$([ -f "$DATA_DIR/auth.json" ] && echo yes || echo no) ok=$ok_val"
  FAIL=$((FAIL + 1))
fi

# ── Test 7: After logout, auth status with no env vars returns error, exit 2
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN 2>/dev/null || true
assert_exit "auth status after logout returns exit 2" 2 confluence auth status

# ── Test 8: auth logout when no stored → still exit 0 (idempotent)
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN 2>/dev/null || true
rm -f "$DATA_DIR/auth.json"
assert_exit "auth logout with no stored creds is idempotent, exit 0" 0 confluence auth logout

# ── Test 9: auth login missing --site → error JSON on stderr, exit 4, .code=4
run_cli confluence auth login --email test@test.com --token FAKE
TOTAL=$((TOTAL + 1))
code_val=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "4" ] && [ "$code_val" = "4" ]; then
  echo "ok $TOTAL - auth login missing --site returns exit 4, stderr .code=4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth login missing --site returns exit 4, stderr .code=4"
  echo "  # exit=$EXIT_CODE code=$code_val"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ── Test 10: auth login missing --email → error JSON on stderr, exit 4
run_cli confluence auth login --site test.atlassian.net --token FAKE
TOTAL=$((TOTAL + 1))
code_val=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "4" ] && [ "$code_val" = "4" ]; then
  echo "ok $TOTAL - auth login missing --email returns exit 4, stderr .code=4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth login missing --email returns exit 4, stderr .code=4"
  echo "  # exit=$EXIT_CODE code=$code_val"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ── Test 11: auth login missing --token → error JSON on stderr, exit 4
run_cli confluence auth login --site test.atlassian.net --email test@test.com
TOTAL=$((TOTAL + 1))
code_val=$(echo "$STDERR" | jq -r '.code' 2>/dev/null || echo "")
if [ "$EXIT_CODE" = "4" ] && [ "$code_val" = "4" ]; then
  echo "ok $TOTAL - auth login missing --token returns exit 4, stderr .code=4"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - auth login missing --token returns exit 4, stderr .code=4"
  echo "  # exit=$EXIT_CODE code=$code_val"
  echo "  # stderr: $(echo "$STDERR" | head -3)"
  FAIL=$((FAIL + 1))
fi

# ── Test 12: Both env + stored → auth status shows source=env (env takes precedence)
run_cli confluence auth login --site stored.atlassian.net --email stored@test.com --token STORED_TOKEN
export CONFLUENCE_SITE="env.atlassian.net"
export CONFLUENCE_EMAIL="env@test.com"
export CONFLUENCE_TOKEN="ENV_TOKEN"
assert_stdout_json "env vars take precedence over stored creds, source=env" ".source" "env" confluence auth status
unset CONFLUENCE_SITE CONFLUENCE_EMAIL CONFLUENCE_TOKEN

summary
