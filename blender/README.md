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

Done: part roles, material presets, fluid presets, physics/math cards with Geometry Nodes groups, Points / Ray-march / Gaussian-splat render paths
(Cycles verified), LOTCBP SDF with on-demand refinement bricks, cavity/joint/plug detection, container drain, continuous flow, emitters,
X-ray + thermal/stress tint, cache (.npz), bake (new versions), record, pack into .blend, PLY/Alembic export.
Not done / unverified: EEVEE render check, interactive UI testing, per-voxel volume temperature. See docs/ROADMAP.md.
Publishing: never commit a token; use env var BLENDER_EXT_TOKEN with the Blender Extensions web upload.

## Projection Remesh (Tessera Projection / LOTBCBP quad remesh)
Sidebar > Arc Flow > "Projection Remesh". The remesh is a projection of the object against itself: the object's own nearest-surface projection (BVH, the same idea as the LOTBCBP collision body) is the reference for the density field, for projecting every new vertex, and for measuring the result.
Operators: **Analyse Topology** (counts tris / odd n-gons, selects them, writes `af_odd_face`, `af_tri_face`, `af_small_face`, `af_crease` + vertex group `AF_Crease`), **Projection Remesh** (new object `<name>_quad`, or "Replace Original"), **Quick Topology Fix** (weld, degenerate/loose removal, normals), **Recalculate Normals (Outside)** (standalone, vectorised, per connected component).

What is automatic (default "Automatic"): the mirror plane (see Symmetry below), crease angle (85th percentile of dihedrals, 15..40 deg), small/large threshold (Otsu on log face size, per crease-bounded region), refinement passes toward the deviation tolerance, bad-quad smoothing, normals before/after. Manual overrides stay available.
Method: clean-up -> (optional) bisect + keep one half -> join triangles to quads (angle/shape limited) -> leftover n-gons split n -> n quads (Subdivision Surface SIMPLE, keeps UV/material/vgroups) -> density-weighted relaxation + projection onto the source -> refinement passes where face-centre deviation > tolerance -> mirror the half (exact symmetry). Quadriflow is used (Method Auto) when the Resolution/target cannot be met by the join/split steps; its symmetry is only approximate.
Density field: crease edges (dihedral), boundaries, small features, and the **Arc Edge scale**: per vertex the arc length of a 1/8 circle (45 degree turn) of the local principal curvature (shape operator fitted by least squares, exact for spheres/cylinders), graded so neighbours differ by at most ~2x, and compared to 4 typical faces. Oversize triangles (>4% of bbox diagonal, as in the Arc Flow SDF bake) are virtually subdivided for density sampling only; face size on a sparse mesh is not treated as feature size. The source is never modified; BVH nearest-point is exact on any triangle size.
Arc Edge math (`core/arcedge.py`): circumference=(sqrt(3d))^2, area, volume, sphere surface=volume*0.25, branch arc=circumference*0.125, y=((x*2)+1)/x; d=1 gives 3, 9, 729, 182.25 (tested). The documented circumference (3d) is ~4.5% below the geometric pi*d: it is used only as the scale ladder that drives density. All geometry (deviation, symmetry error, edge lengths, projection) is exact Euclidean; it does not replace pi.
Resolution: 0.01..12 multiplier of the input quad-equivalent count (sum of (n-2)/2 per face; a triangulated input of T tris counts T/2). 1.0 = natural count of join/split (can be up to 4x when leftover n-gons force a split); other values steer to ~target (tested within 35%: 0.25, 0.5, 2.0 via Quadriflow). Predicted face count is shown in the panel.
Source: Evaluated (modifiers of any stack position baked in; original and its stack untouched; result has no modifiers) or Base mesh. Tested with Mirror/Subsurf/Solidify/Bevel stacks in different orders, plus shape keys, vertex groups and materials (shape keys: the current evaluated coordinates are used; they are not transferred).
Normals Outside: vectorised flood fill across manifold edges + per-component signed volume (closed) or centroid heuristic (open shells, reported); non-orientable edges are reported and left. Keep Custom Normals skips meshes with custom split normals.
Report: face counts, quad ratio, max deviation from the projection (both directions, fraction of bbox diagonal), symmetry error, poles (valence 3 / 5+), bad quads.
Symmetry (no origin / orientation assumption): the plane is found in the mesh's own coordinates, wherever the object sits and however it is rotated or scaled (uniformly). Surface samples (vertices + face centroids, deterministic stride) give an area-weighted centroid and PCA axes; candidate plane normals are the three principal axes (plus a ring of directions when two eigenvalues are nearly equal); each candidate is scored by reflecting the samples and measuring the distance to the surface projection (BVH): score = mean/2 + 95th percentile/2 of the distance over the bounding diagonal. The best is refined by coordinate descent on two tilt angles and the offset along the normal, and snapped to a local axis through the origin when it is that. Confidence classes: symmetric (p95 < 0.3%, mean < 0.1% of the diagonal), near-symmetric (mean < 2% and 80% of samples within 2%), asymmetric. The report carries class, confidence, mean/p95, normal, point, asymmetric fraction and which half was kept (the half with more surface area). Symmetric / near-symmetric: the half is quadrangulated and reflected, so topology is exactly symmetric about the detected plane (the deviation from the source, which includes any asymmetric detail that was replaced, is in the quality report). Asymmetric: nothing is mirrored and it says so. Manual: "Symmetry" checkbox forces the local X/Y/Z axis (only the offset is searched, kept at 0 if already exact); Automatic off + checkbox off disables it. Tested: random rotation/scale/translation gives the same plane within 2 degrees and 1% of the diagonal and a face count within 10% (7.5% seen), flipped-diagonal triangulations become symmetric all-quad, an asymmetric blob is reported asymmetric and not mirrored. Limits: only the single best plane is used (no multi-plane handling for a bolt), non-uniform scale breaks the reflection model, genuinely asymmetric regions of a near-symmetric mesh are replaced by the mirrored half rather than left unmirrored (reported as deviation), and quad layout is not seeded/grown from the most symmetric small regions: join/split is Blender's deterministic pairing on the kept half. Already-quad inputs go through the same pipeline (topology is cleaned/made symmetric, not preserved verbatim); voxelised surfaces are untested.
Honest limits / approximate: not an edge-flow-aware remesher; principal curvature directions are estimated but quad edges are NOT aligned to them; poles are only reduced indirectly (no pole elimination); crease density moves vertices, it does not add loops; symmetry keeps one half of a non-symmetric source; leftover n-gons cost a x4 split.
UV / paint data (accurate bmesh path): "UV Handling" = Keep+transfer (default) / Transfer + new `UVMap_Tessera` (Blender smart-project, angle-based; no conformal/seam unwrap) / New only / Skip. Every new face is assigned to the source face nearest its centre and all its loops are projected onto that face (barycentric), so nothing is interpolated across a seam; UDIM tiles stay (tested: u in 0..1.75, no tile-straddling faces). UV map names/order and the active/render UV map and active/render colour attribute carry over by name. Also transferred by projection: FLOAT_COLOR/BYTE_COLOR (point + corner), float/int/vector layers on point/corner/face (interpolated for float/vector/colour/UV, nearest for int), vertex-group weights, material index, smooth flag, seam/sharp edge flags (nearest source edge). A UV report (maps found/transferred, max UV deviation at face centres) is in the result. Low-res UV layouts carry onto much denser topology (tested at Resolution 4, 8 and 0.25), so a high-resolution texture can be applied through the old UVs. Not handled / unverified: crease weights, sculpt face sets/mask and edge-domain float attributes are not transferred explicitly (point/face layers named like them go through the generic path only if bmesh exposes them); shape keys are not transferred (current evaluated shape is used, no warning UI yet); third-party paint add-ons that keep data outside the mesh (image layers, external files) keep working through the UVs, but not every add-on can be tested. UV transfer uses per-face/per-loop Python BVH queries, so it is meant for the accurate path (tens/hundreds of thousands of faces), not millions.
NOT DONE in this increment: the multi-million-face NumPy fast path and the 1M/multi-million benchmarks (so no speed claim is made: the accurate path runs ~0.1 s on 1k faces, ~5-7 s on 16k-tri Suzanne with symmetry and crease relaxation, ~9 s Quadriflow at 2x on 2k faces; heavier meshes are untested), progress/cancel UI, vectorised-only analysis is in place (no per-face loops in `analyse_packed`, except virtual subdivision setup for oversize faces) but untested beyond ~16k faces, Geometry Nodes exposure (skipped: not cheap).
Tests: `python3 tests/test_retopo.py`, `blender -b --factory-startup --python tests/test_retopo_bpy.py` (5.2.3 and 5.3.0). Renders: `docs/renders/retopo_*.png` (`docs/render_retopo.py`).
