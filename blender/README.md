# Arc Flow for Blender (LOTBCBP fluid simulation)

**LOTBCBP = Level Of Tessellation Boolean Collision Body Projection** (called LOTCBP before 0.2.0).
Collision bodies are resolved by a base signed-distance field plus virtual tessellation bricks that are generated on demand
where fluid touches a surface, and the connected cavities of an assembly can be projected into one real Boolean union.

Blender extension, v0.2.0. Tested on Blender 5.2.3 LTS and 5.3.0 (headless; Cycles CPU render smoke test of all three render paths); `blender_version_min` is 5.2.3.
Sidebar tab "Arc Flow" in the 3D viewport. Click "Add Demo Rig", then Build.

## Install
- Build: `blender/build.sh` (validates and writes `blender/dist/arc_flow-0.2.0.zip`).
- Install: Preferences > Get Extensions > (v) > Install from Disk, pick the zip. Or
  `blender --command extension install-file -r user_default --enable blender/dist/arc_flow-0.2.0.zip`.
- Publishing to extensions.blender.org: `blender/PUBLISHING.md`. Never commit a token; use the env var `BLENDER_EXT_TOKEN`.
- Files saved with 0.1.x keep working: the renamed properties (`lotcbp*` -> `lotbcbp*`) are migrated when the file loads. Operator ids (`arcflow.*`) did not change.

## Features
- Part roles (Container / Transport / Chamber / Collider / emitter), material presets, fluid presets, physics and math cards with Geometry Nodes groups.
- Points / Ray-march / Gaussian-splat render paths (Cycles verified), shaders editable in the Shader Editor.
- LOTBCBP SDF with on-demand refinement bricks, cavity / joint / plug detection, container drain, continuous or finite flow, emitters.
- **Boolean projection (new)**: parts whose cavities intersect form a continuous through-cavity. The *Solver* card has a
  "Collision: Boolean projection" box: *Build Fluid Cavity* creates one non-destructive `AF_Cavity_N` object per assembly (a
  Geometry Nodes Mesh Boolean union over live cavity sources, exact or manifold solver), shown as an overlay and, with
  *Boolean projection* on, added to the solver as an extra legal region that receives the LOTBCBP tessellation. *Cut joints* adds
  Boolean difference modifiers so each partner's cavity is cut out of the walls at the joints (the solver keeps reading the uncut
  walls). The status line reports joints found / plugged / spilling.
- **Environment card (new)**: atmosphere presets Earth, Mars, Venus, Titan, Jupiter (1 bar level) set pressure, temperature,
  gravity and a gas mix; a compound table (N2, O2, Ar, CO2, CH4, H2, He, H2O, NH3, SO2 with molar mass, gamma and Sutherland
  viscosity constants) lets you edit the mix. The mix gives density (P M / R T), viscosity, gamma and sound speed, used for
  ambient pressure against spills and vents, gas drag (quadratic + Stokes) on free droplets, exhaust plume spread and isentropic
  expansion of gas, and gravity. Optional "environment asset look": world colour and fog density from the atmosphere, and an
  `AF_Ground` plane with a surface material (render only, off by default, never rewrites a world you built yourself).
- X-ray + thermal / stress tint, cache (.npz), bake (new versions), record, pack into .blend, PLY / Alembic export.

## Not in this release
Phase changes and chemical reactions (boiling, condensation, combustion chemistry beyond the flame-temperature model), buoyancy
vehicles, multi-stage thrust, per-voxel temperature in the ray-march volume, particle-particle interaction (the solver is a
pressure-driven tracer model), EEVEE render check, interactive UI testing, assemblies that move continuously are re-evaluated
every frame they move (slow for large cavities). See `docs/ROADMAP.md`.

## Tests
- `python3 blender/tests/test_solver.py` (pure NumPy: solver, atmosphere presets, cavity union / joint classification, surface nets).
- `blender --factory-startup -b --python blender/tests/test_blender.py` (headless Blender; add `-- --installed` for an installed extension).
- `blender --factory-startup -b --python blender/tests/test_render.py` (Cycles CPU render of Points / Ray-march / Splat).
