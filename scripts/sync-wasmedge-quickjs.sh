#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="${ROOT_DIR}/wasmedge-quickjs.lock"
PATCH_FILE="${ROOT_DIR}/patches/wasmedge-quickjs-http.patch"

if [[ ! -f "${LOCK_FILE}" ]]; then
  echo "Missing lock file: ${LOCK_FILE}" >&2
  exit 1
fi

if [[ ! -f "${PATCH_FILE}" ]]; then
  echo "Missing patch file: ${PATCH_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${LOCK_FILE}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd tar
require_cmd patch
require_cmd zip

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Missing checksum tool: need sha256sum or shasum" >&2
    exit 1
  fi
}

verify_sha256() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(sha256_file "${path}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "SHA256 mismatch for ${path}" >&2
    echo "expected: ${expected}" >&2
    echo "actual:   ${actual}" >&2
    exit 1
  fi
}

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wasmedge-quickjs-sync.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

WORK_DIR="${TMP_DIR}/work"
OUT_DIR="${TMP_DIR}/out"
mkdir -p "${WORK_DIR}" "${OUT_DIR}"

echo "Downloading pinned WasmEdge QuickJS assets for ${WASMEDGE_QUICKJS_VERSION}..."
curl -fsSL "${WASMEDGE_QUICKJS_WASM_URL}" -o "${TMP_DIR}/wasmedge_quickjs.wasm"
curl -fsSL "${WASMEDGE_QUICKJS_SOURCE_URL}" -o "${TMP_DIR}/source.tar.gz"

verify_sha256 "${TMP_DIR}/wasmedge_quickjs.wasm" "${WASMEDGE_QUICKJS_WASM_SHA256}"
verify_sha256 "${TMP_DIR}/source.tar.gz" "${WASMEDGE_QUICKJS_SOURCE_SHA256}"

tar -xzf "${TMP_DIR}/source.tar.gz" -C "${TMP_DIR}"
cp -R "${TMP_DIR}/${WASMEDGE_QUICKJS_SOURCE_ROOT}/modules" "${WORK_DIR}/modules"

echo "Applying local WasmEdge QuickJS patch..."
patch -p0 -d "${WORK_DIR}" < "${PATCH_FILE}"

cp "${TMP_DIR}/wasmedge_quickjs.wasm" "${OUT_DIR}/wasmedge_quickjs.wasm"
cp -R "${WORK_DIR}/modules" "${OUT_DIR}/modules"
(
  cd "${OUT_DIR}"
  find modules -exec touch -t 202001010000 {} +
  find modules -type f | LC_ALL=C sort | zip -X -q modules.zip -@
)

rm -rf "${ROOT_DIR}/modules" "${ROOT_DIR}/modules.zip" "${ROOT_DIR}/wasmedge_quickjs.wasm"
cp -R "${OUT_DIR}/modules" "${ROOT_DIR}/modules"
cp "${OUT_DIR}/modules.zip" "${ROOT_DIR}/modules.zip"
cp "${OUT_DIR}/wasmedge_quickjs.wasm" "${ROOT_DIR}/wasmedge_quickjs.wasm"

echo "Generated runtime assets:"
echo "  ${ROOT_DIR}/modules/"
echo "  ${ROOT_DIR}/modules.zip"
echo "  ${ROOT_DIR}/wasmedge_quickjs.wasm"
