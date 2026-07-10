#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
REPOSITORY="${WORKFLOW_BOOTSTRAP_REPOSITORY:-mythral0/workflow-bootstrap}"
RELEASE="${WORKFLOW_BOOTSTRAP_VERSION:-latest}"
DESTINATION="${PREFIX}/bin/workflow-bootstrap"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "workflow-bootstrap supports Debian and 64-bit Raspbian Linux." >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64 | amd64)
    ARCH="x64"
    ;;
  aarch64 | arm64)
    ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m). Expected x86_64 or aarch64." >&2
    exit 1
    ;;
esac

ASSET="workflow-bootstrap-linux-${ARCH}"
if [[ "$RELEASE" == "latest" ]]; then
  BASE_URL="https://github.com/${REPOSITORY}/releases/latest/download"
else
  BASE_URL="https://github.com/${REPOSITORY}/releases/download/${RELEASE}"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    echo "curl or wget is required to download the release." >&2
    exit 1
  fi
}

download "${BASE_URL}/${ASSET}" "${TMP_DIR}/${ASSET}"
download "${BASE_URL}/${ASSET}.sha256" "${TMP_DIR}/${ASSET}.sha256"
(
  cd "$TMP_DIR"
  sha256sum --check "${ASSET}.sha256"
)

install -d "${PREFIX}/bin"
rm -f "$DESTINATION" "${PREFIX}/bin/workflow-bootstrap.cjs"
install -m 0755 "${TMP_DIR}/${ASSET}" "$DESTINATION"

echo "Installed ${ASSET} to $DESTINATION"
"$DESTINATION" --version
