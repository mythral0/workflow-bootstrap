#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
DESTINATION="${PREFIX}/bin/workflow-bootstrap"

rm -f "$DESTINATION" "${PREFIX}/bin/workflow-bootstrap.cjs"
echo "Removed $DESTINATION"
