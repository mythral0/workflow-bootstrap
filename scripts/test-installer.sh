#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/tmp/installer-test"
RELEASE="${WORK}/release"
OLD_RELEASE="${WORK}/old-release"
PREFIX="${WORK}/prefix"
VERSION="$(node -p "require('${ROOT}/package.json').version")"

rm -rf "$WORK"
mkdir -p "$RELEASE" "$OLD_RELEASE" "$PREFIX"
cp "${ROOT}/bin/workflow-bootstrap.cjs" "${RELEASE}/workflow-bootstrap.cjs"
printf '%s\n' "$VERSION" > "${RELEASE}/workflow-bootstrap.version"
printf '0.0.1\n' > "${OLD_RELEASE}/workflow-bootstrap.version"
(
  cd "$RELEASE"
  sha256sum workflow-bootstrap.cjs > workflow-bootstrap.cjs.sha256
)

BASE_URL="file://${RELEASE}"
PREFIX="$PREFIX" WORKFLOW_BOOTSTRAP_BASE_URL="$BASE_URL" "${ROOT}/scripts/install.sh"
[[ "$("${PREFIX}/bin/workflow-bootstrap" --version)" == "$VERSION" ]]

# A current installation must not attempt to download an executable again.
rm "${RELEASE}/workflow-bootstrap.cjs" "${RELEASE}/workflow-bootstrap.cjs.sha256"
PREFIX="$PREFIX" WORKFLOW_BOOTSTRAP_BASE_URL="$BASE_URL" "${ROOT}/scripts/install.sh"

# An older requested release must not replace a newer system-wide installation.
PREFIX="$PREFIX" WORKFLOW_BOOTSTRAP_BASE_URL="file://${OLD_RELEASE}" "${ROOT}/scripts/install.sh"
[[ "$("${PREFIX}/bin/workflow-bootstrap" --version)" == "$VERSION" ]]
