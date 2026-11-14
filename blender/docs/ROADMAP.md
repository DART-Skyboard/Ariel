# Arc Flow Blender extension: Roadmap (items below the title are not implemented yet unless listed under "Done")

- Environment card: atmosphere presets (Earth, Mars, Venus, Titan, Jupiter), user-defined compounds, gas mixes.
- Phase changes and reactions driven by per-compound property tables.
- Buoyancy vehicles: balloon gas cell, release valves.
- Multi-stage / multi-propulsion thrust sources feeding a trajectory (Mantis-style).
- Per-voxel temperature in the ray-march volume (Store Named Grid, Blender 5+).
- Incompressible particle-particle interaction (current solver is a pressure-driven tracer model).

## Done in 0.1.1
- Animated / deforming collision bodies (valves, shape keys, armatures, modifiers) refresh the Boolean composition and LOTBCBP tessellation during sim and bake.
- Quad-first LOTBCBP projection; standalone Convert to Quads / projection / analysis tools; Geometry Nodes editor groups and Prep setup.
- EEVEE + Cycles parity for Points / Ray-march / Splat.

## Deferred
- Melting / phase change of part materials (not implemented; no melt behaviour in this add-on).
