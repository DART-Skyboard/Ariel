"""Quad Remesh (LOTBCBP) - analysis and remeshing logic.

LOTBCBP = Level Of Tessellation Boolean Collision Body Projection.  The same idea Arc Flow uses for fluids
(a coarse body plus on-demand tessellation, always projected back onto the true surface) is reused here:
a coarse quad base is generated, tessellation is raised where the density field asks for it, and every vertex is
re-projected onto the original surface so the result cannot drift from the source shape.

Layout
  * Part 1 (NumPy only, no bpy): per-face edge counts, triangle / odd n-gon lists, dihedral crease scores,
    angle-deficit curvature, face-size field, small/large face threshold (Otsu on log size, per region),
    crease-weighted density field, density-weighted relaxation, mirror error.
  * Part 2 (bmesh, bpy imported lazily): clean-up, triangle joining, symmetric half-mesh quadrangulation,
    mirror, projection, report.

HONEST LIMITS
  * This is not a feature-aligned field-guided remesher (no edge-flow / pole control).  Topology is
    "join triangles to quads, then split what is left with simple subdivision (every n-gon -> n quads)".
    Quad *count* therefore grows in steps of x4 where leftovers exist; use method QUADRIFLOW to reduce it.
  * Higher density near creases is achieved by density-weighted vertex relaxation (vertices migrate towards
    creases and are re-projected onto the source), not by adding loops locally.  Face count is unchanged by
    that step; faces in the band get smaller and the surrounding surface gets slightly larger.
  * Symmetry: the chosen half is kept and mirrored, so a non-symmetric source loses its other half's detail
    (the symmetry error of the source is reported first).  With QUADRIFLOW, symmetry is only quadriflow's own.
  * Pure triangle fans (poles) and non-manifold input may leave a few triangles in rare cases; the report
    says how many.
"""
import math
from dataclasses import dataclass, field

import numpy as np


# ----------------------------------------------------------------------------------------------------------------
# Part 1: NumPy only
# ----------------------------------------------------------------------------------------------------------------

def pack_faces(faces):
    """list of vertex-index sequences -> (loops, start, size)."""
    size = np.fromiter((len(f) for f in faces), dtype=np.int64, count=len(faces))
    start = np.zeros(len(faces), dtype=np.int64)
    if len(faces):
        start[1:] = np.cumsum(size)[:-1]
    loops = np.fromiter((v for f in faces for v in f), dtype=np.int64, count=int(size.sum()))
    return loops, start, size


def face_edge_counts(faces):
    """Number of edges (= vertices) of each face."""
    return np.fromiter((len(f) for f in faces), dtype=np.int64, count=len(faces))


def count_report(sizes):
    sizes = np.asarray(sizes)
    n = len(sizes)
    tri = int((sizes == 3).sum())
    quad = int((sizes == 4).sum())
    odd_ngon = int(((sizes % 2 == 1) & (sizes > 3)).sum())
    even_ngon = int(((sizes % 2 == 0) & (sizes > 4)).sum())
    return {"faces": n, "tris": tri, "quads": quad, "odd_ngons": odd_ngon, "even_ngons": even_ngon,
            "odd_total": tri + odd_ngon, "quad_ratio": (quad / n) if n else 1.0}


def odd_face_mask(sizes):
    """True for every face with an odd number of edges (triangles, pentagons, ...)."""
    return (np.asarray(sizes) % 2) == 1


def _loop_face_index(size):
    return np.repeat(np.arange(len(size)), size)


def _bc(idx, w, n):
    """np.bincount-based scatter-add (much faster than np.add.at on millions of entries)."""
    return np.bincount(idx, weights=w, minlength=n)


def _next_loop(start, size):
    """index of next loop within the same face for every loop."""
    li = np.arange(int(size.sum()))
    fi = _loop_face_index(size)
    rel = li - start[fi]
    return start[fi] + (rel + 1) % size[fi]


def face_geometry(V, loops, start, size):
    """Newell normals, areas, centroids."""
    V = np.asarray(V, dtype=np.float64)
    fi = _loop_face_index(size)
    nxt = _next_loop(start, size)
    a = V[loops]
    b = V[loops[nxt]]
    cr = np.cross(a, b)
    nf = len(size)
    n = np.stack([_bc(fi, cr[:, k], nf) for k in range(3)], axis=1)
    ln = np.linalg.norm(n, axis=1)
    area = 0.5 * ln
    nrm = n / np.maximum(ln, 1e-300)[:, None]
    cen = np.stack([_bc(fi, a[:, k], nf) for k in range(3)], axis=1) / size[:, None]
    return nrm, area, cen


def build_edges(loops, start, size):
    """Unique edges (E,2) and the (up to two) faces on each: ef (E,2) with -1 for none; ecount (E,)."""
    E, ef, cnt, _ = build_edges2(loops, start, size)
    return E, ef, cnt


def build_edges2(loops, start, size):
    """As build_edges plus el (E,2): the loop index of each edge's first two uses (-1 if absent)."""
    fi = _loop_face_index(size)
    nxt = _next_loop(start, size)
    a = loops
    b = loops[nxt]
    lo = np.minimum(a, b)
    hi = np.maximum(a, b)
    nv = int(loops.max()) + 1 if len(loops) else 0
    key = lo * (nv + 1) + hi
    uniq, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    E = np.stack([uniq // (nv + 1), uniq % (nv + 1)], axis=1)
    ef = -np.ones((len(uniq), 2), dtype=np.int64)
    order = np.argsort(inv, kind="stable")
    sinv = inv[order]
    sface = fi[order]
    first = np.r_[True, sinv[1:] != sinv[:-1]]
    pos = np.arange(len(sinv)) - np.maximum.accumulate(np.where(first, np.arange(len(sinv)), 0))
    keep0 = pos == 0
    keep1 = pos == 1
    ef[sinv[keep0], 0] = sface[keep0]
    ef[sinv[keep1], 1] = sface[keep1]
    el = -np.ones((len(uniq), 2), dtype=np.int64)
    sloop = order
    el[sinv[keep0], 0] = sloop[keep0]
    el[sinv[keep1], 1] = sloop[keep1]
    return E, ef, cnt, el


def edge_dihedral(fnormal, ef):
    """Dihedral (turn) angle in radians for manifold edges, 0 for boundary/non-manifold edges."""
    ok = (ef[:, 0] >= 0) & (ef[:, 1] >= 0)
    ang = np.zeros(len(ef))
    n0 = fnormal[ef[ok, 0]]
    n1 = fnormal[ef[ok, 1]]
    ang[ok] = np.arccos(np.clip((n0 * n1).sum(1), -1.0, 1.0))
    return ang


def vertex_deficit(V, loops, start, size, nv):
    """Angle deficit (2*pi - sum of corner angles) per vertex: a discrete curvature, large at tips/saddles."""
    V = np.asarray(V, dtype=np.float64)
    li = np.arange(len(loops))
    fi = _loop_face_index(size)
    rel = li - start[fi]
    prv = start[fi] + (rel - 1) % size[fi]
    nxt = start[fi] + (rel + 1) % size[fi]
    p = V[loops]
    u = V[loops[prv]] - p
    w = V[loops[nxt]] - p
    cosv = (u * w).sum(1) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1), 1e-300)
    ang = np.arccos(np.clip(cosv, -1, 1))
    return 2 * math.pi - _bc(loops, ang, nv)



def vertex_normals(V, loops, start, size, nv):
    nrm, area, _ = face_geometry(V, loops, start, size)
    fi = _loop_face_index(size)
    w = (nrm * area[:, None])[fi]
    vn = np.stack([_bc(loops, w[:, k], nv) for k in range(3)], axis=1)
    ln = np.linalg.norm(vn, axis=1)
    return vn / np.maximum(ln, 1e-300)[:, None]


def principal_curvatures(V, E, vn):
    """Per-vertex shape operator fitted by least squares on edge normal curvatures
    kappa_n(v->u) = -2 n.(u-v)/|u-v|^2 (exact for a sphere), in the tangent frame of each vertex.
    Returns (k1, k2, dir1): k1>=k2 signed principal curvatures (convex positive), dir1 = unit direction of k1.
    Vectorised (bincount), no per-vertex Python."""
    V = np.asarray(V, dtype=np.float64)
    nv = len(V)
    src = np.concatenate([E[:, 0], E[:, 1]])
    dst = np.concatenate([E[:, 1], E[:, 0]])
    d = V[dst] - V[src]
    n = vn[src]
    dn = (d * n).sum(1)
    l2 = np.maximum((d * d).sum(1), 1e-300)
    kn = -2.0 * dn / l2
    t = d - dn[:, None] * n
    tl = np.linalg.norm(t, axis=1)
    ok = tl > 1e-12 * np.sqrt(l2)
    # per-vertex tangent frame
    ref = np.where((np.abs(vn[:, 0]) < 0.9)[:, None], np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))
    e1 = np.cross(vn, ref)
    e1 /= np.maximum(np.linalg.norm(e1, axis=1), 1e-300)[:, None]
    e2 = np.cross(vn, e1)
    tu = t / np.maximum(tl, 1e-300)[:, None]
    tx = (tu * e1[src]).sum(1)
    ty = (tu * e2[src]).sum(1)
    r = np.stack([tx * tx, 2 * tx * ty, ty * ty], axis=1)
    r[~ok] = 0.0
    A = np.zeros((nv, 3, 3))
    for i in range(3):
        for j in range(i, 3):
            A[:, i, j] = A[:, j, i] = _bc(src, r[:, i] * r[:, j], nv)
    b = np.stack([_bc(src, r[:, i] * kn, nv) for i in range(3)], axis=1)
    A += np.eye(3)[None] * 1e-9
    abc = np.linalg.solve(A, b[:, :, None])[:, :, 0]
    a, bb, c = abc[:, 0], abc[:, 1], abc[:, 2]
    mean = 0.5 * (a + c)
    rad = np.sqrt(0.25 * (a - c) ** 2 + bb ** 2)
    k1, k2 = mean + rad, mean - rad
    th = 0.5 * np.arctan2(2 * bb, a - c)
    dir1 = np.cos(th)[:, None] * e1 + np.sin(th)[:, None] * e2
    return k1, k2, dir1


def arc_scale(k1, k2, cap):
    """Arc Edge size scale: arc length s of the surface curve over a 45 degree turn (= a 1/8 circle),
    s = (pi/4)/|kappa| in exact Euclidean geometry.  The matching Arc Edge circle diameter is
    arcedge.diameter_from_arc(s).  `cap` bounds flat regions (kappa -> 0)."""
    kabs = np.maximum(np.abs(k1), np.abs(k2))
    return np.minimum((math.pi / 4.0) / np.maximum(kabs, 1e-12), cap)


def grade_size(s, E, V, gradation=2.0, iters=25):
    """Gradation smoothing of a size field: a neighbour may exceed the smaller one by at most (gradation-1)*edge
    length, so adjacent regions never differ by much more than ~gradation x in size."""
    s = s.copy()
    ln = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1) * (gradation - 1.0)
    for _ in range(iters):
        t = s.copy()
        np.minimum.at(t, E[:, 0], s[E[:, 1]] + ln)
        np.minimum.at(t, E[:, 1], s[E[:, 0]] + ln)
        if np.allclose(t, s, rtol=1e-6, atol=0):
            break
        s = t
    return s


def virtual_subdivide(V, tris, tri_edge_crease, max_edge):
    """Virtual subdivision of OVERSIZE triangles (sparse tessellation), by longest-edge bisection, as in the Arc Flow
    SDF bake: the source mesh is never modified; this only yields extra sample points so that a few huge faces do
    not decide the density field (the nearest source vertex of a point deep inside a big face is a far corner).
    tris (T,3) vertex indices; tri_edge_crease (T,3) crease 0..1 of edges (0-1,1-2,2-0).
    Returns (points (M,3), crease_at_points (M,)) for the new midpoints (flat midpoints; exact for projection since
    BVH nearest-point is exact on any triangle size)."""
    P = np.asarray(V, dtype=np.float64)
    A, B, C = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    cr = np.asarray(tri_edge_crease, dtype=np.float64)
    pts, dens = [], []
    for _ in range(14):
        e = np.stack([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1), np.linalg.norm(A - C, axis=1)], 1)
        big = e.max(1) > max_edge
        if not big.any():
            break
        A, B, C, cr, e = A[big], B[big], C[big], cr[big], e[big]
        k = e.argmax(1)
        # roll so the longest edge is edge 0 (A-B)
        idx = (np.arange(3)[None, :] + k[:, None]) % 3
        X = np.stack([A, B, C], 1)
        X = np.take_along_axis(X, np.stack([idx] * 3, -1), 1)
        cr = np.take_along_axis(cr, idx, 1)
        A, B, C = X[:, 0], X[:, 1], X[:, 2]
        M = 0.5 * (A + B)
        pts.append(M)
        dens.append(cr[:, 0])
        # children (A,M,C) and (M,B,C): edges A-M(split), M-C(0), C-A(orig) / M-B(split), B-C(orig), C-M(0)
        z = np.zeros(len(cr))
        c1 = np.stack([cr[:, 0], z, cr[:, 2]], 1)
        c2 = np.stack([cr[:, 0], cr[:, 1], z], 1)
        A, B, C = np.concatenate([A, M]), np.concatenate([M, B]), np.concatenate([C, C])
        cr = np.concatenate([c1, c2])
        if sum(len(p) for p in pts) > 4_000_000:
            break
    if not pts:
        return np.zeros((0, 3)), np.zeros(0)
    return np.concatenate(pts), np.concatenate(dens)


# ---- consistent outward orientation (vectorised; no per-face Python loops) -------------------------------------

def orient_outward(V, loops, start, size):
    """Find which faces must be flipped so every connected component is consistently oriented and faces outward.
    1. flood across manifold edges (vectorised frontier BFS): a manifold edge is consistent when its two loops run in
       opposite directions; the per-face parity relative to the component seed follows from that;
    2. per component: signed volume V = 1/3 sum(A * n.c) of the consistently oriented component; V < 0 -> flip all.
       Closed components are decided by the signed volume.  Open shells (boundary edges) have no volume: they are
       oriented away from the component's centroid (heuristic, reported as 'open_heuristic').
    Non-manifold edges (>2 faces) are not crossed; edges whose two faces cannot be made consistent (non-orientable)
    are counted in info['inconsistent_edges'] and those faces stay as they are.
    Returns (flip (F,) bool, info dict)."""
    nf = len(size)
    V = np.asarray(V, dtype=np.float64)
    E, ef, cnt, el = build_edges2(loops, start, size)
    man = (cnt == 2) & (ef[:, 0] >= 0) & (ef[:, 1] >= 0) & (el[:, 1] >= 0)
    la, lb = el[man, 0], el[man, 1]
    fa, fb = ef[man, 0], ef[man, 1]
    same = (loops[la] == loops[lb]).astype(np.int8)
    src = np.concatenate([fa, fb]); dst = np.concatenate([fb, fa]); pe = np.concatenate([same, same])
    order = np.argsort(src, kind="stable")
    src, dst, pe = src[order], dst[order], pe[order]
    indptr = np.zeros(nf + 1, dtype=np.int64)
    np.cumsum(np.bincount(src, minlength=nf), out=indptr[1:])
    comp = -np.ones(nf, dtype=np.int64)
    par = np.zeros(nf, dtype=np.int8)
    ncomp = 0
    ptr = 0
    while True:
        while ptr < nf and comp[ptr] >= 0:
            ptr += 1
        if ptr >= nf:
            break
        comp[ptr] = ncomp
        front = np.array([ptr])
        while front.size:
            c = indptr[front + 1] - indptr[front]
            if c.sum() == 0:
                break
            rep = np.repeat(np.arange(len(front)), c)
            off = np.arange(c.sum()) - np.repeat(np.cumsum(c) - c, c)
            idx = indptr[front][rep] + off
            nb = dst[idx]
            newp = par[front][rep] ^ pe[idx]
            un = comp[nb] < 0
            nb, newp = nb[un], newp[un]
            nb, first = np.unique(nb, return_index=True)
            comp[nb] = ncomp
            par[nb] = newp[first]
            front = nb
        ncomp += 1
    inconsistent = int(((par[fa] ^ par[fb]) != same).sum()) if len(fa) else 0
    nrm, area, cen = face_geometry(V, loops, start, size)
    sgn = 1.0 - 2.0 * par.astype(np.float64)
    vol_f = sgn * area * (nrm * cen).sum(1) / 3.0
    vol = _bc(comp, vol_f, ncomp)
    # open components: centroid heuristic
    bnd_edge = cnt != 2
    open_comp = np.zeros(ncomp, dtype=bool)
    ecomp = comp[np.maximum(ef[:, 0], 0)]
    open_comp[ecomp[bnd_edge & (ef[:, 0] >= 0)]] = True
    ccen = np.stack([_bc(comp, cen[:, k] * area, ncomp) for k in range(3)], 1) / np.maximum(_bc(comp, area, ncomp), 1e-300)[:, None]
    heur_f = sgn * area * (nrm * (cen - ccen[comp])).sum(1)
    heur = _bc(comp, heur_f, ncomp)
    score = np.where(open_comp, heur, vol)
    comp_flip = (score < 0).astype(np.int8)
    flip = (par ^ comp_flip[comp]).astype(bool)
    # faces already consistent and outward need no flip; flip means "reverse this face relative to its stored order"
    info = {"components": int(ncomp), "closed_components": int((~open_comp).sum()),
            "open_heuristic": int(open_comp.sum()), "inconsistent_edges": inconsistent,
            "nonmanifold_edges": int((cnt > 2).sum()), "flipped_faces": int(flip.sum())}
    return flip, info


def flip_packed(loops, start, size, flip):
    """Loop permutation that reverses the winding of the faces in `flip`.  Returns perm: new_loop[i] = old_loop[perm[i]]."""
    fi = _loop_face_index(size)
    rel = np.arange(len(loops)) - start[fi]
    src_rel = np.where(flip[fi], size[fi] - 1 - rel, rel)
    return start[fi] + src_rel


# ---- automatic mirror-plane detection (no origin / orientation assumption) ----------------------------------------

def surface_sample_points(V, loops, start, size, n=2400):
    """Deterministic surface samples: vertices and face centroids (strided to ~n points)."""
    _, area, cen = face_geometry(V, loops, start, size)
    P = np.concatenate([np.asarray(V, dtype=np.float64), cen])
    stride = max(1, len(P) // n)
    return P[::stride], cen, area


def reflect(P, p, n):
    return P - 2.0 * ((P - p) @ n)[:, None] * n[None, :]


def _plane_score(P, p, n, dist_fn, diag):
    d = dist_fn(reflect(P, p, n)) / diag
    return float(0.5 * d.mean() + 0.5 * np.percentile(d, 95)), d


def classify_symmetry(mean, p95, frac_ok):
    """symmetric / near-symmetric / asymmetric from deviations normalised by the bounding diagonal."""
    if p95 < 0.003 and mean < 0.001:
        return "symmetric"
    if mean < 0.02 and frac_ok >= 0.8:
        return "near-symmetric"
    return "asymmetric"


def detect_symmetry(P, centroid, dist_fn, diag, force_normal=None, snap=True):
    """Find the best single mirror plane of a surface using the surface projection itself.
    P: surface sample points (n,3); dist_fn(Q) -> distance of points Q to the surface (BVH / nearest sample);
    centroid: area-weighted centroid.  Candidate normals are the three PCA axes of the samples (plus a ring of
    directions inside a degenerate eigen-plane); the best is refined by coordinate descent on two tilt angles and the
    offset along the normal.  `force_normal`: only the offset is searched (manual axis).  Deterministic.
    Returns dict(normal, point, mean, p95, frac_ok, cls, confidence, deviations, candidates)."""
    P = np.asarray(P, dtype=np.float64)
    c = np.asarray(centroid, dtype=np.float64)
    sub = P[:: max(1, len(P) // 500)]
    cov = np.cov((P - c).T)
    w, ax = np.linalg.eigh(cov)
    ax = ax[:, ::-1]; w = w[::-1]
    cands = [ax[:, i] for i in range(3)]
    for i, j in ((0, 1), (1, 2)):
        if w[j] > 0 and w[i] / max(w[j], 1e-300) < 1.15:           # degenerate pair: any direction in the plane
            for a in np.linspace(0, math.pi, 12, endpoint=False):
                cands.append(math.cos(a) * ax[:, i] + math.sin(a) * ax[:, j])
    if force_normal is not None:
        cands = [np.asarray(force_normal, dtype=np.float64)]
    scored = []
    for n in cands:
        n = n / np.linalg.norm(n)
        sc, _ = _plane_score(sub, c, n, dist_fn, diag)
        scored.append((sc, tuple(n)))
    scored.sort(key=lambda t: t[0])
    best_s, n = scored[0][0], np.array(scored[0][1])
    p = c.copy()

    def frame(n):
        r = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
        u = np.cross(n, r); u /= np.linalg.norm(u)
        return u, np.cross(n, u)
    steps = [math.radians(2.0), math.radians(2.0), 0.01 * diag]
    if force_normal is not None:
        steps[0] = steps[1] = 0.0
        sc0, d0 = _plane_score(P, p, n, dist_fn, diag)
        if classify_symmetry(float(d0.mean()), float(np.percentile(d0, 95)), float((d0 < 0.02).mean())) == "symmetric":
            steps[2] = 0.0                                          # already exact about the given plane through c
    for _ in range(5):
        for k in range(3):
            if steps[k] == 0.0:
                continue
            for sgn in (1, -1):
                u, v = frame(n)
                nn, pp = n, p
                if k == 0:
                    nn = n * math.cos(sgn * steps[0]) + u * math.sin(sgn * steps[0])
                elif k == 1:
                    nn = n * math.cos(sgn * steps[1]) + v * math.sin(sgn * steps[1])
                else:
                    pp = p + sgn * steps[2] * n
                nn = nn / np.linalg.norm(nn)
                sc, _ = _plane_score(sub, pp, nn, dist_fn, diag)
                if sc < best_s - 1e-12:
                    best_s, n, p = sc, nn, pp
                    break
        steps = [x * 0.5 for x in steps]
    sc, d = _plane_score(P, p, n, dist_fn, diag)
    mean, p95, frac = float(d.mean()), float(np.percentile(d, 95)), float((d < 0.02).mean())
    if snap:                                                         # snap to a local axis through the origin when it is that
        for i in range(3):
            e = np.zeros(3); e[i] = 1.0
            if abs(float(n @ e)) > math.cos(math.radians(0.5)) and abs(float(p @ e)) < 1e-3 * diag:
                n = e * np.sign(float(n @ e)); p = p - (p @ e) * e
                break
    cls = classify_symmetry(mean, p95, frac)
    return {"normal": n, "point": p, "mean": mean, "p95": p95, "frac_ok": frac, "cls": cls,
            "confidence": float(max(0.0, 1.0 - mean / 0.02)), "deviations": d, "samples": P,
            "candidate_scores": [round(t[0], 6) for t in scored[:6]]}


def plane_frame(n, p):
    """Rigid transform (R (3,3), t (3,)) with x' = R x + t mapping the plane (point p, normal n) to x' = 0, n -> +X."""
    n = np.asarray(n, dtype=np.float64); n = n / np.linalg.norm(n)
    r = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(n, r); u /= np.linalg.norm(u)
    w = np.cross(n, u)
    R = np.stack([n, u, w])
    return R, -R @ np.asarray(p, dtype=np.float64)


def otsu_threshold(x, bins=64):
    """Otsu threshold of a 1-D sample; returns (threshold, separability 0..1)."""
    x = np.asarray(x, dtype=np.float64)
    if len(x) < 2 or float(x.max() - x.min()) < 1e-12:
        return float(x.mean()) if len(x) else 0.0, 0.0
    hist, edges = np.histogram(x, bins=bins)
    hist = hist.astype(np.float64)
    centers = 0.5 * (edges[:-1] + edges[1:])
    w0 = np.cumsum(hist)
    w1 = w0[-1] - w0
    m0 = np.cumsum(hist * centers) / np.maximum(w0, 1e-12)
    m1 = (np.sum(hist * centers) - np.cumsum(hist * centers)) / np.maximum(w1, 1e-12)
    between = w0 * w1 * (m0 - m1) ** 2
    k = int(np.argmax(between[:-1]))
    total_var = hist.sum() * np.sum(hist * (centers - np.sum(hist * centers) / hist.sum()) ** 2) / hist.sum()
    sep = float(between[k] / max(total_var * hist.sum(), 1e-12)) if total_var > 0 else 0.0
    return float(0.5 * (edges[k + 1] + edges[k + 2 if k + 2 < len(edges) else k + 1])), min(1.0, sep)


def face_regions(nfaces, ef, edge_cross_ok, max_iter=30):
    """Face connected components crossing only edges where edge_cross_ok (vectorised min-label propagation with
    pointer jumping; capped at max_iter so a huge smooth mesh may be split into several labels - harmless)."""
    ok = edge_cross_ok & (ef[:, 0] >= 0) & (ef[:, 1] >= 0)
    a, b = ef[ok, 0], ef[ok, 1]
    lab = np.arange(nfaces)
    for _ in range(max_iter):
        m = np.minimum(lab[a], lab[b])
        new = lab.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        for _j in range(3):
            new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    _, lab = np.unique(lab, return_inverse=True)
    return lab


def _spread(field_v, E, rings, decay):
    """Widen a 0..1 vertex field by `rings` neighbour steps (value decays per ring)."""
    f = field_v.copy()
    for _ in range(int(rings)):
        g = f.copy()
        np.maximum.at(g, E[:, 0], decay * f[E[:, 1]])
        np.maximum.at(g, E[:, 1], decay * f[E[:, 0]])
        f = g
    return f


@dataclass
class Analysis:
    counts: dict
    tri_mask: np.ndarray
    odd_mask: np.ndarray
    edges: np.ndarray
    edge_faces: np.ndarray
    dihedral: np.ndarray            # per edge, radians
    crease_edge: np.ndarray         # per edge 0..1
    sharp_edge: np.ndarray          # per edge bool (dihedral >= sharp angle)
    boundary_edge: np.ndarray       # per edge bool
    crease_v: np.ndarray            # per vertex 0..1 (before widening)
    density_v: np.ndarray           # per vertex 0..1 final target-density weight
    face_size: np.ndarray           # sqrt(area) per face
    small_mask: np.ndarray          # per face: below its region's small/large threshold
    threshold: float                # global small/large threshold (face size)
    region_threshold: np.ndarray    # per region
    regions: np.ndarray             # per face region label
    nonmanifold_edges: int = 0
    info: dict = field(default_factory=dict)
    k1: np.ndarray = None           # principal curvatures per vertex (signed, exact Euclidean)
    k2: np.ndarray = None
    kdir1: np.ndarray = None        # direction of k1 (estimated; quad-edge alignment to it is NOT enforced)
    arc_size: np.ndarray = None     # graded Arc Edge size scale per vertex
    virt_pts: np.ndarray = None     # extra density sample points from virtual subdivision of oversize faces
    virt_dens: np.ndarray = None
    edge_loops: np.ndarray = None   # (E,2) first two loop uses of each edge
    edge_count: np.ndarray = None   # (E,) faces per edge


def analyse(V, faces, *a, **kw):
    """List-of-faces convenience wrapper around analyse_packed."""
    loops, start, size = pack_faces(faces)
    return analyse_packed(V, loops, start, size, *a, **kw)


def analyse_packed(V, loops, start, size, crease_angle=math.radians(25.0), sharp_angle=math.radians(50.0),
                   band_rings=2, band_decay=0.75, threshold_mode="AUTO", manual_threshold=0.0,
                   curvature_weight=0.5, per_region=True):
    """Full analysis of a polygon mesh.  `faces`: list of index sequences.
    threshold_mode AUTO: per-region Otsu split of log(face size); MANUAL: `manual_threshold` is a face size
    expressed as a multiple of the mesh median face size (e.g. 0.5 = faces smaller than half the median)."""
    V = np.asarray(V, dtype=np.float64)
    nv = len(V)
    nf = len(size)
    counts = count_report(size)
    nrm, area, cen = face_geometry(V, loops, start, size)
    E, ef, ecnt, eloops = build_edges2(loops, start, size)
    dih = edge_dihedral(nrm, ef)
    crease_e = np.clip(dih / max(crease_angle, 1e-6), 0.0, 1.0)
    sharp_e = dih >= sharp_angle
    bnd = ecnt == 1
    nonman = int((ecnt > 2).sum())

    crease_v = np.zeros(nv)
    np.maximum.at(crease_v, E[:, 0], crease_e)
    np.maximum.at(crease_v, E[:, 1], crease_e)
    # boundaries behave like creases for density purposes
    np.maximum.at(crease_v, E[bnd, 0], 1.0)
    np.maximum.at(crease_v, E[bnd, 1], 1.0)
    diag = float(np.linalg.norm(V.max(0) - V.min(0))) if nv else 1.0
    # ---- Arc Edge curvature scale (exact geometry; the ladder is the scale measure, see core/arcedge.py) ----
    vn = vertex_normals(V, loops, start, size, nv)
    k1, k2, kdir = principal_curvatures(V, E, vn)
    s_arc = grade_size(arc_scale(k1, k2, 0.5 * diag), E, V, gradation=2.0)
    base_v = crease_v

    # ---- face size field; oversize faces (sparse tessellation) are not feature size ----
    elen = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    max_e = np.zeros(nf)
    np.maximum.at(max_e, np.maximum(ef[:, 0], 0), np.where(ef[:, 0] >= 0, elen, 0))
    np.maximum.at(max_e, np.maximum(ef[:, 1], 0), np.where(ef[:, 1] >= 0, elen, 0))
    oversize = max_e > 0.04 * diag                  # same 4%-of-bbox rule as the Arc Flow SDF bake
    fsize = np.sqrt(np.maximum(area, 1e-300))
    fsize = np.minimum(fsize, 0.04 * diag)
    lsz = np.log(fsize)
    # regions are separated by creases, so a lip and the cheek around it are judged separately
    if per_region:
        regions = face_regions(nf, ef, crease_e < 0.5)
    else:
        regions = np.zeros(nf, dtype=np.int64)
    nreg = int(regions.max()) + 1 if nf else 0
    med = float(np.median(fsize)) if nf else 1.0
    gthr, gsep = otsu_threshold(lsz) if nf else (0.0, 0.0)
    rthr = np.full(nreg, gthr)
    small = np.zeros(nf, dtype=bool)
    if threshold_mode == "MANUAL":
        t = math.log(max(manual_threshold, 1e-9) * med)
        rthr[:] = t
        small = lsz < t
        gthr = t
    elif not per_region or nreg > 5000:
        t = gthr if gsep >= 0.35 else -np.inf
        rthr[:] = t
        small = lsz < t
    else:
        order = np.argsort(regions, kind="stable")
        bounds = np.searchsorted(regions[order], np.arange(nreg + 1))
        for r in range(nreg):
            idx = order[bounds[r]:bounds[r + 1]]
            if len(idx) >= 24:
                t, sep = otsu_threshold(lsz[idx])
                # only trust a split that actually separates two populations; otherwise fall back to global
                if sep < 0.35:
                    t = gthr if gsep >= 0.35 else -np.inf
                rthr[r] = t
            else:
                rthr[r] = gthr if gsep >= 0.35 else -np.inf
            small[idx] = lsz[idx] < rthr[r]
    small_v = _bc(loops, small[_loop_face_index(size)].astype(float), nv)
    cnt_v = _bc(loops, np.ones(len(loops)), nv)
    small_v = small_v / np.maximum(cnt_v, 1)
    small &= ~oversize
    small_v = _bc(loops, small[_loop_face_index(size)].astype(float), nv) / np.maximum(cnt_v, 1)
    # Arc Edge density: an arc (1/8-circle) much shorter than 4 typical faces means the surface bends tighter than
    # the tessellation resolves -> denser; gentle curvature (arc >= 4 faces) -> 0
    L_ref = 4.0 * med
    dens_arc = np.clip(np.log2(L_ref / np.maximum(s_arc, 1e-300)) / 3.0, 0.0, 1.0)
    density = np.maximum(np.maximum(base_v, 0.5 * small_v), 0.8 * dens_arc)
    density = _spread(density, E, band_rings, band_decay)
    vpts = np.zeros((0, 3)); vden = np.zeros(0)
    if oversize.any():
        tri_f, tri_v, tri_c = [], [], []
        osf = np.nonzero(oversize)[0]
        for f in osf[:200000]:
            vs = loops[start[f]:start[f] + size[f]]
            for i in range(1, len(vs) - 1):
                tri_v.append((vs[0], vs[i], vs[i + 1]))
        tri_v = np.array(tri_v, dtype=np.int64)
        # per-triangle-edge crease via edge lookup
        key = np.minimum(E[:, 0], E[:, 1]) * (nv + 1) + np.maximum(E[:, 0], E[:, 1])
        order = np.argsort(key)
        def ecr(a, b):
            k = np.minimum(a, b) * (nv + 1) + np.maximum(a, b)
            pos = np.searchsorted(key[order], k)
            pos = np.minimum(pos, len(order) - 1)
            hit = key[order][pos] == k
            return np.where(hit, crease_e[order][pos], 0.0)
        tc = np.stack([ecr(tri_v[:, 0], tri_v[:, 1]), ecr(tri_v[:, 1], tri_v[:, 2]), ecr(tri_v[:, 2], tri_v[:, 0])], 1)
        vpts, vden = virtual_subdivide(V, tri_v, tc, 0.04 * diag)
    return Analysis(counts=counts, tri_mask=(size == 3), odd_mask=odd_face_mask(size), edges=E, edge_faces=ef,
                    dihedral=dih, crease_edge=crease_e, sharp_edge=sharp_e, boundary_edge=bnd, crease_v=base_v,
                    density_v=density, face_size=fsize, small_mask=small,
                    threshold=float(math.exp(gthr)) if np.isfinite(gthr) else 0.0,
                    region_threshold=rthr, regions=regions, nonmanifold_edges=nonman,
                    k1=k1, k2=k2, kdir1=kdir, arc_size=s_arc, virt_pts=vpts, virt_dens=vden, edge_loops=eloops, edge_count=ecnt,
                    info={"oversize_faces": int(oversize.sum()), "median_face_size": med, "regions": nreg, "otsu_separability": gsep,
                          "small_faces": int(small.sum())})


def mirror_error(V, axis=0, tol=1e-4, nearest=None):
    """Symmetry error of a point set about the plane axis=0: for every vertex, distance to the nearest vertex
    among the mirrored set.  Returns (max, mean, fraction_within_tol)."""
    V = np.asarray(V, dtype=np.float64)
    M = V.copy()
    M[:, axis] *= -1.0
    if nearest is None:
        d = nearest_distance(M, V)
    else:
        d = nearest(M, V)
    return float(d.max()) if len(d) else 0.0, float(d.mean()) if len(d) else 0.0, float((d <= tol).mean()) if len(d) else 1.0


def nearest_distance(P, Q, chunk=512):
    out = np.empty(len(P))
    for i in range(0, len(P), chunk):
        a = P[i:i + chunk]
        d2 = ((a[:, None, :] - Q[None, :, :]) ** 2).sum(2)
        out[i:i + chunk] = np.sqrt(d2.min(1))
    return out


def nearest_index(P, Q, chunk=512):
    out = np.empty(len(P), dtype=np.int64)
    for i in range(0, len(P), chunk):
        a = P[i:i + chunk]
        d2 = ((a[:, None, :] - Q[None, :, :]) ** 2).sum(2)
        out[i:i + chunk] = d2.argmin(1)
    return out


def relax_density(V, edges, density_fn, pinned, iters=12, gain=3.0, lam=0.55, project=None, plane_axis=None):
    """Density-weighted Laplacian relaxation.

    Each free vertex moves towards the *weighted* centroid of its neighbours with weight 1 + gain*density(neighbour):
    vertices therefore migrate toward high-density (crease) zones, shrinking quads there.  `density_fn(P)` returns
    the density (0..1) at positions P, `project(P)` re-projects onto the source surface (projection step against the object's own collision-body projection),
    `pinned` vertices never move (they are only projected for the plane axis if given).
    `plane_axis`: vertices exactly on the plane stay on it (their axis coordinate is forced to 0)."""
    P = np.asarray(V, dtype=np.float64).copy()
    n = len(P)
    free = ~np.asarray(pinned, dtype=bool)
    on_plane = None
    if plane_axis is not None:
        on_plane = np.abs(P[:, plane_axis]) < 1e-9
    a = np.concatenate([edges[:, 0], edges[:, 1]])
    b = np.concatenate([edges[:, 1], edges[:, 0]])
    for _ in range(int(iters)):
        w = 1.0 + gain * np.asarray(density_fn(P))
        ws = np.zeros(n)
        acc = np.zeros((n, 3))
        np.add.at(ws, a, w[b])
        np.add.at(acc, a, w[b][:, None] * P[b])
        tgt = acc / np.maximum(ws, 1e-12)[:, None]
        newP = P + lam * (tgt - P)
        P = np.where(free[:, None], newP, P)
        if on_plane is not None:
            P[on_plane, plane_axis] = 0.0
        if project is not None:
            Q = project(P)
            P = np.where(free[:, None], Q, P)
            if on_plane is not None:
                P[on_plane, plane_axis] = 0.0
    return P


def band_density_ratio(face_centroids, face_area_src_centroids, face_area_src, src_density, out_density_at_centroids,
                       band=0.6, flat=0.3):
    """Faces per unit *source* area in the crease band vs in flat regions (used by tests / report).
    Returns (density_band, density_flat, ratio)."""
    ob = out_density_at_centroids >= band
    of = out_density_at_centroids <= flat
    sb = src_density >= band
    sf = src_density <= flat
    a_b = float(face_area_src[sb].sum())
    a_f = float(face_area_src[sf].sum())
    d_b = ob.sum() / max(a_b, 1e-12)
    d_f = of.sum() / max(a_f, 1e-12)
    return float(d_b), float(d_f), float(d_b / max(d_f, 1e-12))


# ----------------------------------------------------------------------------------------------------------------
# Part 2: bmesh / bpy
# ----------------------------------------------------------------------------------------------------------------

AXES = {"X": 0, "Y": 1, "Z": 2}


@dataclass
class RemeshSettings:
    method: str = "AUTO"                 # AUTO | JOIN_SPLIT | QUADRIFLOW
    auto: bool = True                    # derive unspecified settings (symmetry axis, crease angle) from the projection
    use_symmetry: object = None          # None = auto-detect (when auto), True/False = manual override
    axis: str = "X"
    sym_tolerance: float = 1e-4          # fraction of bbox diagonal
    keep_positive_side: bool = True
    crease_angle: object = None          # None = auto from the dihedral distribution (when auto), else radians
    sharp_angle: float = math.radians(50.0)
    threshold_mode: str = "AUTO"
    manual_threshold: float = 0.6
    target_faces: int = 0                # 0 = keep roughly the input quad count
    crease_density: float = 6.0          # gain; 0 disables the density relaxation
    band_rings: int = 2
    relax_iterations: int = 24
    preserve_sharp: bool = True
    preserve_boundary: bool = True
    join_angle: float = math.radians(40.0)
    join_shape: float = math.radians(60.0)
    weld_distance: float = 1e-5          # fraction of bbox diagonal
    deviation_tol: float = 0.002         # max allowed deviation from the projection, fraction of bbox diagonal
    refine_passes: int = 2               # extra density passes aimed at faces whose deviation exceeds the tolerance
    uv_mode: str = "KEEP"                # KEEP | KEEP_NEW | NEW | SKIP (NEW layers are generated by the operator)
    resolution: float = 1.0              # output size multiplier relative to the input quad-equivalent count (0.01..12)
    recalc_before: bool = True           # consistent outward normals before the projection reference is built
    recalc_after: bool = True            # ... and on the result
    max_levels: int = 2                  # cap on x4 subdivision steps when the target is far above the input


def bm_arrays(bm):
    V = np.array([v.co[:] for v in bm.verts], dtype=np.float64).reshape(-1, 3)
    bm.verts.ensure_lookup_table()
    faces = [[v.index for v in f.verts] for f in bm.faces]
    return V, faces


def bm_report(bm):
    sizes = np.array([len(f.verts) for f in bm.faces], dtype=np.int64)
    r = count_report(sizes)
    r["verts"] = len(bm.verts)
    return r


def cleanup_bmesh(bm, weld=1e-5, dissolve_degenerate=True, remove_loose=True, recalc_normals=True):
    """Quick topology fix for sculpt / CAD imports.  Returns a dict of what was changed."""
    import bmesh
    rep = {}
    v0, f0 = len(bm.verts), len(bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=weld)
    rep["welded_verts"] = v0 - len(bm.verts)
    if dissolve_degenerate:
        bmesh.ops.dissolve_degenerate(bm, dist=max(weld, 1e-9), edges=bm.edges[:])
    zero = [f for f in bm.faces if f.calc_area() < 1e-14]
    if zero:
        bmesh.ops.delete(bm, geom=zero, context='FACES')
    rep["degenerate_faces"] = len(zero)
    if remove_loose:
        loose_v = [v for v in bm.verts if not v.link_faces]
        loose_e = [e for e in bm.edges if not e.link_faces]
        if loose_e:
            bmesh.ops.delete(bm, geom=loose_e, context='EDGES')
        loose_v = [v for v in bm.verts if not v.link_edges]
        if loose_v:
            bmesh.ops.delete(bm, geom=loose_v, context='VERTS')
        rep["loose_removed"] = len(loose_e) + len(loose_v)
    if recalc_normals and len(bm.faces):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    rep["nonmanifold_edges"] = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    rep["boundary_edges"] = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    rep["faces_removed"] = f0 - len(bm.faces)
    return rep


def join_to_quads(bm, angle=math.radians(40.0), shape=math.radians(60.0)):
    import bmesh
    tris = [f for f in bm.faces if len(f.verts) == 3]
    if tris:
        bmesh.ops.join_triangles(bm, faces=tris, cmp_seam=False, cmp_sharp=False, cmp_uvs=False, cmp_vcols=False,
                                 cmp_materials=True, angle_face_threshold=angle, angle_shape_threshold=shape,
                                 topology_influence=1.0)


def simple_split_all(bm):
    """Every n-gon -> n quads (face centre + edge midpoints), positions linear.  Uses the Subdivision Surface
    modifier in SIMPLE mode so UVs, materials and vertex groups are interpolated by Blender itself."""
    import bpy
    me = bpy.data.meshes.new("_af_tmp")
    bm.to_mesh(me)
    ob = bpy.data.objects.new("_af_tmp", me)
    sc = bpy.context.scene
    sc.collection.objects.link(ob)
    try:
        md = ob.modifiers.new("s", 'SUBSURF')
        md.subdivision_type = 'SIMPLE'
        md.levels = 1
        md.render_levels = 1
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        new = bpy.data.meshes.new_from_object(ev)
        bm.clear()
        bm.from_mesh(new)
        bpy.data.meshes.remove(new)
    finally:
        sc.collection.objects.unlink(ob)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)


def _bbox_diag(V):
    return float(np.linalg.norm(V.max(0) - V.min(0))) if len(V) else 1.0


def _kd_nearest(P, Q):
    """nearest distance from each P to the set Q using mathutils KDTree (fast), numpy fallback outside Blender."""
    try:
        import mathutils
    except ImportError:
        return nearest_distance(P, Q)
    t = mathutils.kdtree.KDTree(len(Q))
    for i, q in enumerate(Q):
        t.insert(q, i)
    t.balance()
    return np.array([t.find(p)[2] for p in P])


def source_symmetry(V, axis="X", tol_frac=1e-4):
    """(max error, mean error, fraction ok) of the source about the plane axis=0, as fractions of bbox diag."""
    d = _bbox_diag(V)
    mx, mn, fr = mirror_error(V, AXES[axis], tol_frac * d, nearest=_kd_nearest)
    return mx / d, mn / d, fr


def resolve_auto(st, Vr, an_fn):
    """Fill in settings left on automatic.  Returns (settings copy, dict describing what was decided)."""
    import copy
    st = copy.copy(st)
    info = {}
    if st.crease_angle is None:
        if st.auto:
            an0 = analyse(*an_fn, crease_angle=math.radians(25.0))
            d = an0.dihedral[(an0.edge_faces[:, 0] >= 0) & (an0.edge_faces[:, 1] >= 0)]
            d = d[d > math.radians(2.0)]
            ca = float(np.percentile(d, 85)) if len(d) else math.radians(25.0)
            st.crease_angle = min(max(ca, math.radians(15.0)), math.radians(40.0))
        else:
            st.crease_angle = math.radians(25.0)
        info["crease_angle_deg"] = round(math.degrees(st.crease_angle), 1)
    if st.use_symmetry is None:
        st.use_symmetry = False
    return st, info


def _pinned_mask(bm, st, pin_sharp, symmetric, ax):
    pinned = np.zeros(len(bm.verts), dtype=bool)
    for e in bm.edges:
        nl = len(e.link_faces)
        if nl == 1:
            on_plane = symmetric and abs(e.verts[0].co[ax]) < 1e-9 and abs(e.verts[1].co[ax]) < 1e-9
            if st.preserve_boundary and not on_plane:
                pinned[e.verts[0].index] = pinned[e.verts[1].index] = True
        elif nl == 2 and pin_sharp:
            if math.acos(max(-1.0, min(1.0, e.link_faces[0].normal.dot(e.link_faces[1].normal)))) >= st.sharp_angle:
                pinned[e.verts[0].index] = pinned[e.verts[1].index] = True
    return pinned


def face_deviation(bm, bvh):
    """Distance of every face centre to the projection of the source surface; per-vertex max of incident faces."""
    import mathutils
    bm.verts.ensure_lookup_table()
    fd = np.zeros(len(bm.faces))
    vd = np.zeros(len(bm.verts))
    for i, f in enumerate(bm.faces):
        c = f.calc_center_median()
        loc = bvh.find_nearest(c)
        fd[i] = (loc[0] - c).length if loc and loc[0] is not None else 0.0
        for v in f.verts:
            vd[v.index] = max(vd[v.index], fd[i])
    return fd, vd


def quad_quality(bm, min_deg=25.0, max_deg=155.0):
    """Indices of badly shaped faces (corner angle outside [min,max]) plus pole counts (interior verts, valence != 4)."""
    lo, hi = math.radians(min_deg), math.radians(max_deg)
    bad = []
    for f in bm.faces:
        if len(f.verts) != 4:
            continue
        a = [l.calc_angle() for l in f.loops]
        if min(a) < lo or max(a) > hi:
            bad.append(f.index)
    p3 = p5 = 0
    for v in bm.verts:
        if v.is_boundary:
            continue
        n = len(v.link_edges)
        if n == 3:
            p3 += 1
        elif n >= 5:
            p5 += 1
    return bad, p3, p5


def smooth_bad_quads(bm, bvh, st, symmetric, ax, iters=6):
    """Tangent smoothing (uniform Laplacian + projection) of the vertices of badly shaped quads."""
    import mathutils
    bm.faces.ensure_lookup_table()
    bad, _, _ = quad_quality(bm)
    if not bad:
        return 0
    pinned = _pinned_mask(bm, st, st.preserve_sharp, symmetric, ax)
    vs = {v for i in bad for v in bm.faces[i].verts if not pinned[v.index]}
    for _ in range(iters):
        new = {}
        for v in vs:
            nb = [e.other_vert(v).co for e in v.link_edges]
            c = sum(nb, mathutils.Vector()) / len(nb)
            q = v.co.lerp(c, 0.6)
            loc = bvh.find_nearest(q)
            q = loc[0].copy() if loc and loc[0] is not None else q
            if symmetric and abs(v.co[ax]) < 1e-9:
                q[ax] = 0.0
            new[v] = q
        for v, q in new.items():
            v.co = q
    bm.normal_update()
    return len(bad)


def final_quality(bm, bvh_ref, ref_V, st, ax):
    """Report: deviation from the projection in both directions, symmetry error, poles, bad quads (fractions of diag)."""
    import mathutils
    from mathutils.bvhtree import BVHTree
    diag = _bbox_diag(ref_V)
    fd, _ = face_deviation(bm, bvh_ref)
    vd = 0.0
    for v in bm.verts:
        loc = bvh_ref.find_nearest(v.co)
        if loc and loc[0] is not None:
            vd = max(vd, (loc[0] - v.co).length)
    out_bvh = BVHTree.FromBMesh(bm, epsilon=0.0)
    rd = 0.0
    for p in ref_V[:: max(1, len(ref_V) // 20000)]:
        loc = out_bvh.find_nearest(mathutils.Vector(p))
        if loc and loc[0] is not None:
            rd = max(rd, (loc[0] - mathutils.Vector(p)).length)
    Vo = np.array([v.co[:] for v in bm.verts]).reshape(-1, 3)
    mx, mn, _ = mirror_error(Vo, ax, st.sym_tolerance * diag, nearest=_kd_nearest)
    bad, p3, p5 = quad_quality(bm)
    q = {"max_deviation": max(float(fd.max()) if len(fd) else 0.0, vd, rd) / diag,
         "mean_face_deviation": float(fd.mean()) / diag if len(fd) else 0.0,
         "deviation_tol": st.deviation_tol, "within_tolerance": None,
         "symmetry_error": mx / diag, "symmetry_axis": st.axis, "symmetry_enforced": bool(st.use_symmetry),
         "poles_valence3": p3, "poles_valence5plus": p5, "bad_quads": len(bad)}
    q["within_tolerance"] = q["max_deviation"] <= st.deviation_tol
    return q


def _symmetry_setup(work, st, diag):
    """Decide / detect the mirror plane on the cleaned source `work`, move `work` into the plane frame (plane = x=0)
    and update `st` (copy).  Returns (report dict, inverse transform Matrix or None)."""
    import mathutils
    from mathutils import Matrix
    from mathutils.bvhtree import BVHTree
    rep = {"mode": "OFF" if st.use_symmetry is False else ("AXIS" if st.use_symmetry else "AUTO")}
    if st.use_symmetry is False or not len(work.faces):
        return rep, None
    tmp = BVHTree.FromBMesh(work, epsilon=0.0)

    def dist_fn(Q):
        out = np.empty(len(Q))
        for i, q in enumerate(Q):
            hit = tmp.find_nearest(mathutils.Vector(q))
            out[i] = hit[3] if hit and hit[3] is not None else 1e9
        return out
    V, F = bm_arrays(work)
    loops, start, size = pack_faces(F)
    P, cen, area = surface_sample_points(V, loops, start, size)
    c = (cen * area[:, None]).sum(0) / max(area.sum(), 1e-300)
    force = None
    if rep["mode"] == "AXIS":
        force = np.zeros(3); force[AXES[st.axis]] = 1.0
    det = detect_symmetry(P, c, dist_fn, diag, force_normal=force)
    rep.update({"class": det["cls"], "confidence": det["confidence"], "mean_dev": det["mean"], "p95_dev": det["p95"],
                "normal": tuple(float(x) for x in det["normal"]), "point": tuple(float(x) for x in det["point"]),
                "asymmetric_fraction": 1.0 - det["frac_ok"], "candidate_scores": det["candidate_scores"]})
    enforce = det["cls"] in ("symmetric", "near-symmetric") or (rep["mode"] == "AXIS")
    rep["enforced"] = bool(enforce)
    if not enforce:
        st.use_symmetry = False
        rep["note"] = "asymmetric: not mirrored"
        return rep, None
    R, t = plane_frame(det["normal"], det["point"])
    M = Matrix([[*R[0], t[0]], [*R[1], t[1]], [*R[2], t[2]], [0, 0, 0, 1]])
    work.transform(M)
    work.normal_update()
    st.use_symmetry = True
    st.axis = "X"
    # keep the half with more surface area (deterministic); the other half is replaced by the mirrored copy
    V2, F2 = bm_arrays(work)
    l2, s2, z2 = pack_faces(F2)
    _, a2, c2 = face_geometry(V2, l2, s2, z2)
    pos = float(a2[c2[:, 0] > 0].sum()); neg = float(a2[c2[:, 0] < 0].sum())
    st.keep_positive_side = pos >= neg
    rep["kept_side"] = "+" if st.keep_positive_side else "-"
    rep["area_ratio_sides"] = min(pos, neg) / max(max(pos, neg), 1e-300)
    return rep, M.inverted()


def remesh_bmesh(src_bm, st, quadriflow_fn=None, ref_bvh=None, ref_sample_V=None, density_samples=None):
    """Quad-remesh `src_bm` (left untouched) per RemeshSettings; returns (new_bm, report dict).
    Large-mesh 'reduce' mode: src_bm is a decimated working mesh; `ref_bvh` is the BVH of the ORIGINAL full-resolution
    surface (projection + deviation reference), `ref_sample_V` a sample of its vertices, `density_samples` =
    (points, density) from the full-resolution analysis."""
    import bmesh
    import mathutils
    from mathutils.bvhtree import BVHTree
    rep = {"input": bm_report(src_bm)}
    V0, _ = bm_arrays(src_bm)
    diag = _bbox_diag(V0)
    work = src_bm.copy()
    rep["cleanup"] = cleanup_bmesh(work, st.weld_distance * diag, recalc_normals=st.recalc_before)
    work.verts.ensure_lookup_table()
    import copy as _copy
    st = _copy.copy(st)
    sym_rep, M_inv = _symmetry_setup(work, st, diag)
    rep["symmetry"] = sym_rep
    # The object's own projection (nearest-surface BVH, the same one LOTBCBP collision uses) is the reference:
    # density comes from it, every new vertex is projected onto it, the result is measured against it.
    ref = work.copy()
    ref.calc_loop_triangles()
    bvh = ref_bvh if ref_bvh is not None else BVHTree.FromBMesh(ref, epsilon=0.0)
    Vr, Fr = bm_arrays(ref)
    st, auto_info = resolve_auto(st, Vr, (Vr, Fr))
    rep["auto"] = auto_info
    ax = AXES[st.axis]
    tol = st.sym_tolerance * diag
    an = analyse(Vr, Fr, st.crease_angle, st.sharp_angle, st.band_rings, threshold_mode=st.threshold_mode,
                 manual_threshold=st.manual_threshold)
    if density_samples is not None:
        an.virt_pts, an.virt_dens = density_samples
    rep["analysis"] = {"counts": an.counts, "small_faces": an.info["small_faces"], "threshold": an.threshold,
                       "regions": an.info["regions"], "nonmanifold_edges": an.nonmanifold_edges}
    if st.use_symmetry:
        rep["source_symmetry"] = source_symmetry(Vr, st.axis, st.sym_tolerance)

    method = st.method
    q_in = an.counts["faces"]
    base = sum((len(f.verts) - 2) / 2.0 for f in work.faces)      # quad-equivalents of the input
    res = min(max(float(st.resolution), 0.01), 12.0)
    target = st.target_faces if st.target_faces > 0 else (int(round(res * base)) if abs(res - 1.0) > 1e-6 else 0)
    rep["base_faces"] = base
    rep["predicted_faces"] = target or None
    if method == "AUTO":
        method = "JOIN_SPLIT"
        if target and quadriflow_fn:
            trial = work.copy()
            join_to_quads(trial, st.join_angle, st.join_shape)
            nat = len(trial.faces) * (4 if any(len(f.verts) != 4 for f in trial.faces) else 1)
            trial.free()
            best = min((nat * 4 ** k for k in range(st.max_levels + 1)), key=lambda c: abs(math.log(c / target)))
            if not (0.8 <= best / target <= 1.25):
                method = "QUADRIFLOW"
    rep["method"] = method

    if method == "QUADRIFLOW" and quadriflow_fn is not None:
        out = quadriflow_fn(work, target or max(q_in // 2, 16), st)
        if out is not None:
            _project_all(out, bvh, an, st, ref_kind=None, pin_sharp=False, symmetric=False, ax=ax)
            rep["output"] = bm_report(out)
            rep["output"]["quadriflow"] = True
            rep["quality"] = final_quality(out, bvh, ref_sample_V if ref_sample_V is not None else Vr, st, ax)
            _finish_data(out, ref, bvh, st, rep)
            if M_inv is not None:
                out.transform(M_inv); out.normal_update()
            ref.free(); work.free()
            return out, rep
        rep["quadriflow_failed"] = True

    # ---- JOIN_SPLIT (symmetric-safe: quadrangulate a half, mirror) ----
    bm = work
    half = False
    if st.use_symmetry:
        n = [0.0, 0.0, 0.0]
        n[ax] = 1.0
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=tol, plane_co=(0, 0, 0), plane_no=n, use_snap_center=True,
                               clear_inner=st.keep_positive_side is True, clear_outer=st.keep_positive_side is False)
        # drop anything left stranded
        for v in bm.verts:
            if abs(v.co[ax]) <= tol:
                v.co[ax] = 0.0
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        half = True
    join_to_quads(bm, st.join_angle, st.join_shape)
    nonquad = sum(1 for f in bm.faces if len(f.verts) != 4)
    rep["after_join"] = {"nonquad": nonquad, "faces": len(bm.faces)}
    # density target: raise by whole x4 levels when the requested count is far above the current one
    levels = 0
    if target:
        cur = len(bm.faces) * (2 if half else 1)
        if nonquad:
            cur *= 4
        while levels < st.max_levels and cur * 4 <= target * 1.25 and cur < target:
            cur *= 4
            levels += 1
    if nonquad or levels:
        simple_split_all(bm)
        for _ in range(max(levels - (1 if nonquad else 0), 0)):
            simple_split_all(bm)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    _project_all(bm, bvh, an, st, ref_kind="ref", pin_sharp=st.preserve_sharp, symmetric=half, ax=ax,
                 ref_arrays=(Vr, an))
    # automatic refinement: regions whose deviation from the projection is above tolerance attract more vertices
    passes = 0
    while st.auto and passes < st.refine_passes and len(bm.faces):
        fd, vd = face_deviation(bm, bvh)
        if fd.max() <= st.deviation_tol * diag:
            break
        extra = np.clip(vd / (st.deviation_tol * diag), 0.0, 1.0)
        _project_all(bm, bvh, an, st, ref_kind="ref", pin_sharp=st.preserve_sharp, symmetric=half, ax=ax,
                     ref_arrays=(Vr, an), extra_density=extra)
        passes += 1
    bad_before = len(quad_quality(bm)[0]) if st.auto else 0
    if st.auto:
        smooth_bad_quads(bm, bvh, st, half, ax)
    if half:
        _mirror_half(bm, ax, tol)
    rep["output"] = bm_report(bm)
    q = final_quality(bm, bvh, ref_sample_V if ref_sample_V is not None else Vr, st, ax)
    q["refine_passes_used"] = passes
    q["bad_quads_before_fix"] = bad_before
    rep["quality"] = q
    if st.recalc_after and len(bm.faces):
        Vo, Fo = bm_arrays(bm)
        lo, so, zo = pack_faces(Fo)
        flip, oi = orient_outward(Vo, lo, so, zo)
        bm.faces.ensure_lookup_table()
        if flip.any():
            bmesh.ops.reverse_faces(bm, faces=[bm.faces[i] for i in np.nonzero(flip)[0]])
        rep["normals_after"] = oi
    _finish_data(bm, ref, bvh, st, rep)
    if M_inv is not None:
        bm.transform(M_inv); bm.normal_update()
    ref.free()
    return bm, rep


# ---- data transfer by projection (UVs, colours, attributes, flags) ----------------------------------------------

def closest_bary(P, A, B, C):
    """Vectorised closest point on triangles ABC to points P: returns (bary (n,3), distance (n,)). (Ericson)"""
    ab, ac, ap = B - A, C - A, P - A
    d1 = (ab * ap).sum(1); d2 = (ac * ap).sum(1)
    bp = P - B
    d3 = (ab * bp).sum(1); d4 = (ac * bp).sum(1)
    cp = P - C
    d5 = (ab * cp).sum(1); d6 = (ac * cp).sum(1)
    vc = d1 * d4 - d3 * d2
    vb = d5 * d2 - d1 * d6
    va = d3 * d6 - d5 * d4
    n = len(P)
    bary = np.zeros((n, 3))
    den = np.maximum(va + vb + vc, 1e-300)
    inside = (va >= 0) & (vb >= 0) & (vc >= 0)
    bary[inside] = np.stack([va / den, vb / den, vc / den], 1)[inside]
    done = inside.copy()

    def put(mask, b):
        nonlocal done
        m = mask & ~done
        bary[m] = b[m]
        done |= m
    one = np.ones(n); zero = np.zeros(n)
    put((d1 <= 0) & (d2 <= 0), np.stack([one, zero, zero], 1))
    put((d3 >= 0) & (d4 <= d3), np.stack([zero, one, zero], 1))
    put((d6 >= 0) & (d5 <= d6), np.stack([zero, zero, one], 1))
    t = d1 / np.maximum(d1 - d3, 1e-300)
    put((vc <= 0) & (d1 >= 0) & (d3 <= 0), np.stack([1 - t, t, zero], 1))
    t = d2 / np.maximum(d2 - d6, 1e-300)
    put((vb <= 0) & (d2 >= 0) & (d6 <= 0), np.stack([1 - t, zero, t], 1))
    t = (d4 - d3) / np.maximum((d4 - d3) + (d5 - d6), 1e-300)
    put((va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0), np.stack([zero, 1 - t, t], 1))
    # remaining numerical leftovers: clamp-normalise
    rest = ~done
    if rest.any():
        b = np.clip(np.stack([va, vb, vc], 1), 0, None)
        b /= np.maximum(b.sum(1, keepdims=True), 1e-300)
        bary[rest] = b[rest]
    q = bary[:, 0:1] * A + bary[:, 1:2] * B + bary[:, 2:3] * C
    return bary, np.linalg.norm(P - q, axis=1)


def project_to_faces(P, face_of_point, fstart, fsize, loop_co):
    """For points P assigned to faces (index array), find the closest point on that face's fan triangulation.
    Returns (src_loop_idx (n,3) as global loop indices, bary (n,3))."""
    k = fsize[face_of_point] - 2
    k = np.maximum(k, 1)
    rep = np.repeat(np.arange(len(P)), k)
    off = np.arange(len(rep)) - np.repeat(np.cumsum(k) - k, k)
    f = face_of_point[rep]
    l0 = fstart[f]
    l1 = l0 + off + 1
    l2 = l0 + off + 2
    l2 = np.minimum(l2, l0 + fsize[f] - 1)
    bary, dist = closest_bary(P[rep], loop_co[l0], loop_co[l1], loop_co[l2])
    # best triangle per point
    order = np.lexsort((dist, rep))
    first = np.r_[True, rep[order][1:] != rep[order][:-1]]
    sel = order[first]
    return np.stack([l0[sel], l1[sel], l2[sel]], 1), bary[sel]


def _layer_kinds(bm_layers_owner):
    kinds = []
    for kind in ("uv", "color", "float_color", "float", "int", "float_vector"):
        coll = getattr(bm_layers_owner, kind, None)
        if coll is None:
            continue
        try:
            for lay in coll:
                kinds.append((kind, lay.name))
        except Exception:
            pass
    return kinds


def _get(elem, layer, kind):
    v = elem[layer]
    if kind == "uv":
        return np.array(v.uv[:], dtype=np.float64)
    if kind in ("color", "float_color", "float_vector"):
        return np.array(list(v), dtype=np.float64)
    return np.array([float(v)])


def _set(elem, layer, kind, val):
    if kind == "uv":
        elem[layer].uv = (float(val[0]), float(val[1]))
    elif kind in ("color", "float_color", "float_vector"):
        elem[layer] = tuple(float(x) for x in val)
    elif kind == "int":
        elem[layer] = int(round(val[0]))
    else:
        elem[layer] = float(val[0])


def transfer_data(out_bm, ref_bm, bvh, uv_mode="KEEP", report=None):
    """Transfer UV maps, colour attributes, generic loop/point/face attributes, material index, smooth flag and
    seam/sharp edge flags from `ref_bm` (the projection reference; `bvh` is the BVH of that same mesh, reused from the
    remesh projection) to `out_bm` by projection.
    UV islands: every new face is assigned to the SOURCE FACE nearest its centre and all its loops are projected
    onto that face only, so nothing is interpolated across a seam; UDIM tiles are kept because the source face's UVs
    are interpolated as they are.  Interpolated: float / vector / colour / UV; nearest: int / bool / material.
    Speed: the maths is vectorised; the BVH queries and the layer read/write use Python loops, so this is meant
    for the accurate (bmesh) path, not millions of faces."""
    import mathutils
    rep = report if report is not None else {}
    ref_bm.faces.ensure_lookup_table(); out_bm.faces.ensure_lookup_table()
    ref_bm.verts.ensure_lookup_table(); out_bm.verts.ensure_lookup_table()
    if not len(ref_bm.faces) or not len(out_bm.faces):
        return rep
    # create every destination layer first: adding a layer invalidates existing BMLoop/BMVert wrappers
    for owner_ref, owner_out in ((ref_bm.loops, out_bm.loops), (ref_bm.verts, out_bm.verts), (ref_bm.faces, out_bm.faces)):
        for kind, name in _layer_kinds(owner_ref.layers):
            coll = getattr(owner_out.layers, kind)
            if coll.get(name) is None:
                coll.new(name)
    if ref_bm.verts.layers.deform.active is not None:
        out_bm.verts.layers.deform.verify()
    out_bm.faces.ensure_lookup_table(); out_bm.verts.ensure_lookup_table()
    # --- source arrays
    rf = ref_bm.faces
    rsize = np.array([len(f.verts) for f in rf], dtype=np.int64)
    rstart = np.concatenate([[0], np.cumsum(rsize)[:-1]])
    r_loops = [l for f in rf for l in f.loops]
    r_co = np.array([l.vert.co[:] for l in r_loops], dtype=np.float64)
    r_vert = np.array([l.vert.index for l in r_loops], dtype=np.int64)
    # --- out arrays
    of = out_bm.faces
    osize = np.array([len(f.verts) for f in of], dtype=np.int64)
    ostart = np.concatenate([[0], np.cumsum(osize)[:-1]])
    o_loops = [l for f in of for l in f.loops]
    o_co = np.array([l.vert.co[:] for l in o_loops], dtype=np.float64)
    o_face = np.repeat(np.arange(len(of)), osize)
    # --- step 1: nearest source face per new face centre (reuses the projection BVH)
    sf = np.empty(len(of), dtype=np.int64)
    for i, f in enumerate(of):
        hit = bvh.find_nearest(f.calc_center_median())
        sf[i] = hit[2] if hit and hit[2] is not None else 0
    # --- step 2: loops projected onto the assigned face
    lsrc, lb = project_to_faces(o_co, sf[o_face], rstart, rsize, r_co)
    # --- loop layers
    uvs_found = [n for k, n in _layer_kinds(ref_bm.loops.layers) if k == "uv"]
    rep["uv_maps_found"] = len(uvs_found)
    rep["uv_maps_transferred"] = 0
    rep["uv_max_deviation"] = 0.0
    do_loops = uv_mode in ("KEEP", "KEEP_NEW")
    transferred_other = []
    if do_loops:
        for kind, name in _layer_kinds(ref_bm.loops.layers):
            try:
                sl = getattr(ref_bm.loops.layers, kind)[name]
                coll = getattr(out_bm.loops.layers, kind)
                dl = coll.get(name) or coll.new(name)
                vals = np.array([_get(l, sl, kind) for l in r_loops])
                if kind == "int":
                    idx = lsrc[np.arange(len(lsrc)), lb.argmax(1)]
                    nv_ = vals[idx]
                else:
                    nv_ = (vals[lsrc] * lb[:, :, None]).sum(1)
                for l, v in zip(o_loops, nv_):
                    _set(l, dl, kind, v)
                if kind == "uv":
                    rep["uv_maps_transferred"] += 1
                    # consistency: mean of a new face's UVs vs the source UV at the nearest point of its centre
                    cen = np.array([f.calc_center_median()[:] for f in of])
                    cs, cb = project_to_faces(cen, sf, rstart, rsize, r_co)
                    ref_uv = (vals[cs] * cb[:, :, None]).sum(1)
                    new_uv = np.array([nv_[ostart[i]:ostart[i] + osize[i]].mean(0) for i in range(len(of))])
                    rep["uv_max_deviation"] = max(rep["uv_max_deviation"], float(np.abs(new_uv - ref_uv).max()))
                else:
                    transferred_other.append(name)
            except Exception as e:
                rep.setdefault("skipped", []).append("loop:%s (%s)" % (name, e))
    # --- point layers (colours, floats, vector, ints) by projection of each vertex
    ovs = out_bm.verts
    ov_co = np.array([v.co[:] for v in ovs], dtype=np.float64)
    vsf = np.empty(len(ovs), dtype=np.int64)
    for i, v in enumerate(ovs):
        hit = bvh.find_nearest(v.co)
        vsf[i] = hit[2] if hit and hit[2] is not None else 0
    vsrc, vb = project_to_faces(ov_co, vsf, rstart, rsize, r_co)
    src_vi = r_vert[vsrc]                              # (n,3) source vertex indices
    for kind, name in _layer_kinds(ref_bm.verts.layers):
        try:
            sl = getattr(ref_bm.verts.layers, kind)[name]
            coll = getattr(out_bm.verts.layers, kind)
            dl = coll.get(name) or coll.new(name)
            vals = np.array([_get(v, sl, kind) for v in ref_bm.verts])
            nv_ = vals[src_vi[np.arange(len(vsrc)), vb.argmax(1)]] if kind == "int" else (vals[src_vi] * vb[:, :, None]).sum(1)
            for v, val in zip(ovs, nv_):
                _set(v, dl, kind, val)
            transferred_other.append("point:" + name)
        except Exception as e:
            rep.setdefault("skipped", []).append("point:%s (%s)" % (name, e))
    # vertex groups: interpolate weights of the source triangle's three vertices
    dsrc = ref_bm.verts.layers.deform.active
    if dsrc is not None:
        ddst = out_bm.verts.layers.deform.verify()
        for i, v in enumerate(ovs):
            acc = {}
            for j in range(3):
                for g, w in ref_bm.verts[int(src_vi[i, j])][dsrc].items():
                    acc[g] = acc.get(g, 0.0) + w * vb[i, j]
            v[ddst].clear()
            for g, w in acc.items():
                if w > 1e-6:
                    v[ddst][g] = float(w)
        transferred_other.append("vertex_groups")
    # --- faces: material index, smooth, face layers (nearest source face)
    for i, f in enumerate(of):
        s = rf[int(sf[i])]
        f.material_index = s.material_index
        f.smooth = s.smooth
    for kind, name in _layer_kinds(ref_bm.faces.layers):
        if kind in ("uv",):
            continue
        try:
            sl = getattr(ref_bm.faces.layers, kind)[name]
            coll = getattr(out_bm.faces.layers, kind)
            dl = coll.get(name) or coll.new(name)
            for i, f in enumerate(of):
                f[dl] = rf[int(sf[i])][sl]
            transferred_other.append("face:" + name)
        except Exception as e:
            rep.setdefault("skipped", []).append("face:%s (%s)" % (name, e))
    # --- edge flags: seam / sharp(smooth) / crease by nearest edge of the nearest source face
    has_flags = any(e.seam or not e.smooth for e in ref_bm.edges)
    if has_flags:
        for e in out_bm.edges:
            m = (e.verts[0].co + e.verts[1].co) * 0.5
            hit = bvh.find_nearest(m)
            if not hit or hit[2] is None:
                continue
            best, bd = None, 1e30
            for se in rf[hit[2]].edges:
                a, b = se.verts[0].co, se.verts[1].co
                ab = b - a
                t = max(0.0, min(1.0, (m - a).dot(ab) / max(ab.length_squared, 1e-30)))
                d = (a + ab * t - m).length
                if d < bd:
                    bd, best = d, se
            if best is not None and bd < 0.25 * max(best.calc_length(), 1e-12):
                e.seam = best.seam
                e.smooth = best.smooth
        transferred_other.append("edge_flags")
    rep["transferred"] = transferred_other
    return rep


def _finish_data(out, ref, bvh, st, rep):
    """UV / attribute transfer by projection (reuses the remesh BVH)."""
    if st.uv_mode == "SKIP":
        for lay in list(out.loops.layers.uv):
            out.loops.layers.uv.remove(lay)
        rep["transfer"] = {"uv_maps_found": 0, "uv_maps_transferred": 0, "skipped_by_user": True}
        return
    rep["transfer"] = transfer_data(out, ref, bvh, "KEEP" if st.uv_mode in ("KEEP", "KEEP_NEW") else "NONE", {})


def _mirror_half(bm, ax, tol):
    import bmesh
    from mathutils import Matrix
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.mirror(bm, geom=geom, matrix=Matrix.Identity(4), merge_dist=max(tol, 1e-7), axis='XYZ'[ax])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def _project_all(bm, bvh, an, st, ref_kind, pin_sharp, symmetric, ax, ref_arrays=None, extra_density=None):
    """Density relaxation + projection onto the source surface (projection step against the object's own collision-body projection)."""
    import mathutils
    bm.verts.ensure_lookup_table()
    V, faces = bm_arrays(bm)
    if not len(V):
        return
    E = np.array([[e.verts[0].index, e.verts[1].index] for e in bm.edges], dtype=np.int64).reshape(-1, 2)

    def project(P):
        out = P.copy()
        for i in range(len(P)):
            loc = bvh.find_nearest(mathutils.Vector(P[i]))
            if loc is not None and loc[0] is not None:
                out[i] = loc[0][:]
        return out
    pinned = _pinned_mask(bm, st, pin_sharp, symmetric, ax)
    if ref_arrays is not None:
        Vr, anr = ref_arrays
        vp = anr.virt_pts if anr.virt_pts is not None else np.zeros((0, 3))
        tree = mathutils.kdtree.KDTree(len(Vr) + len(vp))
        for i, p in enumerate(Vr):
            tree.insert(p, i)
        for j, p in enumerate(vp):
            tree.insert(p, len(Vr) + j)
        tree.balance()
        dens = np.concatenate([anr.density_v, anr.virt_dens if len(vp) else np.zeros(0)])

        def density_fn(P):
            d = np.array([dens[tree.find(mathutils.Vector(p))[1]] for p in P])
            return d if extra_density is None else np.maximum(d, extra_density)
    else:
        density_fn = None
    if st.crease_density > 0 and density_fn is not None and st.relax_iterations > 0:
        P = relax_density(V, E, density_fn, pinned, st.relax_iterations, st.crease_density, 0.55, project,
                          plane_axis=ax if symmetric else None)
    else:
        P = project(V)
        P = np.where(pinned[:, None], V, P)
        if symmetric:
            P[np.abs(V[:, ax]) < 1e-9, ax] = 0.0
    for v, p in zip(bm.verts, P):
        v.co = p
    bm.normal_update()


def face_density_probe(out_V, out_faces, src_V, src_faces, src_density, band=0.6, flat=0.3):
    """Faces per unit source area in crease bands vs flat zones (numpy, nearest-vertex lookup). For tests/report."""
    _, _, sizes = pack_faces(src_faces)
    sl, ss, sz = pack_faces(src_faces)
    _, sarea, scen = face_geometry(src_V, sl, ss, sz)
    ol, os_, oz = pack_faces(out_faces)
    _, oarea, ocen = face_geometry(out_V, ol, os_, oz)
    sd_face = np.zeros(len(sz))
    np.add.at(sd_face, _loop_face_index(sz), src_density[sl])
    sd_face /= sz
    idx = nearest_index(ocen, scen)
    od_face = sd_face[idx]
    return band_density_ratio(ocen, scen, sarea, sd_face, od_face, band, flat)
