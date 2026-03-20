#!/bin/bash
source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: Base64 Encoder"

# Run internal base64 tests via MODE=test
set +e
"$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data \
  --env MODE=test \
  "$WASM" -- "$SERVER_JS" test-base64 2>/tmp/test_b64_err_$$
B64_EXIT=$?
set -e

# The JS code outputs TAP directly — just relay it
# But also count results for our summary
cat /tmp/test_b64_err_$$ >&2 2>/dev/null

# If MODE=test is not yet implemented, all tests fail
if [ $B64_EXIT -eq 0 ]; then
  echo "ok 1 - base64 internal tests passed"
  TOTAL=1; PASS=1
else
  echo "not ok 1 - base64 internal tests failed (exit $B64_EXIT)"
  TOTAL=1; FAIL=1
fi

rm -f /tmp/test_b64_err_$$
summary
