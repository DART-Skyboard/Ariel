# Arc Flow for Blender (LOTBCBP fluid simulation)

LOTBCBP = **Level of Tessellation Boolean Collision Body Projection**.

Blender 4.2+ extension (0.1.1; validated and tested on 4.2.9 LTS, earlier 0.1.0 checks on 5.2.3).
Build: `blender/build.sh [path/to/blender]` writes `blender/dist/arc_flow-0.1.1.zip`; install it from
Edit > Preferences > Get Extensions > (v) > Install from Disk..., or
`blender --command extension install-file -r user_default --enable blender/dist/arc_flow-0.1.1.zip`.
Sidebar tab "Arc Flow" in the 3D viewport. Click "Add Demo Rig", then Build.

Done: part roles, material presets, fluid presets, physics/math cards with Geometry Nodes groups, Points / Ray-march / Gaussian-splat render paths,
LOTBCBP SDF with on-demand refinement bricks, cavity/joint/plug detection, container drain, continuous flow, emitters,
X-ray + thermal/stress tint, cache (.npz), bake (new versions), record, pack into .blend, PLY/Alembic export.

## New in 0.1.1

**Animated / deforming parts (valves).** Every sim step (Build, Record and Bake) reads the *evaluated* depsgraph:
`matrix_world` and the evaluated mesh (shape keys, armatures, modifiers). A part whose evaluated mesh signature changed
gets a new collision field, so the Boolean composition (cavities, joints, plugs, openings) and the LOTBCBP tessellation
follow the motion: a valve that opens by mesh deformation turns its PLUGGED mouth into OPEN and fluid flows. Unchanged
meshes are not rebuilt; rigid motion only re-evaluates the network when a matrix actually moved. Bake now walks the
timeline with `frame_set` (guarded so the frame handler does not recurse) and restores the frame afterwards.
Library API (pure NumPy, shared by the add-on and the tests): `World.set_fields(fields, mats=None)` /
`World.update_animated(mats, fields=None)`; `World.set_matrices` is unchanged for rigid-only motion.

**Quad-first LOTBCBP.** The collision path keeps the polygon structure of the evaluated mesh (no longer only loop
triangles): `PartField` cleans and quadrangulates its own collision copy (triangle pairs joined, n-gons split into quad
strips, left-over triangles split into 3 quads), and the virtual tessellation splits quads as quads (edge midpoints +
centre, Phong projection). Triangles only appear inside the exact distance query. The user's object is never modified.

**Standalone mesh tools** (sidebar "Arc Flow > Mesh Tools (LOTBCBP)", Object menu, Edit Mode Face menu, Geometry Node editor).
None of them needs fluids, roles, Build or a simulation; you can use only the remesh path and leave.
- *Convert to Quads*: Object Mode = whole selected objects; Edit Mode with all faces selected = whole mesh; Edit Mode with
  a patch selected = only that region (the rest of the mesh and the patch border stay untouched). Cleans duplicate /
  near-coincident vertices with a *local* threshold (fraction of each vertex's own edge length, so tight detail such as
  lips or ear ridges survives), dissolves zero-area / zero-length geometry, splits n-gons into balanced quad strips and
  joins triangle pairs (topology preserving: dense regions stay dense, broad regions keep large quads; no uniform
  remesh). Symmetry: mesh mirror flags or an auto-detected X/Y/Z mirror; only one side is processed and mirrored back so
  both sides are identical. "All quads" option splits the region once (centre + edge midpoints) so no triangle remains.
- *LOTBCBP Projection*: run the quad tessellation / projection on selected meshes without a sim; writes `<name>_LOTBCBP`.
- *Analyze Geometry*: tris / quads / n-gons, duplicate and degenerate geometry, open and non-manifold edges, quad quality,
  cavity mode + volume, openings, intersections between the selected meshes (stored in `obj["af_analysis"]`).
- *Assign Role*: the existing part roles with their presets (Container / tank, Pressure chamber / vessel, Channel /
  transport, Combustion chamber, Nozzle / bell, Collider, None).
- *Auto-setup Simulation*: analyzes the selection, assigns roles to unassigned meshes from cavities / openings / names,
  adds a fluid if none exists and builds the world; joints come from the mesh intersections (no manual joints).

**Geometry Nodes editor.** Add menu > "Arc Flow (LOTBCBP)" and a header menu "Arc Flow", plus an "Arc Flow" N-panel.
Node groups built only from built-in nodes, so they wire next to any Blender node or nodes from other extensions:
`AF LOTBCBP Quads` (merge by distance + all-quad split), `AF LOTBCBP Tessellate` (quad midpoint split, optional smooth),
`AF LOTBCBP Analyze` (`af_is_quad`, `af_face_area`, quad fraction), `AF LOTBCBP Prep` (Quads > Tessellate > Analyze >
AF_Feedback) and `AF_Feedback`. **Prep Geometry Nodes setup** drops `AF LOTBCBP Prep` into the active object's GN graph
(creates an "AF LOTBCBP" modifier + tree wired Input > Prep > Output with an "AF Feedback" input when there is none; adds
the node to an existing tree, optionally inserted before Group Output). The sidebar highlights the button on meshes that
have no AF GN setup yet.

**Render / feedback.** Points / Ray-march / Splat render in both EEVEE (4.2 EEVEE Next) and Cycles
(`tests/render_check.py`). Fix: ray-march emission is masked by the grid density (it used to glow over the whole volume
bounds: view-filling fog in EEVEE, blocky tiles in Cycles); per-material engine settings are re-applied on every bind.
Preset buttons per fluid restore the default card of each mode. Points: new "Subdivisions" (default 2) for the default
icosphere, passed to the AF_Points modifier; "Assign Selected Mesh" buttons for the point source and the splat source
(X = back to the icosphere). Feedback: "Assign Active Object" plus Modifier / Particles / Force field / Geometry Nodes
(drivers on the active modifier setting, particle emission velocity, field strength, or the AF Feedback input of the GN
prep tree) and a custom property path; all read `af_fb`, written every frame.

Tests: `python3 blender/tests/test_solver.py` (NumPy only) and
`blender -b --factory-startup --python blender/tests/test_blender.py` (Blender background: quads, patch, symmetry,
GN prep, tools, auto-setup, feedback, animated valve bake). Render parity: `blender-softwaregl -b --factory-startup --python blender/tests/render_check.py`.

Not done / deferred: melting (not implemented, no melt behaviour or hooks in this add-on yet), interactive UI testing, per-voxel volume temperature,
symmetry for Edit Mode patches (patches are converted without mirroring). See docs/ROADMAP.md.
Publishing: never commit a token; use env var BLENDER_EXT_TOKEN with the Blender Extensions web upload.
