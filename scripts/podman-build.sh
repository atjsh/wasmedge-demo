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

exec "${PODMAN_BIN}" build --platform=wasi/wasm -t "${IMAGE_NAME}" "${ROOT_DIR}"
