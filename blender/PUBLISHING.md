# Publishing Arc Flow to extensions.blender.org

Never commit, paste or log an API token. The scripts read it from the environment variable `BLENDER_EXT_TOKEN` only.

## 1. Build and verify

```
blender/build.sh                     # validate + build blender/dist/arc_flow-<version>.zip (needs Blender 5.2.3+)
blender --command extension validate blender/arc_flow
python3 blender/tests/test_solver.py                                  # pure NumPy solver tests
blender --factory-startup -b --python blender/tests/test_blender.py   # headless Blender test (add-on from source)
```

To test the zip itself in a clean config (what a reviewer does):

```
export BLENDER_USER_CONFIG=$(mktemp -d) BLENDER_USER_SCRIPTS=$(mktemp -d) BLENDER_USER_EXTENSIONS=$(mktemp -d)
blender -b --command extension install-file -r user_default --enable blender/dist/arc_flow-0.2.0.zip
blender -b --python blender/tests/test_blender.py -- --installed
```

Manifest checklist (`blender/arc_flow/blender_manifest.toml`): `id` stays `arc_flow` forever; bump `version` for every upload
(the platform rejects a version number it already has); `tagline` at most 64 characters, no trailing period; `license`
is an SPDX id (`GPL-3.0-or-later`); `tags` must come from the platform list (validated by `extension validate`);
`blender_version_min` is the oldest Blender actually tested (5.2.3); `[permissions]` lists only `files` (cache read/write).

## 2. First submission (new extension): web UI

A brand-new extension is submitted by hand: log in at https://extensions.blender.org, use the upload / submit page for a
new extension, choose the zip from `blender/dist/`, fill in the listing (description, screenshots, tags) and submit. The
platform checks the manifest, then a moderator reviews it before it becomes public (status moves from awaiting review to
approved; reviewers may ask for changes in the thread on the extension page). Reviewers look at: GPL-compatible license, no
obfuscated code, permissions that match what the code really does, no network access without a `network` permission, sensible
listing text and images. Answer review comments on the extension page and upload a new version when changes are needed.

The Blender developer docs for the moderation flow and add-on guidelines live under
https://developer.blender.org/docs/features/extensions/moderation/ and
https://developer.blender.org/docs/handbook/extensions/addon_guidelines/ (these two pages could not be fetched when this file
was written; check them before the first submission).

## 3. New versions of an existing extension: API upload

Verified against https://developer.blender.org/docs/features/extensions/ci_cd/ : a token can upload a **new version of an
extension that already exists on the platform**.

- Create a token at https://extensions.blender.org/settings/tokens/ (your profile), export it as `BLENDER_EXT_TOKEN`.
- Request: `POST https://extensions.blender.org/api/v1/extensions/<extension id>/versions/upload/`
  with header `Authorization: bearer <token>` and multipart fields `version_file` (the zip) and `release_notes` (Markdown).
- The docs show a sample token in their curl example; that is a placeholder, ignore it.
- Note: the docs name the variable `BLENDER_EXTENSION_TOKEN` in one place and `BLENDER_EXTENSIONS_TOKEN` in the command; this
  repo uses `BLENDER_EXT_TOKEN`.

```
export BLENDER_EXT_TOKEN=...        # in your shell / CI secret store, never in a file in the repo
blender/build.sh
blender/publish.sh -n               # dry run: shows extension id, version, zip and endpoint, sends nothing
blender/publish.sh -f notes.md      # uploads dist/arc_flow-<version>.zip with the notes
```

`publish.sh` passes the token to curl on stdin (not on the command line) and refuses to run without it. An uploaded
version goes through the platform's review like a first submission before it is offered to users.

Not verified: whether the same endpoint can create a brand-new extension (the docs only describe updating an existing one),
and the platform's response format on success (the script prints whatever the server returns).

## 4. Release checklist

1. Bump `version` in `blender_manifest.toml`; update README and `docs/ROADMAP.md`.
2. Run the three test commands above on the newest stable Blender and on the oldest supported one.
3. `blender/build.sh` (removes stale zips from `blender/dist`), commit the zip only if you want it in the repo.
4. Upload (web UI for the first version, `publish.sh` afterwards) and watch the review thread.
