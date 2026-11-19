# Arc Flow Blender extension: Roadmap

Done in 0.2.0: LOTBCBP rename, Boolean projection (Fluid Cavity union, Cut joints), Environment card (atmosphere presets,
gas-mix compound table, drag / spill / expansion coupling, world and ground look), Blender 5.3 compatibility, Extensions-platform
packaging.

Remaining:
- **Phase changes and reactions** driven by per-compound property tables (evaporation, condensation, freezing; combustion beyond the
  flame-temperature model). Explicitly NOT in 0.2.0: the environment gas mix is inert and the atmosphere never changes composition.
- Buoyancy vehicles: balloon gas cell, release valves (needs the mix density already available from the Environment card).
- Multi-stage / multi-propulsion thrust sources feeding a trajectory (Mantis-style).
- Per-voxel temperature in the ray-march volume (Store Named Grid, Blender 5+).
- Incompressible particle-particle interaction (current solver is a pressure-driven tracer model).

Smaller follow-ups: incremental update of the Fluid Cavity field for moving assemblies, an atmosphere altitude profile (scale height is
already reported), EEVEE render check.

## Next (0.3.0)
- Fluid mode: volumetric particle-based fluid dynamics for general fluids (mixing, lava-lamp convection, free gas, fluids without containers, moving colliders, Environment-driven buoyancy and gravity, Geometry Nodes groups). In progress; not part of 0.2.0.
- Projection Remesh: curvature-aligned quad layout, exact symmetry in the large-mesh fast path, shape-key transfer, Geometry Nodes exposure.
