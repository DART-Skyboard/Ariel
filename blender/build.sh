#!/usr/bin/env bash
# Validate and build the Arc Flow Blender extension zip into blender/dist.
# Usage: blender/build.sh [path/to/blender]      (Blender 5.2.3 or newer)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${1:-${BLENDER:-blender}}"
mkdir -p "$HERE/dist"
# only the zip of the current manifest version stays in dist/
rm -f "$HERE"/dist/tessera_projection-*.zip
find "$HERE/arc_flow" -name __pycache__ -type d -prune -exec rm -rf {} +
"$BLENDER" --command extension validate "$HERE/arc_flow"
"$BLENDER" --command extension build --source-dir "$HERE/arc_flow" --output-dir "$HERE/dist"
ls -la "$HERE/dist"
echo
echo "Install: Blender > Edit > Preferences > Get Extensions > (v) > Install from Disk... and pick the zip,"
echo "         or:  $BLENDER --command extension install-file -r user_default --enable $HERE/dist/tessera_projection-*.zip"
echo "Publish: see blender/PUBLISHING.md (blender/publish.sh uploads with \$BLENDER_EXT_TOKEN; never put the token in a file)."
