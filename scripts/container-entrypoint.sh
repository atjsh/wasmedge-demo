#!/usr/bin/env bash
set -euo pipefail

WASMEDGE_BIN="/root/.wasmedge/bin/wasmedge"
ARGS=(
  "--dir" "/app:/app"
  "--dir" "/modules:/app/modules"
  "--dir" "/data:/data"
)

forward_env() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    ARGS+=("--env" "${name}=${!name}")
  fi
}

forward_env MODE
forward_env CLI_DATA_DIR
forward_env CONFLUENCE_SITE
forward_env CONFLUENCE_EMAIL
forward_env CONFLUENCE_TOKEN
forward_env SSL_CERT_FILE
forward_env HTTP_PROXY
forward_env HTTPS_PROXY
forward_env NO_PROXY
forward_env http_proxy
forward_env https_proxy
forward_env no_proxy

ARGS+=("/app/wasmedge_quickjs.wasm" "--" "/app/server.js")
ARGS+=("$@")

exec "${WASMEDGE_BIN}" "${ARGS[@]}"
