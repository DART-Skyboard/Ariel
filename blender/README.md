# Arc Flow for Blender (LOTCBP fluid simulation)

Blender 4.2+ extension (tested on 5.2.3). Build: `blender/build.sh`; install the zip from Preferences > Get Extensions > Install from Disk.
Sidebar tab "Arc Flow" in the 3D viewport. Click "Add Demo Rig", then Build.

Done: part roles, material presets, fluid presets, physics/math cards with Geometry Nodes groups, Points / Ray-march / Gaussian-splat render paths
(Cycles verified), LOTCBP SDF with on-demand refinement bricks, cavity/joint/plug detection, container drain, continuous flow, emitters,
X-ray + thermal/stress tint, cache (.npz), bake (new versions), record, pack into .blend, PLY/Alembic export.
Not done / unverified: EEVEE render check, interactive UI testing, per-voxel volume temperature. See docs/ROADMAP.md.
Publishing: never commit a token; use env var BLENDER_EXT_TOKEN with the Blender Extensions web upload.
