<p align="center"><img src="branding/tessera_256.png" width="128" alt="Tessera Projection logo"></p>

# Tessera Projection for Blender

Collision, Boolean and quad-remesh projection for any mesh, plus the Arc Flow fluid simulation built on it.

**LOTBCBP = Level Of Tessellation Boolean Collision Body Projection** (called LOTCBP before 0.2.0).
Collision bodies are resolved by a base signed-distance field plus virtual tessellation bricks that are generated on demand
where fluid touches a surface, and the connected cavities of an assembly can be projected into one real Boolean union.
The same projection is reused for **Projection Remesh**: a mesh is projected against itself to decide where its quads go.

Blender extension, v0.2.0. Tested on Blender 5.2.3 LTS and 5.3.0 (headless; Cycles CPU render smoke test of all three render paths); `blender_version_min` is 5.2.3.
Sidebar tab "Tessera" in the 3D viewport. For fluids: click "Add Demo Rig", then Build. For topology: select a mesh, open "Projection Remesh".

## Install
- Build: `blender/build.sh` (validates and writes `blender/dist/tessera_projection-0.2.0.zip`).
- Install: Preferences > Get Extensions > (v) > Install from Disk, pick the zip. Or
  `blender --command extension install-file -r user_default --enable blender/dist/tessera_projection-0.2.0.zip`.
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

## Systems, crossfeed outcomes and demos (Tessera Projection / LOTBCBP)
**Systems panel** (sidebar, under the main panel). Every connected set of parts is a self-initialising *system*; nothing has to be set up by hand.
- *Detection*: parts are joined when their cavities overlap (the same notion as the Boolean projection joints). Connected components
  are the independent systems ("Engine A", "Engine B", ordered by position). Roles come from the part's Container / Transport / Chamber setting; parts
  without a role can be given one from geometry with **Auto roles** (closed volume = container, thin open channel = transport, tapered open part
  and the compact part it feeds = nozzle and chamber). Fuel / oxidizer for each container comes from its fluid's role, then the name (`fuel`, `lox`, `ox`),
  then the container order; the per-part **Propellant role** override is shown in the Part panel. The panel lists, per system: status (idle / running /
  enhanced / failed), tank / line / chamber counts, requirements (O/F against the optimum for the fuel, chamber pressure, thrust estimate from the feed
  pressures) and warnings (no oxidizer source, no chamber, empty tank, tank not connected, no throat). Detection re-runs on **Re-detect** and on Build; moving
  or editing a part only marks the list stale (no per-frame handler).
- *Linked systems*: a Transport part whose removal splits the graph into two complete engines (chamber plus both propellants) is a **crossfeed link**;
  it belongs to neither engine and the two engines are shown as a *linked group*. Adding or deleting the pipe merges / splits the group on the next detection.
- **Crossfeed outcomes** (`core/systems.py`). A lumped, deterministic *simplified tracer model, not CFD*: orifice flow in the feed lines and the crossfeed pipe
  (flow follows the pressure gradient), an injector drop, a choked nozzle (c* from flame temperature, parabolic O/F efficiency around the fuel's optimum), ideal-expansion
  thrust, first-order "visual" time constants for tank pressurisation and wall heating, and the thin-wall hoop-stress check with the temperature-derated
  yield strength of the part's material preset and wall thickness (`core/materials.py`). Outcomes: *Enhanced* when the link raises thrust by 5 % or more, moves O/F toward the
  optimum and everything stays inside the wall limits; *Failed* (latched, with the reason) when a wall exceeds its derated hoop limit, hot gas has been flowing
  back into a propellant tank for 0.4 s, or fuel and oxidizer mix in one tank. The rupture fires a *breach event*: the wall is marked failed, a jet emitter
  at the breach sprays the tank's fluid (or hot exhaust gas) through the normal particle solver, a glowing breach disc appears and a flash light decays. The status
  history is computed from the frame number, so scrubbing the timeline stays consistent. The donor engine of a crossfeed is not starved in the status model
  (tank pressure is treated as regulated), and the particle solver is not coupled back to the status model except through ignition and the breach emitter.
- **Interactive physics context.** The extension also scans for anything that makes a scene interactive and lists it as *Interactive physics context*,
  marking the affected assets "auto-initialised: <reason>": an Environment card / atmosphere preset (*environment physics*), animated or driven transforms near an
  asset (*moving collision body*, which is given the Collider role automatically), rigid bodies (*rigid-body rig*), objects with constraints (*mechanical rig*) and static
  collision bodies. The scan runs on Build and **Re-detect** only. This release only detects and initialises; the surface velocity of moving colliders is handled by the fluid
  solver work, not here.
- **Demos** (buttons at the top of the Systems panel): **Load Demo: Single Engine** builds two tanks, two pipes, a chamber and a nozzle from Blender's own primitives
  (UV spheres, cone / cylinder with Solidify, torus flanges). **Load Demo: Twin Engines + Crossfeed** builds two of them side by side (engine A on a 20 bar feed, engine B
  on 6 bar, because hot gas can only flow back into a tank that sits at a lower pressure) and a straight crossfeed pipe, with a *Crossfeed* toggle and a variant: **Good**
  (engine A's oxidizer tank into engine B's chamber: B is fuel-rich, the extra oxidizer moves O/F toward the optimum, status Enhanced) or **Bad** (engine A's hot chamber into
  engine B's fuel tank: status Failed, rupture at the tank). Press Build / Play. Limits: the crossfeed pipe carries a metering orifice (about 2 % of the area) so the
  model numbers stay sensible; geometric pipe radii of thin parts below the field resolution are taken from design values stored on the demo parts; thrust figures are relative, not
  engineering values.

## Not in this release
Phase changes and chemical reactions (boiling, condensation, combustion chemistry beyond the flame-temperature model), buoyancy
vehicles, multi-stage thrust, per-voxel temperature in the ray-march volume, particle-particle interaction (the solver is a
pressure-driven tracer model), EEVEE render check, interactive UI testing, assemblies that move continuously are re-evaluated
every frame they move (slow for large cavities). See `docs/ROADMAP.md`.

## Tests
- `python3 blender/tests/test_solver.py` (pure NumPy: solver, atmosphere presets, cavity union / joint classification, surface nets).
- `python3 blender/tests/test_systems.py` (pure Python: system grouping, linking, role detection, outcome classification) and `blender --factory-startup -b --python blender/tests/test_systems_bpy.py` (both demos, timeline status transitions, rupture visuals, interactive physics detection).
- `blender --factory-startup -b --python blender/tests/test_blender.py` (headless Blender; add `-- --installed` for an installed extension).
- `blender --factory-startup -b --python blender/tests/test_render.py` (Cycles CPU render of Points / Ray-march / Splat).

Done: part roles, material presets, fluid presets, physics/math cards with Geometry Nodes groups, Points / Ray-march / Gaussian-splat render paths
(Cycles verified), LOTCBP SDF with on-demand refinement bricks, cavity/joint/plug detection, container drain, continuous flow, emitters,
X-ray + thermal/stress tint, cache (.npz), bake (new versions), record, pack into .blend, PLY/Alembic export.
Not done / unverified: EEVEE render check, interactive UI testing, per-voxel volume temperature. See docs/ROADMAP.md.
Publishing: never commit a token; use env var BLENDER_EXT_TOKEN with the Blender Extensions web upload.

## Projection Remesh (Tessera Projection / LOTBCBP quad remesh)
Sidebar > Tessera > "Projection Remesh". The remesh is a projection of the object against itself: the object's own nearest-surface projection (BVH, the same idea as the LOTBCBP collision body) is the reference for the density field, for projecting every new vertex, and for measuring the result.
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
UV / paint data (accurate bmesh path): "UV Handling" = Keep+transfer (default) / Transfer + new `UVMap_Tessera` (Blender smart-project, angle-based; no conformal/seam unwrap) / New only / Skip. Every new face is assigned to the source face nearest its centre and all its loops are projected onto that face (barycentric), so nothing is interpolated across a seam; UDIM tiles stay (tested: u in 0..1.75, no tile-straddling faces). UV map names/order and the active/render UV map and active/render colour attribute carry over by name. Also transferred by projection: FLOAT_COLOR/BYTE_COLOR (point + corner), float/int/vector layers on point/corner/face (interpolated for float/vector/colour/UV, nearest for int), vertex-group weights, material index, smooth flag, seam/sharp edge flags (nearest source edge). A UV report (maps found/transferred, max UV deviation at face centres) is in the result. Low-res UV layouts carry onto much denser topology (tested at Resolution 4, 8 and 0.25), so a high-resolution texture can be applied through the old UVs. Not handled / unverified: crease weights, sculpt face sets/mask and edge-domain float attributes are not transferred explicitly (point/face layers named like them go through the generic path only if bmesh exposes them); shape keys are not transferred (current evaluated shape is used, no warning UI yet); third-party paint add-ons that keep data outside the mesh (image layers, external files) keep working through the UVs, but not every add-on can be tested. In the accurate path UV transfer uses per-face/per-loop Python BVH queries (tens/hundreds of thousands of faces); the fast path carries UVs by index maps instead. Sculpt face sets (`.sculpt_face_set`), sculpt mask and crease weights are transferred by the fast path's generic attribute maps; the accurate path does not transfer them.
Large meshes (fast path, `retopo_fast_ops.py` + `core/retopo_fast.py`): chosen automatically above 200,000 faces ("Large Meshes": Auto / Always / Never). Everything is foreach_get/foreach_set + NumPy (no bmesh on the full mesh): vectorised normals-outside, analysis (principal curvature, Arc Edge scale, creases, density), mirror-plane detection on a sampled subset (mathutils KDTree on at most 250k samples, 1500 query points), Karp-Sipser-flavoured mutual-best triangle pairing with augmenting rounds, density-weighted relaxation limited to the tangent plane and to half an edge length (so no per-vertex BVH query is needed), and attribute transfer by index maps (corner/UV via loop map, point, face, edge by vertex-pair key; UDIM-safe, joins never cross a UV seam; sculpt face sets, crease weights, vertex groups via a nearest-vertex Data Transfer). Two modes: **PAIR** (Resolution about 1, i.e. 0.88..1.12: output ~ input/2 quads for a triangulated input) and **REDUCE** (Resolution < 0.88 and target <= 300k faces: vertex-clustering to ~400k triangles if needed, then Blender's collapse Decimate to a working mesh, then the accurate pipeline with exact symmetry, density from the full-resolution analysis and projection onto the ORIGINAL surface; UV/attributes are not transferred in REDUCE). Resolution > 1.12 on a large mesh is refused with a message (run on a smaller mesh or twice). Progress: a modal operator shows a progress bar / status text and Esc cancels between stages (stages are single NumPy calls, so cancellation is not instant; a cancelled run may leave a temporary mesh datablock); `bpy.ops` from a script runs synchronously.
Fast-path limits (honest): PAIR leaves the triangles it cannot pair (pole fans, UV-seam/sharp borders; measured 92% quads on triangulated Suzanne, 98-99.7% on the benchmark sphere) and its topology is symmetric only if the source triangulation is (the plane is detected, reported and the deviation measured, but not enforced; exact half-mesh mirroring is the accurate path / REDUCE); REDUCE is much coarser in shape (clustering + decimation + a 3.6% sampled deviation at 1M faces, 12% on Suzanne at Resolution 0.2) and its face count lands up to ~40% off the target; deviation/symmetry numbers in the fast path are SAMPLED (20k points each way). Shape keys are never transferred (the evaluated/basis coordinates are used; a note is added to the report).
Benchmark, Blender 5.3.0 headless, 2-core shared Linux box (other jobs were running, timings are noisy), synthetic bumpy UV sphere (triangulated, one UV map with one seam), Resolution 1.0 (PAIR), seconds per stage; peak RSS includes the benchmark's own mesh generation (`tests/bench_retopo.py`):

| input faces | output faces | quad ratio | read | normals | analysis | symmetry | pairing | relax | write | measure | total | peak RSS MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 98,280 | 49,615 | 0.981 | 0.0 | 0.1 | 0.3 | 0.2 | 0.2 | 0.2 | 0.1 | 0.3 | 1.4 | 488 |
| 991,018 | 497,076 | 0.994 | 0.4 | 1.7 | 3.9 | 0.9 | 1.9 | 2.3 | 0.8 | 1.7 | 13.6 | 1775 |
| 3,972,048 | 1,989,188 | 0.997 | 2.6 | 9.0 | 25.8 | 4.6 | 13.0 | 14.7 | 4.5 | 9.5 | 83.7 | 5443 |

REDUCE, same sphere, 991,018 faces, Resolution 0.05: 34,859 output faces (100% quads, target ~25k), 51 s total (read 0.6, normals 2.6, analysis 6.4, symmetry 1.3, cluster 1.4, decimate 4.5, BVH 0.8, accurate remesh 31.8, measure 2.0), sampled deviation from the original 3.6%, peak RSS 1.4 GB: the accurate remesh stage is dominated by per-vertex BVH projection (about 77 microseconds per query on a 1M-triangle BVH). The 4M-face PAIR run needs ~5.4 GB: it will not fit on a machine with much less RAM. Not measured: REDUCE at 4M, the accurate path above ~16k faces, evaluated mode with heavy modifier stacks, other Blender versions than 5.3.0 for the benchmark (the functional tests run on 5.2.3 and 5.3.0).
Not done: Geometry Nodes exposure (skipped: not cheap), shape-key transfer, a half-mesh exact-symmetry mode for PAIR.
Tests: `python3 tests/test_retopo.py`, `blender -b --factory-startup --python tests/test_retopo_bpy.py` (5.2.3 and 5.3.0). Renders: `docs/renders/retopo_*.png` (`docs/render_retopo.py`).
