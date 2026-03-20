#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-}"
IMAGE_NAME="${IMAGE_NAME:-localhost/wasmedge-demo:latest}"
HOST_PORT="${HOST_PORT:-18099}"
CONTAINER_NAME="wasmedge-demo-fetch-test-${HOST_PORT}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wasmedge-demo-fetch.XXXXXX")"

cleanup() {
  if [[ -n "${CONTAINER_RUNTIME}" ]]; then
    "${CONTAINER_RUNTIME}" kill "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    "${CONTAINER_RUNTIME}" rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

resolve_runtime() {
  if [[ -n "${CONTAINER_RUNTIME}" ]]; then
    echo "${CONTAINER_RUNTIME}"
  elif command -v podman >/dev/null 2>&1; then
    command -v podman
  elif [[ -x /opt/podman/bin/podman ]]; then
    echo /opt/podman/bin/podman
  elif command -v docker >/dev/null 2>&1; then
    command -v docker
  else
    echo "No supported container runtime found." >&2
    exit 1
  fi
}

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 30); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${url}" >&2
  return 1
}

CONTAINER_RUNTIME="$(resolve_runtime)"

"${CONTAINER_RUNTIME}" run -d --rm \
  --name "${CONTAINER_NAME}" \
  -p "${HOST_PORT}:8080" \
  -v "${DATA_DIR}:/data" \
  "${IMAGE_NAME}" >/dev/null

wait_for_http "http://127.0.0.1:${HOST_PORT}/"

HTTP_BODY="$(curl -fsS -X POST "http://127.0.0.1:${HOST_PORT}/api/fetch" \
  -H 'content-type: application/json' \
  -d '{"url":"http://httpbin.org/get","method":"GET"}')"
HTTPS_BODY="$(curl -fsS -X POST "http://127.0.0.1:${HOST_PORT}/api/fetch" \
  -H 'content-type: application/json' \
  -d '{"url":"https://httpbin.org/get","method":"GET"}')"

printf '%s' "${HTTP_BODY}" | grep -q '"status":200'
printf '%s' "${HTTPS_BODY}" | grep -q '"status":200'

echo "Container fetch smoke test passed."
