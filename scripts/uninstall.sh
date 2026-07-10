#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
DESTINATION="${PREFIX}/bin/workflow-bootstrap.cjs"
COMMAND="${PREFIX}/bin/workflow-bootstrap"

rm -f "$COMMAND" "$DESTINATION"
echo "Removed $COMMAND"
