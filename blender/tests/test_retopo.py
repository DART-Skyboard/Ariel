"""NumPy-only analysis tests (no bpy): python3 blender/tests/test_retopo.py"""
import math, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'arc_flow'))
from core import retopo as R

FAIL = 0


def ok(c, msg):
    global FAIL
    print(("PASS " if c else "FAIL ") + msg)
    if not c:
        FAIL += 1


def cube(n=4):
    """subdivided cube as quads, n x n per face"""
    V = {}; F = []
    def vid(p):
        k = tuple(np.round(p, 9)); V.setdefault(k, len(V)); return V[k]
    g = np.linspace(-1, 1, n + 1)
    for ax in range(3):
        for s in (-1, 1):
            for i in range(n):
                for j in range(n):
                    def P(a, b):
                        p = np.zeros(3); p[ax] = s; p[(ax + 1) % 3] = g[a]; p[(ax + 2) % 3] = g[b]; return p
                    q = [vid(P(i, j)), vid(P(i + 1, j)), vid(P(i + 1, j + 1)), vid(P(i, j + 1))]
                    F.append(q if s > 0 else q[::-1])
    Vn = np.zeros((len(V), 3))
    for k, i in V.items():
        Vn[i] = k
    return Vn, F


def test_counts():
    F = [[0, 1, 2, 3], [0, 1, 2], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]
    c = R.count_report(R.face_edge_counts(F))
    ok(c["tris"] == 1 and c["quads"] == 1 and c["odd_ngons"] == 2 and c["even_ngons"] == 1 and c["odd_total"] == 3,
       "counts tri/quad/odd/even %s" % c)
    ok(list(R.odd_face_mask(R.face_edge_counts(F))) == [False, True, True, False, True], "odd mask")


def test_cube_creases():
    V, F = cube(4)
    an = R.analyse(V, F, math.radians(25), math.radians(50))
    ok(an.counts["quad_ratio"] == 1.0 and an.nonmanifold_edges == 0 and not an.boundary_edge.any(), "cube closed quads")
    sharp = an.sharp_edge.sum()
    ok(sharp == 12 * 4, "cube has 48 sharp edge segments (got %d)" % sharp)
    on_edge = np.sum(np.sum(np.abs(V) > 0.999, axis=1) >= 2)
    ok(np.all(an.density_v[np.sum(np.abs(V) > 0.999, axis=1) >= 2] == 1.0), "crease verts density 1")
    flat_center = [i for i, v in enumerate(V) if abs(v[0]) < 1e-9 and abs(v[1]) < 1e-9 and abs(abs(v[2]) - 1) < 1e-9]
    ok(an.density_v[flat_center[0]] == 0.0 or an.density_v[flat_center[0]] < 1.0, "face centre lower than crease")


def test_otsu_split():
    rng = np.random.default_rng(1)
    small = rng.normal(np.log(0.1), 0.05, 300); large = rng.normal(np.log(1.0), 0.05, 300)
    t, sep = R.otsu_threshold(np.r_[small, large])
    ok(math.log(0.1) < t < math.log(1.0) and sep > 0.8, "otsu separates log-size populations (thr %.2f sep %.2f)" % (t, sep))
    # a mesh with a fine strip surrounded by large quads -> small mask finds the strip
    g = np.r_[np.linspace(0, 1, 9)[:-1], np.linspace(1, 1.4, 17)[:-1], np.linspace(1.4, 2.4, 9)]
    V = []; F = []
    nx = len(g)
    for j in range(nx):
        for i in range(nx):
            V.append((g[i], g[j], 0))
    for j in range(nx - 1):
        for i in range(nx - 1):
            F.append([j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i])
    an = R.analyse(np.array(V, float), F, threshold_mode='AUTO')
    sz = an.face_size
    ok(an.small_mask[sz < 0.05].mean() > 0.9 and an.small_mask[sz > 0.1].mean() < 0.1, "small/large threshold on mixed grid")
    an2 = R.analyse(np.array(V, float), F, threshold_mode='MANUAL', manual_threshold=0.5)
    ok(an2.small_mask.sum() > 0 and an2.small_mask.sum() < len(F), "manual threshold")


def test_mirror():
    V, F = cube(4)
    mx, mn, fr = R.mirror_error(V, 0, 1e-6)
    ok(mx < 1e-9 and fr == 1.0, "cube is mirror symmetric")
    V2 = V.copy(); V2[3, 0] += 0.01
    mx, mn, fr = R.mirror_error(V2, 0, 1e-6)
    ok(mx > 0.005 and fr < 1.0, "broken symmetry detected (%.4f)" % mx)


def test_relax_moves_toward_density():
    n = 21
    V = np.array([(x, 0, 0) for x in np.linspace(0, 1, n)])
    E = np.array([[i, i + 1] for i in range(n - 1)])
    dens = lambda P: np.exp(-((P[:, 0] - 0.5) ** 2) / 0.01)
    P = R.relax_density(V, E, dens, np.isin(np.arange(n), [0, n - 1]), iters=60, gain=20, lam=0.5)
    gaps = np.diff(P[:, 0])
    ok(gaps[n // 2 - 1: n // 2 + 1].mean() < 0.6 * gaps[:3].mean() and np.all(gaps > 0), "relaxation clusters verts toward density, no fold-over")


def test_edges():
    V, F = cube(2)
    l, s, z = R.pack_faces(F)
    E, ef, cnt = R.build_edges(l, s, z)
    ok(len(E) == 2 * (len(V) - 2 + 0) + 0 or len(E) - len(V) + len(F) == 2, "Euler characteristic of cube = 2")
    ok((cnt == 2).all(), "all edges manifold")


def uv_sphere(R=1.0, nu=48, nv=24):
    V = [(0, 0, R)]
    for j in range(1, nv):
        th = math.pi * j / nv
        for i in range(nu):
            ph = 2 * math.pi * i / nu
            V.append((R * math.sin(th) * math.cos(ph), R * math.sin(th) * math.sin(ph), R * math.cos(th)))
    V.append((0, 0, -R))
    F = []
    for i in range(nu):
        F.append([0, 1 + i, 1 + (i + 1) % nu][::-1][::-1])
    for j in range(nv - 2):
        for i in range(nu):
            a = 1 + j * nu + i; b = 1 + j * nu + (i + 1) % nu
            F.append([a, a + nu, b + nu, b])
    last = len(V) - 1
    for i in range(nu):
        F.append([last, 1 + (nv - 2) * nu + (i + 1) % nu, 1 + (nv - 2) * nu + i])
    return np.array(V, float), F


def test_arcedge():
    from core import arcedge as A
    ok(np.allclose([A.circumference(1.0), A.area(1.0), A.volume(1.0), A.sphere_surface(1.0)], [3.0, 9.0, 729.0, 182.25], rtol=1e-12),
       "Arc Edge worked example d=1: 3, 9, 729, 182.25")
    ok(abs(float(A.branch_arc(1.0)) - 0.375) < 1e-12 and abs(float(A.arcedge_y(2.0)) - 2.5) < 1e-12, "branch arc 0.375, y=((x*2)+1)/x")
    d = np.array([0.5, 1.0, 4.0])
    ok(np.allclose(A.diameter_from_arc(A.branch_arc(d)), d), "diameter_from_arc inverts branch_arc (vectorised)")
    lad = A.ladder(0.1, 10.0)
    i = A.match_circle(A.branch_arc(1.0) * 0.99, lad)
    ok(A.branch_arc(lad[i]) >= A.branch_arc(1.0) * 0.99 and (i == 0 or A.branch_arc(lad[i - 1]) < A.branch_arc(1.0) * 0.99),
       "match_circle finds the first (smallest) circle whose 1/8 arc matches")
    ok(abs(A.circumference(1.0) - math.pi) / math.pi > 0.04, "documented circumference differs from pi*d (~4.5%): geometry stays exact")


def test_curvature():
    V, F = uv_sphere(2.0)
    l, st, sz = R.pack_faces(F)
    E, ef, cnt = R.build_edges(l, st, sz)
    vn = R.vertex_normals(V, l, st, sz, len(V))
    k1, k2, d = R.principal_curvatures(V, E, vn)
    mid = np.abs(V[:, 2]) < 1.0
    ok(abs(np.median(k1[mid]) - 0.5) < 0.03 and abs(np.median(k2[mid]) - 0.5) < 0.03, "sphere R=2: both principal curvatures ~0.5 (%.3f, %.3f)" % (np.median(k1[mid]), np.median(k2[mid])))
    # cylinder: curvature 1/R across, 0 along
    n, m, Rr = 40, 10, 1.5
    Vc = np.array([(Rr * math.cos(2 * math.pi * i / n), Rr * math.sin(2 * math.pi * i / n), z) for z in np.linspace(0, 3, m) for i in range(n)])
    Fc = [[j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i] for j in range(m - 1) for i in range(n)]
    l, st, sz = R.pack_faces(Fc)
    E, ef, cnt = R.build_edges(l, st, sz)
    vn = R.vertex_normals(Vc, l, st, sz, len(Vc))
    # orient outward
    vn = np.where(((Vc[:, :2] * vn[:, :2]).sum(1) < 0)[:, None], -vn, vn)
    k1, k2, d = R.principal_curvatures(Vc, E, vn)
    inner = (np.arange(len(Vc)) >= n) & (np.arange(len(Vc)) < (m - 1) * n)
    ok(abs(np.median(k1[inner]) - 1 / Rr) < 0.03 and abs(np.median(k2[inner])) < 0.03, "cylinder: k1~1/R, k2~0 (%.3f, %.3f)" % (np.median(k1[inner]), np.median(k2[inner])))
    s = R.arc_scale(k1, k2, 100.0)
    ok(abs(np.median(s[inner]) - (math.pi / 4) * Rr) < 0.1, "arc scale s=(pi/4)/k exact Euclidean")


def test_grade():
    n = 50
    V = np.array([(x, 0, 0) for x in np.linspace(0, 1, n)])
    E = np.array([[i, i + 1] for i in range(n - 1)])
    s = np.full(n, 1.0); s[25] = 0.01
    g = R.grade_size(s, E, V, 2.0, iters=200)
    step = np.abs(np.diff(g)).max()
    ok(g[25] == 0.01 and step <= (1 / (n - 1)) + 1e-9 and g[0] > g[25], "gradation limits size change per edge to (g-1)*edge length (max step %.4f)" % step)


def test_virtual_subdivision_and_sparse():
    V = np.array([(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)], float)
    tris = np.array([[0, 1, 2], [0, 2, 3]])
    cr = np.array([[1, 0, 0], [0, 0, 1.0]])
    pts, dn = R.virtual_subdivide(V, tris, cr, 1.5)
    ok(len(pts) > 50 and (dn > 0.5).sum() > 0 and (dn == 0).sum() > 0, "oversize triangles are virtually subdivided (%d points)" % len(pts))
    ok(np.abs(pts[:, 2]).max() == 0 and pts.min() >= 0 and pts.max() <= 10, "virtual points lie on the original faces")
    # sparse cube (12 triangles): every face oversize; the field must be creases, not face size
    Vc = np.array([(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], float)
    Fq = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    an = R.analyse(Vc, Fq)
    ok(an.info["oversize_faces"] == 6 and not an.small_mask.any(), "sparse faces: face size not used as feature size")
    ok(len(an.virt_pts) > 0, "sparse mesh gets virtual density samples")


def test_orient():
    rng = np.random.default_rng(5)
    for name, (V, F) in (("cube", cube(3)), ("sphere", uv_sphere(1.0, 24, 12))):
        l, st, sz = R.pack_faces(F)
        _, area, _ = R.face_geometry(V, l, st, sz)
        # reference outward flag: n . c > 0
        nrm, _, cen = R.face_geometry(V, l, st, sz)
        base_out = ((nrm * cen).sum(1) > 0)
        F2 = [f[::-1] if (rng.random() < 0.5) else f for f in F]
        flipped_by_me = np.array([f2 != f for f, f2 in zip(F, F2)])
        l2, st2, sz2 = R.pack_faces(F2)
        flip, info = R.orient_outward(V, l2, st2, sz2)
        perm = R.flip_packed(l2, st2, sz2, flip)
        l3 = l2[perm]
        nrm3, _, cen3 = R.face_geometry(V, l3, st2, sz2)
        out = ((nrm3 * (cen3 - V.mean(0))).sum(1) > 0)
        ok(out.all(), "%s with random flips -> all outward (%d flipped faces, info %s)" % (name, info["flipped_faces"], info))
        ok(info["closed_components"] == 1 and info["inconsistent_edges"] == 0, "%s: one closed component" % name)
        ok(info["flipped_faces"] == int(flipped_by_me.sum()), "%s flipped-face count matches" % name)
    # two components flipped independently
    V1, F1 = cube(2); V2, F2_ = cube(2)
    V2 = V2 + np.array([5.0, 0, 0])
    Vt = np.vstack([V1, V2]); Ft = [list(f) for f in F1] + [[i + len(V1) for i in f[::-1]] for f in F2_]  # 2nd cube inside-out
    Ft[3] = Ft[3][::-1]  # one stray flipped face in cube A
    l, st, sz = R.pack_faces(Ft)
    flip, info = R.orient_outward(Vt, l, st, sz)
    perm = R.flip_packed(l, st, sz, flip)
    l3 = l[perm]
    nrm3, _, cen3 = R.face_geometry(Vt, l3, st, sz)
    ca = cen3[:len(F1)] - V1.mean(0); cb = cen3[len(F1):] - V2.mean(0)
    ok(info["components"] == 2 and ((nrm3[:len(F1)] * ca).sum(1) > 0).all() and ((nrm3[len(F1):] * cb).sum(1) > 0).all(),
       "two components fixed independently (flipped %d: 1 stray + %d inside-out)" % (info["flipped_faces"], len(F2_)))
    # open shell: grid patch with mixed windings becomes consistent
    g = [[j * 5 + i, j * 5 + i + 1, (j + 1) * 5 + i + 1, (j + 1) * 5 + i] for j in range(4) for i in range(4)]
    Vg = np.array([(i, j, 0) for j in range(5) for i in range(5)], float)
    g2 = [f[::-1] if k % 3 == 0 else f for k, f in enumerate(g)]
    l, st, sz = R.pack_faces(g2)
    flip, info = R.orient_outward(Vg, l, st, sz)
    nrm, _, _ = R.face_geometry(Vg, l[R.flip_packed(l, st, sz, flip)], st, sz)
    ok(abs(nrm[:, 2].sum()) == 16 and info["open_heuristic"] == 1, "open patch made consistent (open shell reported)")


def test_detect_symmetry_numpy():
    V, F = uv_sphere(1.0, 40, 20)
    # shape symmetric about x=0 only: elongated in z, bump on +y side, wobble even in x
    r = 1 + 0.3 * V[:, 1] + 0.2 * V[:, 0] ** 2 + 0.25 * V[:, 2] ** 2
    V = V * r[:, None] * np.array([1.0, 1.0, 1.6])
    rng = np.random.default_rng(4)
    q = rng.normal(size=4); q /= np.linalg.norm(q)
    w, x, y, z = q
    Rm = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                   [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                   [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    shift = np.array([7.0, -3.0, 11.0])
    Vt = 2.2 * (V @ Rm.T) + shift
    l, st, sz = R.pack_faces(F)
    P, cen, area = R.surface_sample_points(Vt, l, st, sz)
    dense = np.concatenate([Vt, cen])
    diag = R._bbox_diag(Vt)
    det = R.detect_symmetry(P, (cen * area[:, None]).sum(0) / area.sum(), lambda Q: R.nearest_distance(Q, dense), diag)
    true_n = Rm[:, 0]; true_p = 2.2 * 0 + shift
    ok(abs(det["normal"] @ true_n) > math.cos(math.radians(2)) and abs((det["point"] - true_p) @ true_n) < 0.02 * diag and det["cls"] != "asymmetric",
       "numpy: mirror plane of a rotated/shifted/scaled shape found (dot %.4f, %s)" % (abs(det["normal"] @ true_n), det["cls"]))
    # asymmetric shape
    Va = V + 0.4 * np.sin(3 * V[:, [1, 2, 0]] + 1.0)
    P2, cen2, area2 = R.surface_sample_points(Va, l, st, sz)
    dense2 = np.concatenate([Va, cen2])
    det2 = R.detect_symmetry(P2, (cen2 * area2[:, None]).sum(0) / area2.sum(), lambda Q: R.nearest_distance(Q, dense2), R._bbox_diag(Va))
    ok(det2["cls"] == "asymmetric", "numpy: asymmetric shape classified %s (mean %.4f)" % (det2["cls"], det2["mean"]))
    Rr, t = R.plane_frame(det["normal"], det["point"])
    ok(np.allclose(Rr @ det["point"] + t, 0) and np.isclose(np.linalg.det(Rr), 1.0), "plane_frame is a proper rigid map")


def test_fast_numpy():
    from core import retopo_fast as RF
    V, F = uv_sphere(1.0, 60, 30)
    # triangulate
    T = []
    for f in F:
        for k in range(1, len(f) - 1):
            T.append([f[0], f[k], f[k + 1]])
    T = [list(t) for t in T]
    l, st, sz = R.pack_faces(T)
    an = R.analyse_packed(V, l, st, sz, per_region=False)
    pr = RF.pair_triangles(V, l, st, sz, an)
    n_out = len(pr["out_size"])
    quads = int((pr["out_size"] == 4).sum())
    ok(quads / n_out > 0.9 and pr["n_pairs"] * 2 + (pr["out_size"] == 3).sum() == len(T), "pairing: %d tris -> %d quads + %d tris (ratio %.3f)" % (len(T), quads, int((pr["out_size"] == 3).sum()), quads / n_out))
    ost = np.concatenate([[0], np.cumsum(pr["out_size"])[:-1]])
    nrm0, a0, _ = R.face_geometry(V, l, st, sz)
    nrm1, a1, c1 = R.face_geometry(V, pr["out_loops"], ost, pr["out_size"])
    ok(abs(a1.sum() - a0.sum()) < 1e-9 * a0.sum() and (nrm1 * c1).sum(1).min() > 0, "pairing keeps area and orientation (outward)")
    ok(set(np.unique(pr["out_loops"])) <= set(range(len(V))) and len(pr["loop_src"]) == len(pr["out_loops"]), "loop maps consistent")
    # clustering decimation
    Vc, tc = RF.cluster_decimate(V, l, sz, 400)
    ok(0.5 * 400 < len(tc) < 1.8 * 400 and tc.max() < len(Vc), "cluster decimation %d -> %d tris" % (len(T), len(tc)))
    # relax stays on tangent plane
    vn = R.vertex_normals(V, l, st, sz, len(V))
    E, _, _ = R.build_edges(pr["out_loops"], ost, pr["out_size"])
    dens = np.where(V[:, 2] > 0.5, 1.0, 0.0)
    P, na = RF.relax_active(V, vn, E, dens, np.zeros(len(V), bool), 6, 6.0)
    dev = np.abs(np.linalg.norm(P, axis=1) - 1.0).max()
    ok(na > 0 and dev < 0.02, "tangent relaxation keeps points near the surface (dev %.4f, %d active)" % (dev, na))


if __name__ == "__main__":
    test_fast_numpy()
    test_detect_symmetry_numpy()
    test_orient()
    test_arcedge(); test_curvature(); test_grade(); test_virtual_subdivision_and_sparse()
    test_counts(); test_cube_creases(); test_otsu_split(); test_mirror(); test_relax_moves_toward_density(); test_edges()
    print("FAILURES:", FAIL)
    sys.exit(1 if FAIL else 0)
