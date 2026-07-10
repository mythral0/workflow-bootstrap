#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:?usage: scripts/build-native.sh <output-file>}"
OUTPUT="$(node -e "console.log(require('node:path').resolve(process.argv[1]))" "$OUTPUT")"
CONFIG="${ROOT}/tmp/native/sea-config.json"
MAIN="${ROOT}/bin/workflow-bootstrap.cjs"

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 26 )); then
  echo "Node.js 26 or newer is required to build native executables." >&2
  exit 1
fi

if [[ ! -f "$MAIN" ]]; then
  echo "Bundled application is missing; run the source build first." >&2
  exit 1
fi

mkdir -p "$(dirname "$CONFIG")" "$(dirname "$OUTPUT")"
node -e '
  const fs = require("node:fs");
  const [config, main, output] = process.argv.slice(1);
  fs.writeFileSync(config, JSON.stringify({
    main,
    mainFormat: "commonjs",
    output,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    execArgvExtension: "none"
  }, null, 2));
' "$CONFIG" "$MAIN" "$OUTPUT"

node --build-sea "$CONFIG"
chmod 0755 "$OUTPUT"
"$OUTPUT" --version
