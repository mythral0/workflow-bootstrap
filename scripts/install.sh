#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-/usr/local}"
SOURCE="${ROOT}/bin/workflow-bootstrap.cjs"
DESTINATION="${PREFIX}/bin/workflow-bootstrap.cjs"
COMMAND="${PREFIX}/bin/workflow-bootstrap"

if [[ ! -f "$SOURCE" ]]; then
  echo "Standalone executable is missing: $SOURCE" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20 or newer is required; found $(node --version)." >&2
  exit 1
fi

install -d "${PREFIX}/bin"
rm -f "$DESTINATION" "$COMMAND"
install -m 0755 "$SOURCE" "$DESTINATION"
ln -s "workflow-bootstrap.cjs" "$COMMAND"

echo "Installed workflow-bootstrap to $COMMAND"
"$COMMAND" --version
