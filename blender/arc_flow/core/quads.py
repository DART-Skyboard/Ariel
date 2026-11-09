"""Quad-first mesh preparation for LOTBCBP (pure NumPy, no bpy).

Used by the collision-field path (PartField) and shared with the Blender "Convert to Quads" operator for
analysis.  Topology-preserving: triangles are joined in pairs, n-gons are split into strips of quads, and only
leftover triangles are split (centroid + edge midpoints -> 3 quads).  Nothing is remeshed onto a uniform grid,
so dense source regions stay dense and broad regions keep their large faces.

Quads are stored so that corners 0-2 are the original shared diagonal; triangulating a quad along 0-2 therefore
reproduces the source surface exactly (the base signed-distance field does not drift)."""
import numpy as np


# ----------------------------------------------------------------------------- face input helpers
def as_polys(faces):
    """faces: (F,k) int array, list of index sequences, or (counts, flat_indices) -> list of int arrays."""
    if isinstance(faces, tuple) and len(faces) == 2 and np.ndim(faces[0]) == 1 and np.ndim(faces[1]) == 1 \
            and len(faces[1]) == int(np.sum(faces[0])):
        counts, flat = np.asarray(faces[0], np.int64), np.asarray(faces[1], np.int64)
        return np.split(flat, np.cumsum(counts)[:-1]) if len(counts) else []
    if isinstance(faces, np.ndarray) and faces.ndim == 2:
        return list(faces.astype(np.int64))
    return [np.asarray(f, np.int64) for f in faces]


def fan_tris(polys):
    out = []
    for p in polys:
        for k in range(1, len(p) - 1):
            out.append((p[0], p[k], p[k + 1]))
    return np.array(out, np.int64).reshape(-1, 3)


def _edge_lengths(verts, polys):
    a = np.concatenate([p for p in polys]) if polys else np.zeros(0, np.int64)
    b = np.concatenate([np.roll(p, -1) for p in polys]) if polys else np.zeros(0, np.int64)
    return a, b, np.linalg.norm(verts[a] - verts[b], axis=1)


# ----------------------------------------------------------------------------- cleaning
def clean(verts, faces, rel_tol=0.02, abs_tol=None):
    """Merge duplicate / near-coincident vertices with a LOCAL threshold (rel_tol x the shortest real edge
    around each vertex), then drop collapsed and zero-area faces.  Real detail survives: a tight feature with
    short edges gets a proportionally tight threshold.  Returns (verts, polys, info)."""
    verts = np.asarray(verts, np.float64)
    polys = [p for p in as_polys(faces) if len(p) >= 3]
    V = len(verts)
    info = dict(merged=0, degenerate=0, slivers=0)
    if V == 0 or not polys:
        return verts, polys, info
    diag = float(np.linalg.norm(verts.max(0) - verts.min(0))) or 1.0
    eps = abs_tol if abs_tol is not None else 1e-6 * diag
    parent = np.arange(V)

    def find(x):
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r
    # 1) exact / near duplicates (unwelded seams), spatial hash at eps
    key = np.floor(verts / max(eps, 1e-12)).astype(np.int64)
    _u, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    first = {}
    for i, k in enumerate(inv.tolist()):
        if k in first:
            parent[find(i)] = find(first[k])
        else:
            first[k] = i
    # 2) edge collapse of edges much shorter than their neighbourhood (local, adaptive)
    a, b, L = _edge_lengths(verts, polys)
    nonzero = L > eps
    loc = np.full(V, np.inf)
    np.minimum.at(loc, a[nonzero], L[nonzero]); np.minimum.at(loc, b[nonzero], L[nonzero])
    med = np.zeros(V); cnt = np.zeros(V)
    np.add.at(med, a, L); np.add.at(cnt, a, 1); np.add.at(med, b, L); np.add.at(cnt, b, 1)
    med = med / np.maximum(cnt, 1)
    thr = rel_tol * np.minimum(med[a], med[b])
    for i, j in zip(a[(L <= thr) & (L > eps)].tolist(), b[(L <= thr) & (L > eps)].tolist()):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri
    roots = np.array([find(i) for i in range(V)])
    info['merged'] = int(V - len(np.unique(roots)))
    used, remap = np.unique(roots, return_inverse=True)
    nv = verts[used]
    out = []
    for p in polys:
        q = remap[roots[p]]
        keep = np.r_[q[1:] != q[:-1], q[0] != q[-1]] if len(q) > 1 else np.array([True])
        q = q[keep]
        if len(q) < 3 or len(np.unique(q)) < 3:
            info['degenerate'] += 1
            continue
        P = nv[q]
        area = 0.5 * np.linalg.norm(np.sum(np.cross(P, np.roll(P, -1, 0)), 0))
        if area <= (eps * eps):
            info['degenerate'] += 1
            continue
        if len(q) == 3:
            e = np.linalg.norm(P - np.roll(P, -1, 0), axis=1)
            if 2 * area / max(e.max(), 1e-30) < 1e-3 * e.max():
                info['slivers'] += 1             # counted, kept (dropping would open the surface)
        out.append(q)
    return nv, out, info


# ----------------------------------------------------------------------------- quadrangulation
def _corner_angles(P):
    """P (n,4,3) -> (n,4) corner angles in degrees."""
    u = np.roll(P, 1, 1) - P
    w = np.roll(P, -1, 1) - P
    c = np.sum(u * w, -1) / np.maximum(np.linalg.norm(u, axis=-1) * np.linalg.norm(w, axis=-1), 1e-30)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def _tri_normals(verts, tris):
    P = verts[tris]
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-30)


def to_quads(verts, faces, strict=True, face_angle=40.0, shape_angle=80.0, do_clean=True):
    """Any mix of triangles / quads / n-gons -> all-quad mesh.  Returns (verts, quads (Q,4), info).

    strict: leftover triangles (no good partner) are split into 3 quads with shared edge midpoints, so the
    output is quads only.  face_angle: max angle between the two triangle normals; shape_angle: max corner
    deviation from 90 degrees of the joined quad (same meaning as Blender's Tris to Quads thresholds)."""
    verts = np.asarray(verts, np.float64)
    if do_clean:
        verts, polys, info = clean(verts, faces)
    else:
        polys, info = [p for p in as_polys(faces) if len(p) >= 3], {}
    src = dict(tris=sum(1 for p in polys if len(p) == 3), quads=sum(1 for p in polys if len(p) == 4),
               ngons=sum(1 for p in polys if len(p) > 4))
    info.update(source=src)
    quads, tris = [], []
    for p in polys:
        n = len(p)
        if n == 3:
            tris.append(p)
        elif n == 4:
            quads.append(p)
        else:                                   # strip split: balanced quads across the polygon
            i, j = 0, n - 1
            while j - i >= 3:
                quads.append(np.array([p[i], p[i + 1], p[j - 1], p[j]]))
                i += 1; j -= 1
            if j - i == 2:
                tris.append(np.array([p[i], p[i + 1], p[j]]))
    tris = np.array(tris, np.int64).reshape(-1, 3)
    joined = np.zeros((0, 4), np.int64)
    if len(tris):
        fn = _tri_normals(verts, tris)
        T = len(tris)
        e = np.stack([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]], 1)          # (T,3,2)
        V = len(verts)
        lo, hi = e.min(2), e.max(2)
        key = (lo * V + hi).reshape(-1)
        order = np.argsort(key, kind='stable')
        ks = key[order]
        same = np.flatnonzero(ks[1:] == ks[:-1])
        cand = []
        for s in same:
            if s + 2 < len(ks) and ks[s + 2] == ks[s]:
                continue                                                           # non-manifold edge
            if s > 0 and ks[s - 1] == ks[s]:
                continue
            f1, k1 = divmod(int(order[s]), 3)
            f2, k2 = divmod(int(order[s + 1]), 3)
            if f1 == f2:
                continue
            cand.append((f1, k1, f2, k2))
        if cand:
            C = np.array(cand)
            f1, k1, f2, k2 = C[:, 0], C[:, 1], C[:, 2], C[:, 3]
            a = tris[f1, k1]; b = tris[f1, (k1 + 1) % 3]; c = tris[f1, (k1 + 2) % 3]
            d = tris[f2, (k2 + 2) % 3]
            ok_orient = tris[f2, k2] == b                                           # consistent winding
            Q = np.stack([a, d, b, c], 1)                                          # diagonal a-b = corners 0-2
            nang = np.degrees(np.arccos(np.clip(np.sum(fn[f1] * fn[f2], 1), -1, 1)))
            ang = _corner_angles(verts[Q])
            shape = np.abs(ang - 90.0).max(1)
            good = ok_orient & (nang <= face_angle) & (shape <= shape_angle)
            score = nang / max(face_angle, 1e-6) + shape / 90.0
            used = np.zeros(T, bool)
            take = []
            for ci in np.argsort(score):
                if not good[ci]:
                    continue
                x, y = f1[ci], f2[ci]
                if used[x] or used[y]:
                    continue
                used[x] = used[y] = True
                take.append(ci)
            joined = Q[take] if take else joined
            tris = tris[~used]
    info['joined_pairs'] = int(len(joined))
    out_q = [np.array(quads, np.int64).reshape(-1, 4), joined]
    info['split_tris'] = 0
    if strict and len(tris):
        nv = [verts]
        mid = {}
        base = len(verts)
        extra = []

        def midpoint(i, j):
            k = (min(i, j), max(i, j))
            if k not in mid:
                mid[k] = base + len(extra)
                extra.append(0.5 * (verts[i] + verts[j]))
            return mid[k]
        qs = []
        for a, b, c in tris.tolist():
            g = base + len(extra); extra.append((verts[a] + verts[b] + verts[c]) / 3.0)
            mab, mbc, mca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            qs += [(a, mab, g, mca), (b, mbc, g, mab), (c, mca, g, mbc)]
        verts = np.concatenate([verts, np.array(extra)])
        out_q.append(np.array(qs, np.int64))
        info['split_tris'] = int(len(tris))
        tris = np.zeros((0, 3), np.int64)
    quads = np.concatenate(out_q) if out_q else np.zeros((0, 4), np.int64)
    info['quads'] = int(len(quads)); info['tris_left'] = int(len(tris))
    if len(tris):
        info['leftover'] = tris
    return verts, quads, info


def quads_to_tris(quads):
    """Triangulate along corners 0-2 (the source diagonal)."""
    q = np.asarray(quads, np.int64).reshape(-1, 4)
    return np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]]) if len(q) else np.zeros((0, 3), np.int64)


def quality(verts, quads):
    """Basic quad quality: mean / worst corner-angle deviation from 90 degrees, aspect ratio."""
    if len(quads) == 0:
        return dict(n=0, angle_dev_mean=0.0, angle_dev_max=0.0, aspect_mean=0.0)
    P = np.asarray(verts)[np.asarray(quads)]
    dev = np.abs(_corner_angles(P) - 90.0)
    e = np.linalg.norm(P - np.roll(P, -1, 1), axis=-1)
    asp = e.max(1) / np.maximum(e.min(1), 1e-30)
    return dict(n=int(len(quads)), angle_dev_mean=float(dev.mean()), angle_dev_max=float(dev.max()), aspect_mean=float(asp.mean()))


def analyze(verts, faces):
    """Mesh report shared by the Analyze operator and auto-setup."""
    verts = np.asarray(verts, np.float64)
    polys = as_polys(faces)
    sizes = np.array([len(p) for p in polys]) if polys else np.zeros(0, int)
    _v, _p, cinfo = clean(verts, polys)
    tris = fan_tris(polys)
    V = len(verts)
    if len(tris):
        e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
        k = e.min(1) * V + e.max(1)
        _u, cnt = np.unique(k, return_counts=True)
        boundary, nonman = int((cnt == 1).sum()), int((cnt > 2).sum())
    else:
        boundary = nonman = 0
    qv, qq, qinfo = to_quads(verts, polys)
    return dict(verts=int(V), faces=int(len(polys)), tris=int((sizes == 3).sum()), quads=int((sizes == 4).sum()),
                ngons=int((sizes > 4).sum()), duplicate_or_short=cinfo['merged'], degenerate=cinfo['degenerate'],
                slivers=cinfo['slivers'], boundary_edges=boundary, nonmanifold_edges=nonman,
                quad_result=quality(qv, qq), quadify=dict((k, v) for k, v in qinfo.items() if k != 'leftover'))


# ----------------------------------------------------------------------------- quad soup + virtual quad tessellation
def _unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-30)


class QuadSoup:
    """Quads with per-corner vertex normals (Q,4,3), per-edge normals (Q,4,3; edge k = corner k -> k+1)
    and face normals (Q,3)."""
    __slots__ = ('P', 'vn', 'en', 'fn')

    def __init__(self, P, vn, en, fn):
        self.P, self.vn, self.en, self.fn = P, vn, en, fn

    def __len__(self):
        return len(self.P)

    def take(self, idx):
        return QuadSoup(self.P[idx], self.vn[idx], self.en[idx], self.fn[idx])

    @staticmethod
    def from_mesh(verts, quads):
        verts = np.asarray(verts, np.float64); quads = np.asarray(quads, np.int64).reshape(-1, 4)
        P = verts[quads]
        fn = _unit(np.cross(P[:, 2] - P[:, 0], P[:, 3] - P[:, 1]))
        area = 0.5 * np.linalg.norm(np.cross(P[:, 2] - P[:, 0], P[:, 3] - P[:, 1]), axis=1)
        vacc = np.zeros((len(verts), 3))
        for k in range(4):
            np.add.at(vacc, quads[:, k], fn * area[:, None])
        vn = _unit(vacc)[quads]
        V = len(verts)
        e = np.stack([quads, np.roll(quads, -1, 1)], -1)                  # (Q,4,2)
        key = (e.min(-1) * V + e.max(-1)).reshape(-1)
        u, inv = np.unique(key, return_inverse=True)
        eacc = np.zeros((len(u), 3))
        np.add.at(eacc, inv, np.repeat(fn, 4, axis=0))
        en = _unit(eacc[inv].reshape(-1, 4, 3))
        return QuadSoup(P, vn, en, fn)

    def bounds_each(self):
        return self.P.min(1), self.P.max(1)

    def to_tris(self):
        """-> (A, B, C, fn, vn, en) arrays for sdf.TriSoup (split along corners 0-2)."""
        P, vn, en, fn = self.P, self.vn, self.en, self.fn
        A = np.concatenate([P[:, 0], P[:, 0]]); B = np.concatenate([P[:, 1], P[:, 2]]); C = np.concatenate([P[:, 2], P[:, 3]])
        tvn = np.concatenate([vn[:, [0, 1, 2]], vn[:, [0, 2, 3]]])
        ten = np.concatenate([np.stack([en[:, 0], en[:, 1], fn], 1), np.stack([fn, en[:, 2], en[:, 3]], 1)])
        tf = np.cross(B - A, C - A)
        nl = np.linalg.norm(tf, axis=1)
        ff = np.concatenate([fn, fn])
        tf = np.where((nl > 1e-14)[:, None], tf / np.maximum(nl, 1e-30)[:, None], ff)
        tf = np.where((np.sum(tf * ff, 1) < 0)[:, None], -tf, tf)
        good = nl > 1e-14
        return A[good], B[good], C[good], tf[good], tvn[good], ten[good]


def subdivide_quads(qs, max_edge, cap=50000, phong=0.0, passes=8):
    """Virtual quad tessellation: every quad with an edge > max_edge is split into 4 quads (edge midpoints +
    centre).  With phong>0 new points move toward the Phong surface of the corner normals (curved low-poly
    surfaces gain real curvature).  Children inherit parent edge normals; inner edges take the face normal."""
    added = 0
    cos_smooth = np.cos(np.radians(40.0))
    for _ in range(passes):
        if len(qs) == 0:
            break
        L = np.linalg.norm(qs.P - np.roll(qs.P, -1, 1), axis=-1).max(1)
        need = L > max_edge
        n = int(need.sum())
        if n == 0:
            break
        if added + 3 * n > cap:
            room = max((cap - added) // 3, 0)
            if room == 0:
                break
            idx = np.argsort(-L)[:room]
            need = np.zeros(len(qs), bool); need[idx] = True; need &= L > max_edge
            n = int(need.sum())
        keep = qs.take(np.flatnonzero(~need))
        s = qs.take(np.flatnonzero(need))
        P, vn, en, fn = s.P, s.vn, s.en, s.fn
        P1 = np.roll(P, -1, 1); n1 = np.roll(vn, -1, 1)
        M = 0.5 * (P + P1)                                        # midpoint of edge k
        nM = _unit(vn + n1)
        Cc = P.mean(1)
        nC = _unit(vn.sum(1))
        if phong > 0.0:
            smooth = (np.sum(vn * en, -1) > cos_smooth) & (np.sum(n1 * en, -1) > cos_smooth)
            pa = M - np.sum((M - P) * vn, -1, keepdims=True) * vn
            pb = M - np.sum((M - P1) * n1, -1, keepdims=True) * n1
            M = np.where(smooth[..., None], M + phong * (0.5 * (pa + pb) - M), M)
            pc = Cc[:, None] - np.sum((Cc[:, None] - P) * vn, -1, keepdims=True) * vn
            allsm = smooth.all(1)
            Cc = np.where(allsm[:, None], Cc + phong * (pc.mean(1) - Cc), Cc)
        nM = np.where((np.sum(nM * en, -1) > 0)[..., None], nM, en)
        kids_P, kids_vn, kids_en = [], [], []
        for k in range(4):
            km = (k - 1) % 4                                   # previous edge (ends at corner k)
            kids_P.append(np.stack([P[:, k], M[:, k], Cc, M[:, km]], 1))
            kids_vn.append(np.stack([vn[:, k], nM[:, k], nC, nM[:, km]], 1))
            kids_en.append(np.stack([en[:, k], fn, fn, en[:, km]], 1))
        newP = np.concatenate(kids_P); newvn = np.concatenate(kids_vn); newen = np.concatenate(kids_en)
        newfn = np.tile(fn, (4, 1))
        qs = QuadSoup(np.concatenate([keep.P, newP]), np.concatenate([keep.vn, newvn]),
                      np.concatenate([keep.en, newen]), np.concatenate([keep.fn, newfn]))
        added += 3 * n
    return qs


def soup_to_mesh(qs, weld=1e-7):
    """QuadSoup -> welded (verts, quads) for writing back to a mesh."""
    P = qs.P.reshape(-1, 3)
    if len(P) == 0:
        return np.zeros((0, 3)), np.zeros((0, 4), np.int64)
    diag = float(np.linalg.norm(P.max(0) - P.min(0))) or 1.0
    key = np.round(P / (weld * diag)).astype(np.int64)
    _u, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return P[first], inv.reshape(-1, 4)
