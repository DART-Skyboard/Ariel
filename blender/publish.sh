#!/usr/bin/env bash
# Upload a built Arc Flow zip as a NEW VERSION of the already-approved extension "arc_flow" on extensions.blender.org.
#
#   BLENDER_EXT_TOKEN=...  blender/publish.sh [-n] [-f release_notes.md] [path/to/arc_flow-X.Y.Z.zip]
#
# The token comes only from the environment variable BLENDER_EXT_TOKEN (create one at
# https://extensions.blender.org/settings/tokens/).  It is never written to a file, never echoed, and is passed to curl on
# stdin so it does not show up in the process list.  -n = dry run (prints what would be sent, sends nothing).
# The first submission of the extension itself is done by hand in the web UI, see blender/PUBLISHING.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DRY=0; NOTES_FILE=""
while getopts "nf:" o; do
  case "$o" in n) DRY=1 ;; f) NOTES_FILE="$OPTARG" ;; *) exit 2 ;; esac
done
shift $((OPTIND - 1))
ID="$(sed -n 's/^id *= *"\(.*\)"/\1/p' "$HERE/arc_flow/blender_manifest.toml" | head -1)"
VER="$(sed -n 's/^version *= *"\(.*\)"/\1/p' "$HERE/arc_flow/blender_manifest.toml" | head -1)"
ZIP="${1:-$HERE/dist/${ID}-${VER}.zip}"
URL="https://extensions.blender.org/api/v1/extensions/${ID}/versions/upload/"
[ -f "$ZIP" ] || { echo "zip not found: $ZIP (run blender/build.sh first)" >&2; exit 1; }
if [ -n "$NOTES_FILE" ]; then NOTES="$(cat "$NOTES_FILE")"; else NOTES="Arc Flow ${VER}"; fi
echo "extension : $ID"
echo "version   : $VER"
echo "zip       : $ZIP"
echo "endpoint  : POST $URL"
if [ "$DRY" = 1 ]; then echo "(dry run: nothing sent)"; exit 0; fi
: "${BLENDER_EXT_TOKEN:?set BLENDER_EXT_TOKEN in the environment (never in a file or the command line)}"
printf 'header = "Authorization: bearer %s"\n' "$BLENDER_EXT_TOKEN" | \
  curl --fail-with-body -sS -K - -X POST "$URL" -F "version_file=@${ZIP}" -F "release_notes=${NOTES}"
echo
echo "Uploaded. The new version now waits in the platform's review queue (see blender/PUBLISHING.md)."
