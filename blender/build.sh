#!/usr/bin/env bash
# Build (and validate) the Arc Flow Blender extension zip.  Usage: blender/build.sh [path/to/blender]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${1:-${BLENDER:-blender}}"
mkdir -p "$HERE/dist"
find "$HERE/arc_flow" -name __pycache__ -type d -prune -exec rm -rf {} +
"$BLENDER" --command extension validate "$HERE/arc_flow"
"$BLENDER" --command extension build --source-dir "$HERE/arc_flow" --output-dir "$HERE/dist"
ls -la "$HERE/dist"
echo
echo "Install: Blender > Edit > Preferences > Get Extensions > (v) > Install from Disk... and pick the zip,"
echo "         or:  $BLENDER --command extension install-file -r user_default --enable $HERE/dist/arc_flow-*.zip"
echo "Publish (needs your own token in the environment, never commit it):"
echo "         $BLENDER --command extension server-generate / see blender/docs/PUBLISHING.md"
