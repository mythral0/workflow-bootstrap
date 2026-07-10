#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
REPOSITORY="${WORKFLOW_BOOTSTRAP_REPOSITORY:-mythral0/workflow-bootstrap}"
RELEASE="${WORKFLOW_BOOTSTRAP_VERSION:-latest}"
FORCE="${WORKFLOW_BOOTSTRAP_FORCE:-0}"
DESTINATION="${PREFIX}/bin/workflow-bootstrap"
PORTABLE_DESTINATION="${PREFIX}/bin/workflow-bootstrap.cjs"

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

for command in install ln mktemp mv sha256sum sort tail tr; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is missing: $command" >&2
    exit 1
  fi
done

if [[ -n "${WORKFLOW_BOOTSTRAP_BASE_URL:-}" ]]; then
  BASE_URL="$WORKFLOW_BOOTSTRAP_BASE_URL"
elif [[ "$RELEASE" == "latest" ]]; then
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

download "${BASE_URL}/workflow-bootstrap.version" "${TMP_DIR}/workflow-bootstrap.version"
TARGET_VERSION="$(tr -d '[:space:]' < "${TMP_DIR}/workflow-bootstrap.version")"
if [[ ! "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Release contains an invalid version: $TARGET_VERSION" >&2
  exit 1
fi

CURRENT_VERSION=""
if [[ -x "$DESTINATION" ]]; then
  CURRENT_VERSION="$($DESTINATION --version 2>/dev/null || true)"
fi

if [[ "$FORCE" != "1" && "$CURRENT_VERSION" == "$TARGET_VERSION" ]]; then
  echo "workflow-bootstrap $TARGET_VERSION is already installed at $DESTINATION"
  exit 0
fi

if [[ "$FORCE" != "1" && "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  NEWEST="$(printf '%s\n%s\n' "$CURRENT_VERSION" "$TARGET_VERSION" | sort -V | tail -n 1)"
  if [[ "$NEWEST" == "$CURRENT_VERSION" ]]; then
    echo "workflow-bootstrap $CURRENT_VERSION is newer than requested $TARGET_VERSION; leaving it unchanged."
    exit 0
  fi
fi

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
fi

if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 20 )); then
  ASSET="workflow-bootstrap.cjs"
  MODE="portable JavaScript (using $(node --version))"
else
  ASSET="workflow-bootstrap-linux-${ARCH}"
  MODE="native ${ARCH} (Node.js 20+ not available)"
fi

download "${BASE_URL}/${ASSET}" "${TMP_DIR}/${ASSET}"
download "${BASE_URL}/${ASSET}.sha256" "${TMP_DIR}/${ASSET}.sha256"
(
  cd "$TMP_DIR"
  sha256sum --check "${ASSET}.sha256"
)

if [[ "$ASSET" == "workflow-bootstrap.cjs" ]]; then
  ASSET_VERSION="$(node "${TMP_DIR}/${ASSET}" --version 2>/dev/null || true)"
else
  chmod 0755 "${TMP_DIR}/${ASSET}"
  ASSET_VERSION="$("${TMP_DIR}/${ASSET}" --version 2>/dev/null || true)"
fi
if [[ "$ASSET_VERSION" != "$TARGET_VERSION" ]]; then
  echo "Downloaded asset reports version '$ASSET_VERSION'; expected '$TARGET_VERSION'." >&2
  exit 1
fi

install -d "${PREFIX}/bin"
if [[ "$ASSET" == "workflow-bootstrap.cjs" ]]; then
  install -m 0755 "${TMP_DIR}/${ASSET}" "${PORTABLE_DESTINATION}.new"
  mv -f "${PORTABLE_DESTINATION}.new" "$PORTABLE_DESTINATION"
  rm -f "$DESTINATION"
  ln -s "workflow-bootstrap.cjs" "$DESTINATION"
else
  install -m 0755 "${TMP_DIR}/${ASSET}" "${DESTINATION}.new"
  mv -f "${DESTINATION}.new" "$DESTINATION"
  rm -f "$PORTABLE_DESTINATION"
fi

echo "Installed workflow-bootstrap $TARGET_VERSION as $MODE at $DESTINATION"
"$DESTINATION" --version
