"""Convert to Quads (bmesh): topology-preserving quadrangulation for whole objects or a selected face patch.

Standalone remesh tool: needs no fluids, roles, Build or simulation.

Pipeline on the target faces only (the rest of the mesh is never touched, so a patch keeps a clean stitch):
 1. adaptive clean: vertices are binned by their local edge length and each bin is merged with its own
    distance (merge_rel x that length), so tight features (lips, ear ridges) keep their small edges while
    coarse duplicates on broad surfaces are welded; then zero-area / zero-length geometry is dissolved
 2. n-gons are triangulated (Beauty) and every triangle pair is joined into a quad (Tris to Quads thresholds),
    which keeps the source density: dense areas stay dense, broad areas keep their large faces
 3. optional: left-over triangles -> all quads by a midpoint / centre split of the region (Catmull-Clark pattern)
 4. symmetry: mesh mirror flags or a detected X/Y/Z mirror -> only the +side is processed (bisect), then it is
    mirrored back (symmetrize), so both sides get identical quads and nothing straddles the mirror plane
"""
import math

import bmesh
import numpy as np
from mathutils import kdtree


def _region_sets(faces):
    region = set(faces)
    edges = {e for f in faces for e in f.edges}
    inner = {e for e in edges if e.link_faces and all(lf in region for lf in e.link_faces)}
    bverts = {v for e in edges - inner for v in e.verts}
    verts = {v for f in faces for v in f.verts}
    return region, edges, inner, verts, bverts


def detect_symmetry(bm, verts=None, rel_tol=1e-4, frac=0.98):
    """Axes (0, 1, 2) across which the vertex cloud mirrors onto itself (within rel_tol x bounding diagonal)."""
    vs = list(verts if verts is not None else bm.verts)
    if len(vs) < 4:
        return ()
    co = np.array([v.co[:] for v in vs])
    diag = float(np.linalg.norm(co.max(0) - co.min(0))) or 1.0
    tol = rel_tol * diag
    kd = kdtree.KDTree(len(vs))
    for i, c in enumerate(co):
        kd.insert(c, i)
    kd.balance()
    axes = []
    for ax in range(3):
        m = co.copy(); m[:, ax] *= -1
        hit = sum(1 for c in m if kd.find(c)[2] <= tol)
        if hit >= frac * len(vs):
            axes.append(ax)
    return tuple(axes)


def _local_len(v):
    ls = [e.calc_length() for e in v.link_edges]
    ls = [x for x in ls if x > 1e-12]
    return min(ls) if ls else 0.0


def adaptive_merge(bm, verts, merge_rel):
    """Merge by distance with a per-vertex threshold derived from local edge length (log2 bins)."""
    verts = [v for v in verts if v.is_valid]
    if not verts:
        return 0
    n0 = len(bm.verts)
    lens = np.array([_local_len(v) for v in verts])
    pos = lens[lens > 0]
    if not len(pos):
        return 0
    lens[lens <= 0] = pos.min()
    bins = np.floor(np.log2(lens)).astype(int)
    for b in np.unique(bins):
        group = [v for v, k in zip(verts, bins) if k == b and v.is_valid]
        if len(group) > 1:
            bmesh.ops.remove_doubles(bm, verts=group, dist=float(merge_rel * (2.0 ** b)))
    # exact duplicates across bins (unwelded seams of very different scale)
    rest = [v for v in verts if v.is_valid]
    bmesh.ops.remove_doubles(bm, verts=rest, dist=float(1e-6 * max(pos.max(), 1e-9)))
    return n0 - len(bm.verts)


def _split_all_quads(bm, faces, inner):
    """Catmull-Clark topology split of the region: every face -> quads around a centre vertex.  Only region-inner
    edges are split, so faces outside the region (patch boundary) keep their vertex count."""
    faces = [f for f in faces if f.is_valid]
    inner = [e for e in inner if e.is_valid]
    mids = set()
    for e in inner:
        _ne, nv = bmesh.utils.edge_split(e, e.verts[0], 0.5)
        mids.add(nv)
    new = []
    for f in faces:
        if not f.is_valid:
            continue
        loop = [l.vert for l in f.loops]
        m = len(loop)
        if m % 2:                                 # odd ring (boundary edge kept unsplit): leave as is
            new.append(f)
            continue
        start = next((i for i, v in enumerate(loop) if v in mids), None)
        if start is None:
            new.append(f)
            continue
        loop = loop[start:] + loop[:start]
        c = bm.verts.new(f.calc_center_median())
        mat, smooth = f.material_index, f.smooth
        quads = []
        for i in range(0, m, 2):
            quads.append((c, loop[i], loop[(i + 1) % m], loop[(i + 2) % m]))
        bm.faces.remove(f)
        for q in quads:
            try:
                nf = bm.faces.new(q)
                nf.material_index, nf.smooth = mat, smooth
                new.append(nf)
            except ValueError:
                pass
    return new


def split_ngons(bm, ngons):
    """Each n-gon -> quads (p_i, p_i+1, p_j-1, p_j) walking inwards from both ends; same vertices, so the border
    with neighbouring faces is unchanged.  Non-planar / concave n-gons fall back to Beauty triangulation."""
    out = []
    for f in ngons:
        if not f.is_valid:
            continue
        p = [l.vert for l in f.loops]
        n = len(p)
        pieces = []
        i, j = 0, n - 1
        while j - i >= 3:
            pieces.append((p[i], p[i + 1], p[j - 1], p[j])); i += 1; j -= 1
        if j - i == 2:
            pieces.append((p[i], p[i + 1], p[j]))
        nrm = f.normal.copy()
        concave = any((q[1].co - q[0].co).cross(q[-1].co - q[0].co).dot(nrm) <= 0 for q in pieces)
        if concave:
            res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
            out += list(res['faces'])
            continue
        mat, smooth = f.material_index, f.smooth
        bm.faces.remove(f)
        for q in pieces:
            try:
                nf = bm.faces.new(q)
            except ValueError:
                continue
            nf.material_index, nf.smooth = mat, smooth
            out.append(nf)
    return out


def convert(bm, faces=None, merge_rel=0.02, face_angle=40.0, shape_angle=40.0, all_quads=False,
            symmetry='AUTO', whole=None):
    """Quadrangulate `faces` (default: all) of bm in place.  Returns a stats dict."""
    bm.verts.ensure_lookup_table()
    faces = [f for f in (faces if faces is not None else bm.faces) if f.is_valid]
    whole = (len(faces) == len(bm.faces)) if whole is None else whole
    st = dict(faces_in=len(faces), tris_in=sum(1 for f in faces if len(f.verts) == 3),
              ngons_in=sum(1 for f in faces if len(f.verts) > 4), verts_in=len(bm.verts))
    if not faces:
        st.update(quads=0, tris=0, ngons=0, merged=0, symmetry=())
        return st
    region, edges, inner, verts, bverts = _region_sets(faces)
    axes = ()
    if whole and symmetry != 'NONE':
        axes = detect_symmetry(bm) if symmetry == 'AUTO' else tuple('XYZ'.index(a) for a in symmetry if a in 'XYZ')
    diag = 1.0
    if axes:
        # keep the +side only; it is processed once and mirrored back, so both sides get identical quads
        co = np.array([v.co[:] for v in bm.verts])
        diag = float(np.linalg.norm(co.max(0) - co.min(0))) or 1.0
        for a in axes:
            no = [0.0, 0.0, 0.0]; no[a] = 1.0
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=float(1e-6 * diag),
                                   plane_co=(0.0, 0.0, 0.0), plane_no=no, clear_inner=True)
        faces = list(bm.faces)
        region, edges, inner, verts, bverts = _region_sets(faces)
    # 1. adaptive clean (patch: boundary vertices are kept so the stitch stays intact)
    st['merged'] = adaptive_merge(bm, (verts if whole else verts - bverts), merge_rel)
    faces = [f for f in faces if f.is_valid]
    region, edges, inner, verts, bverts = _region_sets(faces)
    lens = [e.calc_length() for e in inner if e.calc_length() > 0]
    if lens:
        bmesh.ops.dissolve_degenerate(bm, dist=float(1e-3 * min(lens)), edges=list(inner))
    faces = [f for f in faces if f.is_valid]
    # 2. n-gons -> balanced strip of quads on their own vertices (odd n leaves one triangle), then every
    #    triangle pair is joined into a quad (topology preserving)
    ngons = [f for f in faces if len(f.verts) > 4]
    if ngons:
        faces = [f for f in faces if f.is_valid and f not in set(ngons)] + split_ngons(bm, ngons)
    tris = list(dict.fromkeys(f for f in faces if f.is_valid and len(f.verts) == 3))
    if tris:
        res = bmesh.ops.join_triangles(bm, faces=tris, cmp_seam=True, cmp_sharp=True, cmp_uvs=False, cmp_materials=True,
                                       angle_face_threshold=math.radians(face_angle), angle_shape_threshold=math.radians(shape_angle))
        faces = [f for f in faces if f.is_valid] + [f for f in res.get('faces', []) if f.is_valid]
    faces = list(dict.fromkeys(f for f in faces if f.is_valid))
    # 3. all quads
    if all_quads and any(len(f.verts) != 4 for f in faces):
        region, edges, inner, verts, bverts = _region_sets(faces)
        faces = _split_all_quads(bm, faces, inner)
    # 4. symmetry
    if axes:
        for a in axes:
            bmesh.ops.symmetrize(bm, input=list(bm.verts) + list(bm.edges) + list(bm.faces), direction='XYZ'[a],
                                 dist=float(1e-5 * diag))
        faces = list(bm.faces)
    faces = [f for f in faces if f.is_valid]
    st.update(quads=sum(1 for f in faces if len(f.verts) == 4), tris=sum(1 for f in faces if len(f.verts) == 3),
              ngons=sum(1 for f in faces if len(f.verts) > 4), faces_out=len(faces), symmetry=tuple('XYZ'[a] for a in axes))
    bm.normal_update()
    return st
