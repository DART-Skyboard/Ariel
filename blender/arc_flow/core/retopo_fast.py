"""Projection Remesh - fast path for very large meshes (NumPy only; Blender glue lives in retopo_ops.py).

Two modes, chosen from the mesh size and the Resolution multiplier:
  PAIR    (Resolution about 1): vectorised mutual-best triangle pairing -> quads, vertices are the SOURCE vertices (no
          new surface points, so nothing needs projecting), density-weighted tangent relaxation of crease vertices,
          every corner/point/face/edge attribute carried over by index maps (UVs exact, UDIM-safe).
  REDUCE  (target <= ~300k faces): vertex-clustering decimation to a working mesh, then the accurate bmesh pipeline
          (exact symmetry, density from the FULL-resolution analysis, projection onto the ORIGINAL surface).

LIMITS (honest): PAIR leaves the triangles it cannot pair (typically a few percent) and its topology is symmetric
only if the source triangulation is (the mirror plane is detected and reported, positions are not forced);
the exact half-mesh mirror needs the accurate path / REDUCE mode.  Clustering decimation is crude (it relies on the
projection back onto the original surface for shape)."""
import math

import numpy as np

from . import retopo as R


def pair_triangles(V, loops, start, size, an, join_angle=math.radians(40.0), shape_angle=math.radians(60.0),
                   material=None, protect_sharp=True, rounds=10, corner_uvs=()):
    """Vectorised triangle -> quad pairing.  Returns dict with out_loops (vertex ids), out_size, loop_src (source loop
    index per output loop), face_src (source face per output face), n_pairs."""
    nf = len(size)
    E, ef, cnt, el = an.edges, an.edge_faces, an.edge_count, an.edge_loops
    tri = size == 3
    man = (cnt == 2) & (ef[:, 0] >= 0) & (ef[:, 1] >= 0) & (el[:, 1] >= 0)
    cand = man.copy()
    cand &= tri[np.maximum(ef[:, 0], 0)] & tri[np.maximum(ef[:, 1], 0)]
    cand &= an.dihedral < join_angle
    if protect_sharp:
        cand &= ~an.sharp_edge
    if material is not None:
        cand &= material[np.maximum(ef[:, 0], 0)] == material[np.maximum(ef[:, 1], 0)]
    ei = np.nonzero(cand)[0]
    la, lb = el[ei, 0], el[ei, 1]
    fa, fb = ef[ei, 0], ef[ei, 1]
    ok = loops[la] != loops[lb]                       # opposite direction = consistently oriented
    ei, la, lb, fa, fb = ei[ok], la[ok], lb[ok], fa[ok], fb[ok]

    def nxt0(l, f, k=1):
        return start[f] + (l - start[f] + k) % 3
    # never join across a UV seam / island border: shared-edge corner UVs must agree in every UV map
    for uvc in corner_uvs:
        same_uv = (np.abs(uvc[la] - uvc[nxt0(lb, fb)]).max(1) < 1e-6) & (np.abs(uvc[nxt0(la, fa)] - uvc[lb]).max(1) < 1e-6)
        ei, la, lb, fa, fb = ei[same_uv], la[same_uv], lb[same_uv], fa[same_uv], fb[same_uv]

    def nxt(l, f, k=1):
        return start[f] + (l - start[f] + k) % 3
    l_b = nxt(la, fa); l_c = nxt(la, fa, 2); l_d = nxt(lb, fb, 2)
    a, b, c, d = loops[la], loops[l_b], loops[l_c], loops[l_d]
    # quad (b, c, a, d): corner angles
    Q = np.stack([V[b], V[c], V[a], V[d]], 1)                      # (m,4,3)
    prv = np.roll(Q, 1, axis=1) - Q
    nx = np.roll(Q, -1, axis=1) - Q
    cosv = (prv * nx).sum(2) / np.maximum(np.linalg.norm(prv, axis=2) * np.linalg.norm(nx, axis=2), 1e-300)
    ang = np.arccos(np.clip(cosv, -1, 1))
    dev = np.abs(ang - math.pi / 2).max(1)
    good = dev <= shape_angle
    ei, la, lb, fa, fb, l_b, l_c, l_d, dev = (x[good] for x in (ei, la, lb, fa, fb, l_b, l_c, l_d, dev))
    score = 1.0 - dev / (math.pi / 2) - np.arange(len(ei)) * 1e-12
    matched = np.zeros(nf, dtype=bool)
    chosen = []
    for _ in range(rounds):
        live = ~matched[fa] & ~matched[fb]
        if not live.any():
            break
        idx = np.nonzero(live)[0]
        # Karp-Sipser flavour: prefer edges that touch faces with few remaining options (avoids stranding triangles)
        deg = np.bincount(np.concatenate([fa[idx], fb[idx]]), minlength=nf)
        sc = score[idx] - 0.5 * (np.minimum(deg[fa[idx]], 6) + np.minimum(deg[fb[idx]], 6))
        best = np.full(nf, -np.inf)
        np.maximum.at(best, fa[idx], sc)
        np.maximum.at(best, fb[idx], sc)
        mutual = (sc >= best[fa[idx]]) & (sc >= best[fb[idx]])
        sel = idx[mutual]
        if not len(sel):
            break
        keep = np.zeros(len(sel), dtype=bool)
        seen = np.zeros(nf, dtype=bool)
        for k in np.argsort(-sc[mutual], kind="stable") if len(sel) < 5000 else []:
            if not seen[fa[sel[k]]] and not seen[fb[sel[k]]]:
                keep[k] = True; seen[fa[sel[k]]] = seen[fb[sel[k]]] = True
        if len(sel) >= 5000:                                   # vectorised conflict removal for big rounds
            used = np.concatenate([fa[sel], fb[sel]])
            cnt_u = np.bincount(used, minlength=nf)
            keep = (cnt_u[fa[sel]] == 1) & (cnt_u[fb[sel]] == 1)
        sel = sel[keep]
        matched[fa[sel]] = True; matched[fb[sel]] = True
        chosen.append(sel)
    sel = np.concatenate(chosen) if chosen else np.zeros(0, dtype=np.int64)
    # augmenting rounds: an unmatched tri t next to matched g (partner w) takes g, and w re-pairs with an unmatched x
    partner_edge = -np.ones(nf, dtype=np.int64)
    partner_edge[fa[sel]] = sel; partner_edge[fb[sel]] = sel
    for _ in range(16):
        um = ~matched
        fa_um, fb_um = um[fa], um[fb]
        e1 = np.nonzero(fa_um ^ fb_um)[0]                      # edges between an unmatched and a matched face
        if not len(e1):
            break
        f = np.where(fa_um[e1], fa[e1], fb[e1])                # unmatched
        g = np.where(fa_um[e1], fb[e1], fa[e1])                # matched
        # alt[w] = (edge, x): a matched face w with an unmatched neighbour x
        alt_e = -np.ones(nf, dtype=np.int64); alt_x = -np.ones(nf, dtype=np.int64)
        alt_e[g[::-1]] = e1[::-1]; alt_x[g[::-1]] = f[::-1]
        pe = partner_edge[g]
        w = np.where(fa[pe] == g, fb[pe], fa[pe])
        x = alt_x[w]; e2 = alt_e[w]
        ok2 = (x >= 0) & (x != f)
        e1, f, g, w, x, e2, pe = e1[ok2], f[ok2], g[ok2], w[ok2], x[ok2], e2[ok2], pe[ok2]
        if not len(e1):
            break
        # keep only non-conflicting (all of f,g,w,x distinct across chosen moves)
        ids = np.stack([f, g, w, x], 1)
        flat = ids.ravel()
        cnt_u = np.bincount(flat, minlength=nf)
        okc = (cnt_u[ids] == 1).all(1)
        e1, f, g, w, x, e2, pe = e1[okc], f[okc], g[okc], w[okc], x[okc], e2[okc], pe[okc]
        if not len(e1):
            break
        matched[f] = True; matched[x] = True
        partner_edge[f] = e1; partner_edge[g] = e1; partner_edge[w] = e2; partner_edge[x] = e2
    sel = np.unique(partner_edge[partner_edge >= 0])
    matched = np.zeros(nf, dtype=bool)
    matched[fa[sel]] = True; matched[fb[sel]] = True
    # build output
    keep_f = np.nonzero(~matched)[0]
    ksz = size[keep_f]
    kst = start[keep_f]
    kl = np.repeat(kst, ksz) + (np.arange(int(ksz.sum())) - np.repeat(np.cumsum(ksz) - ksz, ksz))
    q_src = np.stack([l_b[sel], l_c[sel], la[sel], l_d[sel]], 1)    # source loops in quad order (b,c,a,d)
    out_src = np.concatenate([kl, q_src.ravel()])
    out_size = np.concatenate([ksz, np.full(len(sel), 4, dtype=ksz.dtype)])
    face_src = np.concatenate([keep_f, fa[sel]])
    return {"out_loops": loops[out_src], "out_size": out_size, "loop_src": out_src, "face_src": face_src,
            "n_pairs": int(len(sel)), "candidates": int(len(ei))}


def relax_active(V, vn, out_edges, density, pinned, iters=8, gain=6.0, lam=0.5, max_frac=0.5):
    """Density-weighted tangent relaxation on the vertices with density > 0.02 only (vectorised, bincount scatter).
    Moves are constrained to the original tangent plane (normal component removed) and limited to max_frac of the
    mean incident edge length, so the surface deviation stays small without any per-vertex BVH query."""
    P = V.copy()
    n = len(P)
    active = (density > 0.02) & ~pinned
    if not active.any():
        return P, 0
    a = np.concatenate([out_edges[:, 0], out_edges[:, 1]])
    b = np.concatenate([out_edges[:, 1], out_edges[:, 0]])
    sel = active[a]
    a, b = a[sel], b[sel]
    elen = np.linalg.norm(P[a] - P[b], axis=1)
    mlen = R._bc(a, elen, n) / np.maximum(R._bc(a, np.ones(len(a)), n), 1)
    for _ in range(int(iters)):
        w = 1.0 + gain * density
        ws = R._bc(a, w[b], n)
        tgt = np.stack([R._bc(a, w[b] * P[b, k], n) for k in range(3)], 1) / np.maximum(ws, 1e-12)[:, None]
        dlt = lam * (tgt - P)
        dlt -= (dlt * vn).sum(1)[:, None] * vn
        step = np.linalg.norm(dlt, axis=1)
        cap = max_frac * mlen
        sc = np.where(step > cap, cap / np.maximum(step, 1e-300), 1.0)
        P = np.where(active[:, None], P + dlt * sc[:, None], P)
    return P, int(active.sum())


def cluster_decimate(V, loops, size, target_tris, bbox_pad=1e-6):
    """Vertex-clustering decimation of a (triangulated or polygon) mesh to about target_tris triangles (vectorised).
    Returns (Vc (m,3), tris (t,3) int64).  Cell size is searched on a log scale."""
    V = np.asarray(V, dtype=np.float64)
    lo, hi = V.min(0), V.max(0)
    ext = np.maximum(hi - lo, 1e-12)
    # fan-triangulate
    fi = R._loop_face_index(size)
    start = np.concatenate([[0], np.cumsum(size)[:-1]])
    t_f, t_k = [], []
    for k in range(0, int(size.max()) - 2):
        m = np.nonzero(size > k + 2)[0]
        t_f.append(m); t_k.append(np.full(len(m), k))
    tf = np.concatenate(t_f); tk = np.concatenate(t_k)
    tris = np.stack([loops[start[tf]], loops[start[tf] + tk + 1], loops[start[tf] + tk + 2]], 1)
    best = None
    h_hi = float(ext.max()); h_lo = h_hi / 4096.0
    for _ in range(14):
        h = math.sqrt(h_lo * h_hi)
        key = np.floor((V - lo) / h).astype(np.int64)
        dims = np.floor(ext / h).astype(np.int64) + 2
        lin = (key[:, 0] * dims[1] + key[:, 1]) * dims[2] + key[:, 2]
        uniq, inv = np.unique(lin, return_inverse=True)
        t = inv[tris]
        okt = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
        nt = int(okt.sum())
        best = (h, inv, uniq, t[okt])
        if nt > target_tris:
            h_lo = h
        else:
            h_hi = h
        if abs(nt - target_tris) < 0.05 * target_tris:
            break
    h, inv, uniq, t = best
    # unique faces (orientation kept), drop duplicates
    ts = np.sort(t, axis=1)
    _, first = np.unique(ts, axis=0, return_index=True)
    t = t[np.sort(first)]
    used = np.unique(t)
    remap = -np.ones(len(uniq), dtype=np.int64)
    remap[used] = np.arange(len(used))
    cnt = np.bincount(inv, minlength=len(uniq)).astype(np.float64)
    Vc = np.stack([np.bincount(inv, weights=V[:, k], minlength=len(uniq)) for k in range(3)], 1) / np.maximum(cnt, 1)[:, None]
    return Vc[used], remap[t]
