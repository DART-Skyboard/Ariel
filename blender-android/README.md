# Blender Tablet Updater

Small Android helper (about 20 KB). It lists the Blender tablet demo APKs on `https://mirror.blender.org/demo/tablet/`,
picks the newest, downloads it with the system download manager and opens the installer. It never re-hosts Blender:
the 2.3 GB file comes straight from Blender's own mirror (too large for a GitHub release, which caps files at 2 GiB).

- Download: https://radicaldeepscale.com/blender/BlenderTabletUpdater.apk (page: https://radicaldeepscale.com/blender/)
- Needs Android 8+, about 5 GB free, and "Install unknown apps" allowed for the updater.
- `templates/blender/latest.json` is refreshed daily by `.github/workflows/blender-mirror-check.yml`.
- Build: `build.sh` (aapt2, javac, d8, apksigner; no Gradle). The signing key is not in the repo.
