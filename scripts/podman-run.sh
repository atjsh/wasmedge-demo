#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_podman() {
  if command -v podman >/dev/null 2>&1; then
    command -v podman
  elif [[ -x /opt/podman/bin/podman ]]; then
    echo /opt/podman/bin/podman
  else
    echo "Podman binary not found. Install Podman or add it to PATH." >&2
    exit 1
  fi
}

PODMAN_BIN="$(resolve_podman)"
IMAGE_NAME="${IMAGE_NAME:-localhost/wasmedge-demo:latest}"
HOST_PORT="${HOST_PORT:-8080}"
DATA_DIR="${DATA_DIR:-${ROOT_DIR}/demo-data}"

mkdir -p "${DATA_DIR}"

exec "${PODMAN_BIN}" run --rm \
  -p "${HOST_PORT}:8080" \
  -v "${DATA_DIR}:/data" \
  "${IMAGE_NAME}"
