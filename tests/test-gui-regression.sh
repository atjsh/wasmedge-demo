#!/bin/bash
# GUI regression tests — verify existing GUI endpoints still work after changes.
source "$(dirname "$0")/helpers.sh"
setup_test_data

echo "# Test Suite: GUI Regression"
echo "1..5"

BODY_FILE="/tmp/test_body_$$"

# Start GUI server in background
"$WASMEDGE" --dir .:. --dir "${REPO_DIR}:${REPO_DIR}" --dir /data:/data "$WASM" -- "$SERVER_JS" &
GUI_PID=$!
sleep 2

cleanup() {
  kill "$GUI_PID" 2>/dev/null; wait "$GUI_PID" 2>/dev/null
  rm -f "$BODY_FILE"
}
trap 'cleanup; cleanup_test_data' EXIT

# --- Test 1: GET / returns 200 and body contains "WasmEdge" ---
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' http://localhost:8080/)
if [ "$HTTP_CODE" = "200" ] && grep -qF "WasmEdge" "$BODY_FILE"; then
  echo "ok $TOTAL - GET / returns 200 with WasmEdge in body"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - GET / returns 200 with WasmEdge in body"
  echo "  # http_code=$HTTP_CODE"
  echo "  # body: $(head -c 200 "$BODY_FILE")"
  FAIL=$((FAIL + 1))
fi

# --- Test 2: GET /api/runtime returns 200, valid JSON with .os field ---
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' http://localhost:8080/api/runtime)
if [ "$HTTP_CODE" = "200" ] && jq -e '.os' "$BODY_FILE" >/dev/null 2>&1; then
  echo "ok $TOTAL - GET /api/runtime returns 200 with .os field"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - GET /api/runtime returns 200 with .os field"
  echo "  # http_code=$HTTP_CODE"
  echo "  # body: $(head -c 200 "$BODY_FILE")"
  FAIL=$((FAIL + 1))
fi

# --- Test 3: GET /api/files responds (200 or 503) ---
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' http://localhost:8080/api/files)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
  echo "ok $TOTAL - GET /api/files responds with $HTTP_CODE"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - GET /api/files responds with 200 or 503"
  echo "  # http_code=$HTTP_CODE"
  echo "  # body: $(head -c 200 "$BODY_FILE")"
  FAIL=$((FAIL + 1))
fi

# --- Test 4: GET /api/server-info returns 200, valid JSON with .uptime_ms ---
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' http://localhost:8080/api/server-info)
if [ "$HTTP_CODE" = "200" ] && jq -e '.uptime_ms' "$BODY_FILE" >/dev/null 2>&1; then
  echo "ok $TOTAL - GET /api/server-info returns 200 with .uptime_ms field"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - GET /api/server-info returns 200 with .uptime_ms field"
  echo "  # http_code=$HTTP_CODE"
  echo "  # body: $(head -c 200 "$BODY_FILE")"
  FAIL=$((FAIL + 1))
fi

# --- Test 5: POST /api/echo with "hello" returns 200 and body contains "hello" ---
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X POST -d 'hello' http://localhost:8080/api/echo)
if [ "$HTTP_CODE" = "200" ] && grep -qF "hello" "$BODY_FILE"; then
  echo "ok $TOTAL - POST /api/echo returns 200 with hello in body"
  PASS=$((PASS + 1))
else
  echo "not ok $TOTAL - POST /api/echo returns 200 with hello in body"
  echo "  # http_code=$HTTP_CODE"
  echo "  # body: $(head -c 200 "$BODY_FILE")"
  FAIL=$((FAIL + 1))
fi

summary
