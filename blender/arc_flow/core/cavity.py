"""Cavity-union / joint classification for LOTBCBP Boolean projection (pure NumPy, no bpy).

Two parts whose cavities share volume form one continuous through-cavity; the wall of each part is implicitly cut away
where it lies inside the other part's cavity.  `classify(world)` reads the per-part cavity occupancy of the network
grid and returns the joints, the assemblies (connected components of parts) and the opening state totals.
`surface_nets` turns a signed field into a closed triangle mesh (used for the cavity source of SOLID parts and for
capping open shells, so that a real Boolean union can be built from every cavity).
"""
import numpy as np

from .world import CONNECTED, OPEN, PLUGGED


def classify(world, min_voxels=2):
    """Return dict(joints, assemblies, connected, plugged, spilling, openings).

    joints:     list of dict(a, b, kind 'OVERLAP' | 'OPENING', voxels, volume, centre)   (a < b, part indices)
    assemblies: list of sorted part-index lists (size >= 2), connected through joints
    connected / plugged / spilling: counts of openings in each state (spilling = open to the ambient)
    """
    net = world.net
    out = dict(joints=[], assemblies=[], connected=0, plugged=0, spilling=0, openings=[])
    if net is None:
        return out
    h, origin, dims = net['h'], net['origin'], net['dims']
    cand = [i for i in world.active if world.parts[i].role not in ('COLLIDER', 'CAVITY')]
    pair = {}
    for ai in range(len(cand)):
        for bi in range(ai + 1, len(cand)):
            a, b = cand[ai], cand[bi]
            shared = world.part_in[a] & world.part_in[b]
            n = int(shared.sum())
            if n >= min_voxels:
                idx = np.argwhere(shared)
                centre = origin + idx.mean(0) * h
                pair[(a, b)] = dict(a=a, b=b, kind='OVERLAP', voxels=n, volume=n * h ** 3, centre=centre)
    for o in world.openings:
        st = o['state']
        out['connected'] += st == CONNECTED
        out['plugged'] += st == PLUGGED
        out['spilling'] += st == OPEN
        if st == CONNECTED and o.get('partner', -1) >= 0:
            a, b = sorted((o['part'], o['partner']))
            if (a, b) not in pair:
                pair[(a, b)] = dict(a=a, b=b, kind='OPENING', voxels=0, volume=0.0, centre=np.asarray(o['centre'], float))
    out['openings'] = [dict(part=o['part'], state=o['state']) for o in world.openings]
    out['joints'] = list(pair.values())
    # assemblies = connected components over joints
    par = {i: i for i in cand}

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    for j in out['joints']:
        par[find(j['a'])] = find(j['b'])
    groups = {}
    for i in cand:
        groups.setdefault(find(i), []).append(i)
    out['assemblies'] = [sorted(g) for g in groups.values() if len(g) >= 2]
    out['assemblies'].sort()
    return out


def summary(report):
    """One-line status: joints found, plugged, spilling."""
    return "%d joints | %d plugged | %d spilling" % (len(report['joints']), report['plugged'], report['spilling'])


def joints_of(report, part):
    """Partner part indices that `part` shares a joint with."""
    out = []
    for j in report['joints']:
        if j['a'] == part:
            out.append(j['b'])
        elif j['b'] == part:
            out.append(j['a'])
    return sorted(out)


# ----------------------------------------------------------------------------- surface nets (closed mesh from a signed field)
def surface_nets(field, origin, h):
    """Naive surface nets on a node-sampled field `field[i,j,k]` (negative = inside).

    Returns (verts (n,3), tris (m,3)); triangles are wound so that normals point out of the negative region.  The field
    must be positive on its outer boundary layer so the surface is closed."""
    f = np.asarray(field, float)
    nx, ny, nz = f.shape
    cx, cy, cz = nx - 1, ny - 1, nz - 1
    # cell corner offsets
    offs = np.array([(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)])
    corner = np.stack([f[o[0]:o[0] + cx, o[1]:o[1] + cy, o[2]:o[2] + cz] for o in offs], -1)       # (cx,cy,cz,8)
    neg = corner < 0.0
    mixed = neg.any(-1) & ~neg.all(-1)
    vid = -np.ones((cx, cy, cz), np.int64)
    ci = np.argwhere(mixed)
    vid[mixed] = np.arange(len(ci))
    # vertex = mean of the zero crossings on the 12 cell edges
    edges = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    acc = np.zeros((len(ci), 3))
    cnt = np.zeros(len(ci))
    cc = corner[mixed]
    for a, b in edges:
        fa, fb = cc[:, a], cc[:, b]
        cross = (fa < 0) != (fb < 0)
        t = np.where(cross, fa / np.where(cross, fa - fb, 1.0), 0.0)
        pa = offs[a][None].astype(float); pb = offs[b][None].astype(float)
        p = pa + (pb - pa) * t[:, None]
        acc += np.where(cross[:, None], p, 0.0)
        cnt += cross
    verts = origin + (ci + acc / np.maximum(cnt, 1)[:, None]) * h
    quads = []
    # one quad per sign-changing grid edge, joining the 4 cells that share it
    for ax in range(3):
        u, v = [a for a in range(3) if a != ax]
        sl_a = [slice(None)] * 3
        sl_b = [slice(None)] * 3
        sl_a[ax] = slice(0, nx - 1 if ax == 0 else (ny - 1 if ax == 1 else nz - 1))
        sl_b[ax] = slice(1, None)
        fa, fb = f[tuple(sl_a)], f[tuple(sl_b)]
        flip = (fa < 0) & ~(fb < 0)           # edge leaves the inside along +axis
        enter = ~(fa < 0) & (fb < 0)
        e = np.argwhere(flip | enter)
        if not len(e):
            continue
        # keep edges whose 4 surrounding cells exist (interior of the grid)
        ok = np.ones(len(e), bool)
        for dd in (u, v):
            ok &= (e[:, dd] >= 1) & (e[:, dd] <= f.shape[dd] - 2)
        e = e[ok]
        if not len(e):
            continue
        inside_first = flip[tuple(e.T)]
        cells = []
        for du, dv in ((-1, -1), (0, -1), (0, 0), (-1, 0)):
            c = e.copy()
            c[:, u] += du
            c[:, v] += dv
            cells.append(vid[tuple(c.T)])
        q = np.stack(cells, 1)
        good = (q >= 0).all(1)
        q = q[good]; inside_first = inside_first[good]
        # orientation: (u, v, ax) right-handed ordering -> normal along +ax for the order below
        cyc = (ax + 1) % 3 == u
        q = np.where((inside_first != cyc)[:, None], q[:, ::-1], q)
        quads.append(q)
    if not quads:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    Q = np.concatenate(quads)
    tris = np.concatenate([Q[:, [0, 1, 2]], Q[:, [0, 2, 3]]])
    return verts, tris


def mesh_volume(verts, tris):
    """Signed volume of a closed triangle mesh (positive when normals point outward)."""
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6.0)


def cavity_mesh(field, resolution=48):
    """Closed triangle mesh (part-local coordinates) of the fluid-legal cavity of a PartField (extended to its bounds)."""
    lo, hi = field.bmin, field.bmax
    ext = np.maximum(hi - lo, 1e-6)
    h = float(ext.max() / max(resolution, 8))
    pad = 2.0 * h
    origin = lo - pad
    dims = np.maximum(np.ceil((hi + pad - origin) / h).astype(int) + 1, 4)
    idx = np.stack(np.meshgrid(*[np.arange(d) for d in dims], indexing='ij'), -1).reshape(-1, 3)
    P = origin + idx * h
    cav, _m = field.fields(P, bricks=False)
    cav = cav.reshape(dims)
    # force the outer nodes positive and trim to the modelled bounds so the cavity ends flat at open mouths
    out = np.zeros(dims, bool)
    for ax in range(3):
        coord = origin[ax] + np.arange(dims[ax]) * h
        ok = (coord >= lo[ax] - 1e-9) & (coord <= hi[ax] + 1e-9)
        shape = [1, 1, 1]; shape[ax] = -1
        out |= ~ok.reshape(shape)
    cav = np.where(out, np.abs(cav) + 1e-3, cav)
    edge = np.zeros(dims, bool)
    for ax in range(3):
        sl = [slice(None)] * 3
        sl[ax] = 0; edge[tuple(sl)] = True
        sl[ax] = -1; edge[tuple(sl)] = True
    cav = np.where(edge, np.abs(cav) + 1e-3, cav)
    return surface_nets(cav, origin, h)


def is_closed_manifold(verts, tris):
    """True when every edge is shared by exactly two triangles with opposite orientation and the volume is positive.

    Such a mesh can be used directly (exact copy) as a Boolean operand; anything else (open shells, bores) is rebuilt
    from the field with `cavity_mesh`, which is capped and closed."""
    tris = np.asarray(tris, np.int64)
    if len(tris) < 4:
        return False
    d = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    n = int(tris.max()) + 1
    fwd = d[:, 0] * n + d[:, 1]
    bwd = d[:, 1] * n + d[:, 0]
    uf, cf = np.unique(fwd, return_counts=True)
    if (cf != 1).any():
        return False
    if not np.array_equal(np.sort(fwd), np.sort(bwd)):
        return False
    return mesh_volume(np.asarray(verts, float), tris) > 0.0
