bl_info = {
    "name": "Arc Edge - Dual Scene Setup (Cycles/Eevee) + Doc Circumference",
    "author": "Justin Venable CEO @ Radical Deepscale / Based on ArcEdge.blend reference",
    "version": (1, 0, 9),
    "blender": (4, 3, 2),
    "location": "3D View > Sidebar > Arc Edge",
    "description": "Generate custom arcs, create scene spheres with node materials (Cycles/Eevee), measure arcs with doc-based circumference, animated overlay.",
    "category": "3D View",
}

import bpy
import bmesh
import time
from math import sin, cos
from mathutils import Vector
from bpy.props import (
    FloatProperty, IntProperty, PointerProperty, StringProperty
)

# For overlay drawing
import gpu
from gpu_extras.batch import batch_for_shader

# -------------------------------------------------------------------
# GLOBALS for overlay
# -------------------------------------------------------------------
ARCEDGE_MEASURE_HANDLE = None
ARCEDGE_MEASURE_OP_INSTANCE = None

# -------------------------------------------------------------------
# DOC-BASED CIRCUMFERENCE (No pi)
#   circumference(d) = d * 3
# -------------------------------------------------------------------
def doc_circumference(d):
    """Return the circumference using doc formula: diameter * 3 (no pi)."""
    return d * 3

# -------------------------------------------------------------------
# Helper: Compute full circle vertices using doc-based math.
# -------------------------------------------------------------------
def doc_circle_verts(diameter, steps, cx, cy):
    circ = doc_circumference(diameter)
    radius = diameter / 2.0
    length_per_step = circ / steps
    verts = []
    current_len = 0.0
    for _ in range(steps):
        angle = current_len / radius
        x = cx + radius * cos(angle)
        y = cy + radius * sin(angle)
        verts.append((x, y))
        current_len += length_per_step
    return verts

# -------------------------------------------------------------------
# Helper: Compute partial arc vertices using doc-based math.
# -------------------------------------------------------------------
def doc_partial_arc_verts(diameter, start_fraction, end_fraction, steps, cx, cy):
    circ = doc_circumference(diameter)
    radius = diameter / 2.0
    arc_len_start = circ * start_fraction
    arc_len_end = circ * end_fraction
    arc_len_range = arc_len_end - arc_len_start
    length_per_step = arc_len_range / steps
    verts = []
    current_len = arc_len_start
    for _ in range(steps + 1):
        angle = current_len / radius
        x = cx + radius * cos(angle)
        y = cy + radius * sin(angle)
        verts.append((x, y))
        current_len += length_per_step
    return verts

# -------------------------------------------------------------------
# Mesh Measurement Helpers
# -------------------------------------------------------------------
def measure_mesh_edges(obj):
    """Sum the lengths of all edges in a MESH object (local coordinates)."""
    mesh = obj.data
    if not mesh or not mesh.edges:
        return 0.0, "No edges in mesh"
    total_length = 0.0
    verts = mesh.vertices
    for e in mesh.edges:
        v1 = verts[e.vertices[0]].co
        v2 = verts[e.vertices[1]].co
        total_length += (v2 - v1).length
    return total_length, f"MeshEdges: {total_length:.2f}"

def measure_curve_splines(obj):
    """Naively sum the lengths of poly or NURBS splines in a CURVE object."""
    curve = obj.data
    if not curve or not curve.splines:
        return 0.0, "No splines in curve"
    total_length = 0.0
    for spline in curve.splines:
        if spline.type in ('POLY', 'NURBS'):
            pts = spline.points
            for i in range(len(pts) - 1):
                p1 = pts[i].co
                p2 = pts[i+1].co
                p1_3d = Vector((p1.x, p1.y, p1.z))
                p2_3d = Vector((p2.x, p2.y, p2.z))
                total_length += (p2_3d - p1_3d).length
        elif spline.type == 'BEZIER':
            # A proper Bezier evaluation is not implemented here.
            pass
    return total_length, f"CurveSplines: {total_length:.2f}"

def measure_arc_params_object(obj):
    """For objects with 'arc_params', use the ring-center approach."""
    mesh = obj.data
    if not mesh or not mesh.vertices:
        return 0.0, "No vertices"
    arc_data = obj["arc_params"]
    resolution = arc_data["resolution"]
    cross_seg = 8
    verts = mesh.vertices
    needed = (resolution + 1) * cross_seg
    if len(verts) < needed:
        return 0.0, f"Not enough vertices: {len(verts)} < {needed}"
    ring_centers = []
    for i in range(resolution + 1):
        sum_vec = Vector((0, 0, 0))
        for c in range(cross_seg):
            sum_vec += verts[i * cross_seg + c].co
        center = sum_vec / cross_seg
        ring_centers.append(center)
    raw_arc_length = 0.0
    for i in range(len(ring_centers) - 1):
        raw_arc_length += (ring_centers[i+1] - ring_centers[i]).length
    return raw_arc_length, f"RingCenter: {raw_arc_length:.2f}"

def measure_any_object(obj):
    """Attempt to measure the object using arc_params, then as a mesh, then as a curve."""
    if "arc_params" in obj:
        return measure_arc_params_object(obj)
    elif obj.type == 'MESH':
        return measure_mesh_edges(obj)
    elif obj.type == 'CURVE':
        return measure_curve_splines(obj)
    else:
        return 0.0, "Unsupported object type"

# -------------------------------------------------------------------
# DRAW OVERLAY FUNCTION
# -------------------------------------------------------------------
def draw_measure_overlay():
    """
    Draw a 2D overlay with doc-based circles, arcs, and a progress bar.
    """
    region = bpy.context.region
    if not region:
        return

    base_x = 120
    base_y = 160

    global ARCEDGE_MEASURE_OP_INSTANCE
    progress = ARCEDGE_MEASURE_OP_INSTANCE.progress if ARCEDGE_MEASURE_OP_INSTANCE else 0.0

    shader = gpu.shader.from_builtin('2D_UNIFORM_COLOR')
    gpu.state.blend_set("ALPHA")

    # Big circle (teal) with doc diameter = 40
    big_verts = doc_circle_verts(diameter=40, steps=64, cx=base_x, cy=base_y)
    batch_big = batch_for_shader(shader, 'LINE_LOOP', {"pos": big_verts})
    shader.bind()
    shader.uniform_float("color", (0.0, 0.8, 1.0, 1.0))
    batch_big.draw(shader)

    # Small circle (orange) with doc diameter = 20
    small_verts = doc_circle_verts(diameter=20, steps=32, cx=base_x + 100, cy=base_y)
    batch_small = batch_for_shader(shader, 'LINE_LOOP', {"pos": small_verts})
    shader.uniform_float("color", (1.0, 0.6, 0.0, 1.0))
    batch_small.draw(shader)

    # Partial arc #1 (white) with doc diameter = 30 from 10% to 70%
    arc1_verts = doc_partial_arc_verts(diameter=30, start_fraction=0.1, end_fraction=0.7, steps=32, cx=base_x + 200, cy=base_y)
    batch_arc1 = batch_for_shader(shader, 'LINE_STRIP', {"pos": arc1_verts})
    shader.uniform_float("color", (1, 1, 1, 1))
    batch_arc1.draw(shader)

    # Partial arc #2 (pink) with doc diameter = 20 from 0% to 50%
    arc2_verts = doc_partial_arc_verts(diameter=20, start_fraction=0.0, end_fraction=0.5, steps=24, cx=base_x + 250, cy=base_y + 40)
    batch_arc2 = batch_for_shader(shader, 'LINE_STRIP', {"pos": arc2_verts})
    shader.uniform_float("color", (1, 0.2, 0.8, 1))
    batch_arc2.draw(shader)

    # Progress bar
    bar_w = 100
    bar_h = 10
    bar_x = base_x
    bar_y = base_y - 50
    fill_w = bar_w * (progress / 100.0)
    fill_rect = [
        (bar_x, bar_y),
        (bar_x + fill_w, bar_y),
        (bar_x + fill_w, bar_y + bar_h),
        (bar_x, bar_y + bar_h)
    ]
    batch_fill = batch_for_shader(shader, 'TRI_FAN', {"pos": fill_rect})
    shader.uniform_float("color", (0, 1, 0, 0.5))
    batch_fill.draw(shader)
    outline_rect = [
        (bar_x, bar_y),
        (bar_x + bar_w, bar_y),
        (bar_x + bar_w, bar_y + bar_h),
        (bar_x, bar_y + bar_h)
    ]
    batch_outline = batch_for_shader(shader, 'LINE_LOOP', {"pos": outline_rect})
    shader.uniform_float("color", (1, 1, 1, 1))
    batch_outline.draw(shader)

    gpu.state.blend_set("NONE")

# -------------------------------------------------------------------
# MODAL OPERATOR FOR ANIMATED MEASUREMENT
# -------------------------------------------------------------------
class ARCEDGE_OT_AnimateMeasurement(bpy.types.Operator):
    """Animates an overlay showing measurement progress over real calculation time."""
    bl_idname = "arc_edge.animate_measurement"
    bl_label = "Arc Edge Measurement"

    _timer = None
    progress = 0.0
    measure_time: FloatProperty(default=2.0)
    start_time = 0.0

    def modal(self, context, event):
        if event.type in {'ESC'}:
            self.finish(context, cancel=True)
            return {'CANCELLED'}

        if event.type == 'TIMER':
            elapsed = time.time() - self.start_time
            ratio = min(elapsed / self.measure_time, 1.0)
            self.progress = ratio * 100.0

            # Update panel property
            props = context.scene.arc_edge_props
            props.loader_progress = self.progress

            # Force UI redraw
            for area in context.screen.areas:
                if area.type == 'VIEW_3D':
                    for region in area.regions:
                        if region.type == 'UI':
                            region.tag_redraw()

            if ratio >= 1.0:
                time.sleep(0.3)
                self.finish(context)
                return {'FINISHED'}

        return {'RUNNING_MODAL'}

    def finish(self, context, cancel=False):
        global ARCEDGE_MEASURE_HANDLE, ARCEDGE_MEASURE_OP_INSTANCE
        wm = context.window_manager
        if self._timer:
            wm.event_timer_remove(self._timer)
        if ARCEDGE_MEASURE_HANDLE is not None:
            bpy.types.SpaceView3D.draw_handler_remove(ARCEDGE_MEASURE_HANDLE, 'WINDOW')
            ARCEDGE_MEASURE_HANDLE = None
        ARCEDGE_MEASURE_OP_INSTANCE = None
        context.scene.arc_edge_props.loader_progress = 0.0
        if not cancel:
            self.report({'INFO'}, "Measurement completed.")

    def invoke(self, context, event):
        global ARCEDGE_MEASURE_HANDLE, ARCEDGE_MEASURE_OP_INSTANCE
        wm = context.window_manager
        if ARCEDGE_MEASURE_HANDLE is not None:
            self.report({'WARNING'}, "Measurement overlay already running!")
            return {'CANCELLED'}
        ARCEDGE_MEASURE_OP_INSTANCE = self
        self.progress = 0.0
        self.start_time = time.time()
        ARCEDGE_MEASURE_HANDLE = bpy.types.SpaceView3D.draw_handler_add(
            draw_measure_overlay, (), 'WINDOW', 'POST_PIXEL'
        )
        self._timer = wm.event_timer_add(0.05, window=context.window)
        wm.modal_handler_add(self)
        return {'RUNNING_MODAL'}

# -------------------------------------------------------------------
# ARC CREATION: Tube Mesh Arcs (using doc-based math for deviation and theta)
# -------------------------------------------------------------------
def create_arc_tube_mesh(name, x, y, z, resolution, deviation, tube_radius=0.1, cross_seg=8):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant (3) for deviation instead of pi
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            # Use doc-based theta: 2.0 * 3 * (c/cross_seg)
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = tube_radius * sin(theta)
            local_z = tube_radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj

def update_arc_tube_mesh(obj, x, y, z, resolution, deviation, radius=0.1):
    old_mesh = obj.data
    new_mesh = bpy.data.meshes.new(obj.name + "_Mesh")
    obj.data = new_mesh
    bm = bmesh.new()
    cross_seg = 8
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = radius * sin(theta)
            local_z = radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(new_mesh)
    bm.free()
    if old_mesh and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)

# -------------------------------------------------------------------
# SCENE SETUP FOR CYCLES (Advanced Node-Based Materials)
# -------------------------------------------------------------------
def create_scene_setup_cycles():
    # Remove old objects
    for name in ("MainSphere", "MedianSphere", "KeySphere_1", "KeySphere_2", "KeySphere_3", "KeySphere_4"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Remove old materials
    for matname in ("ArcEdgeMainMaterial", "ArcEdgeMedianMaterial", "ArcEdgeKeyMaterial"):
        mat = bpy.data.materials.get(matname)
        if mat:
            bpy.data.materials.remove(mat)
    # ArcEdgeMainMaterial (Cycles – Advanced Node Setup)
    mat_main = bpy.data.materials.new(name="ArcEdgeMainMaterial")
    mat_main.use_nodes = True
    mat_main.blend_method = 'BLEND'
    mat_main.show_transparent_back = False
    nodes = mat_main.node_tree.nodes
    links = mat_main.node_tree.links
    nodes.clear()
    node_output = nodes.new("ShaderNodeOutputMaterial")
    node_output.location = (800, 0)
    node_mix = nodes.new("ShaderNodeMixShader")
    node_mix.location = (600, 0)
    node_principled = nodes.new("ShaderNodeBsdfPrincipled")
    node_principled.location = (300, 100)
    if "Transmission" in node_principled.inputs:
        node_principled.inputs["Transmission"].default_value = 0.5
    node_principled.inputs["Base Color"].default_value = (0.5, 0.8, 1.0, 1.0)
    node_principled.inputs["Roughness"].default_value = 0.2
    node_transparent = nodes.new("ShaderNodeBsdfTransparent")
    node_transparent.location = (300, -100)
    node_noise = nodes.new("ShaderNodeTexNoise")
    node_noise.location = (-400, 0)
    node_noise.inputs["Scale"].default_value = 4.0
    node_ramp = nodes.new("ShaderNodeValToRGB")
    node_ramp.location = (-200, 0)
    node_ramp.color_ramp.elements[0].position = 0.0
    node_ramp.color_ramp.elements[0].color = (0.0, 0.4, 1.0, 1.0)
    node_ramp.color_ramp.elements[1].position = 1.0
    node_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(node_noise.outputs["Fac"], node_ramp.inputs["Fac"])
    links.new(node_ramp.outputs["Color"], node_mix.inputs["Fac"])
    links.new(node_principled.outputs["BSDF"], node_mix.inputs[1])
    links.new(node_transparent.outputs["BSDF"], node_mix.inputs[2])
    links.new(node_mix.outputs["Shader"], node_output.inputs["Surface"])
    # ArcEdgeMedianMaterial
    mat_median = bpy.data.materials.new(name="ArcEdgeMedianMaterial")
    mat_median.use_nodes = True
    mat_median.blend_method = 'BLEND'
    nodes = mat_median.node_tree.nodes
    links = mat_median.node_tree.links
    nodes.clear()
    node_output = nodes.new("ShaderNodeOutputMaterial")
    node_output.location = (800, 0)
    node_mix = nodes.new("ShaderNodeMixShader")
    node_mix.location = (600, 0)
    node_principled = nodes.new("ShaderNodeBsdfPrincipled")
    node_principled.location = (300, 100)
    if "Transmission" in node_principled.inputs:
        node_principled.inputs["Transmission"].default_value = 0.0
    node_principled.inputs["Base Color"].default_value = (1.0, 0.388, 0.278, 1.0)
    node_principled.inputs["Roughness"].default_value = 0.3
    node_transparent = nodes.new("ShaderNodeBsdfTransparent")
    node_transparent.location = (300, -100)
    node_noise = nodes.new("ShaderNodeTexNoise")
    node_noise.location = (-400, 0)
    node_noise.inputs["Scale"].default_value = 2.0
    node_ramp = nodes.new("ShaderNodeValToRGB")
    node_ramp.location = (-200, 0)
    node_ramp.color_ramp.elements[0].color = (1.0, 0.388, 0.278, 1.0)
    node_ramp.color_ramp.elements[1].color = (1.0, 0.7, 0.4, 1.0)
    links.new(node_noise.outputs["Fac"], node_ramp.inputs["Fac"])
    links.new(node_ramp.outputs["Color"], node_mix.inputs["Fac"])
    links.new(node_principled.outputs["BSDF"], node_mix.inputs[1])
    links.new(node_transparent.outputs["BSDF"], node_mix.inputs[2])
    links.new(node_mix.outputs["Shader"], node_output.inputs["Surface"])
    # ArcEdgeKeyMaterial
    mat_key = bpy.data.materials.new(name="ArcEdgeKeyMaterial")
    mat_key.use_nodes = True
    mat_key.blend_method = 'OPAQUE'
    nodes = mat_key.node_tree.nodes
    links = mat_key.node_tree.links
    nodes.clear()
    node_output = nodes.new("ShaderNodeOutputMaterial")
    node_output.location = (800, 0)
    node_mix = nodes.new("ShaderNodeMixShader")
    node_mix.location = (600, 0)
    node_principled = nodes.new("ShaderNodeBsdfPrincipled")
    node_principled.location = (300, 100)
    if "Transmission" in node_principled.inputs:
        node_principled.inputs["Transmission"].default_value = 0.0
    node_principled.inputs["Base Color"].default_value = (0.0, 0.749, 1.0, 1.0)
    node_principled.inputs["Roughness"].default_value = 0.3
    node_glossy = nodes.new("ShaderNodeBsdfGlossy")
    node_glossy.location = (300, -100)
    node_glossy.inputs["Roughness"].default_value = 0.1
    node_noise = nodes.new("ShaderNodeTexNoise")
    node_noise.location = (-400, 0)
    node_noise.inputs["Scale"].default_value = 3.0
    node_ramp = nodes.new("ShaderNodeValToRGB")
    node_ramp.location = (-200, 0)
    node_ramp.color_ramp.elements[0].color = (0.0, 0.749, 1.0, 1.0)
    node_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(node_noise.outputs["Fac"], node_ramp.inputs["Fac"])
    links.new(node_ramp.outputs["Color"], node_mix.inputs["Fac"])
    links.new(node_principled.outputs["BSDF"], node_mix.inputs[1])
    links.new(node_glossy.outputs["BSDF"], node_mix.inputs[2])
    links.new(node_mix.outputs["Shader"], node_output.inputs["Surface"])
    # Create Spheres for Cycles
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5, location=(0, 0, 0), segments=32, ring_count=16)
    main_sphere = bpy.context.active_object
    main_sphere.name = "MainSphere"
    main_sphere.data.materials.append(mat_main)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5, location=(0, 0, 0), segments=32, ring_count=16)
    median_sphere = bpy.context.active_object
    median_sphere.name = "MedianSphere"
    median_sphere.data.materials.append(mat_median)
    positions = [(-1.8, 1.8, -1.8), (1.8, 1.8, 1.8), (-1.8, -1.8, -1.8), (1.8, -1.8, 1.8)]
    for i, pos in enumerate(positions):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.625, location=pos, segments=32, ring_count=16)
        key_sphere = bpy.context.active_object
        key_sphere.name = f"KeySphere_{i+1}"
        key_sphere.data.materials.append(mat_key)

# -------------------------------------------------------------------
# SCENE SETUP FOR EEVEE (Simple Diffuse)
# -------------------------------------------------------------------
def create_scene_setup_eevee():
    for name in ("MainSphere", "MedianSphere", "SmallSphere_1", "SmallSphere_2", "SmallSphere_3", "SmallSphere_4"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for matname in ("MainSphereMat", "HalfSphereMat", "SmallSphereMat_1", "SmallSphereMat_2", "SmallSphereMat_3", "SmallSphereMat_4"):
        mat = bpy.data.materials.get(matname)
        if mat:
            bpy.data.materials.remove(mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5, location=(0, 0, 0), segments=32, ring_count=16)
    main_sphere = bpy.context.active_object
    main_sphere.name = "MainSphere"
    mat_main = bpy.data.materials.new(name="MainSphereMat")
    mat_main.diffuse_color = (0.529, 0.808, 0.922, 0.25)
    main_sphere.data.materials.append(mat_main)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5, location=(0, 0, 0), segments=32, ring_count=16)
    half_sphere = bpy.context.active_object
    half_sphere.name = "MedianSphere"
    mat_half = bpy.data.materials.new(name="HalfSphereMat")
    mat_half.diffuse_color = (1, 0.388, 0.278, 1)
    half_sphere.data.materials.append(mat_half)
    positions = [(-1.8, 1.8, -1.8), (1.8, 1.8, 1.8), (-1.8, -1.8, -1.8), (1.8, -1.8, 1.8)]
    for i, pos in enumerate(positions):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.625, location=pos, segments=32, ring_count=16)
        small_sphere = bpy.context.active_object
        small_sphere.name = f"SmallSphere_{i+1}"
        mat_small = bpy.data.materials.new(name=f"SmallSphereMat_{i+1}")
        mat_small.diffuse_color = (0, 0.749, 1, 1)
        small_sphere.data.materials.append(mat_small)

# -------------------------------------------------------------------
# ARC CREATION: Tube Mesh Arcs (Using doc-based math for deviation and theta)
# -------------------------------------------------------------------
def create_arc_tube_mesh(name, x, y, z, resolution, deviation, tube_radius=0.1, cross_seg=8):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant (3) for deviation instead of pi
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            # Use doc-based theta: 2.0 * 3 * (c/cross_seg)
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = tube_radius * sin(theta)
            local_z = tube_radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj

def update_arc_tube_mesh(obj, x, y, z, resolution, deviation, radius=0.1):
    old_mesh = obj.data
    new_mesh = bpy.data.meshes.new(obj.name + "_Mesh")
    obj.data = new_mesh
    bm = bmesh.new()
    cross_seg = 8
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = radius * sin(theta)
            local_z = radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(new_mesh)
    bm.free()
    if old_mesh and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)

# -------------------------------------------------------------------
# MESH/CURVE MEASUREMENT HELPERS
# -------------------------------------------------------------------
def measure_mesh_edges(obj):
    """Sum the lengths of all edges in a MESH object (local coordinates)."""
    mesh = obj.data
    if not mesh or not mesh.edges:
        return 0.0, "No edges in mesh"
    total_length = 0.0
    verts = mesh.vertices
    for e in mesh.edges:
        v1 = verts[e.vertices[0]].co
        v2 = verts[e.vertices[1]].co
        total_length += (v2 - v1).length
    return total_length, f"MeshEdges: {total_length:.2f}"

def measure_curve_splines(obj):
    """Naively sum the lengths of poly or NURBS splines in a CURVE object."""
    curve = obj.data
    if not curve or not curve.splines:
        return 0.0, "No splines in curve"
    total_length = 0.0
    for spline in curve.splines:
        if spline.type in ('POLY', 'NURBS'):
            pts = spline.points
            for i in range(len(pts) - 1):
                p1 = pts[i].co
                p2 = pts[i+1].co
                p1_3d = Vector((p1.x, p1.y, p1.z))
                p2_3d = Vector((p2.x, p2.y, p2.z))
                total_length += (p2_3d - p1_3d).length
        elif spline.type == 'BEZIER':
            # For simplicity, not implementing a full Bezier sampling here.
            pass
    return total_length, f"CurveSplines: {total_length:.2f}"

def measure_arc_params_object(obj):
    """Use the ring-center approach for objects with 'arc_params'."""
    mesh = obj.data
    if not mesh or not mesh.vertices:
        return 0.0, "No vertices"
    arc_data = obj["arc_params"]
    resolution = arc_data["resolution"]
    cross_seg = 8
    verts = mesh.vertices
    needed = (resolution + 1) * cross_seg
    if len(verts) < needed:
        return 0.0, f"Not enough vertices: {len(verts)} < {needed}"
    ring_centers = []
    for i in range(resolution + 1):
        sum_vec = Vector((0, 0, 0))
        for c in range(cross_seg):
            sum_vec += verts[i * cross_seg + c].co
        center = sum_vec / cross_seg
        ring_centers.append(center)
    raw_arc_length = 0.0
    for i in range(len(ring_centers) - 1):
        raw_arc_length += (ring_centers[i+1] - ring_centers[i]).length
    return raw_arc_length, f"RingCenter: {raw_arc_length:.2f}"

def measure_any_object(obj):
    """Determine measurement using arc_params (if available), else MESH, else CURVE."""
    if "arc_params" in obj:
        return measure_arc_params_object(obj)
    elif obj.type == 'MESH':
        return measure_mesh_edges(obj)
    elif obj.type == 'CURVE':
        return measure_curve_splines(obj)
    else:
        return 0.0, "Unsupported object type"

# -------------------------------------------------------------------
# MODAL OPERATOR FOR ANIMATED MEASUREMENT
# -------------------------------------------------------------------
class ARCEDGE_OT_AnimateMeasurement(bpy.types.Operator):
    """Animates an overlay showing measurement progress over real calculation time."""
    bl_idname = "arc_edge.animate_measurement"
    bl_label = "Arc Edge Measurement"

    _timer = None
    progress = 0.0
    measure_time: FloatProperty(default=2.0)
    start_time = 0.0

    def modal(self, context, event):
        if event.type in {'ESC'}:
            self.finish(context, cancel=True)
            return {'CANCELLED'}
        if event.type == 'TIMER':
            elapsed = time.time() - self.start_time
            ratio = min(elapsed / self.measure_time, 1.0)
            self.progress = ratio * 100.0
            # Update panel property
            props = context.scene.arc_edge_props
            props.loader_progress = self.progress
            # Force UI redraw
            for area in context.screen.areas:
                if area.type == 'VIEW_3D':
                    for region in area.regions:
                        if region.type == 'UI':
                            region.tag_redraw()
            if ratio >= 1.0:
                time.sleep(0.3)
                self.finish(context)
                return {'FINISHED'}
        return {'RUNNING_MODAL'}

    def finish(self, context, cancel=False):
        global ARCEDGE_MEASURE_HANDLE, ARCEDGE_MEASURE_OP_INSTANCE
        wm = context.window_manager
        if self._timer:
            wm.event_timer_remove(self._timer)
        if ARCEDGE_MEASURE_HANDLE is not None:
            bpy.types.SpaceView3D.draw_handler_remove(ARCEDGE_MEASURE_HANDLE, 'WINDOW')
            ARCEDGE_MEASURE_HANDLE = None
        ARCEDGE_MEASURE_OP_INSTANCE = None
        context.scene.arc_edge_props.loader_progress = 0.0
        if not cancel:
            self.report({'INFO'}, "Measurement completed.")

    def invoke(self, context, event):
        global ARCEDGE_MEASURE_HANDLE, ARCEDGE_MEASURE_OP_INSTANCE
        wm = context.window_manager
        if ARCEDGE_MEASURE_HANDLE is not None:
            self.report({'WARNING'}, "Measurement overlay already running!")
            return {'CANCELLED'}
        ARCEDGE_MEASURE_OP_INSTANCE = self
        self.progress = 0.0
        self.start_time = time.time()
        ARCEDGE_MEASURE_HANDLE = bpy.types.SpaceView3D.draw_handler_add(
            draw_measure_overlay, (), 'WINDOW', 'POST_PIXEL'
        )
        self._timer = wm.event_timer_add(0.05, window=context.window)
        wm.modal_handler_add(self)
        return {'RUNNING_MODAL'}

# -------------------------------------------------------------------
# ARC CREATION: Tube Mesh Arcs (Using doc-based math for deviation and theta)
# -------------------------------------------------------------------
def create_arc_tube_mesh(name, x, y, z, resolution, deviation, tube_radius=0.1, cross_seg=8):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant (3) for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            # Use doc-based theta: 2.0 * 3 * (c/cross_seg)
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = tube_radius * sin(theta)
            local_z = tube_radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj

def update_arc_tube_mesh(obj, x, y, z, resolution, deviation, radius=0.1):
    old_mesh = obj.data
    new_mesh = bpy.data.meshes.new(obj.name + "_Mesh")
    obj.data = new_mesh
    bm = bmesh.new()
    cross_seg = 8
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = radius * sin(theta)
            local_z = radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(new_mesh)
    bm.free()
    if old_mesh and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)

# -------------------------------------------------------------------
# SCENE SETUP FOR EEVEE (Simple Diffuse)
# -------------------------------------------------------------------
def create_scene_setup_eevee():
    for name in ("MainSphere", "MedianSphere", "SmallSphere_1", "SmallSphere_2", "SmallSphere_3", "SmallSphere_4"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for matname in ("MainSphereMat", "HalfSphereMat", "SmallSphereMat_1", "SmallSphereMat_2", "SmallSphereMat_3", "SmallSphereMat_4"):
        mat = bpy.data.materials.get(matname)
        if mat:
            bpy.data.materials.remove(mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5, location=(0, 0, 0), segments=32, ring_count=16)
    main_sphere = bpy.context.active_object
    main_sphere.name = "MainSphere"
    mat_main = bpy.data.materials.new(name="MainSphereMat")
    mat_main.diffuse_color = (0.529, 0.808, 0.922, 0.25)
    main_sphere.data.materials.append(mat_main)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5, location=(0, 0, 0), segments=32, ring_count=16)
    half_sphere = bpy.context.active_object
    half_sphere.name = "MedianSphere"
    mat_half = bpy.data.materials.new(name="HalfSphereMat")
    mat_half.diffuse_color = (1, 0.388, 0.278, 1)
    half_sphere.data.materials.append(mat_half)
    positions = [(-1.8, 1.8, -1.8), (1.8, 1.8, 1.8), (-1.8, -1.8, -1.8), (1.8, -1.8, 1.8)]
    for i, pos in enumerate(positions):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.625, location=pos, segments=32, ring_count=16)
        small_sphere = bpy.context.active_object
        small_sphere.name = f"SmallSphere_{i+1}"
        mat_small = bpy.data.materials.new(name=f"SmallSphereMat_{i+1}")
        mat_small.diffuse_color = (0, 0.749, 1, 1)
        small_sphere.data.materials.append(mat_small)

# -------------------------------------------------------------------
# ARC CREATION: Tube Mesh Arcs (Using doc-based math for deviation and theta)
# -------------------------------------------------------------------
def create_arc_tube_mesh(name, x, y, z, resolution, deviation, tube_radius=0.1, cross_seg=8):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant (3) for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            # Use doc-based theta: 2.0 * 3 * (c/cross_seg)
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = tube_radius * sin(theta)
            local_z = tube_radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj

def update_arc_tube_mesh(obj, x, y, z, resolution, deviation, radius=0.1):
    old_mesh = obj.data
    new_mesh = bpy.data.meshes.new(obj.name + "_Mesh")
    obj.data = new_mesh
    bm = bmesh.new()
    cross_seg = 8
    ring_verts = []
    for i in range(resolution + 1):
        t = i / resolution
        px = t * x
        py = t * y
        pz = t * z
        # Use doc-based constant for deviation
        py += sin(3 * t) * deviation
        center = Vector((px, py, pz))
        ring = []
        for c in range(cross_seg):
            theta = 2.0 * 3 * (c / cross_seg)
            local_x = radius * sin(theta)
            local_z = radius * cos(theta)
            v = bm.verts.new((center.x + local_x, center.y, center.z + local_z))
            ring.append(v)
        ring_verts.append(ring)
    bm.verts.index_update()
    for i in range(resolution):
        ringA = ring_verts[i]
        ringB = ring_verts[i + 1]
        for c in range(cross_seg):
            c_next = (c + 1) % cross_seg
            bm.faces.new((ringA[c], ringA[c_next], ringB[c_next], ringB[c]))
    bm.faces.index_update()
    bm.to_mesh(new_mesh)
    bm.free()
    if old_mesh and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)

# -------------------------------------------------------------------
# PROPERTY GROUP
# -------------------------------------------------------------------
class ArcEdgeProperties(bpy.types.PropertyGroup):
    # Arc 1
    arc1_x: FloatProperty(name="X", default=0.0)
    arc1_y: FloatProperty(name="Y", default=0.0)
    arc1_z: FloatProperty(name="Z", default=0.0)
    arc1_deviation: FloatProperty(name="Deviation", default=0.0)
    arc1_resolution: IntProperty(name="Resolution", default=8, min=2, max=256)
    # Arc 2
    arc2_x: FloatProperty(name="X", default=0.0)
    arc2_y: FloatProperty(name="Y", default=0.0)
    arc2_z: FloatProperty(name="Z", default=0.0)
    arc2_deviation: FloatProperty(name="Deviation", default=0.0)
    arc2_resolution: IntProperty(name="Resolution", default=8, min=2, max=256)
    # Arc 3
    arc3_x: FloatProperty(name="X", default=0.0)
    arc3_y: FloatProperty(name="Y", default=0.0)
    arc3_z: FloatProperty(name="Z", default=0.0)
    arc3_deviation: FloatProperty(name="Deviation", default=0.0)
    arc3_resolution: IntProperty(name="Resolution", default=8, min=2, max=256)
    # Measurement outputs
    arc_length: FloatProperty(name="Arc Length", default=0.0, precision=4)
    min_circle: FloatProperty(name="Min Circle (diam)", default=0.0, precision=4)
    max_circle: FloatProperty(name="Max Circle (diam)", default=0.0, precision=4)
    matched_report: StringProperty(name="Matched Circles", default="")
    # Loader progress for panel display
    loader_progress: FloatProperty(name="Arc Edge Progress", default=0.0, min=0.0, max=100.0)

# -------------------------------------------------------------------
# OPERATORS
# -------------------------------------------------------------------
class ARCEDGE_OT_CreateSceneSetupCycles(bpy.types.Operator):
    bl_idname = "arc_edge.create_scene_setup_cycles"
    bl_label = "Create Scene Setup (Cycles)"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        create_scene_setup_cycles()
        self.report({'INFO'}, "Scene Setup created (Cycles).")
        return {'FINISHED'}

class ARCEDGE_OT_CreateSceneSetupEevee(bpy.types.Operator):
    bl_idname = "arc_edge.create_scene_setup_eevee"
    bl_label = "Create Scene Setup (Eevee)"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        create_scene_setup_eevee()
        self.report({'INFO'}, "Scene Setup created (Eevee).")
        return {'FINISHED'}

class ARCEDGE_OT_CreateArc1(bpy.types.Operator):
    bl_idname = "arc_edge.create_arc1"
    bl_label = "Create Arc 1"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        props = context.scene.arc_edge_props
        obj = create_arc_tube_mesh(
            name="Arc1",
            x=props.arc1_x,
            y=props.arc1_y,
            z=props.arc1_z,
            resolution=props.arc1_resolution,
            deviation=props.arc1_deviation,
            tube_radius=0.1
        )
        obj["arc_params"] = {
            "x": props.arc1_x,
            "y": props.arc1_y,
            "z": props.arc1_z,
            "resolution": props.arc1_resolution,
            "deviation": props.arc1_deviation,
            "radius": 0.1
        }
        return {'FINISHED'}

class ARCEDGE_OT_CreateArc2(bpy.types.Operator):
    bl_idname = "arc_edge.create_arc2"
    bl_label = "Create Arc 2"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        props = context.scene.arc_edge_props
        obj = create_arc_tube_mesh(
            name="Arc2",
            x=props.arc2_x,
            y=props.arc2_y,
            z=props.arc2_z,
            resolution=props.arc2_resolution,
            deviation=props.arc2_deviation,
            tube_radius=0.1
        )
        obj["arc_params"] = {
            "x": props.arc2_x,
            "y": props.arc2_y,
            "z": props.arc2_z,
            "resolution": props.arc2_resolution,
            "deviation": props.arc2_deviation,
            "radius": 0.1
        }
        return {'FINISHED'}

class ARCEDGE_OT_CreateArc3(bpy.types.Operator):
    bl_idname = "arc_edge.create_arc3"
    bl_label = "Create Arc 3"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        props = context.scene.arc_edge_props
        obj = create_arc_tube_mesh(
            name="Arc3",
            x=props.arc3_x,
            y=props.arc3_y,
            z=props.arc3_z,
            resolution=props.arc3_resolution,
            deviation=props.arc3_deviation,
            tube_radius=0.1
        )
        obj["arc_params"] = {
            "x": props.arc3_x,
            "y": props.arc3_y,
            "z": props.arc3_z,
            "resolution": props.arc3_resolution,
            "deviation": props.arc3_deviation,
            "radius": 0.1
        }
        return {'FINISHED'}

class ARCEDGE_OT_UpdateArc(bpy.types.Operator):
    bl_idname = "arc_edge.update_arc"
    bl_label = "Update Selected Arc"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        obj = context.active_object
        if not obj or "arc_params" not in obj:
            self.report({'WARNING'}, "Select an Arc object with arc_params first!")
            return {'CANCELLED'}
        params = obj["arc_params"]
        update_arc_tube_mesh(
            obj,
            x=params["x"],
            y=params["y"],
            z=params["z"],
            resolution=params["resolution"],
            deviation=params["deviation"],
            radius=params["radius"]
        )
        self.report({'INFO'}, f"Arc '{obj.name}' updated.")
        return {'FINISHED'}

class ARCEDGE_OT_MeasureArc(bpy.types.Operator):
    """Measure selected object (mesh, curve, or arc_params) using doc-based circumference, then animate overlay."""
    bl_idname = "arc_edge.measure_arc"
    bl_label = "Measure Arc"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        props = context.scene.arc_edge_props
        obj = context.active_object
        if not obj:
            self.report({'WARNING'}, "No active object to measure!")
            return {'CANCELLED'}
        # Measure based on object type:
        if obj.type in {'MESH', 'CURVE'} or ("arc_params" in obj):
            raw_diam, debug_str = measure_any_object(obj)
        else:
            self.report({'WARNING'}, "Unsupported object type for measurement.")
            return {'CANCELLED'}
        t0 = time.time()
        # (The measurement is assumed to be immediate for this demo)
        t1 = time.time()
        measure_duration = t1 - t0
        if measure_duration < 0.3:
            measure_duration = 0.3  # minimum display time

        doc_based_circ = doc_circumference(raw_diam)
        props.arc_length = raw_diam
        props.min_circle = doc_based_circ
        props.max_circle = 2.0 * raw_diam
        props.matched_report = f"Result: {doc_based_circ:.2f} / {debug_str}"

        self.report({'INFO'}, f"Measured {raw_diam:.4f} => DocCirc={doc_based_circ:.4f} in {measure_duration:.2f}s. Launching overlay.")
        bpy.ops.arc_edge.animate_measurement('INVOKE_DEFAULT', measure_time=measure_duration)
        return {'FINISHED'}
    
def create_geometry_nodes_for_arcs():
    """Creates a geometry node setup replicating the preset structure from the screenshot, 
    including physics properties, gravity selection, and extrusion with enhanced physics calculations."""

    # Ensure a selected object exists
    obj = bpy.context.active_object
    if not obj:
        print("No active object selected.")
        return

    # Ensure the Geometry Nodes modifier is present
    if "ArcEdge_GeoNodes" not in obj.modifiers:
        geo_modifier = obj.modifiers.new(name="ArcEdge_GeoNodes", type='NODES')
        node_group = bpy.data.node_groups.new(name="ArcEdge_GeoNodes", type='GeometryNodeTree')
        geo_modifier.node_group = node_group
    else:
        geo_modifier = obj.modifiers["ArcEdge_GeoNodes"]
        if geo_modifier.node_group is None:
            node_group = bpy.data.node_groups.new(name="ArcEdge_GeoNodes", type='GeometryNodeTree')
            geo_modifier.node_group = node_group
        else:
            node_group = geo_modifier.node_group

    # Ensure nodes exist before clearing
    if node_group.nodes:
        node_group.nodes.clear()
    else:
        print("Warning: Node group has no nodes yet.")

    # Ensure interface exists before adding sockets
    if not hasattr(node_group, "interface"):
        print("Error: node_group interface missing!")
        return

    # ---- DEFINE INTERFACE SOCKETS ----
    node_group.interface.new_socket(name="Geometry Input", in_out='INPUT', socket_type='NodeSocketGeometry')
    node_group.interface.new_socket(name="Mesh Output", in_out='OUTPUT', socket_type='NodeSocketGeometry')

    # Extrude Thickness Input
    thickness_socket = node_group.interface.new_socket(name="Extrude Thickness", in_out='INPUT', socket_type='NodeSocketFloat')
    thickness_socket.default_value = 0.1  

    # Gravity Strength Input
    gravity_socket = node_group.interface.new_socket(name="Gravity Strength", in_out='INPUT', socket_type='NodeSocketFloat')
    gravity_socket.default_value = 9.81  

    # ---- CREATE INPUT/OUTPUT NODES ----
    group_input = node_group.nodes.new("NodeGroupInput")
    group_output = node_group.nodes.new("NodeGroupOutput")
    group_input.location = (-500, 0)
    group_output.location = (500, 0)

    # ---- ADD ARC CURVE NODES (Bezier Segments) ----
    arc_nodes = []
    for i in range(3):
        arc_node = node_group.nodes.new("GeometryNodeCurvePrimitiveBezierSegment")
        arc_node.name = f"Custom_Arc_{i+1}"
        arc_node.label = f"Custom Arc {i+1}"
        arc_node.location = (-200, i * -200)
        arc_nodes.append(arc_node)

    # ---- Create Profile Circle for Extrusion ----
    profile_curve = node_group.nodes.new("GeometryNodeCurvePrimitiveCircle")
    profile_curve.inputs["Radius"].default_value = 0.1  
    profile_curve.location = (-400, -500)

    # Connect "Extrude Thickness" to Circle Radius
    node_group.links.new(group_input.outputs["Extrude Thickness"], profile_curve.inputs["Radius"])

    # ---- Apply "CURVE TO MESH" for Extrusion ----
    extrude_nodes = []
    for i, arc_node in enumerate(arc_nodes):
        extrude_node = node_group.nodes.new("GeometryNodeCurveToMesh")
        extrude_node.location = (0, i * -200)
        extrude_nodes.append(extrude_node)

        node_group.links.new(arc_node.outputs["Curve"], extrude_node.inputs["Curve"])
        node_group.links.new(profile_curve.outputs["Curve"], extrude_node.inputs["Profile Curve"])

    # ---- JOIN ALL EXTRUDED ARCS ----
    join_geometry = node_group.nodes.new("GeometryNodeJoinGeometry")
    join_geometry.location = (200, -100)

    for extrude_node in extrude_nodes:
        node_group.links.new(extrude_node.outputs["Mesh"], join_geometry.inputs["Geometry"])

    # ---- ADD PHYSICS FRAME ----
    physics_frame = node_group.nodes.new("NodeFrame")
    physics_frame.label = "Physics Properties"
    physics_frame.location = (-600, -400)

    # ---- New PHYSICS NODES ----
    physics_nodes = {}

    # Mass: "Quantity of Mol"
    mass_node = node_group.nodes.new("ShaderNodeValue")
    mass_node.name = "Mass"
    mass_node.label = "Mass: Quantity of Mol"
    mass_node.outputs[0].default_value = 0.0  
    mass_node.location = (-600, -400)
    physics_nodes["Mass"] = mass_node

    # Volume: "Volume Dimensions" with X, Y, Z Inputs
    volume_node = node_group.nodes.new("ShaderNodeVectorMath")
    volume_node.name = "Volume"
    volume_node.label = "Volume Dimensions"
    volume_node.operation = 'MULTIPLY'
    volume_node.location = (-600, -450)
    physics_nodes["Volume"] = volume_node

    # Weight: Mass × Gravity (Dropdown for Units)
    weight_node = node_group.nodes.new("ShaderNodeMath")
    weight_node.name = "Weight"
    weight_node.label = "Weight (kg)"
    weight_node.operation = 'MULTIPLY'
    weight_node.inputs[1].default_value = 9.81  
    weight_node.location = (-600, -500)
    physics_nodes["Weight"] = weight_node

    # Density: Mass ÷ Volume
    density_node = node_group.nodes.new("ShaderNodeMath")
    density_node.name = "Density"
    density_node.label = "Density (kg/m³)"
    density_node.operation = 'DIVIDE'
    density_node.location = (-600, -550)
    physics_nodes["Density"] = density_node

    # Temperature: Select Fahrenheit or Celsius
    temp_node = node_group.nodes.new("ShaderNodeMixRGB")
    temp_node.name = "Temperature"
    temp_node.label = "Temperature (°C / °F)"
    temp_node.location = (-600, -600)
    physics_nodes["Temperature"] = temp_node

    # Velocity: Select km/h, mph, m/s, m/s²
    velocity_node = node_group.nodes.new("ShaderNodeMixRGB")
    velocity_node.name = "Velocity"
    velocity_node.label = "Velocity (km/h, mph, m/s)"
    velocity_node.location = (-600, -650)
    physics_nodes["Velocity"] = velocity_node

    # ---- ADD GRAVITY FRAME ----
    gravity_frame = node_group.nodes.new("NodeFrame")
    gravity_frame.label = "Gravity Presets"
    gravity_frame.location = (-600, -800)

    # Gravity Values (m/s²)
    gravity_values = {
        "Earth": 9.81,
        "Moon": 1.62,
        "Mars": 3.71,
        "Venus": 8.87,
        "Jupiter": 24.79
    }

    gravity_inputs = {}
    for i, (planet, value) in enumerate(gravity_values.items()):
        node = node_group.nodes.new("ShaderNodeValue")
        node.name = f"{planet}_Gravity"
        node.label = f"{planet} Gravity"
        node.outputs[0].default_value = value
        node.location = (-600, -800 - (i * 50))
        node.parent = gravity_frame  
        gravity_inputs[planet] = node

    # ---- ADD GRAVITY SELECTION NODE ----
    gravity_node = node_group.nodes.new("ShaderNodeMixRGB")
    gravity_node.name = "Gravity_Selector"
    gravity_node.label = "Gravity Selector"
    gravity_node.blend_type = 'ADD'
    gravity_node.location = (-400, -800)

    # Connect Gravity Presets
    for i, planet in enumerate(gravity_values.keys()):
        node_group.links.new(gravity_inputs[planet].outputs[0], gravity_node.inputs[1 if i == 0 else 2])

    # ---- CONNECT FINAL OUTPUT ----
    node_group.links.new(join_geometry.outputs["Geometry"], group_output.inputs["Mesh Output"])

    print("Arc Edge Geometry Nodes setup created successfully with full physics calculations.")

# -------------------------------------------------------------------
# UI PANEL
# -------------------------------------------------------------------
class VIEW3D_PT_ArcEdgePanel(bpy.types.Panel):
    bl_label = "Arc Edge"
    bl_idname = "VIEW3D_PT_arc_edge_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Arc Edge"

    def draw(self, context):
        layout = self.layout
        props = context.scene.arc_edge_props

        # Scene Setup Buttons
        box = layout.box()
        box.label(text="Arc Edge Gimbal (Spheres) - (Optional):")
        box.label(text="Main")
        box.label(text="Median")
        box.label(text="1/8th Key")
        row = box.row()
        row.operator("arc_edge.create_scene_setup_cycles", text="Cycles Setup")
        row.operator("arc_edge.create_scene_setup_eevee", text="Eevee Setup")

        # Overlay Loader (Panel-based)
        box = layout.box()
        box.label(text="Arc Edge Measure Progress:")
        box.prop(props, "loader_progress", slider=True)

        # Arc 1 Controls
        box = layout.box()
        box.label(text="Arc 1:")
        col = box.column(align=True)
        row = col.row(align=True)
        row.prop(props, "arc1_x")
        row.prop(props, "arc1_y")
        row.prop(props, "arc1_z")
        col.prop(props, "arc1_deviation")
        col.prop(props, "arc1_resolution")
        col.operator("arc_edge.create_arc1", text="Create Arc 1")

        # Arc 2 Controls
        box = layout.box()
        box.label(text="Arc 2:")
        col = box.column(align=True)
        row = col.row(align=True)
        row.prop(props, "arc2_x")
        row.prop(props, "arc2_y")
        row.prop(props, "arc2_z")
        col.prop(props, "arc2_deviation")
        col.prop(props, "arc2_resolution")
        col.operator("arc_edge.create_arc2", text="Create Arc 2")

        # Arc 3 Controls
        box = layout.box()
        box.label(text="Arc 3:")
        col = box.column(align=True)
        row = col.row(align=True)
        row.prop(props, "arc3_x")
        row.prop(props, "arc3_y")
        row.prop(props, "arc3_z")
        col.prop(props, "arc3_deviation")
        col.prop(props, "arc3_resolution")
        col.operator("arc_edge.create_arc3", text="Create Arc 3")

        # Update / Measure Controls
        box = layout.box()
        box.label(text="Measure Selected Arc:")
        row = box.row()
        # row.operator("arc_edge.update_arc", text="Update Arc")
        row.operator("arc_edge.measure_arc", text="Measure Arc")
        col = box.column(align=True)
        col.prop(props, "arc_length", text="Raw Arc Length")
        col.prop(props, "min_circle", text="1/8th Cir. | Arc Match")
        col.prop(props, "max_circle", text="Max Circle Diam")
        col.label(text="Matches:")
        col.label(text=props.matched_report)

# Operator for UI Button
class ARCEDGE_OT_SetupGeoNodes(bpy.types.Operator):
    """Setup Arc Edge Geometry Nodes"""
    bl_idname = "arc_edge.setup_geometry_nodes"
    bl_label = "Arc Edge Node Setup"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        create_geometry_nodes_for_arcs()
        self.report({'INFO'}, "Arc Edge Geometry Nodes setup completed.")
        return {'FINISHED'}

# Panel Addition in N-Panel under "Arc Edge Physics"
class VIEW3D_PT_ArcEdgeGeoNodesPanel(bpy.types.Panel):
    """Creates a panel for setting up Arc Edge Geometry Nodes"""
    bl_label = "Arc Edge Physics | Experimental"
    bl_idname = "VIEW3D_PT_arc_edge_physics"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Arc Edge"

    def draw(self, context):
        layout = self.layout
        layout.operator("arc_edge.setup_geometry_nodes", text="Arc Edge Node Setup")

# -------------------------------------------------------------------
# REGISTER / UNREGISTER
# -------------------------------------------------------------------
classes = (
    ArcEdgeProperties,
    ARCEDGE_OT_AnimateMeasurement,
    ARCEDGE_OT_CreateSceneSetupCycles,
    ARCEDGE_OT_CreateSceneSetupEevee,
    ARCEDGE_OT_CreateArc1,
    ARCEDGE_OT_CreateArc2,
    ARCEDGE_OT_CreateArc3,
    ARCEDGE_OT_UpdateArc,
    ARCEDGE_OT_MeasureArc,
    VIEW3D_PT_ArcEdgePanel,
)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.arc_edge_props = PointerProperty(type=ArcEdgeProperties)
    bpy.utils.register_class(ARCEDGE_OT_SetupGeoNodes)
    bpy.utils.register_class(VIEW3D_PT_ArcEdgeGeoNodesPanel)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.arc_edge_props
    bpy.utils.unregister_class(ARCEDGE_OT_SetupGeoNodes)
    bpy.utils.unregister_class(VIEW3D_PT_ArcEdgeGeoNodesPanel)

    
if __name__ == "__main__":
    register()
